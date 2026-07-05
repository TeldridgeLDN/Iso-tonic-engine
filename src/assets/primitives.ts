// Isometric drawing helpers. Every asset composes SVG fragments from these.
// Emits only <path> <line> <polygon> <polyline> <rect> <circle> <text> <g>.
// No id/style attributes anywhere.

import { HALF_W, HALF_H, INK, PAPER, STROKE, STROKE_THIN, FONT, n } from './style.ts';

export interface Pt {
  x: number;
  y: number;
}

/**
 * Project tile coords to screen. Asset-local origin = projected north vertex
 * of footprint tile (0,0), so P(0,0) = (0,0).
 *   screen = ((tx − ty)·32, (tx + ty)·16)
 */
export function project(tx: number, ty: number): Pt {
  return { x: (tx - ty) * HALF_W, y: (tx + ty) * HALF_H };
}

// --- low-level polygon / polyline / line helpers ------------------------

function ptsAttr(pts: Pt[]): string {
  return pts.map((p) => `${n(p.x)},${n(p.y)}`).join(' ');
}

export interface FaceOpts {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
}

/** Filled + stroked polygon (a face). Opaque PAPER by default so it occludes. */
export function polygon(pts: Pt[], opts: FaceOpts = {}): string {
  const fill = opts.fill ?? PAPER;
  const stroke = opts.stroke ?? INK;
  const sw = opts.strokeWidth ?? STROKE;
  const op = opts.opacity !== undefined ? ` opacity="${n(opts.opacity)}"` : '';
  return `<polygon points="${ptsAttr(pts)}" fill="${fill}" stroke="${stroke}" stroke-width="${n(sw)}" stroke-linejoin="round"${op}/>`;
}

/** Open polyline (no fill). */
export function polyline(pts: Pt[], sw = STROKE_THIN, stroke = INK): string {
  return `<polyline points="${ptsAttr(pts)}" fill="none" stroke="${stroke}" stroke-width="${n(sw)}" stroke-linejoin="round" stroke-linecap="round"/>`;
}

export function line(a: Pt, b: Pt, sw = STROKE_THIN, stroke = INK): string {
  return `<line x1="${n(a.x)}" y1="${n(a.y)}" x2="${n(b.x)}" y2="${n(b.y)}" stroke="${stroke}" stroke-width="${n(sw)}" stroke-linecap="round"/>`;
}

export function circle(c: Pt, r: number, opts: FaceOpts = {}): string {
  const fill = opts.fill ?? PAPER;
  const stroke = opts.stroke ?? INK;
  const sw = opts.strokeWidth ?? STROKE;
  return `<circle cx="${n(c.x)}" cy="${n(c.y)}" r="${n(r)}" fill="${fill}" stroke="${stroke}" stroke-width="${n(sw)}" stroke-linejoin="round"/>`;
}

/** Filled shape from an explicit SVG path string of local coords. */
export function pathFill(d: string, opts: FaceOpts = {}): string {
  const fill = opts.fill ?? PAPER;
  const stroke = opts.stroke ?? INK;
  const sw = opts.strokeWidth ?? STROKE;
  return `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${n(sw)}" stroke-linejoin="round" stroke-linecap="round"/>`;
}

export interface TextOpts {
  size?: number;
  fill?: string;
  anchor?: 'start' | 'middle' | 'end';
  weight?: number | 'bold' | 'normal';
  rotate?: number; // degrees, about (x,y)
  letterSpacing?: number;
}

export function text(x: number, y: number, s: string, opts: TextOpts = {}): string {
  const size = opts.size ?? 7;
  const fill = opts.fill ?? INK;
  const anchor = opts.anchor ?? 'start';
  const weight = opts.weight ?? 'normal';
  const esc = s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const ls = opts.letterSpacing !== undefined ? ` letter-spacing="${n(opts.letterSpacing)}"` : '';
  const rot = opts.rotate ? ` transform="rotate(${n(opts.rotate)} ${n(x)} ${n(y)})"` : '';
  return `<text x="${n(x)}" y="${n(y)}" font-family="${FONT}" font-size="${n(size)}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}"${ls}${rot}>${esc}</text>`;
}

/** Wrap a list of fragments in a translated group. */
export function group(dx: number, dy: number, frags: string[]): string {
  if (dx === 0 && dy === 0) return frags.join('');
  return `<g transform="translate(${n(dx)} ${n(dy)})">${frags.join('')}</g>`;
}

// --- isometric primitives -----------------------------------------------

/** Ground-tile diamond outline for a w×d footprint at local origin. */
export function isoDiamond(w = 1, d = 1, opts: FaceOpts = {}): string {
  const nn = project(0, 0);
  const e = project(w, 0);
  const s = project(w, d);
  const ww = project(0, d);
  return polygon([nn, e, s, ww], { fill: opts.fill ?? PAPER, stroke: opts.stroke ?? INK, strokeWidth: opts.strokeWidth ?? STROKE });
}

/** Dashed / dotted variant of a diamond outline (unfilled) for zones. */
export function isoDiamondOutline(
  w: number,
  d: number,
  dash: string,
  stroke = INK,
  sw = STROKE
): string {
  const nn = project(0, 0);
  const e = project(w, 0);
  const s = project(w, d);
  const ww = project(0, d);
  const pts = ptsAttr([nn, e, s, ww]);
  return `<polygon points="${pts}" fill="none" stroke="${stroke}" stroke-width="${n(sw)}" stroke-linejoin="round" stroke-dasharray="${dash}"/>`;
}

export interface IsoBoxOpts {
  fill?: string;
  hatchRight?: boolean; // fine 45° hatch on right (SE) face
  hatchLeft?: boolean;
  stroke?: string;
  strokeWidth?: number;
}

/**
 * A solid isometric box: footprint w (along +x) × d (along +y), height h in
 * screen px (rises in −y). Returns the three visible faces back-to-front:
 * left (SW) + right (SE) first, then top. Opaque white fills occlude.
 *
 * Corner naming (ground):  N=P(0,0) E=P(w,0) S=P(w,d) W=P(0,d)
 */
export function isoBox(w: number, d: number, h: number, opts: IsoBoxOpts = {}): string {
  const fill = opts.fill ?? PAPER;
  const stroke = opts.stroke ?? INK;
  const sw = opts.strokeWidth ?? STROKE;

  const gN = project(0, 0);
  const gE = project(w, 0);
  const gS = project(w, d);
  const gW = project(0, d);
  const up = (p: Pt): Pt => ({ x: p.x, y: p.y - h });
  const tN = up(gN);
  const tE = up(gE);
  const tS = up(gS);
  const tW = up(gW);

  const faces: string[] = [];

  // Left face (SW): ground W→S, top S→W.  Visible west/left side.
  faces.push(polygon([gW, gS, tS, tW], { fill, stroke, strokeWidth: sw }));
  if (opts.hatchLeft) faces.push(hatchFace([gW, gS, tS, tW]));

  // Right face (SE): ground S→E, top E→S.  Visible east/right side.
  faces.push(polygon([gS, gE, tE, tS], { fill, stroke, strokeWidth: sw }));
  if (opts.hatchRight) faces.push(hatchFace([gS, gE, tE, tS]));

  // Top face — drawn last, nearest the viewer at the apex.
  faces.push(polygon([tN, tE, tS, tW], { fill, stroke, strokeWidth: sw }));

  return faces.join('');
}

/**
 * A fine 45° hatch clipped to a quadrilateral face, approximated by a set of
 * short parallel ink lines. Kept sparse per the contract.
 */
export function hatchFace(quad: Pt[]): string {
  // quad = [a,b,c,d] in order. Hatch by interpolating along a→b and d→c.
  const [a, b, c, d] = quad;
  const lines: string[] = [];
  const steps = 6;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    const q = { x: d.x + (c.x - d.x) * t, y: d.y + (c.y - d.y) * t };
    lines.push(line(p, q, 0.6, INK));
  }
  return lines.join('');
}

/**
 * Rectangle mapped onto the LEFT (SW) face plane of a box.
 * Face basis: u along W→S (screen +x,+y over span d), v = up (screen −y).
 * Inputs u0,u1 in [0,d] tile units, v0,v1 in screen px up from ground.
 */
export function leftFaceRect(u0: number, u1: number, v0: number, v1: number, sw = STROKE_THIN): string {
  const on = (u: number, v: number): Pt => {
    const g = project(0, u); // along W→S
    return { x: g.x, y: g.y - v };
  };
  const pts = [on(u0, v0), on(u1, v0), on(u1, v1), on(u0, v1)];
  return polygon(pts, { fill: PAPER, stroke: INK, strokeWidth: sw });
}

/**
 * Rectangle mapped onto the RIGHT (SE) face plane of a box.
 * Face basis: u along E→S? we use S→E direction. Here u in [0,w] tile units
 * measured along the south edge from S toward E, v = up screen px.
 * The right face south edge runs S=P(w,d) → E=P(w,0): decreasing ty.
 */
export function rightFaceRect(depthD: number, u0: number, u1: number, v0: number, v1: number, sw = STROKE_THIN): string {
  const on = (u: number, v: number): Pt => {
    const g = project(u, depthD); // along the far (south) edge at fixed ty=d, tx = u
    return { x: g.x, y: g.y - v };
  };
  const pts = [on(u0, v0), on(u1, v0), on(u1, v1), on(u0, v1)];
  return polygon(pts, { fill: PAPER, stroke: INK, strokeWidth: sw });
}
