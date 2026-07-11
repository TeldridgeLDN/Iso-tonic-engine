// Painter's-algorithm depth ordering across grid + free entities.
// Pure TS, no DOM.

import type { Entity } from './model.ts';
import { screenToTile, effectiveFootprint } from './iso.ts';

/**
 * Depth key for an entity.
 *
 * - Annotations always render above all scene content → +Infinity tier.
 * - Grid placements: use the far corner of the footprint,
 *     (x + w − 1) + (y + d − 1).
 * - Free placements: derive fractional tile coords from world position via
 *     screenToTile, then tx + ty.
 *
 * Higher key ⇒ drawn later ⇒ nearer the viewer.
 */
export function depthKey(entity: Entity): number {
  if (entity.type === 'annotation') return Number.POSITIVE_INFINITY;

  const p = entity.placement;
  if (p.mode === 'grid') {
    const { w, d } = effectiveFootprint(p);
    const farX = p.x + w - 1;
    const farY = p.y + d - 1;
    return farX + farY;
  }

  // free placement
  const { tx, ty } = screenToTile(p.x, p.y);
  return tx + ty;
}

/**
 * Stable-sorted copy of entities in back-to-front render order.
 *
 * Four tiers: ground plates (flat zone content — their large footprints
 * would otherwise give them late, structure-crossing draw order), then
 * scene content, then routes (process-flow lines that ride above the scene
 * they connect), then annotations. Within a tier, depthKey then input order.
 * `isGround` lets the caller identify ground-plane assets (core has no
 * asset knowledge). Array.prototype.sort is stable in modern JS.
 */
export function sortForRender(
  entities: Entity[],
  isGround?: (entity: Entity) => boolean,
): Entity[] {
  const tierOf = (e: Entity): number => {
    if (e.type === 'annotation') return 3;
    if (e.type === 'route') return 2;
    if (isGround?.(e)) return 0;
    return 1;
  };
  return entities
    .map((entity, index) => ({ entity, index, key: depthKey(entity), tier: tierOf(entity) }))
    .sort((a, b) => {
      if (a.tier !== b.tier) return a.tier - b.tier;
      if (a.key === b.key) return a.index - b.index;
      // NaN guard not needed: keys are finite or +Infinity.
      return a.key - b.key;
    })
    .map((w) => w.entity);
}
