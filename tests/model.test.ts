import { describe, it, expect } from 'vitest';
import {
  createEmptyDocument,
  byId,
  childrenOf,
  semanticRelatives,
  isEntityVisible,
  footprintsOverlap,
} from '../src/core/model.ts';
import type {
  SceneDocument,
  Entity,
  Placement,
} from '../src/core/model.ts';

function ent(partial: Partial<Entity> & { id: string; type: Entity['type'] }): Entity {
  return {
    label: partial.id,
    placement: { mode: 'grid', x: 0, y: 0, footprint: { w: 1, d: 1 } },
    asset: { symbol: 'x' },
    ...partial,
  };
}

function docWith(entities: Entity[]): SceneDocument {
  const d = createEmptyDocument('t', '2020-01-01T00:00:00.000Z');
  d.entities = entities;
  return d;
}

describe('createEmptyDocument', () => {
  it('is a valid empty v1 doc with injected timestamp', () => {
    const d = createEmptyDocument('My Map', '2020-01-01T00:00:00.000Z');
    expect(d.version).toBe(1);
    expect(d.meta.title).toBe('My Map');
    expect(d.meta.created).toBe('2020-01-01T00:00:00.000Z');
    expect(d.meta.modified).toBe('2020-01-01T00:00:00.000Z');
    expect(d.layers).toEqual([]);
    expect(d.entities).toEqual([]);
  });
});

describe('byId / childrenOf', () => {
  const d = docWith([
    ent({ id: 'org', type: 'organisation' }),
    ent({ id: 'dept', type: 'department', parentId: 'org' }),
    ent({ id: 'team', type: 'team', parentId: 'dept' }),
    ent({ id: 'team2', type: 'team', parentId: 'dept' }),
  ]);

  it('finds by id', () => {
    expect(byId(d, 'team')?.id).toBe('team');
    expect(byId(d, 'nope')).toBeUndefined();
  });

  it('lists direct children', () => {
    expect(childrenOf(d, 'dept').map((e) => e.id).sort()).toEqual(['team', 'team2']);
    expect(childrenOf(d, 'team')).toEqual([]);
  });
});

describe('semanticRelatives', () => {
  // org → dept → { team (focal), team2 }; team → user
  const d = docWith([
    ent({ id: 'org', type: 'organisation' }),
    ent({ id: 'dept', type: 'department', parentId: 'org' }),
    ent({ id: 'team', type: 'team', parentId: 'dept' }),
    ent({ id: 'team2', type: 'team', parentId: 'dept' }),
    ent({ id: 'user', type: 'user', parentId: 'team' }),
    ent({ id: 'unrelated', type: 'organisation' }),
  ]);

  it('includes self, transitive parents, transitive children, and direct siblings', () => {
    const ids = semanticRelatives(d, 'team').map((e) => e.id);
    expect(ids).toContain('team'); // self
    expect(ids).toContain('dept'); // parent
    expect(ids).toContain('org'); // grandparent
    expect(ids).toContain('user'); // child
    expect(ids).toContain('team2'); // sibling
    expect(ids).not.toContain('unrelated');
  });

  it('is self-first and de-duplicated', () => {
    const ids = semanticRelatives(d, 'team').map((e) => e.id);
    expect(ids[0]).toBe('team');
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('returns [] for missing id', () => {
    expect(semanticRelatives(d, 'ghost')).toEqual([]);
  });

  it('does not infinite-loop on a cycle', () => {
    const cyc = docWith([
      ent({ id: 'a', type: 'team', parentId: 'b' }),
      ent({ id: 'b', type: 'team', parentId: 'a' }),
    ]);
    const ids = semanticRelatives(cyc, 'a').map((e) => e.id);
    expect(ids).toContain('a');
    expect(ids).toContain('b');
  });
});

describe('isEntityVisible', () => {
  it('visible by default', () => {
    const d = docWith([ent({ id: 'a', type: 'team' })]);
    expect(isEntityVisible(d, byId(d, 'a')!)).toBe(true);
  });

  it('hidden when its type layer is hidden', () => {
    const d = docWith([ent({ id: 'a', type: 'team' })]);
    d.typeLayerVisibility = { team: false };
    expect(isEntityVisible(d, byId(d, 'a')!)).toBe(false);
  });

  it('hidden when ANY custom layer is hidden', () => {
    const d = docWith([ent({ id: 'a', type: 'team', customLayers: ['L1', 'L2'] })]);
    d.layers = [
      { id: 'L1', name: 'one', visible: true },
      { id: 'L2', name: 'two', visible: false },
    ];
    expect(isEntityVisible(d, byId(d, 'a')!)).toBe(false);
  });

  it('visible when type + all custom layers visible (truth table)', () => {
    const cases: Array<{ type: boolean; l1: boolean; l2: boolean; expected: boolean }> = [
      { type: true, l1: true, l2: true, expected: true },
      { type: true, l1: true, l2: false, expected: false },
      { type: true, l1: false, l2: true, expected: false },
      { type: false, l1: true, l2: true, expected: false },
      { type: false, l1: false, l2: false, expected: false },
    ];
    for (const c of cases) {
      const d = docWith([ent({ id: 'a', type: 'team', customLayers: ['L1', 'L2'] })]);
      d.typeLayerVisibility = { team: c.type };
      d.layers = [
        { id: 'L1', name: 'one', visible: c.l1 },
        { id: 'L2', name: 'two', visible: c.l2 },
      ];
      expect(isEntityVisible(d, byId(d, 'a')!)).toBe(c.expected);
    }
  });
});

describe('footprintsOverlap', () => {
  const g = (x: number, y: number, w: number, d: number): Placement => ({
    mode: 'grid',
    x,
    y,
    footprint: { w, d },
  });

  it('detects overlapping grid footprints', () => {
    expect(footprintsOverlap(g(0, 0, 2, 2), g(1, 1, 2, 2))).toBe(true);
  });

  it('detects non-overlapping adjacent footprints as disjoint', () => {
    expect(footprintsOverlap(g(0, 0, 2, 2), g(2, 0, 2, 2))).toBe(false);
  });

  it('free placements never overlap', () => {
    const free: Placement = { mode: 'free', x: 0, y: 0 };
    expect(footprintsOverlap(free, g(0, 0, 2, 2))).toBe(false);
    expect(footprintsOverlap(free, free)).toBe(false);
  });
});
