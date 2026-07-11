import { describe, it, expect } from 'vitest';
import {
  wizardBuildDocument,
  emptyAnswers,
  sequentialIdGen,
  type WizardAnswers,
} from '../src/ui/wizardBuild.ts';
import { childrenOf } from '../src/core/model.ts';
import type { Entity, GridPlacement, SceneDocument } from '../src/core/model.ts';

const NOW = '2026-07-05T00:00:00.000Z';

/** A scripted set of answers exercising every step + parent chain. */
function scriptedAnswers(): WizardAnswers {
  const a = emptyAnswers();
  a.domain = 'public-service';
  a.service = { name: 'Bin Collection', description: 'Kerbside waste service' };
  a.organisations = [{ name: 'City Council' }];
  a.departments = [
    { name: 'Waste Ops', parentRef: '0' }, // → org index 0
    { name: 'Digital', parentRef: '0' },
  ];
  a.teams = [
    { name: 'Crews', parentRef: '0' }, // → dept index 0 (Waste Ops)
    { name: 'Platform', parentRef: '1' }, // → dept index 1 (Digital)
  ];
  a.userGroups = [
    { name: 'Loaders', parentRef: '0', headcount: 3 }, // 3 figurines under Crews
    { name: 'Engineers', parentRef: '1', headcount: 2 }, // 2 figurines under Platform
  ];
  a.digitalSystems = [
    { name: 'Route Optimiser', parentRef: '1', asset: 'gov-laptop' }, // → team Platform
  ];
  a.physicalInfra = [
    { name: 'Depot', parentRef: '0', asset: 'office-block' }, // → dept Waste Ops
  ];
  a.annotations = [{ name: 'How are missed bins reported?' }];
  return a;
}

function build(a: WizardAnswers = scriptedAnswers()): SceneDocument {
  return wizardBuildDocument(a, { idGen: sequentialIdGen(), now: NOW });
}

function grid(e: Entity): GridPlacement {
  expect(e.placement.mode).toBe('grid');
  return e.placement as GridPlacement;
}

/** True if child's footprint tiles are all inside parent's footprint. */
function within(child: Entity, parent: Entity): boolean {
  const c = grid(child);
  const p = grid(parent);
  return (
    c.x >= p.x &&
    c.y >= p.y &&
    c.x + c.footprint.w <= p.x + p.footprint.w &&
    c.y + c.footprint.d <= p.y + p.footprint.d
  );
}

describe('wizardBuildDocument — territory seam', () => {
  it('org/department/team steps all produce territory entities with the territory asset', () => {
    const doc = build();
    const territories = doc.entities.filter((e) => e.type === 'territory');
    expect(territories).toHaveLength(5); // 1 org + 2 depts + 2 teams
    for (const t of territories) {
      expect(t.asset.symbol).toBe('territory');
    }
    // No legacy zone kinds anywhere.
    for (const e of doc.entities) {
      expect(['organisation', 'department', 'team', 'process']).not.toContain(e.type);
      expect(e.asset.symbol).not.toBe('department-zone');
    }
  });

  it('territories carry no label params and no goals — only w/d size params', () => {
    const doc = build();
    for (const t of doc.entities.filter((e) => e.type === 'territory')) {
      expect(t.userGoal).toBeUndefined();
      expect(t.orgGoal).toBeUndefined();
      const params = t.asset.params ?? {};
      expect(params).not.toHaveProperty('label');
      expect(params).not.toHaveProperty('number');
      expect(params).not.toHaveProperty('userGroups');
      // Size params mirror the laid-out footprint (panel/handle stay in sync).
      const g = grid(t);
      expect(params.w).toBe(g.footprint.w);
      expect(params.d).toBe(g.footprint.d);
    }
  });

  it('builds the correct parent chains (org ← depts ← teams)', () => {
    const doc = build();
    const org = doc.entities.find((e) => e.label === 'City Council')!;
    expect(org.parentId).toBeUndefined();
    const wasteOps = doc.entities.find((e) => e.label === 'Waste Ops')!;
    const digital = doc.entities.find((e) => e.label === 'Digital')!;
    expect(wasteOps.parentId).toBe(org.id);
    expect(digital.parentId).toBe(org.id);
    const crews = doc.entities.find((e) => e.label === 'Crews')!;
    const platform = doc.entities.find((e) => e.label === 'Platform')!;
    expect(crews.parentId).toBe(wasteOps.id);
    expect(platform.parentId).toBe(digital.id);
  });

  it('nests child territories within their parent footprint (sized to contain)', () => {
    const doc = build();
    const org = doc.entities.find((e) => e.label === 'City Council')!;
    const wasteOps = doc.entities.find((e) => e.label === 'Waste Ops')!;
    const digital = doc.entities.find((e) => e.label === 'Digital')!;
    const crews = doc.entities.find((e) => e.label === 'Crews')!;
    const platform = doc.entities.find((e) => e.label === 'Platform')!;
    expect(within(wasteOps, org)).toBe(true);
    expect(within(digital, org)).toBe(true);
    expect(within(crews, wasteOps)).toBe(true);
    expect(within(platform, digital)).toBe(true);
  });

  it('nests grid infrastructure within its parent territory footprint', () => {
    const doc = build();
    const platform = doc.entities.find((e) => e.label === 'Platform')!;
    const wasteOps = doc.entities.find((e) => e.label === 'Waste Ops')!;
    const sys = doc.entities.find((e) => e.type === 'digital-infra')!;
    const depot = doc.entities.find((e) => e.type === 'physical-infra')!;
    expect(sys.parentId).toBe(platform.id);
    expect(within(sys, platform)).toBe(true);
    expect(depot.parentId).toBe(wasteOps.id);
    expect(within(depot, wasteOps)).toBe(true);
  });

  it('falls back to "Territory N" labels when rows are unnamed', () => {
    const a = emptyAnswers();
    a.service = { name: 'S' };
    a.organisations = [{ name: '' }];
    a.departments = [{ name: '', parentRef: '0' }];
    a.teams = [{ name: '', parentRef: '0' }];
    const doc = build(a);
    const labels = doc.entities
      .filter((e) => e.type === 'territory')
      .map((e) => e.label);
    expect(labels).toEqual(['Territory 1', 'Territory 2', 'Territory 3']);
  });

  it('expands user-group headcounts into that many figurines under their team', () => {
    const doc = build();
    const figurines = doc.entities.filter((e) => e.type === 'user');
    expect(figurines).toHaveLength(5); // 3 Loaders + 2 Engineers
    for (const f of figurines) {
      expect(f.asset.symbol).toBe('figurine');
      expect(f.asset.params).toHaveProperty('skin');
      expect(f.placement.mode).toBe('free');
    }
    const crews = doc.entities.find((e) => e.label === 'Crews')!;
    const loaders = childrenOf(doc, crews.id).filter((e) => e.type === 'user');
    expect(loaders).toHaveLength(3);
  });

  it('attaches systems, infra and annotations with chosen assets', () => {
    const doc = build();
    const sys = doc.entities.find((e) => e.type === 'digital-infra')!;
    expect(sys.label).toBe('Route Optimiser');
    expect(sys.asset.symbol).toBe('gov-laptop');
    const infra = doc.entities.find((e) => e.type === 'physical-infra')!;
    expect(infra.label).toBe('Depot');
    expect(infra.asset.symbol).toBe('office-block');
    const note = doc.entities.find((e) => e.type === 'annotation')!;
    expect(note.asset.symbol).toBe('callout');
    expect(note.asset.params).toMatchObject({
      text: 'How are missed bins reported?',
    });
  });

  it('is deterministic: identical answers → byte-identical document', () => {
    const a = scriptedAnswers();
    const d1 = wizardBuildDocument(a, { idGen: sequentialIdGen(), now: NOW });
    const d2 = wizardBuildDocument(a, { idGen: sequentialIdGen(), now: NOW });
    expect(JSON.stringify(d1)).toBe(JSON.stringify(d2));
  });

  it('handles a fully-skipped wizard (only a service name)', () => {
    const a = emptyAnswers();
    a.service = { name: 'Empty Service' };
    const doc = build(a);
    expect(doc.entities).toHaveLength(0);
    expect(doc.meta.title).toBe('Empty Service');
    expect(doc.version).toBe(1);
  });

  it('resolves parents referenced by row index and ignores dangling refs', () => {
    const a = emptyAnswers();
    a.service = { name: 'S' };
    a.organisations = [{ name: 'Org A' }];
    a.departments = [
      { name: 'Good', parentRef: '0' },
      { name: 'Orphan', parentRef: '9' }, // out of range → no parent
    ];
    const doc = build(a);
    const good = doc.entities.find((e) => e.label === 'Good')!;
    const orphan = doc.entities.find((e) => e.label === 'Orphan')!;
    const org = doc.entities.find((e) => e.label === 'Org A')!;
    expect(good.parentId).toBe(org.id);
    expect(orphan.parentId).toBeUndefined();
  });

  it('clamps headcount to 1..5', () => {
    const a = emptyAnswers();
    a.service = { name: 'S' };
    a.teams = [{ name: 'T' }];
    a.userGroups = [
      { name: 'Big', parentRef: '0', headcount: 99 },
      { name: 'Zero', parentRef: '0', headcount: 0 },
    ];
    const doc = build(a);
    const users = doc.entities.filter((e) => e.type === 'user');
    expect(users).toHaveLength(5 + 1); // 5 (clamped from 99) + 1 (clamped from 0)
  });

  it('produces a document that validates and is already migrated', async () => {
    const { validateDocument, migrate } = await import('../src/core/schema.ts');
    const doc = build();
    expect(migrate(doc)).toBe(doc); // identity — nothing legacy to rewrite
    expect(validateDocument(doc).ok).toBe(true);
  });
});
