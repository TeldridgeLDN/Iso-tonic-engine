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
// A "straight" connects one pair; corners/T/cross pick from all four midpoints.
//
// SEAM CONTRACT: every shape crosses a tile edge exactly at that edge's
// midpoint, ROAD_HALF wide, with its spine tangent PARALLEL to the axis
// through that midpoint. Straights, corners, T-junctions and crossroads all
// share this contract, so any combination composes SimCity-style.
// Half the carriageway width in px (20px overall). Must be comfortably less
// than the ~14.3px spine-to-vertex clearance of the tile diamond, or a single
// band swallows the whole tile and junction kerb corners degenerate to points
// outside it (the flaw in the pre-2026-07 16px roads).
const ROAD_HALF = 10;

// Flat-colour terrain palette (muted, matching the Variant-B sprite look).
const ASPHALT = '#9A9DA2';
const ROAD_DASH = '#F2EFE8';
const WATER = '#8FB6C4';
const BANK = '#5E8799';

// ordered ring of midpoints, clockwise: mNE, mSE, mSW, mNW
const ring = [mNE, mSE, mSW, mNW];
// Inward axis direction at each ring midpoint (unit vector into the tile).
const inward: Pt[] = ring.map((m, i) => unit(sub(ring[(i + 2) % 4], m)));

function sub(a: Pt, b: Pt): Pt {
  return { x: a.x - b.x, y: a.y - b.y };
}

function unit(v: Pt): Pt {
  const L = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / L, y: v.y / L };
}

function add(a: Pt, v: Pt, k = 1): Pt {
  return { x: a.x + v.x * k, y: a.y + v.y * k };
}

function dot(a: Pt, b: Pt): number {
  return a.x * b.x + a.y * b.y;
}

/** Intersection of lines p + t·r and q + s·w (assumed non-parallel). */
function lineIntersect(p: Pt, r: Pt, q: Pt, w: Pt): Pt {
  const denom = r.x * w.y - r.y * w.x;
  const t = ((q.x - p.x) * w.y - (q.y - p.y) * w.x) / denom;
  return { x: p.x + r.x * t, y: p.y + r.y * t };
}

function polygonFill(pts: Pt[], fill: string): string {
  return `<polygon points="${pts.map((p) => `${n(p.x)},${n(p.y)}`).join(' ')}" fill="${fill}" stroke="none"/>`;
}

/** Carriageway fill polygon between endpoints a..b. */
function bandFill(a: Pt, b: Pt, half: number, fill: string): string {
  const pv = perp(a, b);
  return polygonFill(
    [add(a, pv, half), add(b, pv, half), add(b, pv, -half), add(a, pv, -half)],
    fill
  );
}

/** Centre-line dashes between a..b over given t ranges (pairs of [t0,t1]). */
function centreDashes(a: Pt, b: Pt, ranges: Array<[number, number]>): string {
  return ranges.map(([t0, t1]) => line(lerp(a, b, t0), lerp(a, b, t1), 1.2, ROAD_DASH)).join('');
}

const FULL_DASHES: Array<[number, number]> = [
  [0.0625, 0.15], [0.3125, 0.4], [0.5625, 0.65], [0.8125, 0.9],
];

/** Full straight band: fill + two kerbs + dashes. */
function roadBand(a: Pt, b: Pt, dashes = true): string {
  const pv = perp(a, b);
  const frags: string[] = [bandFill(a, b, ROAD_HALF, ASPHALT)];
  frags.push(line(add(a, pv, ROAD_HALF), add(b, pv, ROAD_HALF), STROKE, INK));
  frags.push(line(add(a, pv, -ROAD_HALF), add(b, pv, -ROAD_HALF), STROKE, INK));
  if (dashes) frags.push(centreDashes(a, b, FULL_DASHES));
  return frags.join('');
}

// --- curved spine sampling (shared by road corner and rivers) ------------

interface Offsets {
  spine: Pt[];
  left: Pt[];
  right: Pt[];
}

/** Sampled quadratic spine with ±half offsets (optional deterministic wobble). */
function quadOffsets(a: Pt, ctrl: Pt, b: Pt, half: number, wobble = false, seed = 1): Offsets {
  const N = 14;
  const spine: Pt[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const mt = 1 - t;
    let x = mt * mt * a.x + 2 * mt * t * ctrl.x + t * t * b.x;
    let y = mt * mt * a.y + 2 * mt * t * ctrl.y + t * t * b.y;
    if (wobble && i > 0 && i < N) {
      // tapered by sin(πt) so the wobble dies at the endpoints — the spine
      // leaves each edge exactly on-axis and seams stay kink-free
      const w = Math.sin(t * Math.PI * 3 + seed) * 1.3 * Math.sin(Math.PI * t);
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
    left.push(add(spine[i], d, half));
    right.push(add(spine[i], d, -half));
  }
  return { spine, left, right };
}

/** Tangent-normal of a quadratic bezier at t. */
function perpQuad(a: Pt, c: Pt, b: Pt, t: number): Pt {
  const dx = 2 * (1 - t) * (c.x - a.x) + 2 * t * (b.x - c.x);
  const dy = 2 * (1 - t) * (c.y - a.y) + 2 * t * (b.y - c.y);
  const L = Math.hypot(dx, dy) || 1;
  return { x: -dy / L, y: dx / L };
}

/** Sampled cubic spine with ±half offsets. End tangents are a→c1 and c2→b. */
function cubicOffsets(a: Pt, c1: Pt, c2: Pt, b: Pt, half: number): Offsets {
  const N = 14;
  const spine: Pt[] = [];
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const mt = 1 - t;
    spine.push({
      x: mt ** 3 * a.x + 3 * mt * mt * t * c1.x + 3 * mt * t * t * c2.x + t ** 3 * b.x,
      y: mt ** 3 * a.y + 3 * mt * mt * t * c1.y + 3 * mt * t * t * c2.y + t ** 3 * b.y,
    });
    const dx = 3 * mt * mt * (c1.x - a.x) + 6 * mt * t * (c2.x - c1.x) + 3 * t * t * (b.x - c2.x);
    const dy = 3 * mt * mt * (c1.y - a.y) + 6 * mt * t * (c2.y - c1.y) + 3 * t * t * (b.y - c2.y);
    const L = Math.hypot(dx, dy) || 1;
    const d = { x: -dy / L, y: dx / L };
    left.push(add(spine[i], d, half));
    right.push(add(spine[i], d, -half));
  }
  return { spine, left, right };
}

function offsetsFill(o: Offsets, fill: string): string {
  return polygonFill([...o.left, ...o.right.slice().reverse()], fill);
}

/** Dashes along a sampled spine over the same t ranges as centreDashes. */
function spineDashes(spine: Pt[], ranges: Array<[number, number]>, color = ROAD_DASH): string {
  const at = (t: number): Pt => {
    const f = t * (spine.length - 1);
    const i = Math.min(Math.floor(f), spine.length - 2);
    return lerp(spine[i], spine[i + 1], f - i);
  };
  return ranges.map(([t0, t1]) => line(at(t0), at(t1), 1.2, color)).join('');
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
 * road-corner (1×1, orientations 4): connects two adjacent edge midpoints.
 * A cubic whose end tangents run along the edge axes, so kerbs meet a
 * straight (or any other contract shape) in the next tile without a kink.
 * The control points hug the turned diamond vertex, keeping the wide
 * carriageway inside the tile.
 */
export function roadCorner(params?: Record<string, unknown>): string {
  const o = readOrientation(params);
  const a = ring[o % 4];
  const b = ring[(o + 1) % 4];
  const K = 9; // control-point pull — tight turn, still smooth at ROAD_HALF 16
  const offs = cubicOffsets(a, add(a, inward[o % 4], K), add(b, inward[(o + 1) % 4], K), b, ROAD_HALF);
  return group(0, 0, [
    offsetsFill(offs, ASPHALT),
    polyline(offs.left, STROKE, INK),
    polyline(offs.right, STROKE, INK),
    spineDashes(offs.spine, FULL_DASHES),
  ]);
}

/**
 * road-t (1×1, orientations 4): a through-road along one axis plus a stem
 * into the third edge. The through kerb on the stem side breaks at the stem
 * mouth, and the stem kerbs run up to that kerb line — an open junction, not
 * a sealed-off stub. Orientation rotates which edge is the stem.
 */
export function roadT(params?: Record<string, unknown>): string {
  const o = readOrientation(params);
  const a = ring[o % 4];
  const b = ring[(o + 2) % 4];
  const s = ring[(o + 1) % 4];
  const u = unit(sub(b, a));
  const pvu = perp(a, b);
  // which side of the through-road the stem is on
  const sgn = Math.sign(dot(sub(s, tileC), pvu)) || 1;
  const nearA = add(a, pvu, ROAD_HALF * sgn);
  const nearB = add(b, pvu, ROAD_HALF * sgn);
  const farA = add(a, pvu, -ROAD_HALF * sgn);
  const farB = add(b, pvu, -ROAD_HALF * sgn);
  const ds = unit(sub(tileC, s));
  const pvs = perp(s, tileC);
  const s1 = add(s, pvs, ROAD_HALF);
  const s2 = add(s, pvs, -ROAD_HALF);
  const i1 = lineIntersect(s1, ds, nearA, u);
  const i2 = lineIntersect(s2, ds, nearA, u);
  // order the two mouth intersections along the through axis
  const [first, second] = dot(sub(i1, nearA), u) < dot(sub(i2, nearA), u) ? [i1, i2] : [i2, i1];
  return group(0, 0, [
    bandFill(a, b, ROAD_HALF, ASPHALT),
    bandFill(s, tileC, ROAD_HALF, ASPHALT),
    line(farA, farB, STROKE, INK), // far kerb, unbroken
    line(nearA, first, STROKE, INK), // near kerb, broken at the stem mouth
    line(second, nearB, STROKE, INK),
    line(s1, i1, STROKE, INK), // stem kerbs up to the through kerb line
    line(s2, i2, STROKE, INK),
    centreDashes(a, b, FULL_DASHES),
  ]);
}

/**
 * road-cross (1×1, orientations 1): both axes crossing at the tile centre.
 * Each kerb line breaks where the other road passes — four open corners.
 */
export function roadCross(): string {
  const axes: Array<[Pt, Pt]> = [
    [mNW, mSE],
    [mNE, mSW],
  ];
  const frags: string[] = [bandFill(mNW, mSE, ROAD_HALF, ASPHALT), bandFill(mNE, mSW, ROAD_HALF, ASPHALT)];
  for (let r = 0; r < 2; r++) {
    const [a, b] = axes[r];
    const [c, d] = axes[1 - r];
    const u = unit(sub(b, a));
    const pvu = perp(a, b);
    const pvo = perp(c, d);
    for (const sgn of [1, -1]) {
      const kA = add(a, pvu, ROAD_HALF * sgn);
      const kB = add(b, pvu, ROAD_HALF * sgn);
      // intersections with BOTH kerb lines of the crossing road
      const uo = unit(sub(d, c));
      const j1 = lineIntersect(kA, u, add(c, pvo, ROAD_HALF), uo);
      const j2 = lineIntersect(kA, u, add(c, pvo, -ROAD_HALF), uo);
      const [first, second] = dot(sub(j1, kA), u) < dot(sub(j2, kA), u) ? [j1, j2] : [j2, j1];
      frags.push(line(kA, first, STROKE, INK));
      frags.push(line(second, kB, STROKE, INK));
    }
    // outer dashes only — the junction box stays clear
    frags.push(centreDashes(a, b, [[0.05, 0.18], [0.82, 0.95]]));
  }
  return group(0, 0, frags);
}

// ========================================================================
// RIVERS — filled water band with darker banks, same edge-midpoint contract
// ========================================================================

const RIVER_HALF = 7;

/** river-straight (1×1, orientations 2): gently bowed water band across one axis. */
export function riverStraight(params?: Record<string, unknown>): string {
  const o = readOrientation(params);
  const [a, b] = o % 2 === 0 ? [mNW, mSE] : [mNE, mSW];
  // straight spine + tapered wobble: wavy interior, exactly on-axis at both
  // edges, so neighbouring tiles meet without a kink
  const offs = quadOffsets(a, lerp(a, b, 0.5), b, RIVER_HALF, true, o + 1);
  return group(0, 0, [
    offsetsFill(offs, WATER),
    polyline(offs.left, STROKE_THIN, BANK),
    polyline(offs.right, STROKE_THIN, BANK),
  ]);
}

/**
 * river-bend (1×1, orientations 4): water bend between two adjacent edges.
 * Cubic with inward end tangents (same recipe as road-corner) — the old quad
 * through the tile centre was tighter than RIVER_HALF and the inner bank
 * self-intersected into a cusp.
 */
export function riverBend(params?: Record<string, unknown>): string {
  const o = readOrientation(params);
  const a = ring[o % 4];
  const b = ring[(o + 1) % 4];
  const K = 9;
  const offs = cubicOffsets(a, add(a, inward[o % 4], K), add(b, inward[(o + 1) % 4], K), b, RIVER_HALF);
  return group(0, 0, [
    offsetsFill(offs, WATER),
    polyline(offs.left, STROKE_THIN, BANK),
    polyline(offs.right, STROKE_THIN, BANK),
  ]);
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
  // invisible interior hit-area (clicks inside the region select it)
  const ha = [project(0, 0), project(p.w, 0), project(p.w, p.d), project(0, p.d)];
  frags.push(
    `<polygon points="${ha.map((q) => `${n(q.x)},${n(q.y)}`).join(' ')}" fill="#FFFFFF" fill-opacity="0" stroke="none"/>`
  );
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
