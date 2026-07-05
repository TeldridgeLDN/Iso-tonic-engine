// Painter's-algorithm depth ordering across grid + free entities.
// Pure TS, no DOM.

import type { Entity } from './model.ts';
import { screenToTile } from './iso.ts';

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
    const farX = p.x + p.footprint.w - 1;
    const farY = p.y + p.footprint.d - 1;
    return farX + farY;
  }

  // free placement
  const { tx, ty } = screenToTile(p.x, p.y);
  return tx + ty;
}

/**
 * Stable-sorted copy of entities in back-to-front render order.
 * Ties (equal depth keys, incl. multiple annotations) preserve input order,
 * giving deterministic output. Array.prototype.sort is stable in modern JS.
 */
export function sortForRender(entities: Entity[]): Entity[] {
  return entities
    .map((entity, index) => ({ entity, index, key: depthKey(entity) }))
    .sort((a, b) => {
      if (a.key === b.key) return a.index - b.index;
      // NaN guard not needed: keys are finite or +Infinity.
      return a.key - b.key;
    })
    .map((w) => w.entity);
}
