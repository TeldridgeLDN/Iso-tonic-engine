// Small inline SVG thumbnail of an asset fragment, scaled to fit a square box.
//
// Asset fragments are authored in local coords with varied, unknown bounds, so
// we stamp the fragment into a live (offscreen or attached) <svg>, measure its
// bounding box via getBBox, then set a viewBox that frames it with padding.
// Everything is presentation-attribute driven (no `style=`), matching the
// contract for exported fragments — though thumbnails are never exported.

import { getAsset } from '../assets/library.ts';

const SVGNS = 'http://www.w3.org/2000/svg';

export interface ThumbOptions {
  size?: number; // px (square). default 72
  params?: Record<string, unknown>;
}

/**
 * Build an <svg> element containing the asset's rendered fragment, framed to
 * fit. Must be attached to the DOM (or offscreen but laid out) before getBBox
 * returns real numbers; we attach a hidden measuring host on demand.
 */
export function assetThumbnail(assetId: string, opts: ThumbOptions = {}): SVGSVGElement {
  const size = opts.size ?? 72;
  const def = getAsset(assetId);
  const fragment = def ? def.render(opts.params) : fallbackFragment();

  const svg = document.createElementNS(SVGNS, 'svg') as SVGSVGElement;
  svg.setAttribute('class', 'iso-thumb');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

  const g = document.createElementNS(SVGNS, 'g') as SVGGElement;
  g.innerHTML = fragment;
  svg.appendChild(g);

  frame(svg, g, size);
  return svg;
}

/**
 * Measure the group and set the svg viewBox to frame it. Uses a temporary
 * hidden host attached to <body> so getBBox is meaningful even before the
 * thumbnail is placed in its final container.
 */
function frame(svg: SVGSVGElement, g: SVGGElement, size: number): void {
  const host = measuringHost();
  host.appendChild(svg);

  let box: DOMRect | null = null;
  try {
    box = g.getBBox();
  } catch {
    box = null;
  }

  host.removeChild(svg);

  if (!box || box.width === 0 || box.height === 0) {
    // No measurement available (e.g. non-layout environment): frame the iso
    // tile footprint region as a reasonable default.
    svg.setAttribute('viewBox', `-40 -60 80 80`);
    return;
  }

  const pad = Math.max(box.width, box.height) * 0.12 + 2;
  const dim = Math.max(box.width, box.height) + pad * 2;
  // Centre the content's own box within a square viewBox.
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const vbX = cx - dim / 2;
  const vbY = cy - dim / 2;
  svg.setAttribute('viewBox', `${round(vbX)} ${round(vbY)} ${round(dim)} ${round(dim)}`);
  void size;
}

let host: HTMLDivElement | undefined;
function measuringHost(): HTMLDivElement {
  if (host && host.isConnected) return host;
  host = document.createElement('div');
  // Off-screen but still laid out, so getBBox works.
  host.setAttribute(
    'style',
    'position:absolute;left:-9999px;top:-9999px;width:0;height:0;overflow:hidden;'
  );
  document.body.appendChild(host);
  return host;
}

function fallbackFragment(): string {
  return '<rect x="-16" y="-16" width="32" height="32" fill="none" stroke="#1A1A1A" stroke-width="1.5"/>';
}

function round(v: number): number {
  return Math.round(v * 100) / 100;
}
