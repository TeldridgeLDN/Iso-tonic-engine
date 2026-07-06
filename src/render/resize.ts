// Pure resize maths + the resizability predicate for zone-type ground assets.
// No DOM / browser APIs — everything here is unit-tested headlessly.
//
// Terminology:
//   authored footprint  = placement.footprint (AS AUTHORED, rotation 0)
//   effective footprint = authored swapped w↔d for odd rotations (what the user
//                         sees and drags). The handle + drag work in EFFECTIVE
//                         space; the ResizeEntity command stays dumb (authored),
//                         so this module converts at the boundary.

import type { Entity, GridPlacement } from '../core/model.ts';
import { effectiveFootprint, tileToScreen } from '../core/iso.ts';
import type { ScreenPoint } from '../core/iso.ts';

// A minimal shape of an asset def, kept local so this module does not depend on
// the asset library's concrete type (library.ts is read-only / owned elsewhere).
export interface ResizeAssetDef {
  ground?: boolean;
  paramSchema?: { key: string; kind: string; min?: number; max?: number }[];
}

export interface SizeBounds {
  min: number;
  max: number;
}

/** Default clamp when a param field omits min/max. */
export const DEFAULT_MIN = 1;
export const DEFAULT_MAX = 24;

/**
 * A grid, ground zone asset whose paramSchema carries numeric `w` and `d`
 * fields is resizable tile-by-tile. Anything else (free placement, non-ground,
 * or an asset without both numeric w/d params) is not.
 */
export function isResizable(
  entity: Entity,
  assetDef: ResizeAssetDef | undefined
): boolean {
  if (entity.placement.mode !== 'grid') return false;
  if (!assetDef || assetDef.ground !== true) return false;
  return hasNumericField(assetDef, 'w') && hasNumericField(assetDef, 'd');
}

function hasNumericField(def: ResizeAssetDef, key: string): boolean {
  return (def.paramSchema ?? []).some(
    (f) => f.key === key && f.kind === 'number'
  );
}

/** Clamp bounds for the w/d params, falling back to DEFAULT_MIN/MAX. */
export function resizeBounds(assetDef: ResizeAssetDef | undefined): {
  w: SizeBounds;
  d: SizeBounds;
} {
  return {
    w: fieldBounds(assetDef, 'w'),
    d: fieldBounds(assetDef, 'd'),
  };
}

function fieldBounds(
  def: ResizeAssetDef | undefined,
  key: string
): SizeBounds {
  const f = (def?.paramSchema ?? []).find(
    (x) => x.key === key && x.kind === 'number'
  );
  return {
    min: typeof f?.min === 'number' ? f.min : DEFAULT_MIN,
    max: typeof f?.max === 'number' ? f.max : DEFAULT_MAX,
  };
}

function clamp(v: number, b: SizeBounds): number {
  return Math.min(b.max, Math.max(b.min, v));
}

/**
 * Resolve a resize drag into an AUTHORED {w,d}.
 *
 * The handle lives at the far corner of the EFFECTIVE footprint, so we work in
 * effective tiles: candidate effective extent = round(pointer − origin), clamped
 * to the effective bounds, then converted to authored space (swapped for odd
 * rotation). Bounds are supplied in AUTHORED axes (w=x-extent, d=y-extent); for
 * odd rotation the effective axes map to the swapped authored bounds.
 *
 * @param originTile   the footprint origin tile (placement x/y)
 * @param pointerTile  fractional tile coords under the pointer now
 * @param bounds       authored-axis clamp bounds { w, d }
 * @param rotation     placement rotation (0..3); odd ⇒ effective swaps w/d
 * @returns authored { w, d } (integers, clamped)
 */
export function resolveResizeDrag(
  originTile: { tx: number; ty: number },
  pointerTile: { tx: number; ty: number },
  bounds: { w: SizeBounds; d: SizeBounds },
  rotation: 0 | 1 | 2 | 3 = 0
): { w: number; d: number } {
  const odd = rotation % 2 === 1;

  // Effective bounds: for odd rotation the effective x-axis is the authored
  // d-axis and vice-versa.
  const effWBounds = odd ? bounds.d : bounds.w;
  const effDBounds = odd ? bounds.w : bounds.d;

  const effW = clamp(Math.round(pointerTile.tx - originTile.tx), effWBounds);
  const effD = clamp(Math.round(pointerTile.ty - originTile.ty), effDBounds);

  // Convert effective → authored.
  return odd ? { w: effD, d: effW } : { w: effW, d: effD };
}

/**
 * Screen (world-px) position of the resize handle: the far corner of the
 * EFFECTIVE footprint (south vertex of the footprint diamond), i.e. the tile
 * corner opposite the origin. For a placement at (x,y) with effective wEff×dEff
 * that is tile-corner (x+wEff, y+dEff).
 */
export function resizeHandleScreen(placement: GridPlacement): ScreenPoint {
  const { w, d } = effectiveFootprint(placement);
  return tileToScreen(placement.x + w, placement.y + d);
}
