// Pure resolver for the Present-mode spotlight id set. Factored out of app.ts
// (500-line budget) and unit-testable without the DOM.

import type { SceneDocument } from '../core/model.ts';
import { spotlightSet } from '../core/model.ts';

export interface SpotlightState {
  /** A whole custom layer is spotlit (layers-panel name click). Wins if set. */
  layerId?: string;
  /** A focal entity is spotlit (canvas click). */
  entityId?: string;
}

/**
 * The set of entity ids to keep at full opacity in Present mode, or undefined
 * when nothing is spotlit (no dimming). A layer spotlight lights every entity
 * in that custom layer; an entity spotlight uses spotlightSet (self + semantic
 * relatives + shared-custom-layer group).
 */
export function presentSpotlight(
  doc: SceneDocument,
  state: SpotlightState
): Set<string> | undefined {
  if (state.layerId) {
    const lid = state.layerId;
    return new Set(
      doc.entities.filter((e) => e.customLayers?.includes(lid)).map((e) => e.id)
    );
  }
  if (state.entityId) {
    return spotlightSet(doc, state.entityId);
  }
  return undefined;
}
