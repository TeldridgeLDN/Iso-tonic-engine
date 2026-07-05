// Pure re-render of the scene layer of an <svg>. Rendering is a pure function
// of the document (per docs/PLAN.md decision 3): every visible entity is
// stamped as its asset fragment inside a translated <g>, in painter's-algorithm
// order (core/depth.sortForRender), annotations last.
//
// At ~200 entities an innerHTML rebuild per change is comfortably fast, so we
// keep it simple (no diffing).

import type { Entity, SceneDocument } from '../core/model.ts';
import { isEntityVisible } from '../core/model.ts';
import { sortForRender } from '../core/depth.ts';
import { tileToScreen } from '../core/iso.ts';
import { getAsset } from '../assets/library.ts';
import { INK } from '../assets/style.ts';

export interface ViewState {
  /** id of the entity under a persistent emphasis (selection). */
  selectedId?: string;
  /** id of the entity currently hovered (transient emphasis). */
  hoverId?: string;
  /**
   * Present-mode spotlight: when set, only these ids stay at full opacity;
   * everything else dims. undefined = no spotlight active.
   */
  spotlightIds?: Set<string>;
  /** Draw the faint editor grid dots (edit mode only, stripped from export). */
  showGrid?: boolean;
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
function renderEntity(entity: Entity, view: ViewState): string {
  const def = getAsset(entity.asset.symbol);
  const fragment = def ? def.render(entity.asset.params) : missingGlyph();

  const { x, y } = entityOrigin(entity);

  const attrs: string[] = [
    `data-entity-id="${entity.id}"`,
    `transform="translate(${round(x)} ${round(y)})"`,
  ];

  // Transient hover / persistent selection emphasis: a data-hook the stylesheet
  // turns into an ACCENT drop-shadow. Kept as an attribute (not baked geometry)
  // so it never affects export.
  if (view.hoverId === entity.id) attrs.push('data-hover="true"');
  if (view.selectedId === entity.id) attrs.push('data-selected="true"');

  // Present-mode spotlight dimming.
  if (view.spotlightIds && !view.spotlightIds.has(entity.id)) {
    attrs.push(`opacity="${DIM}"`);
  }

  return `<g ${attrs.join(' ')}>${fragment}</g>`;
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
  const ordered = sortForRender(visible); // annotations land last (+Infinity key)

  for (const entity of ordered) {
    parts.push(renderEntity(entity, view));
  }

  sceneRoot.innerHTML = parts.join('');
}

/** Serialise the scene fragment as a string (used by tests / export prep). */
export function renderSceneToString(doc: SceneDocument, view: ViewState = {}): string {
  const parts: string[] = [];
  if (view.showGrid) parts.push(renderGridDots(doc));
  const visible = doc.entities.filter((e) => isEntityVisible(doc, e));
  for (const entity of sortForRender(visible)) parts.push(renderEntity(entity, view));
  return parts.join('');
}
