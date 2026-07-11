// Route-drawing controller (edit mode, 'route' canvas tool). Owns the transient
// list of stops being accumulated as the operator clicks, builds the live
// preview entity re-using the real route renderer, and produces the single
// undoable PlaceEntity command on finish. Kept out of app.ts so the shell stays
// under budget and the decidable logic (stop decisions, entity shape, label
// numbering) is unit-testable without the DOM.
//
// A route is transient editor state exactly like the placement ghost — it is
// NOT a parallel document store; nothing lands in the document until finish()
// yields a command the History executes.

import type { Entity, RouteStop, SceneDocument } from '../core/model.ts';
import { byId, resolveRouteStops } from '../core/model.ts';
import { PlaceEntity, type Command } from '../core/commands.ts';

/** Stable id of the editor-only in-progress route preview entity. */
export const ROUTE_PREVIEW_ID = '__route-preview__';

/** The asset symbol every route entity carries (per docs/SCHEMA.md). */
const ROUTE_SYMBOL = 'route-path';

// ---------------------------------------------------------------------------
// Pure decisions (unit-tested)
// ---------------------------------------------------------------------------

/**
 * Decide the stop a click produces: an entity-anchored stop when the click hit
 * a real, non-route entity in the document; otherwise a free world-px stop.
 *
 * The in-progress preview (ROUTE_PREVIEW_ID) and existing route entities are NOT
 * valid anchors — a click on either falls through to a free stop, so a route can
 * never anchor to itself or to another route.
 */
export function routeStopFor(
  doc: SceneDocument,
  entityId: string | undefined,
  world: { x: number; y: number }
): RouteStop {
  if (entityId && entityId !== ROUTE_PREVIEW_ID) {
    const target = byId(doc, entityId);
    if (target && target.type !== 'route') return { entityId };
  }
  return { x: Math.round(world.x), y: Math.round(world.y) };
}

/** Two stops are equal when both anchor the same entity, or share x AND y. */
export function stopsEqual(a: RouteStop, b: RouteStop): boolean {
  if ('entityId' in a && 'entityId' in b) return a.entityId === b.entityId;
  if ('x' in a && 'x' in b) return a.x === b.x && a.y === b.y;
  return false;
}

/**
 * Append a stop, collapsing an immediate duplicate of the current last stop.
 * The dedupe keeps a double-click (which fires two clicks before the finish)
 * from planting two stacked stops, and is harmless for deliberate re-clicks.
 */
export function appendRouteStop(stops: RouteStop[], next: RouteStop): RouteStop[] {
  const last = stops[stops.length - 1];
  if (last && stopsEqual(last, next)) return stops;
  return [...stops, next];
}

/** Drop the last stop (used by the properties panel's "Remove last stop"). */
export function removeLastStop(stops: RouteStop[]): RouteStop[] {
  return stops.slice(0, -1);
}

/** Number of authored stops on a route entity (0 for a malformed/absent bag). */
export function routeStopCount(entity: Entity): number {
  const params = entity.asset.params;
  if (!params || typeof params !== 'object') return 0;
  const stops = (params as Record<string, unknown>).stops;
  return Array.isArray(stops) ? stops.length : 0;
}

/**
 * Build a fully-formed route entity from accumulated stops.
 *
 * - label: "Journey N", N = 1 + count of existing route entities.
 * - placement: FREE at the first stop's RESOLVED world position (entity anchors
 *   project through the target's placement; free stops use their own coords),
 *   falling back to the origin if the first stop is unresolvable.
 * - asset: symbol "route-path" carrying the stops (schema-valid for >= 1 stop).
 */
export function buildRouteEntity(
  doc: SceneDocument,
  stops: RouteStop[],
  id: string
): Entity {
  const journeyN = doc.entities.filter((e) => e.type === 'route').length + 1;
  const entity: Entity = {
    id,
    type: 'route',
    label: `Journey ${journeyN}`,
    placement: { mode: 'free', x: 0, y: 0 },
    asset: { symbol: ROUTE_SYMBOL, params: { stops: [...stops] } },
  };
  const first = resolveRouteStops(doc, entity)[0];
  if (first) entity.placement = { mode: 'free', x: first.x, y: first.y };
  return entity;
}

// ---------------------------------------------------------------------------
// Transient controller
// ---------------------------------------------------------------------------

export class RouteBuilder {
  private stops: RouteStop[] = [];

  /** True while a route is being drawn (has at least one stop). */
  get active(): boolean {
    return this.stops.length > 0;
  }

  /** Append a click's stop (already decided via routeStopFor). */
  addStop(stop: RouteStop): void {
    this.stops = appendRouteStop(this.stops, stop);
  }

  /** Discard the in-progress route (Escape). */
  reset(): void {
    this.stops = [];
  }

  /**
   * The editor-only preview entity for the accumulated stops, or undefined when
   * empty. Rendered through the real route renderer, marked data-editor-only by
   * the shell. Carries the reserved preview id so a click on it never anchors.
   */
  previewEntity(): Entity | undefined {
    if (this.stops.length === 0) return undefined;
    return {
      id: ROUTE_PREVIEW_ID,
      type: 'route',
      label: 'New journey',
      placement: { mode: 'free', x: 0, y: 0 },
      asset: { symbol: ROUTE_SYMBOL, params: { stops: [...this.stops] } },
    };
  }

  /**
   * The command + entity that commits the route, or undefined when there is
   * nothing to commit (no stops). Does NOT mutate builder state — the caller
   * resets after executing.
   */
  finish(doc: SceneDocument, id: string): { command: Command; entity: Entity } | undefined {
    if (this.stops.length < 1) return undefined;
    const entity = buildRouteEntity(doc, this.stops, id);
    return { command: new PlaceEntity(entity), entity };
  }
}
