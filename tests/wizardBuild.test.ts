import { describe, it, expect } from 'vitest';
import {
  wizardBuildDocument,
  emptyAnswers,
  sequentialIdGen,
  type WizardAnswers,
} from '../src/ui/wizardBuild.ts';
import { byId, childrenOf } from '../src/core/model.ts';

const NOW = '2026-07-05T00:00:00.000Z';

/** A scripted set of answers exercising every step + parent chain. */
function scriptedAnswers(): WizardAnswers {
  const a = emptyAnswers();
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
    { name: 'Route Optimiser', parentRef: '1', asset: 'server-rack' }, // → team Platform
  ];
  a.physicalInfra = [
    { name: 'Depot', parentRef: '0', asset: 'office-block' }, // → dept Waste Ops
  ];
  a.annotations = [{ name: 'How are missed bins reported?' }];
  return a;
}

describe('wizardBuildDocument', () => {
  it('builds the correct entity tree with parentIds', () => {
    const doc = wizardBuildDocument(scriptedAnswers(), {
      idGen: sequentialIdGen(),
      now: NOW,
    });

    expect(doc.meta.title).toBe('Bin Collection');
    expect(doc.meta.description).toBe('Kerbside waste service');

    const org = doc.entities.find((e) => e.type === 'organisation');
    expect(org).toBeDefined();
    expect(org!.parentId).toBeUndefined();

    const depts = doc.entities.filter((e) => e.type === 'department');
    expect(depts).toHaveLength(2);
    // both departments parent to the org
    for (const d of depts) expect(d.parentId).toBe(org!.id);

    const wasteOps = depts.find((d) => d.label === 'Waste Ops')!;
    const digital = depts.find((d) => d.label === 'Digital')!;

    const teams = doc.entities.filter((e) => e.type === 'team');
    expect(teams).toHaveLength(2);
    const crews = teams.find((t) => t.label === 'Crews')!;
    const platform = teams.find((t) => t.label === 'Platform')!;
    expect(crews.parentId).toBe(wasteOps.id);
    expect(platform.parentId).toBe(digital.id);
  });

  it('expands user-group headcounts into that many figurines', () => {
    const doc = wizardBuildDocument(scriptedAnswers(), {
      idGen: sequentialIdGen(),
      now: NOW,
    });

    const figurines = doc.entities.filter((e) => e.type === 'user');
    expect(figurines).toHaveLength(5); // 3 Loaders + 2 Engineers
    for (const f of figurines) {
      expect(f.asset.symbol).toBe('figurine');
      expect(f.asset.params).toBeTruthy();
      // randomFigurineParams always sets these keys
      expect(f.asset.params).toHaveProperty('skin');
      expect(f.asset.params).toHaveProperty('hairStyle');
    }

    const crews = doc.entities.find((e) => e.label === 'Crews')!;
    const loaders = childrenOf(doc, crews.id).filter((e) => e.type === 'user');
    expect(loaders).toHaveLength(3);
  });

  it('attaches systems and infra to the right parents with chosen assets', () => {
    const doc = wizardBuildDocument(scriptedAnswers(), {
      idGen: sequentialIdGen(),
      now: NOW,
    });

    const platform = doc.entities.find((e) => e.label === 'Platform')!;
    const wasteOps = doc.entities.find((e) => e.label === 'Waste Ops')!;

    const sys = doc.entities.find((e) => e.type === 'digital-infra')!;
    expect(sys.label).toBe('Route Optimiser');
    expect(sys.asset.symbol).toBe('server-rack');
    expect(sys.parentId).toBe(platform.id);

    const infra = doc.entities.find((e) => e.type === 'physical-infra')!;
    expect(infra.label).toBe('Depot');
    expect(infra.asset.symbol).toBe('office-block');
    expect(infra.parentId).toBe(wasteOps.id);

    const note = doc.entities.find((e) => e.type === 'annotation')!;
    expect(note.asset.symbol).toBe('callout');
    expect(note.asset.params).toMatchObject({
      text: 'How are missed bins reported?',
    });
  });

  it('applies autoLayout: every entity has a concrete placement', () => {
    const doc = wizardBuildDocument(scriptedAnswers(), {
      idGen: sequentialIdGen(),
      now: NOW,
    });
    for (const e of doc.entities) {
      expect(e.placement).toBeTruthy();
      expect(['grid', 'free']).toContain(e.placement.mode);
      expect(Number.isFinite(e.placement.x)).toBe(true);
      expect(Number.isFinite(e.placement.y)).toBe(true);
    }
    // organisation is laid out as a grid plate
    const org = doc.entities.find((e) => e.type === 'organisation')!;
    expect(org.placement.mode).toBe('grid');
    // users are free-placed figurines
    const user = doc.entities.find((e) => e.type === 'user')!;
    expect(user.placement.mode).toBe('free');
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
    const doc = wizardBuildDocument(a, { idGen: sequentialIdGen(), now: NOW });
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
    const doc = wizardBuildDocument(a, { idGen: sequentialIdGen(), now: NOW });
    const good = doc.entities.find((e) => e.label === 'Good')!;
    const orphan = doc.entities.find((e) => e.label === 'Orphan')!;
    const org = doc.entities.find((e) => e.type === 'organisation')!;
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
    const doc = wizardBuildDocument(a, { idGen: sequentialIdGen(), now: NOW });
    const users = doc.entities.filter((e) => e.type === 'user');
    expect(users).toHaveLength(5 + 1); // 5 (clamped from 99) + 1 (clamped from 0)
  });
});
