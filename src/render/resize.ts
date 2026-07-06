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
 * The two schema shapes that carry a tile size: zone assets (`w`/`d`) and
 * parametric buildings (`widthTiles`/`depthTiles`). This is the single source of
 * truth for "which param keys mirror the footprint" — placement seeding, the
 * ResizeEntity dispatch sites, and the migration all resolve size keys through
 * `sizeParamKeys`.
 */
const SIZE_KEY_PAIRS: { w: string; d: string }[] = [
  { w: 'w', d: 'd' },
  { w: 'widthTiles', d: 'depthTiles' },
];

/**
 * Resolve the size-param key pair an asset's schema uses to mirror its
 * footprint, or undefined if it has neither pair. Zones → {w,d}; parametric
 * buildings → {widthTiles,depthTiles}.
 */
export function sizeParamKeys(
  assetDef: ResizeAssetDef | undefined
): { w: string; d: string } | undefined {
  if (!assetDef) return undefined;
  for (const pair of SIZE_KEY_PAIRS) {
    if (hasNumericField(assetDef, pair.w) && hasNumericField(assetDef, pair.d)) {
      return pair;
    }
  }
  return undefined;
}

/**
 * A grid asset whose paramSchema carries a size-param pair is resizable
 * tile-by-tile: zones (`w`/`d`, always ground) and parametric buildings
 * (`widthTiles`/`depthTiles`, NOT ground). Anything else (free placement, or an
 * asset without a recognised size pair) is not. Ground is no longer required —
 * grid placement plus a size-param pair is the criterion, so buildings get the
 * handle, the resize tool, and panel routing automatically.
 */
export function isResizable(
  entity: Entity,
  assetDef: ResizeAssetDef | undefined
): boolean {
  if (entity.placement.mode !== 'grid') return false;
  return sizeParamKeys(assetDef) !== undefined;
}

function hasNumericField(def: ResizeAssetDef, key: string): boolean {
  return (def.paramSchema ?? []).some(
    (f) => f.key === key && f.kind === 'number'
  );
}

/**
 * Clamp bounds for the size params, keyed off whichever pair the schema uses
 * (zone `w`/`d` or building `widthTiles`/`depthTiles`), falling back to
 * DEFAULT_MIN/MAX. Returned as authored-axis `{w,d}` regardless of key names.
 */
export function resizeBounds(assetDef: ResizeAssetDef | undefined): {
  w: SizeBounds;
  d: SizeBounds;
} {
  const keys = sizeParamKeys(assetDef) ?? { w: 'w', d: 'd' };
  return {
    w: fieldBounds(assetDef, keys.w),
    d: fieldBounds(assetDef, keys.d),
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
 * Resolve which zone a resize-tool press should target (pure, unit-tested).
 *
 * SimCity-forgiving rule:
 *   1. If the entity directly under the pointer is a resizable zone → target it.
 *   2. Otherwise, if a zone is already selected and it's resizable → fall back to
 *      it (so a press landing on a nested figurine, or just missing, still
 *      resizes the selected zone).
 *   3. Otherwise → no target (the press is a no-op; do NOT pan or move).
 *
 * Both entities are looked up via `resizableOf`, which returns each entity's
 * asset def (or undefined). Keeping the def-lookup as a callback means this
 * module stays free of the asset library dependency.
 *
 * @param pressed   entity directly under the pointer (or undefined)
 * @param selected  currently-selected entity (or undefined)
 * @param defOf     maps an entity to its ResizeAssetDef (undefined if unknown)
 * @returns the entity to resize, or undefined for a no-op
 */
export function resolveResizeTarget(
  pressed: Entity | undefined,
  selected: Entity | undefined,
  defOf: (entity: Entity) => ResizeAssetDef | undefined
): Entity | undefined {
  if (pressed && isResizable(pressed, defOf(pressed))) return pressed;
  if (selected && isResizable(selected, defOf(selected))) return selected;
  return undefined;
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
