import { describe, it, expect } from 'vitest';
import {
  resolveGridDrop,
  resolveFreeDrop,
  entitiesInMarquee,
  resolveGroupMove,
  isTerritoryEntity,
} from '../src/render/interactions.ts';
import { tileToScreen } from '../src/core/iso.ts';
import type { Entity, SceneDocument, Placement } from '../src/core/model.ts';
import { createEmptyDocument, descendantsOf } from '../src/core/model.ts';
import { MoveEntity, CompoundCommand } from '../src/core/commands.ts';

function gridEntity(id: string, x: number, y: number, w = 1, d = 1): Entity {
  return {
    id,
    type: 'physical-infra',
    label: id,
    placement: { mode: 'grid', x, y, footprint: { w, d } },
    asset: { symbol: 'server-rack' },
  };
}

function docWith(...entities: Entity[]): SceneDocument {
  const doc = createEmptyDocument('t', '2026-01-01T00:00:00.000Z');
  return { ...doc, entities };
}

/** World position of a tile origin (matches how the app converts pointers). */
function worldAtTile(tx: number, ty: number): { x: number; y: number } {
  return tileToScreen(tx, ty);
}

describe('resolveGridDrop', () => {
  it('snaps the dragged entity to the nearest tile from the pointer delta', () => {
    const e = gridEntity('a', 0, 0);
    const doc = docWith(e);
    // drag pointer from tile(0,0) origin to tile(2,1) origin
    const res = resolveGridDrop(e, worldAtTile(0, 0), worldAtTile(2, 1), doc);
    expect(res.placement).toEqual({ mode: 'grid', x: 2, y: 1, footprint: { w: 1, d: 1 } });
    expect(res.accepted).toBe(true);
    expect(res.unchanged).toBe(false);
  });

  it('rejects a drop that overlaps another grid footprint', () => {
    const a = gridEntity('a', 0, 0);
    const b = gridEntity('b', 2, 2);
    const doc = docWith(a, b);
    // move a onto b's tile (2,2)
    const res = resolveGridDrop(a, worldAtTile(0, 0), worldAtTile(2, 2), doc);
    expect(res.placement).toEqual({ mode: 'grid', x: 2, y: 2, footprint: { w: 1, d: 1 } });
    expect(res.accepted).toBe(false);
  });

  it('accepts a drop adjacent to another footprint (no tile overlap)', () => {
    const a = gridEntity('a', 0, 0);
    const b = gridEntity('b', 2, 2);
    const doc = docWith(a, b);
    // land a at (2,1): adjacent to b(2,2), no shared tile
    const res = resolveGridDrop(a, worldAtTile(0, 0), worldAtTile(2, 1), doc);
    expect(res.accepted).toBe(true);
    expect(res.placement.x).toBe(2);
    expect(res.placement.y).toBe(1);
  });

  it('flags a zero-delta drag as unchanged', () => {
    const e = gridEntity('a', 3, 4);
    const doc = docWith(e);
    const res = resolveGridDrop(e, worldAtTile(0, 0), worldAtTile(0, 0), doc);
    expect(res.unchanged).toBe(true);
    expect(res.placement).toEqual({ mode: 'grid', x: 3, y: 4, footprint: { w: 1, d: 1 } });
  });

  it('respects multi-tile footprints when detecting overlap', () => {
    const a = gridEntity('a', 0, 0, 2, 2);
    const b = gridEntity('b', 3, 3, 2, 2);
    const doc = docWith(a, b);
    // shift a by +2,+2 → occupies (2,2)-(3,3): (3,3) collides with b
    const res = resolveGridDrop(a, worldAtTile(0, 0), worldAtTile(2, 2), doc);
    expect(res.accepted).toBe(false);
  });
});

describe('entitiesInMarquee', () => {
  it('selects entities whose projected origin falls inside the rectangle', () => {
    const a = gridEntity('a', 0, 0); // origin (0,0)
    const b = gridEntity('b', 2, 1); // origin (32,48)
    const c = gridEntity('c', 10, 10); // origin (0,320) — far away
    const doc = docWith(a, b, c);
    const ids = entitiesInMarquee(doc, { x: -1, y: -1 }, { x: 33, y: 49 });
    expect(ids.sort()).toEqual(['a', 'b']);
  });

  it('normalises corner order (rectangle given bottom-right → top-left)', () => {
    const a = gridEntity('a', 0, 0);
    const doc = docWith(a);
    expect(entitiesInMarquee(doc, { x: 10, y: 10 }, { x: -10, y: -10 })).toEqual(['a']);
  });

  it('includes ground entities (roads/rivers) so they can be batch-selected', () => {
    const road = gridEntity('road-1', 1, 1); // origin (0,32)
    const doc = docWith(road);
    const o = worldAtTile(1, 1);
    const ids = entitiesInMarquee(
      doc,
      { x: o.x - 1, y: o.y - 1 },
      { x: o.x + 1, y: o.y + 1 }
    );
    expect(ids).toEqual(['road-1']);
  });

  it('returns [] when nothing falls inside', () => {
    const a = gridEntity('a', 0, 0);
    const doc = docWith(a);
    expect(entitiesInMarquee(doc, { x: 100, y: 100 }, { x: 200, y: 200 })).toEqual([]);
  });
});

describe('resolveGroupMove — territory drags carry descendants', () => {
  function territoryPlate(id: string, x: number, y: number, w = 6, d = 6): Entity {
    return {
      id,
      type: 'territory',
      label: id,
      placement: { mode: 'grid', x, y, footprint: { w, d } },
      asset: { symbol: 'territory', params: { w, d } },
    };
  }
  function buildingChild(
    id: string,
    parentId: string,
    x: number,
    y: number,
    w = 1,
    d = 1
  ): Entity {
    return {
      id,
      type: 'physical-infra',
      label: id,
      parentId,
      placement: { mode: 'grid', x, y, footprint: { w, d } },
      asset: { symbol: 'building' },
    };
  }
  function figurineChild(id: string, parentId: string, x: number, y: number): Entity {
    return {
      id,
      type: 'user',
      label: id,
      parentId,
      placement: { mode: 'free', x, y },
      asset: { symbol: 'figurine' },
    };
  }
  const placementOf = (doc: SceneDocument, id: string): Placement =>
    (doc.entities.find((e) => e.id === id) as Entity).placement;

  it('(scope guard) only territory-category entities are group drags', () => {
    const plate = territoryPlate('t', 0, 0);
    const bldg = buildingChild('b', 't', 3, 3);
    expect(isTerritoryEntity(plate)).toBe(true);
    expect(isTerritoryEntity(bldg)).toBe(false);
    // department-zone resolves to the territory asset via ID_ALIASES.
    const zone: Entity = { ...plate, asset: { symbol: 'department-zone' } };
    expect(isTerritoryEntity(zone)).toBe(true);
  });

  it('descendantsOf returns transitive children (grandchildren included)', () => {
    const plate = territoryPlate('t', 0, 0);
    const b = buildingChild('b', 't', 3, 3);
    const f = figurineChild('f', 'b', 1, 2); // grandchild of t
    const doc = docWith(plate, b, f);
    expect(descendantsOf(doc, 't').map((e) => e.id).sort()).toEqual(['b', 'f']);
  });

  it('(a) shifts grid descendants by tile delta and free descendants by px delta', () => {
    const plate = territoryPlate('t', 0, 0, 6, 6);
    const bldg = buildingChild('b', 't', 3, 3);
    const fig = figurineChild('f', 't', 10, 20);
    const grand = figurineChild('g', 'b', 5, 5); // transitive free descendant
    const doc = docWith(plate, bldg, fig, grand);
    // drag plate origin from tile(0,0) → tile(4,2): dtx=4, dty=2.
    const res = resolveGroupMove(plate, worldAtTile(0, 0), worldAtTile(4, 2), doc);
    const map = Object.fromEntries(res.members.map((m) => [m.id, m.placement]));
    expect(res.members[0].id).toBe('t'); // plate first
    expect(map['t']).toMatchObject({ mode: 'grid', x: 4, y: 2 });
    expect(map['b']).toMatchObject({ mode: 'grid', x: 7, y: 5 });
    // free delta = tileToScreen(4,2) = ((4-2)*32, (4+2)*16) = (64, 96).
    expect(map['f']).toEqual({ mode: 'free', x: 74, y: 116 });
    expect(map['g']).toEqual({ mode: 'free', x: 69, y: 101 });
    expect(res.accepted).toBe(true);
    expect(res.unchanged).toBe(false);
  });

  it('(b) a CompoundCommand of the moves is ONE undo step restoring all', () => {
    const plate = territoryPlate('t', 0, 0, 6, 6);
    const bldg = buildingChild('b', 't', 3, 3);
    const fig = figurineChild('f', 't', 10, 20);
    const doc = docWith(plate, bldg, fig);
    const res = resolveGroupMove(plate, worldAtTile(0, 0), worldAtTile(4, 2), doc);
    const cmd = new CompoundCommand(
      'Move territory group',
      res.members.map((m) => new MoveEntity(m.id, m.placement))
    );
    const applied = cmd.apply(doc);
    expect(placementOf(applied, 't')).toMatchObject({ x: 4, y: 2 });
    expect(placementOf(applied, 'b')).toMatchObject({ x: 7, y: 5 });
    expect(placementOf(applied, 'f')).toMatchObject({ x: 74, y: 116 });
    // one invert restores every moved entity
    expect(cmd.invert(applied)).toEqual(doc);
  });

  it('(d) excludes group members from the overlap test (onto a sibling old tile is fine)', () => {
    const plate = territoryPlate('t', 0, 0, 6, 6);
    const a = buildingChild('a', 't', 1, 1);
    const b = buildingChild('b', 't', 2, 1);
    const doc = docWith(plate, a, b);
    // shift +1,0: a→(2,1) lands on b's CURRENT tile, but b is a member (→3,1),
    // so the group must not reject itself.
    const res = resolveGroupMove(plate, worldAtTile(0, 0), worldAtTile(1, 0), doc);
    expect(res.accepted).toBe(true);
  });

  it('(d) rejects when a moving member would overlap a NON-member footprint', () => {
    const plate = territoryPlate('t', 0, 0, 6, 6);
    const a = buildingChild('a', 't', 1, 1);
    const obstacle = gridEntity('obs', 5, 1); // not a child of the plate
    const doc = docWith(plate, a, obstacle);
    // shift +4,0: a→(5,1) collides with the non-member obstacle.
    const res = resolveGroupMove(plate, worldAtTile(0, 0), worldAtTile(4, 0), doc);
    expect(res.accepted).toBe(false);
  });

  it('flags a zero-delta group drag as unchanged', () => {
    const plate = territoryPlate('t', 3, 4, 6, 6);
    const bldg = buildingChild('b', 't', 5, 6);
    const doc = docWith(plate, bldg);
    const res = resolveGroupMove(plate, worldAtTile(0, 0), worldAtTile(0, 0), doc);
    expect(res.unchanged).toBe(true);
  });
});

describe('resolveFreeDrop', () => {
  it('moves a free entity by the raw world delta (no snapping)', () => {
    const e: Entity = {
      id: 'f',
      type: 'user',
      label: 'f',
      placement: { mode: 'free', x: 10, y: 20 },
      asset: { symbol: 'figurine' },
    };
    const next = resolveFreeDrop(e, { x: 0, y: 0 }, { x: 15, y: -5 });
    expect(next).toEqual({ mode: 'free', x: 25, y: 15 });
  });
});

describe('resolveGridDrop — territory ground exemption', () => {
  function territoryEntity(id: string, x: number, y: number, w = 10, d = 10): Entity {
    return {
      id,
      type: 'territory',
      label: id,
      placement: { mode: 'grid', x, y, footprint: { w, d } },
      asset: { symbol: 'territory', params: { w, d } },
    };
  }

  it('accepts dropping an object onto a territory (ground underlies things)', () => {
    const obj = gridEntity('obj', 20, 20);
    const terr = territoryEntity('terr', 0, 0, 10, 10);
    const doc = docWith(obj, terr);
    // move obj onto tile (3,3), inside the territory footprint
    const res = resolveGridDrop(obj, worldAtTile(20, 20), worldAtTile(3, 3), doc);
    expect(res.placement.x).toBe(3);
    expect(res.placement.y).toBe(3);
    expect(res.accepted).toBe(true);
  });

  it('accepts moving a territory underneath existing objects', () => {
    const obj = gridEntity('obj', 3, 3);
    const terr = territoryEntity('terr', 20, 20, 10, 10);
    const doc = docWith(obj, terr);
    // move territory so it covers obj at (3,3)
    const res = resolveGridDrop(terr, worldAtTile(20, 20), worldAtTile(0, 0), doc);
    expect(res.accepted).toBe(true);
  });

  it('still rejects object-on-object overlap', () => {
    const a = gridEntity('a', 0, 0);
    const b = gridEntity('b', 5, 5);
    const terr = territoryEntity('terr', 0, 0, 10, 10);
    const doc = docWith(a, b, terr);
    const res = resolveGridDrop(a, worldAtTile(0, 0), worldAtTile(5, 5), doc);
    expect(res.accepted).toBe(false);
  });
});
