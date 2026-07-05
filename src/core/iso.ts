// Pure isometric projection maths. No DOM / browser APIs.
//
// 2:1 isometric. Tile = 64 × 32 px.
//   +x projects to screen (+32, +16);  +y projects to (−32, +16).
//   screen = ((tx − ty) · 32, (tx + ty) · 16)
// The projection uses TILE_W/2 (=32) and TILE_H/2 (=16) as the per-axis steps.

import type { GridPlacement } from './model.ts';

export const TILE_W = 64;
export const TILE_H = 32;

const HALF_W = TILE_W / 2; // 32
const HALF_H = TILE_H / 2; // 16

export interface ScreenPoint {
  x: number;
  y: number;
}

export interface TilePoint {
  tx: number;
  ty: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Project integer-or-fractional tile coords to screen (world) pixel coords. */
export function tileToScreen(tx: number, ty: number): ScreenPoint {
  return {
    x: (tx - ty) * HALF_W,
    y: (tx + ty) * HALF_H,
  };
}

/**
 * Inverse of tileToScreen. Returns fractional tile coords.
 *
 * From screen = ((tx − ty)·HALF_W, (tx + ty)·HALF_H):
 *   sx/HALF_W = tx − ty
 *   sy/HALF_H = tx + ty
 * => tx = (sx/HALF_W + sy/HALF_H) / 2
 *    ty = (sy/HALF_H − sx/HALF_W) / 2
 */
export function screenToTile(sx: number, sy: number): TilePoint {
  const a = sx / HALF_W; // tx − ty
  const b = sy / HALF_H; // tx + ty
  return {
    tx: (a + b) / 2,
    ty: (b - a) / 2,
  };
}

/** Snap fractional tile coords to the nearest integer tile. */
export function snapToTile(tx: number, ty: number): TilePoint {
  return {
    tx: Math.round(tx),
    ty: Math.round(ty),
  };
}

/**
 * Effective (rotation-applied) footprint of a grid placement.
 *
 * The stored `footprint` is always AS AUTHORED (rotation 0). A quarter-turn
 * swaps the +x and +y extents, so odd rotations (1, 3) swap w↔d; even
 * rotations (0, 2, and absent) leave it unchanged. The origin tile is
 * unchanged — rotation pivots about the footprint origin.
 */
export function effectiveFootprint(placement: GridPlacement): {
  w: number;
  d: number;
} {
  const { w, d } = placement.footprint;
  const r = placement.rotation ?? 0;
  return r % 2 === 0 ? { w, d } : { w: d, d: w };
}

/**
 * The integer tiles occupied by a grid placement's footprint, honouring
 * rotation via effectiveFootprint. Footprint spans [x, x+w) along +x and
 * [y, y+d) along +y using the EFFECTIVE extents.
 */
export function footprintTiles(placement: GridPlacement): TilePoint[] {
  const { w, d } = effectiveFootprint(placement);
  const tiles: TilePoint[] = [];
  for (let dx = 0; dx < w; dx++) {
    for (let dy = 0; dy < d; dy++) {
      tiles.push({ tx: placement.x + dx, ty: placement.y + dy });
    }
  }
  return tiles;
}

/**
 * Screen-space axis-aligned bounding box of a footprint's *base* diamond.
 *
 * The base of an w×d footprint at origin (x,y) is the union of tile diamonds.
 * Its extreme screen points are the four corners of the big diamond:
 *   north  = tile (x,         y)          top vertex           → screen (tileToScreen(x,y))
 *   the base diamond of tile (0,0) has vertices
 *     (0,0) → (32,16) → (0,32) → (−32,16)
 * For the whole footprint the extremes are:
 *   top    (min y): north vertex of origin tile              → tileToScreen(x, y)          .y
 *   bottom (max y): south vertex of far tile (x+w-1, y+d-1)  → tileToScreen(x+w, y+d)      .y
 *   left   (min x): west vertex  of tile (x,     y+d-1)      → tileToScreen(x,   y+d)       .x
 *   right  (max x): east vertex  of tile (x+w-1, y    )      → tileToScreen(x+w, y)         .x
 */
export function footprintBaseBBox(placement: GridPlacement): Rect {
  const { x, y } = placement;
  const { w, d } = effectiveFootprint(placement);

  const top = tileToScreen(x, y).y; // north vertex
  const bottom = tileToScreen(x + w, y + d).y; // south vertex
  const left = tileToScreen(x, y + d).x; // west vertex
  const right = tileToScreen(x + w, y).x; // east vertex

  return {
    x: left,
    y: top,
    w: right - left,
    h: bottom - top,
  };
}
