// Pure re-render of the scene layer of an <svg>. Rendering is a pure function
// of the document (per docs/PLAN.md decision 3): every visible entity is
// stamped as its asset fragment inside a translated <g>, in painter's-algorithm
// order (core/depth.sortForRender), annotations last.
//
// At ~200 entities an innerHTML rebuild per change is comfortably fast, so we
// keep it simple (no diffing).

import type { Entity, GridPlacement, SceneDocument } from '../core/model.ts';
import { isEntityVisible, resolveRouteStops } from '../core/model.ts';
import { sortForRender } from '../core/depth.ts';
import { tileToScreen } from '../core/iso.ts';
import { getAsset, isGroundAsset } from '../assets/library.ts';
import { INK, PAPER, ACCENT } from '../assets/style.ts';
import { circle, text } from '../assets/primitives.ts';
import { resizeHandleScreen } from './resize.ts';

export interface ViewState {
  /**
   * ids under a persistent emphasis (selection). Mirrors the spotlightIds Set
   * pattern so a multi-selection highlights every member with data-selected.
   */
  selectedIds?: Set<string>;
  /** id of the entity currently hovered (transient emphasis). */
  hoverId?: string;
  /**
   * Present-mode spotlight: when set, only these ids stay at full opacity;
   * everything else dims. undefined = no spotlight active.
   */
  spotlightIds?: Set<string>;
  /** Draw the faint editor grid dots (edit mode only, stripped from export). */
  showGrid?: boolean;
  /**
   * Grid placement of the currently-selected RESIZABLE entity (edit mode only).
   * When set, an ACCENT diamond resize handle is drawn at the far corner of its
   * effective footprint, inside a data-editor-only group (never exported).
   */
  resizeHandleFor?: GridPlacement;
}

const DIM = 0.15; // DIM_OPACITY per style contract

/** Screen (world-px) position of an entity's projected origin. */
export function entityOrigin(entity: Entity): { x: number; y: number } {
  const p = entity.placement;
  if (p.mode === 'grid') return tileToScreen(p.x, p.y);
  return { x: p.x, y: p.y };
}

function round(v: number): number {
  return Math.round(v * 100) / 100;
}

/** SVG fragment for one entity (its <g> wrapper + stamped asset). */
function renderEntity(
  entity: Entity,
  doc: SceneDocument,
  view: ViewState,
  fanout: RouteFanout
): string {
  // Routes are drawn from resolved world-space waypoints, not the asset
  // registry — their geometry spans the scene rather than sitting at one origin.
  if (entity.type === 'route') return renderRoute(entity, doc, view, fanout);

  const def = getAsset(entity.asset.symbol);
  const fragment = def ? def.render(renderParams(entity)) : missingGlyph();

  const { x, y } = entityOrigin(entity);

  const attrs: string[] = [
    `data-entity-id="${entity.id}"`,
    `transform="translate(${round(x)} ${round(y)})"`,
  ];

  // Transient hover / persistent selection emphasis: a data-hook the stylesheet
  // turns into an ACCENT drop-shadow. Kept as an attribute (not baked geometry)
  // so it never affects export.
  if (view.hoverId === entity.id) attrs.push('data-hover="true"');
  if (view.selectedIds?.has(entity.id)) attrs.push('data-selected="true"');

  // Present-mode spotlight dimming.
  if (view.spotlightIds && !view.spotlightIds.has(entity.id)) {
    attrs.push(`opacity="${DIM}"`);
  }

  return `<g ${attrs.join(' ')}>${fragment}</g>`;
}

// --- routes ---------------------------------------------------------------

// Dashed accent line (~2px) over a wider white casing for legibility.
const ROUTE_STROKE = 2;
const ROUTE_CASING = 4; // white casing width beneath the accent line
const ROUTE_DASH = '6 4';
const BADGE_R = 9; // step-badge radius (and pill half-height) in world px
const BADGE_CHAR_W = 5.5; // approx advance per glyph at size 9 bold, world px
const BADGE_PAD_X = 5; // horizontal padding each side of the pill text
const BADGE_MIDDOT = '·'; // separator in compound "r·s" badges

// --- shared-stop fan-out ---------------------------------------------------

/**
 * Per-route, per-stop world-px offset applied to BOTH the badge and the path
 * vertex so routes converging on the same entity sit side-by-side instead of
 * stacking. Keyed by route entity id; the inner array is parallel to that
 * route's resolved stops. Empty map ⇒ no offsets (single-route documents).
 */
type RouteFanout = Map<string, Array<{ dx: number; dy: number }>>;

/** The type 'route' entities of a document, in document order. */
function routeEntities(doc: SceneDocument): Entity[] {
  return doc.entities.filter((e) => e.type === 'route');
}

/** Rendered pill width (world px) for a badge label — grows to fit the text. */
function badgeWidth(label: string): number {
  return Math.max(BADGE_R * 2, label.length * BADGE_CHAR_W + BADGE_PAD_X * 2);
}

/**
 * Compute the fan-out offsets for every route in the document.
 *
 * A stop is offset only when it is entity-anchored AND that entity is a stop of
 * two or more DISTINCT routes. Members of such a shared group are ordered by
 * route document index and centred: route at position `p` in a group of size
 * `n` shifts by `(p − (n−1)/2) · step` horizontally, where `step` is the widest
 * member badge + 2px so the pills sit side-by-side with a small gap. Free
 * (non-entity) stops are never offset. Deterministic across renders (document
 * order is stable).
 */
function computeRouteFanout(doc: SceneDocument): RouteFanout {
  const out: RouteFanout = new Map();
  const routes = routeEntities(doc);
  if (routes.length < 2) return out; // single route: plain badges, no fan-out

  // Resolve every route once; entity-anchored stops carry their entityId.
  const resolved = routes.map((r) => resolveRouteStops(doc, r));

  // entityId → ordered distinct route indices that anchor a stop there.
  const groups = new Map<string, number[]>();
  resolved.forEach((stops, ri) => {
    const seen = new Set<string>();
    for (const s of stops) {
      if (s.entityId === undefined || seen.has(s.entityId)) continue;
      seen.add(s.entityId);
      const arr = groups.get(s.entityId) ?? [];
      arr.push(ri); // ascending ri ⇒ document order preserved
      groups.set(s.entityId, arr);
    }
  });

  // Step (world px) for a shared group: widest member badge + 2.
  const groupStep = (entityId: string, members: number[]): number => {
    let maxW = 0;
    for (const ri of members) {
      const idx = resolved[ri].findIndex((s) => s.entityId === entityId);
      maxW = Math.max(maxW, badgeWidth(`${ri + 1}${BADGE_MIDDOT}${idx + 1}`));
    }
    return maxW + 2;
  };

  routes.forEach((r, ri) => {
    const offsets = resolved[ri].map((s) => {
      if (s.entityId === undefined) return { dx: 0, dy: 0 };
      const members = groups.get(s.entityId);
      if (!members || members.length < 2) return { dx: 0, dy: 0 };
      const pos = members.indexOf(ri);
      const centred = pos - (members.length - 1) / 2;
      return { dx: round(centred * groupStep(s.entityId, members)), dy: 0 };
    });
    out.set(r.id, offsets);
  });
  return out;
}

/**
 * A route entity renders as a dashed ACCENT polyline through its resolved
 * waypoints, a numbered step badge at each waypoint, and a label near the
 * entity's placement position.
 *
 * BADGE NUMBERING: with a single route each badge shows its plain 1-based stop
 * index `s`; with two or more routes it shows `<r>·<s>`, where `r` is the
 * route's 1-based position among route entities in document order — so a stop
 * shared by several journeys tells the reader which journey it belongs to.
 *
 * FAN-OUT: where two or more routes converge on the same entity, `fanout` shifts
 * each route's waypoint sideways so the badges (and the dashed lines feeding
 * them) separate instead of stacking. The offset is added to the resolved stop
 * coords BEFORE drawing, so the path vertex and its badge always move together.
 *
 * COORDINATE SPACE: unlike other entities, the route's <g> carries NO translate
 * transform. `resolveRouteStops` (and the free placement that positions the
 * label) already yield world-space screen px, so the geometry is emitted in
 * world coords directly — this avoids re-basing every waypoint onto an origin.
 * The wrapper keeps `data-entity-id`, hover/selection hooks and spotlight
 * dimming, so hit-testing, emphasis and present-mode behave exactly as for any
 * other entity (all of which key off the attributes, not the transform).
 *
 * With fewer than two resolvable waypoints no path is drawn; with none, only
 * the (empty) wrapper <g> is emitted.
 */
function renderRoute(
  entity: Entity,
  doc: SceneDocument,
  view: ViewState,
  fanout: RouteFanout
): string {
  const attrs: string[] = [`data-entity-id="${entity.id}"`];
  if (view.hoverId === entity.id) attrs.push('data-hover="true"');
  if (view.selectedIds?.has(entity.id)) attrs.push('data-selected="true"');
  if (view.spotlightIds && !view.spotlightIds.has(entity.id)) {
    attrs.push(`opacity="${DIM}"`);
  }

  const routes = routeEntities(doc);
  const multi = routes.length > 1;
  const routeIndex = routes.findIndex((e) => e.id === entity.id); // 0-based

  const offsets = fanout.get(entity.id) ?? [];
  const stops = resolveRouteStops(doc, entity).map((p, i) => ({
    x: p.x + (offsets[i]?.dx ?? 0),
    y: p.y + (offsets[i]?.dy ?? 0),
  }));

  const frags: string[] = [];
  if (stops.length >= 2) frags.push(routePath(stops));
  stops.forEach((p, i) => {
    const label = multi ? `${routeIndex + 1}${BADGE_MIDDOT}${i + 1}` : String(i + 1);
    frags.push(routeBadge(p.x, p.y, label, multi));
  });
  if (stops.length >= 1) {
    const origin = entityOrigin(entity);
    frags.push(routeLabel(origin.x, origin.y, entity.label));
  }

  return `<g ${attrs.join(' ')}>${frags.join('')}</g>`;
}

/** Dashed ACCENT polyline through the waypoints over a white casing. */
function routePath(stops: Array<{ x: number; y: number }>): string {
  const pts = stops.map((p) => `${round(p.x)},${round(p.y)}`).join(' ');
  const casing =
    `<polyline points="${pts}" fill="none" stroke="${PAPER}" ` +
    `stroke-width="${ROUTE_CASING}" stroke-linejoin="round" stroke-linecap="round"/>`;
  const accent =
    `<polyline points="${pts}" fill="none" stroke="${ACCENT}" ` +
    `stroke-width="${ROUTE_STROKE}" stroke-linejoin="round" stroke-linecap="round" ` +
    `stroke-dasharray="${ROUTE_DASH}"/>`;
  return casing + accent;
}

/**
 * Numbered step badge: white-outlined ACCENT shape with the white label. A plain
 * single-route badge stays a disc (radius BADGE_R); a compound "r·s" badge grows
 * to a stadium/pill so the wider text fits while keeping the single ACCENT
 * colour of the style contract.
 */
function routeBadge(x: number, y: number, label: string, wide: boolean): string {
  const cx = round(x);
  const cy = round(y);
  const shape = wide
    ? badgePill(cx, cy, badgeWidth(label))
    : circle({ x: cx, y: cy }, BADGE_R, { fill: ACCENT, stroke: PAPER, strokeWidth: 1.5 });
  return (
    shape +
    text(cx, cy + 3.2, label, {
      size: 9,
      weight: 'bold',
      fill: PAPER,
      anchor: 'middle',
    })
  );
}

/**
 * A horizontal stadium (pill) of width `w` and height 2·BADGE_R centred at
 * (cx,cy), drawn as a <path> of two straight edges + two semicircular arcs so it
 * stays within the svg2pdf dialect (like primitives.ellipse). ACCENT fill, white
 * outline — matches the disc badge's treatment.
 */
function badgePill(cx: number, cy: number, w: number): string {
  const r = BADGE_R;
  const half = Math.max(0, w / 2 - r); // half-length of the straight top/bottom
  const xl = round(cx - half);
  const xr = round(cx + half);
  const yt = round(cy - r);
  const yb = round(cy + r);
  const d =
    `M ${xl} ${yt} L ${xr} ${yt} ` +
    `A ${r} ${r} 0 0 1 ${xr} ${yb} ` +
    `L ${xl} ${yb} ` +
    `A ${r} ${r} 0 0 1 ${xl} ${yt} Z`;
  return `<path d="${d}" fill="${ACCENT}" stroke="${PAPER}" stroke-width="1.5" stroke-linejoin="round"/>`;
}

/** Route label in the app's callout style (small bold ACCENT text). */
function routeLabel(x: number, y: number, label: string): string {
  return text(round(x), round(y) - BADGE_R - 4, label, {
    size: 9,
    weight: 'bold',
    fill: ACCENT,
    anchor: 'middle',
    letterSpacing: 0.5,
  });
}

/**
 * The params bag handed to an asset's render(), with the placement's rotation
 * injected as the reserved `orientation` key (0–3). Entities never author an
 * `orientation` param directly — it is derived from placement.rotation so a
 * single source of truth (the placement) drives both footprint and facing.
 * Absent rotation ⇒ no orientation key ⇒ unchanged (backward-compatible) output.
 */
function renderParams(entity: Entity): Record<string, unknown> | undefined {
  const rotation = entity.placement.rotation;
  if (rotation === undefined) return entity.asset.params;
  return { ...(entity.asset.params ?? {}), orientation: rotation };
}

/** Fallback glyph when an asset id is unknown (should not happen in practice). */
function missingGlyph(): string {
  return `<rect x="-16" y="-16" width="32" height="32" fill="none" stroke="${INK}" stroke-width="1.5"/><line x1="-16" y1="-16" x2="16" y2="16" stroke="${INK}" stroke-width="1"/>`;
}

/**
 * Faint tile-grid dot layer: one dot at the projected north vertex of each tile
 * over the used extent (+ margin). Marked data-editor-only so export strips it.
 */
function renderGridDots(doc: SceneDocument): string {
  const extent = usedTileExtent(doc);
  if (!extent) {
    // empty scene: a small default patch around origin so the canvas isn't blank
    return gridDotsFor(-4, -4, 4, 4);
  }
  const margin = 3;
  return gridDotsFor(
    extent.minX - margin,
    extent.minY - margin,
    extent.maxX + margin,
    extent.maxY + margin
  );
}

function gridDotsFor(minX: number, minY: number, maxX: number, maxY: number): string {
  const dots: string[] = [];
  for (let tx = minX; tx <= maxX; tx++) {
    for (let ty = minY; ty <= maxY; ty++) {
      const p = tileToScreen(tx, ty);
      dots.push(
        `<circle cx="${round(p.x)}" cy="${round(p.y)}" r="1" fill="${INK}" opacity="0.1"/>`
      );
    }
  }
  return `<g data-editor-only="true">${dots.join('')}</g>`;
}

/** Bounding tile range of all grid entities (free entities ignored). */
function usedTileExtent(
  doc: SceneDocument
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let found = false;
  for (const e of doc.entities) {
    const p = e.placement;
    if (p.mode !== 'grid') continue;
    found = true;
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x + p.footprint.w - 1);
    maxY = Math.max(maxY, p.y + p.footprint.d - 1);
  }
  return found ? { minX, minY, maxX, maxY } : null;
}

/**
 * Re-render the scene layer of `svgEl`'s dedicated scene group.
 *
 * `svgEl` is expected to contain a `<g data-scene-root>` element; we rebuild
 * only that group's contents, leaving camera/viewBox and static defs intact.
 * If the group is absent (first render) we create it.
 */
export function renderScene(
  sceneRoot: SVGGElement,
  doc: SceneDocument,
  view: ViewState = {}
): void {
  const parts: string[] = [];

  if (view.showGrid) parts.push(renderGridDots(doc));

  const visible = doc.entities.filter((e) => isEntityVisible(doc, e));
  const ordered = sortForRender(visible, isGroundAsset); // ground plates → scene → annotations
  const fanout = computeRouteFanout(doc);

  for (const entity of ordered) {
    parts.push(renderEntity(entity, doc, view, fanout));
  }

  if (view.resizeHandleFor) parts.push(renderResizeHandle(view.resizeHandleFor));

  sceneRoot.innerHTML = parts.join('');
}

/**
 * The resize handle: a small ACCENT diamond at the projected far corner of the
 * effective footprint. Wrapped in a data-editor-only group (stripped on export)
 * and tagged data-resize-handle so the interaction layer can hit-test it.
 */
function renderResizeHandle(placement: GridPlacement): string {
  const p = resizeHandleScreen(placement);
  const cx = round(p.x);
  const cy = round(p.y);
  const r = 6; // half-diagonal of the diamond in world px
  const diamond =
    `M ${cx} ${cy - r} L ${cx + r} ${cy} L ${cx} ${cy + r} L ${cx - r} ${cy} Z`;
  return (
    `<g data-editor-only="true" data-resize-handle="true">` +
    // Invisible, forgiving hit target (r≈14) behind the visible diamond so a
    // grab a few px off-centre still starts a resize.
    `<circle cx="${cx}" cy="${cy}" r="14" fill="#FFFFFF" fill-opacity="0"/>` +
    `<path d="${diamond}" fill="${ACCENT}" stroke="#fff" stroke-width="1.5"/>` +
    `</g>`
  );
}

/** Serialise the scene fragment as a string (used by tests / export prep). */
export function renderSceneToString(doc: SceneDocument, view: ViewState = {}): string {
  const parts: string[] = [];
  if (view.showGrid) parts.push(renderGridDots(doc));
  const visible = doc.entities.filter((e) => isEntityVisible(doc, e));
  const fanout = computeRouteFanout(doc);
  for (const entity of sortForRender(visible, isGroundAsset))
    parts.push(renderEntity(entity, doc, view, fanout));
  return parts.join('');
}
