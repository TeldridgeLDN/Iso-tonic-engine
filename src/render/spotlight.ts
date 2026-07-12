// Pure resolver for the Present-mode spotlight id set. Factored out of app.ts
// (500-line budget) and unit-testable without the DOM.

import type { SceneDocument } from '../core/model.ts';
import {
  spotlightSet,
  byId,
  resolveRouteStops,
  ancestorsOf,
  descendantsOf,
} from '../core/model.ts';

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

/**
 * Focus set for a journey (a type:'route' entity): the ids to keep at full
 * opacity when that journey is focused. Members are —
 *   - the route entity itself,
 *   - every entity-anchored stop of the route,
 *   - ALL ancestors of each stop (so the containing territory plates stay clear),
 *   - ALL descendants of each stop.
 * Free/xy waypoints contribute nothing (they anchor no entity).
 *
 * Everything NOT in this set is dimmed by the caller. Returns an EMPTY set for a
 * missing id or a non-route id — callers MUST guard so an empty set is never
 * used as a spotlight (which would dim the whole scene). One hop only: a stop
 * entity's own routes are not pulled in.
 */
export function journeyFocusSet(doc: SceneDocument, routeId: string): Set<string> {
  const route = byId(doc, routeId);
  if (!route || route.type !== 'route') return new Set<string>();

  const ids = new Set<string>([route.id]);
  for (const stop of resolveRouteStops(doc, route)) {
    if (stop.entityId === undefined) continue;
    ids.add(stop.entityId);
    for (const a of ancestorsOf(doc, stop.entityId)) ids.add(a.id);
    for (const d of descendantsOf(doc, stop.entityId)) ids.add(d.id);
  }
  return ids;
}
