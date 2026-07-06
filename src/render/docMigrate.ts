// Registry-aware document backfill, run when a document is adopted by the App.
//
// core/schema.ts owns the pure, registry-FREE migration (it must not import the
// asset library — assets/render are downstream of core). The size-param backfill
// needs the registry to tell a zone (w/d) from a building (widthTiles/depthTiles),
// so it lives here, in render/, and is invoked at the App's document-adoption seam
// (constructor + replaceDocument), which every loaded doc — autosave, file open,
// wizard, demo — passes through.

import type { Entity, GridPlacement, SceneDocument } from '../core/model.ts';
import { getAsset } from '../assets/library.ts';
import { sizeParamKeys } from './resize.ts';

/**
 * Heal documents authored before placement seeded size params: for every grid
 * entity whose asset carries a size-param pair but whose params are missing one
 * or both keys, backfill them from placement.footprint (the AUTHORED extents).
 *
 * This fixes the reported bug for saved maps and the demo/example: the zone
 * renderer then draws from params that match the footprint, so the blob, the
 * resize handle, and the panel W/D inputs all agree.
 *
 * Pure and non-mutating: returns the same document object when nothing needed
 * backfilling (cheap identity check), otherwise a shallow-copied doc + entities.
 */
export function backfillSizeParams(doc: SceneDocument): SceneDocument {
  let changed = false;
  const entities = doc.entities.map((ent) => {
    const next = backfillEntity(ent);
    if (next !== ent) changed = true;
    return next;
  });
  return changed ? { ...doc, entities } : doc;
}

function backfillEntity(ent: Entity): Entity {
  if (ent.placement.mode !== 'grid') return ent;
  const def = getAsset(ent.asset.symbol);
  const keys = sizeParamKeys(def);
  if (!keys) return ent;

  const params = ent.asset.params ?? {};
  const missingW = !(keys.w in params);
  const missingD = !(keys.d in params);
  if (!missingW && !missingD) return ent;

  const fp = (ent.placement as GridPlacement).footprint;
  const nextParams: Record<string, unknown> = { ...params };
  if (missingW) nextParams[keys.w] = fp.w;
  if (missingD) nextParams[keys.d] = fp.d;
  return { ...ent, asset: { ...ent.asset, params: nextParams } };
}
