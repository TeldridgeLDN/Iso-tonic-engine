// Terrain / landscape family — all ground:true so they render beneath
// structures. Roads and rivers follow a strict edge-midpoint tiling contract so
// any network composes seamlessly; regions & coastlines are organic ground
// plates with a deterministic (seeded) hand-drawn wobble — never Math.random.
//
// Tile diamond vertices (1×1 at local origin):
//   N (0,0)  E (32,16)  S (0,32)  W (−32,16)
// Edge midpoints (the tiling anchors):
//   mNE (16, 8)   mSE (16, 24)   mSW (−16, 24)   mNW (−16, 8)
//   mNW–mSE  = the +x tile axis   (road-straight orientation 0)
//   mNE–mSW  = the +y tile axis   (road-straight orientation 1)

import { project, polyline, line, text, group, readOrientation, type Pt } from './primitives.ts';
import { INK, PAPER, STROKE, STROKE_THIN, HALF_W, HALF_H, n } from './style.ts';

// --- edge midpoints of the origin tile ----------------------------------
const mNE: Pt = { x: HALF_W / 2, y: HALF_H / 2 };   // (16, 8)
const mSE: Pt = { x: HALF_W / 2, y: HALF_H * 1.5 }; // (16, 24)
const mSW: Pt = { x: -HALF_W / 2, y: HALF_H * 1.5 };// (−16, 24)
const mNW: Pt = { x: -HALF_W / 2, y: HALF_H / 2 };  // (−16, 8)
const tileC: Pt = { x: 0, y: HALF_H }; // tile centre (0,16)

function lerp(a: Pt, b: Pt, t: number): Pt {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** Perpendicular unit vector to a→b (screen space). */
function perp(a: Pt, b: Pt): Pt {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L = Math.hypot(dx, dy) || 1;
  return { x: -dy / L, y: dx / L };
}

function num(v: unknown, dflt: number): number {
  const x = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(x) && x > 0 ? x : dflt;
}

// The two road entry/exit pairs (by axis). Orientation selects which pair.
// A "straight" connects one pair; corners/T pick from all four midpoints.
const ROAD_HALF = 8; // half the carriageway width in px (~half a tile wide overall)

/** Two parallel kerb lines + faint centre dashes between endpoints a..b. */
function roadBand(a: Pt, b: Pt, dashes = true): string {
  const pv = perp(a, b);
  const a1 = { x: a.x + pv.x * ROAD_HALF, y: a.y + pv.y * ROAD_HALF };
  const b1 = { x: b.x + pv.x * ROAD_HALF, y: b.y + pv.y * ROAD_HALF };
  const a2 = { x: a.x - pv.x * ROAD_HALF, y: a.y - pv.y * ROAD_HALF };
  const b2 = { x: b.x - pv.x * ROAD_HALF, y: b.y - pv.y * ROAD_HALF };
  const frags: string[] = [];
  frags.push(line(a1, b1, STROKE, INK));
  frags.push(line(a2, b2, STROKE, INK));
  if (dashes) {
    // faint centre-line dashes
    const steps = 4;
    for (let i = 0; i < steps; i++) {
      const t0 = (i + 0.25) / steps;
      const t1 = (i + 0.6) / steps;
      frags.push(line(lerp(a, b, t0), lerp(a, b, t1), 0.6, INK));
    }
  }
  return frags.join('');
}

/** Curved road/river band via a quadratic through a control point. */
function curvedBand(a: Pt, ctrl: Pt, b: Pt, half: number, stroke: number, wobble = false, seed = 1): string {
  // Sample the quad, offset each side by `half` along the local normal.
  const N = 14;
  const spine: Pt[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const mt = 1 - t;
    let x = mt * mt * a.x + 2 * mt * t * ctrl.x + t * t * b.x;
    let y = mt * mt * a.y + 2 * mt * t * ctrl.y + t * t * b.y;
    if (wobble && i > 0 && i < N) {
      const w = Math.sin(t * Math.PI * 3 + seed) * 1.3;
      const d = perpQuad(a, ctrl, b, t);
      x += d.x * w;
      y += d.y * w;
    }
    spine.push({ x, y });
  }
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let i = 0; i <= N; i++) {
    const d = perpQuad(a, ctrl, b, i / N);
    left.push({ x: spine[i].x + d.x * half, y: spine[i].y + d.y * half });
    right.push({ x: spine[i].x - d.x * half, y: spine[i].y - d.y * half });
  }
  return polyline(left, stroke, INK) + polyline(right, stroke, INK);
}

/** Tangent-normal of a quadratic bezier at t. */
function perpQuad(a: Pt, c: Pt, b: Pt, t: number): Pt {
  const dx = 2 * (1 - t) * (c.x - a.x) + 2 * t * (b.x - c.x);
  const dy = 2 * (1 - t) * (c.y - a.y) + 2 * t * (b.y - c.y);
  const L = Math.hypot(dx, dy) || 1;
  return { x: -dy / L, y: dx / L };
}

// ========================================================================
// ROADS
// ========================================================================

/** road-straight (1×1, orientations 2): fills the tile edge-to-edge along one axis. */
export function roadStraight(params?: Record<string, unknown>): string {
  const o = readOrientation(params);
  // o even → +x axis (mNW→mSE); o odd → +y axis (mNE→mSW).
  const [a, b] = o % 2 === 0 ? [mNW, mSE] : [mNE, mSW];
  return group(0, 0, [roadBand(a, b, true)]);
}

/**
 * road-corner (1×1, orientations 4): connects two adjacent edge midpoints,
 * bending through the tile centre. Orientation rotates which corner.
 */
export function roadCorner(params?: Record<string, unknown>): string {
  const o = readOrientation(params);
  // ordered ring of midpoints, clockwise: mNE, mSE, mSW, mNW
  const ring = [mNE, mSE, mSW, mNW];
  const a = ring[o % 4];
  const b = ring[(o + 1) % 4];
  return group(0, 0, [
    curvedBand(a, tileC, b, ROAD_HALF, STROKE, false),
    // centre dashes along the arc
    dashArc(a, tileC, b),
  ]);
}

/**
 * road-t (1×1, orientations 4): a straight along one axis plus a stub into the
 * third edge. Orientation rotates which edge is the stem.
 */
export function roadT(params?: Record<string, unknown>): string {
  const o = readOrientation(params);
  const ring = [mNE, mSE, mSW, mNW];
  // through-road connects ring[o] .. ring[o+2]; stem goes ring[o+1] .. centre.
  const a = ring[o % 4];
  const b = ring[(o + 2) % 4];
  const stem = ring[(o + 1) % 4];
  return group(0, 0, [
    roadBand(a, b, true),
    roadBand(stem, tileC, false),
  ]);
}

function dashArc(a: Pt, c: Pt, b: Pt): string {
  const frags: string[] = [];
  const steps = 4;
  for (let i = 0; i < steps; i++) {
    const t0 = (i + 0.3) / steps;
    const t1 = (i + 0.6) / steps;
    const q = (t: number): Pt => {
      const mt = 1 - t;
      return { x: mt * mt * a.x + 2 * mt * t * c.x + t * t * b.x, y: mt * mt * a.y + 2 * mt * t * c.y + t * t * b.y };
    };
    frags.push(line(q(t0), q(t1), 0.6, INK));
  }
  return frags.join('');
}

// ========================================================================
// RIVERS — wavier double line, same edge-midpoint contract
// ========================================================================

const RIVER_HALF = 7;

/** river-straight (1×1, orientations 2): wavy double line across one axis. */
export function riverStraight(params?: Record<string, unknown>): string {
  const o = readOrientation(params);
  const [a, b] = o % 2 === 0 ? [mNW, mSE] : [mNE, mSW];
  // control point offset perpendicular to give a gentle S; endpoints stay on
  // the exact midpoints so it tiles.
  const pv = perp(a, b);
  const mid = lerp(a, b, 0.5);
  const ctrl = { x: mid.x + pv.x * 3, y: mid.y + pv.y * 3 };
  return group(0, 0, [curvedBand(a, ctrl, b, RIVER_HALF, STROKE, true, o + 1)]);
}

/** river-bend (1×1, orientations 4): wavy bend between two adjacent edges. */
export function riverBend(params?: Record<string, unknown>): string {
  const o = readOrientation(params);
  const ring = [mNE, mSE, mSW, mNW];
  const a = ring[o % 4];
  const b = ring[(o + 1) % 4];
  return group(0, 0, [curvedBand(a, tileC, b, RIVER_HALF, STROKE, true, o + 2)]);
}

// ========================================================================
// ORGANIC REGION — hand-drawn-feel closed blob, dashed, corner label
// ========================================================================

/** Deterministic wobble from a small integer seed (no Math.random). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A closed organic blob inscribed in a w×d footprint diamond. The blob samples
 * points around the footprint centre out toward the diamond edge, jittered by a
 * seeded wobble so it reads hand-drawn but is fully deterministic.
 */
function organicBlob(w: number, d: number, seed: number, inset = 0.82): Pt[] {
  const c = project(w / 2, d / 2);
  // radii toward the diamond's four edges from centre
  const rx = (w + d) * HALF_W * 0.5 * inset * 0.5; // horizontal reach
  const ry = (w + d) * HALF_H * 0.5 * inset * 0.5; // vertical reach
  const rnd = mulberry32(seed || 1);
  const pts: Pt[] = [];
  const N = 16;
  for (let i = 0; i < N; i++) {
    const ang = (i / N) * Math.PI * 2;
    const jitter = 0.78 + rnd() * 0.32; // 0.78..1.10
    pts.push({ x: c.x + Math.cos(ang) * rx * jitter, y: c.y + Math.sin(ang) * ry * jitter });
  }
  return pts;
}

/** Smooth closed polyline path (Catmull-Rom → cubic) from points. */
function closedSmoothPath(pts: Pt[]): string {
  const N = pts.length;
  const P = (i: number): Pt => pts[((i % N) + N) % N];
  let dstr = `M ${n(P(0).x)} ${n(P(0).y)}`;
  for (let i = 0; i < N; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    dstr += ` C ${n(c1.x)} ${n(c1.y)} ${n(c2.x)} ${n(c2.y)} ${n(p2.x)} ${n(p2.y)}`;
  }
  return dstr + ' Z';
}

export interface RegionParams {
  w: number;
  d: number;
  label?: string;
  number?: number;
  userGroups?: string[];
  seed?: number;
}

function regionNormalize(params?: Record<string, unknown>): RegionParams {
  return {
    w: num(params?.w, 4),
    d: num(params?.d, 4),
    label: params?.label as string | undefined,
    number: typeof params?.number === 'number' ? (params!.number as number) : toNum(params?.number),
    userGroups: parseGroups(params?.userGroups),
    seed: typeof params?.seed === 'number' ? (params!.seed as number) : hashSeed(params),
  };
}

function toNum(v: unknown): number | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const x = Number(v);
  return Number.isFinite(x) ? x : undefined;
}

function parseGroups(v: unknown): string[] | undefined {
  if (Array.isArray(v)) return (v as unknown[]).map(String).filter(Boolean);
  if (typeof v === 'string' && v.trim()) return v.split(',').map((s) => s.trim()).filter(Boolean);
  return undefined;
}

/** Stable seed from footprint + label so the blob is deterministic per config. */
function hashSeed(params?: Record<string, unknown>): number {
  const s = `${params?.w ?? ''}x${params?.d ?? ''}:${params?.label ?? ''}`;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** region-organic (parametric footprint, category 'department'). */
export function renderRegionOrganic(params?: Record<string, unknown>): string {
  const p = regionNormalize(params);
  const pts = organicBlob(p.w, p.d, p.seed ?? 1);
  const d = closedSmoothPath(pts);
  const frags: string[] = [];
  frags.push(`<path d="${d}" fill="none" stroke="${INK}" stroke-width="${n(STROKE)}" stroke-linejoin="round" stroke-linecap="round" stroke-dasharray="6 4"/>`);
  // plaque block near the north (top) vertex / origin corner
  frags.push(plaqueBlock(p.label, p.number, p.userGroups));
  return group(0, 0, frags);
}

// ========================================================================
// ISLAND COASTLINE — large organic plate, shoreline treatment (category 'organisation')
// ========================================================================

/** island-coastline (parametric footprint, category 'organisation'). */
export function renderIslandCoastline(params?: Record<string, unknown>): string {
  const p = regionNormalize(params);
  const seed = p.seed ?? 7;
  const pts = organicBlob(p.w, p.d, seed, 0.94);
  const outer = closedSmoothPath(pts);
  // inner shoreline offset slightly inward (beach band)
  const c = project(p.w / 2, p.d / 2);
  const inPts = pts.map((q) => ({ x: q.x + (c.x - q.x) * 0.06, y: q.y + (c.y - q.y) * 0.06 }));
  const inner = closedSmoothPath(inPts);
  const frags: string[] = [];
  // outer coastline (solid) + inner double line (beach)
  frags.push(`<path d="${outer}" fill="${PAPER}" stroke="${INK}" stroke-width="${n(STROKE)}" stroke-linejoin="round" stroke-linecap="round"/>`);
  frags.push(`<path d="${inner}" fill="none" stroke="${INK}" stroke-width="${n(STROKE_THIN)}" stroke-linejoin="round" stroke-linecap="round"/>`);
  // short perpendicular hatch ticks on the OUTSIDE of the coastline (sea feel)
  const N = pts.length;
  for (let i = 0; i < N; i++) {
    const p0 = pts[(i - 1 + N) % N];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % N];
    // outward normal (away from centre)
    let nx = p1.x - c.x;
    let ny = p1.y - c.y;
    const L = Math.hypot(nx, ny) || 1;
    nx /= L; ny /= L;
    const base = lerp(p0, p2, 0.5); // smoothed point near p1
    const tick = { x: p1.x + nx * 4, y: p1.y + ny * 4 };
    frags.push(line({ x: p1.x, y: p1.y }, tick, 0.7, INK));
    void base;
  }
  // plaque near origin corner
  frags.push(plaqueBlock(p.label, p.number, p.userGroups));
  return group(0, 0, frags);
}

// ========================================================================
// PLAQUE BLOCK — numbered badge + title + row of user-group person glyphs.
// Flat on the plate near the origin corner; all text UPRIGHT, ink only.
// ========================================================================

/** A tiny generic person glyph (head + shoulders outline), ~14px tall. */
function personGlyph(cx: number, cy: number): string {
  // cy = baseline of the shoulders; head above.
  const headR = 2.6;
  const headCy = cy - 8;
  const frags: string[] = [];
  frags.push(`<circle cx="${n(cx)}" cy="${n(headCy)}" r="${n(headR)}" fill="${PAPER}" stroke="${INK}" stroke-width="${n(STROKE_THIN)}"/>`);
  // shoulders: shallow arc
  frags.push(
    `<path d="M ${n(cx - 5)} ${n(cy)} A ${n(5)} ${n(4.5)} 0 0 1 ${n(cx + 5)} ${n(cy)}" fill="${PAPER}" stroke="${INK}" stroke-width="${n(STROKE_THIN)}"/>`
  );
  return frags.join('');
}

export function plaqueBlock(label?: string, number?: number, userGroups?: string[]): string {
  const frags: string[] = [];
  // origin corner is the north vertex (0,0); drop the plaque just below-right.
  const ox = 6;
  const oy = -2;
  let cursorX = ox;
  const rowY = oy;
  // numbered badge
  if (number !== undefined) {
    const r = 8;
    frags.push(`<circle cx="${n(cursorX + r)}" cy="${n(rowY - r)}" r="${n(r)}" fill="${PAPER}" stroke="${INK}" stroke-width="${n(STROKE)}"/>`);
    frags.push(text(cursorX + r, rowY - r + 3.2, String(number), { size: 9, weight: 'bold', fill: INK, anchor: 'middle' }));
    cursorX += r * 2 + 4;
  }
  // title
  if (label) {
    frags.push(text(cursorX, rowY - 6, label, { size: 9, weight: 'bold', fill: INK, anchor: 'start' }));
  }
  // user-group icons row beneath the badge/title. Columns are spaced by the
  // MEASURED width of each label (approx char-count × font-size × 0.6) plus a
  // fixed gutter, so long group names no longer collide with their neighbours.
  if (userGroups && userGroups.length) {
    const gy = rowY + 18; // below the title line
    const labelSize = 5.5;
    const glyphMin = 16; // a person glyph needs ~16px even for a short label
    const gutter = 8; // breathing space between adjacent columns
    let gx = ox + 8;
    userGroups.forEach((gLabel) => {
      const labelW = Math.max(glyphMin, gLabel.length * labelSize * 0.6);
      const cx = gx + labelW / 2; // centre the glyph + centred label in the column
      frags.push(personGlyph(cx, gy));
      // tiny label beneath, upright, centred under its glyph
      frags.push(text(cx, gy + 8, gLabel, { size: labelSize, fill: INK, anchor: 'middle' }));
      gx += labelW + gutter;
    });
  }
  return frags.join('');
}
