// Export: SVG (serialise), PNG (canvas 1×/2×/4×), vector PDF (svg2pdf + jsPDF).
// Full map bounds auto-fit, visible layers only, editor-only content stripped.
// Pure transforms live in ./svg-prep.ts; this module is the browser glue
// (Blob/canvas/DOM/jsPDF). Uses the renderer as the single source of scene SVG.

import type { SceneDocument } from '../core/model.ts';
import { renderSceneToString } from '../render/renderer.ts';
import { kebabCase } from './filename.ts';
import {
  assembleSvgWithMeta,
  computeBBox,
  exportDimensions,
  stripEditorOnly,
  type BBox,
} from './svg-prep.ts';
import { buildWrittenDescription } from './description.ts';
import {
  buildLegendModel,
  extendBBoxForLegend,
  panelWidth,
  renderLegendPanel,
} from './legend.ts';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Options common to all raster/vector exports. */
export interface ExportOptions {
  /** Append the right-hand map-key / legend panel. Default false. */
  legend?: boolean;
}

// ---------------------------------------------------------------------------
// Shared prep
// ---------------------------------------------------------------------------

interface Prepared {
  svg: string; // standalone, self-contained SVG document string
  bbox: BBox | null;
  width: number; // export pixel width at scale 1 (viewBox units)
  height: number;
}

/**
 * Build the export-ready SVG for a document:
 *   render (visible-only; renderer already filters via isEntityVisible and
 *   omits grid dots when showGrid is unset) → strip any editor-only content
 *   defensively → compute bbox → assemble standalone SVG (white bg, viewBox +
 *   40px margin, inlined xmlns).
 *
 * <title>/<desc> accessibility metadata is always injected (free). When
 * `opts.legend` is set, a right-hand key panel is appended and the export
 * dimensions grow to keep it inside the viewBox (never cropped).
 */
export function buildExportSvg(doc: SceneDocument, opts: ExportOptions = {}): Prepared {
  // Default view: no grid, no hover/selection/spotlight attributes.
  const fragment = stripEditorOnly(renderSceneToString(doc));
  const bbox = computeBBox(fragment);
  const desc = buildWrittenDescription(doc);
  const title = doc.meta.title || 'Untitled map';

  if (opts.legend) {
    const width = panelWidth(bbox);
    const layout = extendBBoxForLegend(bbox, width);
    const legendFragment = renderLegendPanel(buildLegendModel(doc), layout, bbox);
    const svg = assembleSvgWithMeta(fragment, bbox, {
      title,
      desc,
      extendedBBox: layout.extendedBBox,
      legendFragment,
    });
    const dims = exportDimensions(layout.extendedBBox);
    return { svg, bbox, width: dims.width, height: dims.height };
  }

  const svg = assembleSvgWithMeta(fragment, bbox, { title, desc });
  const { width, height } = exportDimensions(bbox);
  return { svg, bbox, width, height };
}

function fileBase(doc: SceneDocument): string {
  return kebabCase(doc.meta.title) || 'untitled';
}

// ---------------------------------------------------------------------------
// SVG export
// ---------------------------------------------------------------------------

export function exportSVG(doc: SceneDocument, opts: ExportOptions = {}): void {
  const { svg } = buildExportSvg(doc, opts);
  downloadBlob(svg, `${fileBase(doc)}.svg`, 'image/svg+xml');
}

// ---------------------------------------------------------------------------
// Written description export (accessibility artefact)
// ---------------------------------------------------------------------------

/** Download the plain-text written description as '<title>-description.txt'. */
export function exportDescription(doc: SceneDocument): void {
  const text = buildWrittenDescription(doc);
  downloadBlob(text, `${fileBase(doc)}-description.txt`, 'text/plain;charset=utf-8');
}

// ---------------------------------------------------------------------------
// PNG export
// ---------------------------------------------------------------------------

/**
 * Rasterise the export SVG onto a canvas at bbox × scale and download a PNG.
 * Loads the SVG through an <img> via an object URL (kept until draw completes).
 */
export async function exportPNG(
  doc: SceneDocument,
  scale: 1 | 2 | 4,
  opts: ExportOptions = {}
): Promise<void> {
  const { svg, width, height } = buildExportSvg(doc, opts);
  const img = await svgToImage(svg);

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('exportPNG: 2D canvas context unavailable');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const blob = await canvasToBlob(canvas);
  const url = URL.createObjectURL(blob);
  triggerDownload(url, `${fileBase(doc)}.png`);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function svgToImage(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = (): void => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (): void => {
      URL.revokeObjectURL(url);
      reject(new Error('exportPNG: SVG image failed to load'));
    };
    img.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('exportPNG: canvas.toBlob returned null'));
    }, 'image/png');
  });
}

// ---------------------------------------------------------------------------
// PDF export (vector)
// ---------------------------------------------------------------------------

/**
 * Vector PDF: page auto-sized to the map's bbox aspect (pt units), then the
 * SVG is drawn via svg2pdf. Downloaded as '<title>.pdf'.
 */
export async function exportPDF(
  doc: SceneDocument,
  opts: ExportOptions = {}
): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const { svg2pdf } = await import('svg2pdf.js');

  const { svg, width, height } = buildExportSvg(doc, opts);
  const w = Math.max(1, width);
  const h = Math.max(1, height);

  const pdf = new jsPDF({
    unit: 'pt',
    format: [w, h],
    orientation: w >= h ? 'landscape' : 'portrait',
  });

  const element = svgStringToElement(svg);
  await svg2pdf(element, pdf, { x: 0, y: 0, width: w, height: h });
  pdf.save(`${fileBase(doc)}.pdf`);
}

/** Parse an SVG document string into a detached SVGSVGElement. */
function svgStringToElement(svg: string): SVGSVGElement {
  const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const el = parsed.documentElement;
  if (el.namespaceURI !== SVG_NS || el.tagName.toLowerCase() !== 'svg') {
    throw new Error('exportPDF: failed to parse export SVG');
  }
  return el as unknown as SVGSVGElement;
}

// ---------------------------------------------------------------------------
// DOM download glue
// ---------------------------------------------------------------------------

function downloadBlob(data: string, fileName: string, mime: string): void {
  const blob = new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  triggerDownload(url, fileName);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function triggerDownload(url: string, fileName: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
