import { describe, it, expect } from 'vitest';
import { autoLayout } from '../src/core/layout.ts';
import { createEmptyDocument, footprintsOverlap } from '../src/core/model.ts';
import type { SceneDocument, Entity } from '../src/core/model.ts';
import type { GridPlacement } from '../src/core/model.ts';

function ent(id: string, type: Entity['type'], parentId?: string): Entity {
  return {
    id,
    type,
    label: id,
    ...(parentId ? { parentId } : {}),
    placement: { mode: 'grid', x: 0, y: 0, footprint: { w: 1, d: 1 } },
    asset: { symbol: 's' },
  };
}

function sampleDoc(): SceneDocument {
  const d = createEmptyDocument('t', '2020-01-01T00:00:00.000Z');
  d.entities = [
    ent('org', 'organisation'),
    ent('dept1', 'department', 'org'),
    ent('dept2', 'department', 'org'),
    ent('teamA', 'team', 'dept1'),
    ent('teamB', 'team', 'dept1'),
    ent('teamC', 'team', 'dept2'),
    ent('user1', 'user', 'teamA'),
    ent('user2', 'user', 'teamA'),
    ent('user3', 'user', 'teamB'),
    ent('srv', 'digital-infra', 'dept1'),
    ent('van', 'physical-infra', 'dept2'),
    ent('proc', 'process', 'teamA'),
    ent('note', 'annotation'),
    ent('orphan', 'department'), // top-level extra
    ent('lonelyUser', 'user'), // unparented user
  ];
  return d;
}

function gridPlacements(doc: SceneDocument): { id: string; g: GridPlacement }[] {
  return doc.entities
    .filter((e) => e.placement.mode === 'grid')
    .map((e) => ({ id: e.id, g: e.placement as GridPlacement }));
}

/** True if `a` is an ancestor of `b` (or vice-versa) via parentId chains. */
function inContainment(doc: SceneDocument, a: string, b: string): boolean {
  const parentOf = new Map<string, string | undefined>(
    doc.entities.map((e) => [e.id, e.parentId])
  );
  const isAncestor = (anc: string, desc: string): boolean => {
    let cur = parentOf.get(desc);
    const seen = new Set<string>();
    while (cur && !seen.has(cur)) {
      if (cur === anc) return true;
      seen.add(cur);
      cur = parentOf.get(cur);
    }
    return false;
  };
  return isAncestor(a, b) || isAncestor(b, a);
}

describe('autoLayout determinism', () => {
  it('same input → identical output (deep equal)', () => {
    const a = autoLayout(sampleDoc());
    const b = autoLayout(sampleDoc());
    expect(a).toEqual(b);
  });

  it('is order-independent for placement (shuffled input → same placements)', () => {
    const doc = sampleDoc();
    const shuffled = { ...doc, entities: [...doc.entities].reverse() };
    const outA = autoLayout(doc);
    const outB = autoLayout(shuffled);
    // Compare placement per id (array order differs, placements must match).
    const mapA = new Map(outA.entities.map((e) => [e.id, e.placement]));
    const mapB = new Map(outB.entities.map((e) => [e.id, e.placement]));
    for (const [id, p] of mapA) {
      expect(mapB.get(id)).toEqual(p);
    }
  });

  it('preserves entity array order', () => {
    const doc = sampleDoc();
    const out = autoLayout(doc);
    expect(out.entities.map((e) => e.id)).toEqual(doc.entities.map((e) => e.id));
  });

  it('does not mutate the input document', () => {
    const doc = sampleDoc();
    const before = JSON.parse(JSON.stringify(doc));
    autoLayout(doc);
    expect(doc).toEqual(before);
  });
});

describe('autoLayout non-overlap for grid entities', () => {
  // Containment is contractually intended (teams sit inside their department
  // plate; infra sits inside/adjacent to its parent zone). The guarantee is
  // that entities NOT in an ancestor/descendant relationship never overlap.
  it('produces no overlapping grid footprints among non-containment pairs', () => {
    const out = autoLayout(sampleDoc());
    const grids = gridPlacements(out);
    for (let i = 0; i < grids.length; i++) {
      for (let j = i + 1; j < grids.length; j++) {
        if (inContainment(out, grids[i].id, grids[j].id)) continue;
        const overlap = footprintsOverlap(grids[i].g, grids[j].g);
        expect(
          overlap,
          `${grids[i].id} overlaps ${grids[j].id}`
        ).toBe(false);
      }
    }
  });
});

describe('autoLayout placement semantics', () => {
  it('places users as free placements', () => {
    const out = autoLayout(sampleDoc());
    const users = out.entities.filter((e) => e.type === 'user');
    for (const u of users) expect(u.placement.mode).toBe('free');
  });

  it('places annotations as free placements above the map', () => {
    const out = autoLayout(sampleDoc());
    const note = out.entities.find((e) => e.id === 'note')!;
    expect(note.placement.mode).toBe('free');
  });

  it('gives every entity a placement', () => {
    const out = autoLayout(sampleDoc());
    for (const e of out.entities) {
      expect(e.placement).toBeDefined();
      expect(['grid', 'free']).toContain(e.placement.mode);
    }
  });

  it('scatter for users with the same parent is deterministic and distinct', () => {
    const out = autoLayout(sampleDoc());
    const u1 = out.entities.find((e) => e.id === 'user1')!.placement;
    const u2 = out.entities.find((e) => e.id === 'user2')!.placement;
    // Different ids → different seeded offsets → distinct positions.
    expect(u1).not.toEqual(u2);
  });
});
