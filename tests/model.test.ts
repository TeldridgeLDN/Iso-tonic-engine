import { describe, it, expect } from 'vitest';
import {
  createEmptyDocument,
  byId,
  childrenOf,
  semanticRelatives,
  spotlightSet,
  isEntityVisible,
  footprintsOverlap,
  effectiveFootprint,
  resolveRouteStops,
} from '../src/core/model.ts';
import { tileToScreen } from '../src/core/iso.ts';
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

function route(
  id: string,
  stops: Array<{ entityId: string } | { x: number; y: number }>
): Entity {
  return {
    id,
    type: 'route',
    label: id,
    placement: { mode: 'free', x: 0, y: 0 },
    asset: { symbol: 'route-path', params: { stops } },
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
    ent({ id: 'org', type: 'territory' }),
    ent({ id: 'dept', type: 'territory', parentId: 'org' }),
    ent({ id: 'team', type: 'territory', parentId: 'dept' }),
    ent({ id: 'team2', type: 'territory', parentId: 'dept' }),
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
    ent({ id: 'org', type: 'territory' }),
    ent({ id: 'dept', type: 'territory', parentId: 'org' }),
    ent({ id: 'team', type: 'territory', parentId: 'dept' }),
    ent({ id: 'team2', type: 'territory', parentId: 'dept' }),
    ent({ id: 'user', type: 'user', parentId: 'team' }),
    ent({ id: 'unrelated', type: 'territory' }),
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
      ent({ id: 'a', type: 'territory', parentId: 'b' }),
      ent({ id: 'b', type: 'territory', parentId: 'a' }),
    ]);
    const ids = semanticRelatives(cyc, 'a').map((e) => e.id);
    expect(ids).toContain('a');
    expect(ids).toContain('b');
  });
});

describe('isEntityVisible', () => {
  it('visible by default', () => {
    const d = docWith([ent({ id: 'a', type: 'territory' })]);
    expect(isEntityVisible(d, byId(d, 'a')!)).toBe(true);
  });

  it('hidden when its type layer is hidden', () => {
    const d = docWith([ent({ id: 'a', type: 'territory' })]);
    d.typeLayerVisibility = { territory: false };
    expect(isEntityVisible(d, byId(d, 'a')!)).toBe(false);
  });

  it('hidden when ANY custom layer is hidden', () => {
    const d = docWith([ent({ id: 'a', type: 'territory', customLayers: ['L1', 'L2'] })]);
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
      const d = docWith([ent({ id: 'a', type: 'territory', customLayers: ['L1', 'L2'] })]);
      d.typeLayerVisibility = { territory: c.type };
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

  it('re-exports effectiveFootprint from the model surface', () => {
    const p: Placement = { mode: 'grid', x: 0, y: 0, footprint: { w: 3, d: 1 }, rotation: 1 };
    expect(effectiveFootprint(p as never)).toEqual({ w: 1, d: 3 });
  });

  it('2x1 at rotation 1 collides where rotation 0 would not', () => {
    // Focal 1x1 at (0,1).
    const target: Placement = { mode: 'grid', x: 0, y: 1, footprint: { w: 1, d: 1 } };
    // 2x1 at (0,0): rotation 0 occupies (0,0),(1,0) → NO overlap with (0,1).
    const unrotated: Placement = { mode: 'grid', x: 0, y: 0, footprint: { w: 2, d: 1 } };
    expect(footprintsOverlap(target, unrotated)).toBe(false);
    // rotation 1 → 1x2 occupies (0,0),(0,1) → overlaps (0,1).
    const rotated: Placement = { mode: 'grid', x: 0, y: 0, footprint: { w: 2, d: 1 }, rotation: 1 };
    expect(footprintsOverlap(target, rotated)).toBe(true);
  });
});

describe('spotlightSet', () => {
  it('includes semanticRelatives (self, parents, children, siblings)', () => {
    const d = docWith([
      ent({ id: 'org', type: 'territory' }),
      ent({ id: 'dept', type: 'territory', parentId: 'org' }),
      ent({ id: 'team', type: 'territory', parentId: 'dept' }),
      ent({ id: 'team2', type: 'territory', parentId: 'dept' }),
      ent({ id: 'user', type: 'user', parentId: 'team' }),
      ent({ id: 'unrelated', type: 'territory' }),
    ]);
    const s = spotlightSet(d, 'team');
    expect(s.has('team')).toBe(true); // self
    expect(s.has('dept')).toBe(true); // parent
    expect(s.has('org')).toBe(true); // grandparent
    expect(s.has('user')).toBe(true); // child
    expect(s.has('team2')).toBe(true); // sibling
    expect(s.has('unrelated')).toBe(false);
  });

  it('adds every entity sharing at least one custom layer with the focal', () => {
    const d = docWith([
      ent({ id: 'focal', type: 'territory', customLayers: ['journey-A'] }),
      ent({ id: 'sharesA', type: 'territory', customLayers: ['journey-A'] }),
      ent({ id: 'sharesA2', type: 'user', customLayers: ['other', 'journey-A'] }),
      ent({ id: 'noshare', type: 'territory', customLayers: ['journey-B'] }),
      ent({ id: 'nolayers', type: 'territory' }),
    ]);
    d.layers = [
      { id: 'journey-A', name: 'A', visible: true },
      { id: 'journey-B', name: 'B', visible: true },
      { id: 'other', name: 'O', visible: true },
    ];
    const s = spotlightSet(d, 'focal');
    expect(s.has('focal')).toBe(true);
    expect(s.has('sharesA')).toBe(true);
    expect(s.has('sharesA2')).toBe(true);
    expect(s.has('noshare')).toBe(false);
    expect(s.has('nolayers')).toBe(false);
  });

  it('combines shared-layer group WITH parent/child/sibling chains', () => {
    const d = docWith([
      ent({ id: 'org', type: 'territory' }),
      ent({ id: 'team', type: 'territory', parentId: 'org', customLayers: ['L'] }),
      ent({ id: 'user', type: 'user', parentId: 'team' }), // child, no layer
      ent({ id: 'crossCut', type: 'territory', customLayers: ['L'] }), // shared layer only
    ]);
    d.layers = [{ id: 'L', name: 'L', visible: true }];
    const s = spotlightSet(d, 'team');
    expect(s.has('org')).toBe(true); // parent chain
    expect(s.has('user')).toBe(true); // child chain
    expect(s.has('crossCut')).toBe(true); // shared layer
  });

  it('focal without custom layers behaves exactly like semanticRelatives', () => {
    const d = docWith([
      ent({ id: 'dept', type: 'territory' }),
      ent({ id: 'team', type: 'territory', parentId: 'dept' }),
      ent({ id: 'other', type: 'territory', customLayers: ['X'] }),
    ]);
    d.layers = [{ id: 'X', name: 'X', visible: true }];
    const s = spotlightSet(d, 'team');
    const rel = new Set(semanticRelatives(d, 'team').map((e) => e.id));
    expect(s).toEqual(rel);
    expect(s.has('other')).toBe(false);
  });

  it('returns an empty set for a missing focal id', () => {
    const d = docWith([ent({ id: 'a', type: 'territory' })]);
    expect(spotlightSet(d, 'ghost').size).toBe(0);
  });

  it('is dangling-layer-safe: groups by shared id even if no CustomLayer defines it', () => {
    const d = docWith([
      ent({ id: 'focal', type: 'territory', customLayers: ['ghostLayer'] }),
      ent({ id: 'peer', type: 'territory', customLayers: ['ghostLayer'] }),
    ]);
    // doc.layers intentionally does not define 'ghostLayer'.
    const s = spotlightSet(d, 'focal');
    expect(s.has('peer')).toBe(true);
  });

  it('is cycle-safe (via semanticRelatives)', () => {
    const cyc = docWith([
      ent({ id: 'a', type: 'territory', parentId: 'b' }),
      ent({ id: 'b', type: 'territory', parentId: 'a' }),
    ]);
    const s = spotlightSet(cyc, 'a');
    expect(s.has('a')).toBe(true);
    expect(s.has('b')).toBe(true);
  });

  // --- route linkage ---

  it('lights a focal route’s stop entities (route → stops)', () => {
    const d = docWith([
      ent({ id: 'a', type: 'user' }),
      ent({ id: 'b', type: 'territory' }),
      ent({ id: 'unrelated', type: 'territory' }),
      route('r', [{ entityId: 'a' }, { entityId: 'b' }]),
    ]);
    const s = spotlightSet(d, 'r');
    expect(s.has('r')).toBe(true); // self
    expect(s.has('a')).toBe(true);
    expect(s.has('b')).toBe(true);
    expect(s.has('unrelated')).toBe(false);
  });

  it('lights every route that lists the focal entity as a stop (entity → routes)', () => {
    const d = docWith([
      ent({ id: 'a', type: 'user' }),
      ent({ id: 'b', type: 'territory' }),
      route('r1', [{ entityId: 'a' }]),
      route('r2', [{ entityId: 'b' }, { entityId: 'a' }]),
      route('r3', [{ entityId: 'b' }]),
    ]);
    const s = spotlightSet(d, 'a');
    expect(s.has('r1')).toBe(true);
    expect(s.has('r2')).toBe(true);
    expect(s.has('r3')).toBe(false); // does not list a
  });

  it('does not transit through routes (focal entity → route → other stop stays dark)', () => {
    const d = docWith([
      ent({ id: 'a', type: 'user' }),
      ent({ id: 'b', type: 'territory' }),
      route('r', [{ entityId: 'a' }, { entityId: 'b' }]),
    ]);
    // Focal a lights route r, but NOT r's other stop b.
    const s = spotlightSet(d, 'a');
    expect(s.has('r')).toBe(true);
    expect(s.has('b')).toBe(false);
  });
});

describe('resolveRouteStops', () => {
  it('resolves grid entity stops via tileToScreen and free stops via their coords', () => {
    const d = docWith([
      ent({
        id: 'g',
        type: 'user',
        placement: { mode: 'grid', x: 2, y: 3, footprint: { w: 1, d: 1 } },
      }),
      ent({
        id: 'f',
        type: 'territory',
        placement: { mode: 'free', x: 100, y: 200 },
      }),
      route('r', [{ entityId: 'g' }, { x: 7, y: 9 }, { entityId: 'f' }]),
    ]);
    const pts = resolveRouteStops(d, byId(d, 'r')!);
    const g = tileToScreen(2, 3);
    expect(pts).toEqual([
      { x: g.x, y: g.y, entityId: 'g' },
      { x: 7, y: 9 },
      { x: 100, y: 200, entityId: 'f' },
    ]);
  });

  it('skips dangling and route-referencing stops, preserving order', () => {
    const d = docWith([
      ent({ id: 'a', type: 'user', placement: { mode: 'free', x: 1, y: 2 } }),
      ent({ id: 'b', type: 'user', placement: { mode: 'free', x: 3, y: 4 } }),
      route('other', [{ entityId: 'a' }]),
      route('r', [
        { entityId: 'a' },
        { entityId: 'ghost' }, // dangling → skip
        { entityId: 'other' }, // references a route → skip
        { entityId: 'b' },
      ]),
    ]);
    const pts = resolveRouteStops(d, byId(d, 'r')!);
    expect(pts).toEqual([
      { x: 1, y: 2, entityId: 'a' },
      { x: 3, y: 4, entityId: 'b' },
    ]);
  });

  it('returns [] for a route with malformed/absent stops', () => {
    const d = docWith([
      ent({
        id: 'r',
        type: 'route',
        placement: { mode: 'free', x: 0, y: 0 },
        asset: { symbol: 'route-path' }, // no params
      }),
    ]);
    expect(resolveRouteStops(d, byId(d, 'r')!)).toEqual([]);
  });
});
