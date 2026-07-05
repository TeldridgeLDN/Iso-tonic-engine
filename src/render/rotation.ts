// Pure helper for planning an entity rotation (quarter-turn clockwise) and
// testing whether the rotated grid footprint would collide. Factored out of
// app.ts so the shell stays under the 500-line budget and the decision is
// unit-testable headlessly. No DOM.

import type { Entity, GridPlacement, SceneDocument } from '../core/model.ts';
import { footprintsOverlap } from '../core/model.ts';
import type { Rotation } from '../core/commands.ts';
import { getAsset } from '../assets/library.ts';

export interface RotationPlan {
  from: Rotation;
  to: Rotation;
  /** true if the rotated grid footprint overlaps another grid entity. */
  collides: boolean;
}

/**
 * Plan a one-quarter-turn-clockwise rotation of `entity` within `doc`.
 * Returns null for fixed assets (orientations 1 / absent) — nothing to rotate.
 * `collides` reflects the EFFECTIVE (rotated) footprint tested against every
 * OTHER grid entity, mirroring the drag-drop collision rule.
 */
export function planRotation(
  doc: SceneDocument,
  entity: Entity
): RotationPlan | null {
  const def = getAsset(entity.asset.symbol);
  if (!def || (def.orientations ?? 1) === 1) return null;

  const from = ((entity.placement.rotation ?? 0) % 4) as Rotation;
  const to = (((from + 1) % 4) as Rotation);

  let collides = false;
  if (entity.placement.mode === 'grid') {
    const rotated: GridPlacement = { ...entity.placement, rotation: to };
    collides = doc.entities.some(
      (other) =>
        other.id !== entity.id &&
        other.placement.mode === 'grid' &&
        footprintsOverlap(rotated, other.placement)
    );
  }

  return { from, to, collides };
}
