// Pure string/data transforms for export prep. No DOM — unit-tested in node.
//
// Responsibilities:
//   - strip editor-only content (data-editor-only groups) from a scene fragment
//   - compute the content bounding box of a scene fragment (coordinate parsing,
//     honouring nested translate() groups)
//   - assemble a standalone, self-contained SVG document string (white bg,
//     viewBox = bbox + margin, inlined xmlns)
//
// The bbox is a linework-geometry approximation: it reads coordinates from
// <polygon>/<polyline>/<line>/<rect>/<circle>/<path>/<text> and accumulates
// translate offsets from wrapping <g transform="translate(dx dy)">. The 40px
// export margin comfortably absorbs stroke width and any minor approximation.

export interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export const EXPORT_MARGIN = 40;

// ---------------------------------------------------------------------------
// Editor-only stripping
// ---------------------------------------------------------------------------

/**
 * Remove every <g ... data-editor-only...>...</g> (e.g. the grid-dot layer)
 * from an SVG fragment, including balanced nested groups. Idempotent; leaves
 * all other content untouched.
 */
export function stripEditorOnly(svg: string): string {
  let out = svg;
  // Repeat until no editor-only group remains (handles multiple occurrences).
  for (;;) {
    const open = findEditorOnlyOpenTag(out);
    if (open === null) break;
    const end = matchGroupEnd(out, open.tagEnd);
    if (end === -1) {
      // Malformed / unbalanced — drop from the open tag to end of string
      // rather than loop forever.
      out = out.slice(0, open.tagStart);
      break;
    }
    out = out.slice(0, open.tagStart) + out.slice(end);
  }
  return out;
}

interface OpenTag {
  tagStart: number; // index of '<'
  tagEnd: number; // index just past '>'
}

function findEditorOnlyOpenTag(svg: string): OpenTag | null {
  const re = /<g\b[^>]*\bdata-editor-only\b[^>]*>/g;
  const m = re.exec(svg);
  if (!m) return null;
  return { tagStart: m.index, tagEnd: m.index + m[0].length };
}

/**
 * Given an index just past a <g ...> open tag, return the index just past its
 * matching </g>, accounting for nested <g> ... </g>. Returns -1 if unbalanced.
 */
function matchGroupEnd(svg: string, from: number): number {
  const tagRe = /<(\/?)g\b[^>]*?(\/?)>/g;
  tagRe.lastIndex = from;
  let depth = 1;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(svg)) !== null) {
    const isClose = m[1] === '/';
    const selfClose = m[2] === '/';
    if (selfClose) continue; // <g/> opens and closes at once → depth unchanged
    if (isClose) {
      depth -= 1;
      if (depth === 0) return m.index + m[0].length;
    } else {
      depth += 1;
    }
  }
  return -1;
}

// ---------------------------------------------------------------------------
// Bounding-box computation
// ---------------------------------------------------------------------------

/**
 * Compute the content bbox of a scene fragment (already editor-stripped, or
 * not — editor-only groups are cheap to include but callers strip first).
 * Returns null for empty / coordinate-free fragments.
 */
export function computeBBox(fragment: string): BBox | null {
  const acc: BBox = {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
  };
  let any = false;
  const add = (x: number, y: number): void => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    any = true;
    if (x < acc.minX) acc.minX = x;
    if (y < acc.minY) acc.minY = y;
    if (x > acc.maxX) acc.maxX = x;
    if (y > acc.maxY) acc.maxY = y;
  };

  walkElements(fragment, 0, 0, add);
  return any ? acc : null;
}

/**
 * Walk element tags in [dx,dy] translated space, feeding absolute coordinates
 * to `add`. Nested <g transform="translate(...)"> accumulate the offset over
 * their span; other <g> pass the offset through. Non-translate transforms
 * (e.g. rotate on <text>) are ignored for the offset — the point of origin is
 * still counted, which is sufficient for a margin-padded bbox.
 */
function walkElements(
  svg: string,
  dx: number,
  dy: number,
  add: (x: number, y: number) => void
): void {
  const tagRe = /<([a-zA-Z]+)\b([^>]*?)(\/?)>/g;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(svg)) !== null) {
    const name = m[1];
    const attrs = m[2];
    const selfClose = m[3] === '/';

    if (name === 'g') {
      const t = parseTranslate(attrs);
      const childDx = dx + t.x;
      const childDy = dy + t.y;
      if (selfClose) continue;
      const end = matchGroupEnd(svg, tagRe.lastIndex);
      if (end === -1) {
        // Unbalanced: walk the remainder with the child offset, then stop.
        walkElements(svg.slice(tagRe.lastIndex), childDx, childDy, add);
        return;
      }
      const inner = svg.slice(tagRe.lastIndex, findGroupInnerEnd(svg, end));
      walkElements(inner, childDx, childDy, add);
      tagRe.lastIndex = end;
      continue;
    }

    addPointsForElement(name, attrs, dx, dy, add);
  }
}

/** Index of the '<' that begins the </g> whose end is `groupEndPastGt`. */
function findGroupInnerEnd(svg: string, groupEndPastGt: number): number {
  // groupEndPastGt is just past '>' of the closing </g>. Find that '<'.
  const closeIdx = svg.lastIndexOf('</g>', groupEndPastGt);
  return closeIdx === -1 ? groupEndPastGt : closeIdx;
}

function addPointsForElement(
  name: string,
  attrs: string,
  dx: number,
  dy: number,
  add: (x: number, y: number) => void
): void {
  switch (name) {
    case 'polygon':
    case 'polyline': {
      for (const p of parsePointsAttr(attrs)) add(p.x + dx, p.y + dy);
      break;
    }
    case 'line': {
      const x1 = num(attrs, 'x1');
      const y1 = num(attrs, 'y1');
      const x2 = num(attrs, 'x2');
      const y2 = num(attrs, 'y2');
      if (x1 !== null && y1 !== null) add(x1 + dx, y1 + dy);
      if (x2 !== null && y2 !== null) add(x2 + dx, y2 + dy);
      break;
    }
    case 'rect': {
      const x = num(attrs, 'x') ?? 0;
      const y = num(attrs, 'y') ?? 0;
      const w = num(attrs, 'width') ?? 0;
      const h = num(attrs, 'height') ?? 0;
      add(x + dx, y + dy);
      add(x + w + dx, y + h + dy);
      break;
    }
    case 'circle': {
      const cx = num(attrs, 'cx') ?? 0;
      const cy = num(attrs, 'cy') ?? 0;
      const r = num(attrs, 'r') ?? 0;
      add(cx - r + dx, cy - r + dy);
      add(cx + r + dx, cy + r + dy);
      break;
    }
    case 'text': {
      const x = num(attrs, 'x');
      const y = num(attrs, 'y');
      if (x !== null && y !== null) add(x + dx, y + dy);
      break;
    }
    case 'path': {
      const d = attrVal(attrs, 'd');
      if (d) for (const p of parsePathCoords(d)) add(p.x + dx, p.y + dy);
      break;
    }
    default:
      break;
  }
}

// ---------------------------------------------------------------------------
// Attribute / coordinate parsers
// ---------------------------------------------------------------------------

function attrVal(attrs: string, name: string): string | null {
  const re = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`);
  const m = re.exec(attrs);
  return m ? m[1] : null;
}

function num(attrs: string, name: string): number | null {
  const v = attrVal(attrs, name);
  if (v === null) return null;
  const f = Number.parseFloat(v);
  return Number.isFinite(f) ? f : null;
}

/** Parse `translate(dx dy)` or `translate(dx,dy)` from a transform attribute. */
export function parseTranslate(attrs: string): { x: number; y: number } {
  const t = attrVal(attrs, 'transform');
  if (!t) return { x: 0, y: 0 };
  const m = /translate\(\s*(-?[\d.]+)[ ,]+(-?[\d.]+)\s*\)/.exec(t);
  if (m) return { x: Number.parseFloat(m[1]), y: Number.parseFloat(m[2]) };
  const m1 = /translate\(\s*(-?[\d.]+)\s*\)/.exec(t);
  if (m1) return { x: Number.parseFloat(m1[1]), y: 0 };
  return { x: 0, y: 0 };
}

/** Parse a `points="x,y x,y ..."` attribute into points. */
export function parsePointsAttr(attrs: string): { x: number; y: number }[] {
  const raw = attrVal(attrs, 'points');
  if (!raw) return [];
  const nums = raw.match(/-?[\d.]+/g);
  if (!nums) return [];
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) {
    out.push({ x: Number.parseFloat(nums[i]), y: Number.parseFloat(nums[i + 1]) });
  }
  return out;
}

/**
 * Extract coordinate pairs from a path `d` string. This codebase's assets emit
 * absolute M/L path data with plain x,y number pairs; we read every number in
 * order as alternating x,y. This over-counts for any command taking scalar args
 * (none are used here), which only ever *grows* the bbox — safe under margin.
 */
export function parsePathCoords(d: string): { x: number; y: number }[] {
  const nums = d.match(/-?[\d.]+(?:e-?[\d.]+)?/gi);
  if (!nums) return [];
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) {
    out.push({ x: Number.parseFloat(nums[i]), y: Number.parseFloat(nums[i + 1]) });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Standalone SVG assembly
// ---------------------------------------------------------------------------

/**
 * Assemble a self-contained SVG document string from an already-stripped scene
 * fragment and its bbox. Adds an inlined xmlns, a viewBox padded by margin, and
 * an opaque white background rect covering the whole viewBox.
 */
export function assembleSvg(
  fragment: string,
  bbox: BBox | null,
  margin = EXPORT_MARGIN
): string {
  // Degenerate empty scene → a small white square so nothing crashes.
  const box: BBox = bbox ?? { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  const vbX = box.minX - margin;
  const vbY = box.minY - margin;
  const vbW = box.maxX - box.minX + margin * 2;
  const vbH = box.maxY - box.minY + margin * 2;
  const r = (v: number): number => Math.round(v * 100) / 100;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" ` +
    `viewBox="${r(vbX)} ${r(vbY)} ${r(vbW)} ${r(vbH)}" ` +
    `width="${r(vbW)}" height="${r(vbH)}">` +
    `<rect x="${r(vbX)}" y="${r(vbY)}" width="${r(vbW)}" height="${r(vbH)}" fill="#FFFFFF"/>` +
    fragment +
    `</svg>`
  );
}

/** viewBox dimensions (w,h) for a bbox + margin — used to size PNG/PDF. */
export function exportDimensions(
  bbox: BBox | null,
  margin = EXPORT_MARGIN
): { width: number; height: number } {
  const box: BBox = bbox ?? { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  return {
    width: box.maxX - box.minX + margin * 2,
    height: box.maxY - box.minY + margin * 2,
  };
}
