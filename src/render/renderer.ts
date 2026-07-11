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
import { getAsset } from '../assets/library.ts';
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
function renderEntity(entity: Entity, doc: SceneDocument, view: ViewState): string {
  // Routes are drawn from resolved world-space waypoints, not the asset
  // registry — their geometry spans the scene rather than sitting at one origin.
  if (entity.type === 'route') return renderRoute(entity, doc, view);

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
const BADGE_R = 9; // step-badge radius in world px

/**
 * A route entity renders as a dashed ACCENT polyline through its resolved
 * waypoints, a numbered step badge at each waypoint, and a label near the
 * entity's placement position.
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
function renderRoute(entity: Entity, doc: SceneDocument, view: ViewState): string {
  const attrs: string[] = [`data-entity-id="${entity.id}"`];
  if (view.hoverId === entity.id) attrs.push('data-hover="true"');
  if (view.selectedIds?.has(entity.id)) attrs.push('data-selected="true"');
  if (view.spotlightIds && !view.spotlightIds.has(entity.id)) {
    attrs.push(`opacity="${DIM}"`);
  }

  const stops = resolveRouteStops(doc, entity);
  const frags: string[] = [];

  if (stops.length >= 2) frags.push(routePath(stops));
  stops.forEach((p, i) => frags.push(routeBadge(p.x, p.y, i + 1)));
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

/** Numbered step badge: ACCENT disc, white outline, white 1-based number. */
function routeBadge(x: number, y: number, step: number): string {
  const cx = round(x);
  const cy = round(y);
  return (
    circle({ x: cx, y: cy }, BADGE_R, { fill: ACCENT, stroke: PAPER, strokeWidth: 1.5 }) +
    text(cx, cy + 3.2, String(step), {
      size: 9,
      weight: 'bold',
      fill: PAPER,
      anchor: 'middle',
    })
  );
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

  for (const entity of ordered) {
    parts.push(renderEntity(entity, doc, view));
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

/** Ground-plane assets (zone plates) always render beneath structures. */
function isGroundAsset(entity: Entity): boolean {
  return getAsset(entity.asset.symbol)?.ground === true;
}

/** Serialise the scene fragment as a string (used by tests / export prep). */
export function renderSceneToString(doc: SceneDocument, view: ViewState = {}): string {
  const parts: string[] = [];
  if (view.showGrid) parts.push(renderGridDots(doc));
  const visible = doc.entities.filter((e) => isEntityVisible(doc, e));
  for (const entity of sortForRender(visible, isGroundAsset))
    parts.push(renderEntity(entity, doc, view));
  return parts.join('');
}
