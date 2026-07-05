import { describe, it, expect } from 'vitest';
import {
  TILE_W,
  TILE_H,
  tileToScreen,
  screenToTile,
  snapToTile,
  footprintTiles,
  footprintBaseBBox,
  effectiveFootprint,
} from '../src/core/iso.ts';
import type { GridPlacement } from '../src/core/model.ts';

describe('iso constants', () => {
  it('has 64x32 tiles', () => {
    expect(TILE_W).toBe(64);
    expect(TILE_H).toBe(32);
  });
});

describe('tileToScreen', () => {
  it('matches the contract formula screen=((tx-ty)*32,(tx+ty)*16)', () => {
    expect(tileToScreen(0, 0)).toEqual({ x: 0, y: 0 });
    expect(tileToScreen(1, 0)).toEqual({ x: 32, y: 16 });
    expect(tileToScreen(0, 1)).toEqual({ x: -32, y: 16 });
    expect(tileToScreen(1, 1)).toEqual({ x: 0, y: 32 });
    expect(tileToScreen(2, 3)).toEqual({ x: -32, y: 80 });
  });
});

describe('screenToTile / tileToScreen round-trip', () => {
  it('is identity on integer tiles across a range (property-style)', () => {
    for (let tx = -20; tx <= 20; tx++) {
      for (let ty = -20; ty <= 20; ty++) {
        const s = tileToScreen(tx, ty);
        const back = screenToTile(s.x, s.y);
        expect(back.tx).toBeCloseTo(tx, 10);
        expect(back.ty).toBeCloseTo(ty, 10);
      }
    }
  });

  it('returns fractional coords for mid-tile screen points', () => {
    // screen (0,16) is the centre of tile (0,0)'s diamond-ish midpoint band
    const t = screenToTile(0, 16);
    expect(t.tx).toBeCloseTo(0.5, 10);
    expect(t.ty).toBeCloseTo(0.5, 10);
  });
});

describe('snapToTile', () => {
  it('rounds to nearest integer tile', () => {
    expect(snapToTile(0.4, 0.6)).toEqual({ tx: 0, ty: 1 });
    expect(snapToTile(-1.4, 2.5)).toEqual({ tx: -1, ty: 3 });
  });

  it('composes with screenToTile to give the containing tile', () => {
    const s = tileToScreen(3, 5);
    const snapped = snapToTile(...([screenToTile(s.x, s.y).tx, screenToTile(s.x, s.y).ty] as [number, number]));
    expect(snapped).toEqual({ tx: 3, ty: 5 });
  });
});

describe('effectiveFootprint', () => {
  it('is identity for even rotations (0, 2) and absent rotation', () => {
    const base: GridPlacement = { mode: 'grid', x: 0, y: 0, footprint: { w: 2, d: 1 } };
    expect(effectiveFootprint(base)).toEqual({ w: 2, d: 1 });
    expect(effectiveFootprint({ ...base, rotation: 0 })).toEqual({ w: 2, d: 1 });
    expect(effectiveFootprint({ ...base, rotation: 2 })).toEqual({ w: 2, d: 1 });
  });

  it('swaps w/d for odd rotations (1, 3)', () => {
    const base: GridPlacement = { mode: 'grid', x: 0, y: 0, footprint: { w: 2, d: 1 } };
    expect(effectiveFootprint({ ...base, rotation: 1 })).toEqual({ w: 1, d: 2 });
    expect(effectiveFootprint({ ...base, rotation: 3 })).toEqual({ w: 1, d: 2 });
  });

  it('does not mutate the stored footprint (authored footprint preserved)', () => {
    const base: GridPlacement = { mode: 'grid', x: 0, y: 0, footprint: { w: 2, d: 1 }, rotation: 1 };
    effectiveFootprint(base);
    expect(base.footprint).toEqual({ w: 2, d: 1 });
  });
});

describe('footprintTiles', () => {
  it('enumerates the occupied tiles of a footprint', () => {
    const p: GridPlacement = { mode: 'grid', x: 2, y: 3, footprint: { w: 2, d: 2 } };
    const tiles = footprintTiles(p);
    expect(tiles).toHaveLength(4);
    expect(tiles).toEqual(
      expect.arrayContaining([
        { tx: 2, ty: 3 },
        { tx: 3, ty: 3 },
        { tx: 2, ty: 4 },
        { tx: 3, ty: 4 },
      ])
    );
  });

  it('handles 1x1', () => {
    const p: GridPlacement = { mode: 'grid', x: 0, y: 0, footprint: { w: 1, d: 1 } };
    expect(footprintTiles(p)).toEqual([{ tx: 0, ty: 0 }]);
  });

  it('occupies the rotated (effective) tiles for an odd rotation', () => {
    // 2x1 authored (tiles along +x), rotated 1 → 1x2 (tiles along +y).
    const p: GridPlacement = { mode: 'grid', x: 0, y: 0, footprint: { w: 2, d: 1 }, rotation: 1 };
    expect(footprintTiles(p)).toEqual([
      { tx: 0, ty: 0 },
      { tx: 0, ty: 1 },
    ]);
  });
});

describe('footprintBaseBBox (rotation-aware)', () => {
  it('bounds the swapped extents for an odd rotation', () => {
    // authored 2x1, rotation 1 → effective 1x2.
    const p: GridPlacement = { mode: 'grid', x: 0, y: 0, footprint: { w: 2, d: 1 }, rotation: 1 };
    const rotated = footprintBaseBBox(p);
    const equiv = footprintBaseBBox({ mode: 'grid', x: 0, y: 0, footprint: { w: 1, d: 2 } });
    expect(rotated).toEqual(equiv);
  });
});

describe('footprintBaseBBox', () => {
  it('bounds the base diamond of a 1x1 at origin', () => {
    const p: GridPlacement = { mode: 'grid', x: 0, y: 0, footprint: { w: 1, d: 1 } };
    const bbox = footprintBaseBBox(p);
    // vertices (0,0),(32,16),(0,32),(-32,16) → bbox x:-32 w:64 y:0 h:32
    expect(bbox).toEqual({ x: -32, y: 0, w: 64, h: 32 });
  });

  it('bounds a 2x2 footprint', () => {
    const p: GridPlacement = { mode: 'grid', x: 0, y: 0, footprint: { w: 2, d: 2 } };
    const bbox = footprintBaseBBox(p);
    // top = tileToScreen(0,0).y = 0
    // bottom = tileToScreen(2,2).y = (2+2)*16 = 64
    // left = tileToScreen(0,2).x = (0-2)*32 = -64
    // right = tileToScreen(2,0).x = (2-0)*32 = 64
    expect(bbox).toEqual({ x: -64, y: 0, w: 128, h: 64 });
  });
});
