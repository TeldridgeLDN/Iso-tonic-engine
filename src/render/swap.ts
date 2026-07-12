// Pure "swap the asset of an existing entity" resolution + compatibility guard.
// No DOM / browser APIs — everything here is unit-tested headlessly, mirroring
// resize.ts. The SwapAsset command (core/commands.ts) stays dumb; this module
// resolves the target footprint, carried-over params, and rotation, and answers
// the compatibility + overlap questions.

import type {
  AssetRef,
  Entity,
  GridPlacement,
  SceneDocument,
} from '../core/model.ts';
import { byId, descendantsOf, footprintsOverlap } from '../core/model.ts';
import { sizeParamKeys } from './resize.ts';

// A minimal shape of an asset def, kept local so this module does not depend on
// the asset library's concrete type (mirrors resize.ts's ResizeAssetDef).
export interface SwapAssetDef {
  id: string;
  category: string;
  footprint?: { w: number; d: number };
  ground?: boolean;
  orientations?: 1 | 2 | 4;
  paramSchema?: { key: string; kind: string; min?: number; max?: number }[];
}

export interface SwapResolution {
  nextAsset: AssetRef;
  nextPlacement: GridPlacement;
}

/**
 * A grid-placeable asset either declares a footprint (fixed sprites, buildings)
 * or is parametric (a zone/territory whose footprint derives from its w/d
 * params). Assets with neither — figurines, callouts — are free-placed only and
 * are never swap participants.
 */
function isGridPlaceable(def: SwapAssetDef | undefined): def is SwapAssetDef {
  return (
    !!def && (def.footprint !== undefined || sizeParamKeys(def) !== undefined)
  );
}

/**
 * Can `entity` (with its current asset def) be the SOURCE of a swap at all?
 * Only grid-placed, grid-placeable, non-route entities qualify — which
 * structurally excludes figurines and callouts (free-placed) and routes.
 */
export function isSwappableEntity(
  entity: Entity,
  def: SwapAssetDef | undefined
): boolean {
  if (entity.type === 'route') return false;
  if (entity.placement.mode !== 'grid') return false;
  return isGridPlaceable(def);
}

/**
 * Is a swap from `fromDef` to `toDef` allowed? Both must be grid-placeable, and
 * territory-category (ground plates) may only swap to territory-category and
 * vice-versa — a structural entity can't become a ground plate. figurine /
 * callout / route assets are not grid-placeable, so they are rejected on both
 * sides automatically.
 */
export function canSwap(
  fromDef: SwapAssetDef | undefined,
  toDef: SwapAssetDef | undefined
): boolean {
  if (!isGridPlaceable(fromDef) || !isGridPlaceable(toDef)) return false;
  return (fromDef.category === 'territory') === (toDef.category === 'territory');
}

function isNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** A param value is compatible with a target field iff its runtime type matches
 *  the field kind (number ↔ number; select/text/color ↔ string). */
function kindMatches(kind: string, v: unknown): boolean {
  if (kind === 'number') return isNumber(v);
  return typeof v === 'string'; // select / text / color
}

/**
 * Carry over only the params whose key is present in the target asset's
 * paramSchema AND whose value is type-compatible with that field (e.g.
 * signage→signage, w/d for territory→territory). Everything else is dropped.
 */
function carryParams(
  prev: Record<string, unknown>,
  toDef: SwapAssetDef
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of toDef.paramSchema ?? []) {
    if (!(f.key in prev)) continue;
    const v = prev[f.key];
    if (kindMatches(f.kind, v)) out[f.key] = v;
  }
  return out;
}

/**
 * Resolve the fully-formed next asset + placement for swapping `entity` to
 * `toDef`, or null when the swap is not allowed (per isSwappableEntity/canSwap).
 *
 * Rules (see the feature spec):
 *  - placement.mode and grid origin (x,y) are kept;
 *  - the new AUTHORED footprint comes from the target: its declared footprint,
 *    or — for a parametric target whose size params carry over — those params;
 *  - size params are (re)seeded from the resolved footprint so params↔footprint
 *    stay in lockstep (the same invariant placement.seedSizeParams keeps);
 *  - rotation is kept only if the target supports multiple orientations, else
 *    dropped (reset to 0/undefined);
 *  - params carry over only the type-compatible keys the target schema declares.
 */
export function resolveSwap(
  entity: Entity,
  fromDef: SwapAssetDef | undefined,
  toDef: SwapAssetDef | undefined
): SwapResolution | null {
  if (!isSwappableEntity(entity, fromDef)) return null;
  if (!canSwap(fromDef, toDef)) return null;
  if (entity.placement.mode !== 'grid' || !toDef) return null;

  const prevParams = entity.asset.params ?? {};
  const keys = sizeParamKeys(toDef);

  // Footprint: parametric target inheriting carried w/d, else the registry
  // footprint (fallback 1×1 keeps a grid placement well-formed).
  let footprint: { w: number; d: number };
  if (keys && isNumber(prevParams[keys.w]) && isNumber(prevParams[keys.d])) {
    footprint = { w: prevParams[keys.w] as number, d: prevParams[keys.d] as number };
  } else {
    footprint = toDef.footprint ? { ...toDef.footprint } : { w: 1, d: 1 };
  }

  const nextParams = carryParams(prevParams, toDef);
  // Keep the size params in sync with the resolved footprint (created if the
  // carry-over didn't include them, e.g. sprite → parametric building).
  if (keys) {
    nextParams[keys.w] = footprint.w;
    nextParams[keys.d] = footprint.d;
  }

  const supportsRotation = (toDef.orientations ?? 1) > 1;
  const prevRotation = entity.placement.rotation;
  const nextPlacement: GridPlacement = {
    mode: 'grid',
    x: entity.placement.x,
    y: entity.placement.y,
    footprint,
    ...(supportsRotation && prevRotation !== undefined
      ? { rotation: prevRotation }
      : {}),
  };

  const nextAsset: AssetRef = {
    symbol: toDef.id,
    ...(Object.keys(nextParams).length > 0 ? { params: nextParams } : {}),
  };

  return { nextAsset, nextPlacement };
}

/** Ancestor ids of an entity (transitive parents), cycle-safe. */
function ancestorIds(doc: SceneDocument, id: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>([id]);
  let cur = byId(doc, id);
  while (cur?.parentId && !seen.has(cur.parentId)) {
    const parent = byId(doc, cur.parentId);
    if (!parent) break;
    out.push(parent.id);
    seen.add(parent.id);
    cur = parent;
  }
  return out;
}

/**
 * Would landing `entity` on `nextPlacement` (its new, swapped footprint at the
 * unchanged origin) overlap another footprint? Mirrors the drag/placement
 * collision rule: ground plates underlie everything (exempt), and the entity
 * itself plus its ancestor/descendant nesting are self-excluded, so a swap can
 * only be rejected by a genuinely foreign non-ground footprint.
 *
 * `isGround` is injected (the caller resolves it via the asset library) so this
 * module stays free of the library dependency, like resolveResizeTarget.
 */
export function swapOverlaps(
  entity: Entity,
  nextPlacement: GridPlacement,
  doc: SceneDocument,
  isGround: (entity: Entity) => boolean
): boolean {
  if (isGround(entity)) return false;
  const exclude = new Set<string>([
    entity.id,
    ...descendantsOf(doc, entity.id).map((e) => e.id),
    ...ancestorIds(doc, entity.id),
  ]);
  return doc.entities.some(
    (other) =>
      !exclude.has(other.id) &&
      other.placement.mode === 'grid' &&
      !isGround(other) &&
      footprintsOverlap(nextPlacement, other.placement)
  );
}
