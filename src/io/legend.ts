// Legend / map-key panel for exports (Defra whole-services "key" panel).
// Pure string/data transforms — no DOM, unit-tested in node. The panel is a
// white field appended to the RIGHT of the map, separated by a thin INK rule,
// containing: map title, doc description, and a Layers list. Text is the
// contract's Helvetica dialect, INK ink; ACCENT is used ONLY for the title rule.
// (The former per-zone blocks were dropped when zone kinds collapsed into
// unlabeled territories, 2026-07.)
//
// Node cannot measure text, so wrapping is a simple greedy character-count wrap.
// The export bbox/page maths are extended here so the panel always sits inside
// the viewBox / page and is never cropped.

import type { SceneDocument } from '../core/model.ts';
import { INK, ACCENT, FONT } from '../assets/style.ts';
import type { BBox } from './svg-prep.ts';
import { visibleEntities } from './description.ts';

// --- Panel geometry constants ----------------------------------------------

export const PANEL_PAD = 20; // inner padding, all sides
export const PANEL_GAP = 24; // gap between map bbox edge and the panel field
export const PANEL_MIN_W = 260;
export const PANEL_MAX_W = 420;
export const TITLE_SIZE = 16;
export const BODY_SIZE = 11;
export const LINE_H = 15; // line advance for body text
export const SECTION_TITLE_SIZE = 12;
export const WRAP_COLS = 38; // ~chars per line at font-size 11 (greedy wrap)

// --- Panel width -------------------------------------------------------------

/**
 * Panel width = one third of the map width, clamped to [MIN, MAX]. Falls back
 * to MIN for a null/degenerate bbox.
 */
export function panelWidth(bbox: BBox | null): number {
  if (!bbox) return PANEL_MIN_W;
  const mapW = bbox.maxX - bbox.minX;
  const third = mapW / 3;
  return Math.round(clamp(third, PANEL_MIN_W, PANEL_MAX_W));
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// --- Text wrapping -----------------------------------------------------------

/**
 * Greedy word-wrap to a maximum column count. Preserves explicit newlines,
 * never drops a word (a word longer than `cols` occupies its own line). Pure.
 */
export function wrapText(text: string, cols: number = WRAP_COLS): string[] {
  const out: string[] = [];
  for (const paragraph of text.split('\n')) {
    const words = paragraph.split(/\s+/).filter((w) => w.length > 0);
    if (words.length === 0) {
      out.push('');
      continue;
    }
    let line = '';
    for (const word of words) {
      if (line === '') {
        line = word;
      } else if (line.length + 1 + word.length <= cols) {
        line += ' ' + word;
      } else {
        out.push(line);
        line = word;
      }
    }
    if (line !== '') out.push(line);
  }
  return out;
}

// --- Legend content model ----------------------------------------------------

export interface LegendModel {
  title: string;
  description: string;
  layers: string[];
}

/** Derive the legend content model from a document (visible entities only). */
export function buildLegendModel(doc: SceneDocument): LegendModel {
  const layers = doc.layers.map((layer) => {
    const count = visibleEntities(doc).filter((e) =>
      e.customLayers?.includes(layer.id)
    ).length;
    return `${layer.name || layer.id} (${count})`;
  });

  return {
    title: doc.meta.title || 'Untitled map',
    description: doc.meta.description ?? '',
    layers,
  };
}

// --- Extended bbox / page maths ---------------------------------------------

export interface LegendLayout {
  /** left x of the panel field, in map coordinate space. */
  panelX: number;
  panelWidth: number;
  /** the separating INK rule x. */
  ruleX: number;
  /** bbox extended to include the panel (before export margin is applied). */
  extendedBBox: BBox;
}

/**
 * Extend a map bbox to the right to make room for the legend panel. The panel
 * sits at [maxX + GAP, maxX + GAP + width]; the returned bbox spans the union
 * so the standard export margin still applies uniformly.
 */
export function extendBBoxForLegend(bbox: BBox | null, width: number): LegendLayout {
  const box: BBox = bbox ?? { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  const ruleX = box.maxX + PANEL_GAP;
  const panelX = ruleX;
  return {
    panelX,
    panelWidth: width,
    ruleX,
    extendedBBox: {
      minX: box.minX,
      minY: box.minY,
      maxX: panelX + width,
      maxY: box.maxY,
    },
  };
}

// --- Panel SVG fragment ------------------------------------------------------

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function textEl(x: number, y: number, size: number, weight: string, s: string): string {
  const w = weight === 'bold' ? ' font-weight="bold"' : '';
  return (
    `<text x="${round(x)}" y="${round(y)}" font-family="${FONT}" ` +
    `font-size="${size}" fill="${INK}"${w}>${esc(s)}</text>`
  );
}

function round(v: number): number {
  return Math.round(v * 100) / 100;
}

/**
 * Render the legend panel as an SVG fragment positioned in map coordinate
 * space (using the LegendLayout from extendBBoxForLegend). The panel field is a
 * full-height white rect; a thin ACCENT rule separates it from the map; content
 * is INK Helvetica. Height is driven by the map bbox (panel spans map height).
 */
export function renderLegendPanel(
  model: LegendModel,
  layout: LegendLayout,
  mapBBox: BBox | null
): string {
  const box: BBox = mapBBox ?? { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  const top = box.minY;
  const bottom = box.maxY;
  const height = Math.max(1, bottom - top);
  const x = layout.panelX;
  const w = layout.panelWidth;

  const parts: string[] = [];

  // White field.
  parts.push(
    `<rect x="${round(x)}" y="${round(top)}" width="${round(w)}" ` +
      `height="${round(height)}" fill="#FFFFFF"/>`
  );
  // Thin ACCENT rule separating panel from map (the only accent use).
  parts.push(
    `<line x1="${round(layout.ruleX)}" y1="${round(top)}" ` +
      `x2="${round(layout.ruleX)}" y2="${round(bottom)}" ` +
      `stroke="${ACCENT}" stroke-width="1.5" stroke-linecap="round"/>`
  );

  const textX = x + PANEL_PAD;
  let cy = top + PANEL_PAD + TITLE_SIZE;

  // Title.
  parts.push(textEl(textX, cy, TITLE_SIZE, 'bold', model.title));
  cy += LINE_H + 4;

  // Description (wrapped).
  if (model.description) {
    for (const line of wrapText(model.description, WRAP_COLS)) {
      parts.push(textEl(textX, cy, BODY_SIZE, 'normal', line));
      cy += LINE_H;
    }
    cy += 6;
  }

  // Layers.
  if (model.layers.length > 0) {
    parts.push(textEl(textX, cy, SECTION_TITLE_SIZE, 'bold', 'Layers'));
    cy += LINE_H;
    for (const layer of model.layers) {
      parts.push(textEl(textX + 8, cy, BODY_SIZE, 'normal', layer));
      cy += LINE_H;
    }
  }

  return `<g>${parts.join('')}</g>`;
}
