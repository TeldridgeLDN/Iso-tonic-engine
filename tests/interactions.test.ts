import { describe, it, expect } from 'vitest';
import {
  resolveGridDrop,
  resolveFreeDrop,
} from '../src/render/interactions.ts';
import { tileToScreen } from '../src/core/iso.ts';
import type { Entity, SceneDocument } from '../src/core/model.ts';
import { createEmptyDocument } from '../src/core/model.ts';

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
