// Vehicle symbols. Grid-anchored, footprint origin = north vertex of tile (0,0).

import { project, isoDiamond, polygon, line, circle, group, readOrientation, type Pt } from '../primitives.ts';
import { INK, PAPER, STROKE, STROKE_THIN } from '../style.ts';

/**
 * Is this facing the mirrored one? Vehicles keep the SAME iso box (mirroring a
 * 3-face box breaks its silhouette) and instead re-dress features to the far
 * end of the body — the cab/window band moves along the visible faces so it
 * reads as facing the opposite way, while the box stays exactly on the tile.
 */
function flipped(params?: Record<string, unknown>): boolean {
  const o = readOrientation(params);
  return o === 1 || o === 3;
}

function at(tx: number, ty: number, h: number): Pt {
  const g = project(tx, ty);
  return { x: g.x, y: g.y - h };
}

/** A simple iso body block with slanted top, given footprint and heights. */
function bodyBlock(w: number, d: number, floor: number, roof: number): string {
  const gE = at(w, 0, floor), gS = at(w, d, floor), gW = at(0, d, floor);
  const tN = at(0, 0, roof), tE = at(w, 0, roof), tS = at(w, d, roof), tW = at(0, d, roof);
  return [
    polygon([gW, gS, tS, tW], { fill: PAPER, strokeWidth: STROKE }),
    polygon([gS, gE, tE, tS], { fill: PAPER, strokeWidth: STROKE }),
    polygon([tN, tE, tS, tW], { fill: PAPER, strokeWidth: STROKE }),
  ].join('');
}

function wheel(tx: number, ty: number): string {
  const c = project(tx, ty);
  return circle({ x: c.x, y: c.y - 2 }, 2.4, { fill: PAPER, stroke: INK, strokeWidth: STROKE_THIN });
}

// --- van / small truck: 2×1, tall box body -------------------------------
export function van(params?: Record<string, unknown>): string {
  const f = flipped(params);
  const flx = (tx: number): number => (f ? 2 - tx : tx); // flip along +x (the length axis)
  const flu = (u: number): number => (f ? 1 - u : u);    // flip a face fraction
  const body: string[] = [isoDiamond(2, 1)];
  // cab lower + box higher: do two blocks
  body.push(bodyBlock(2, 0.9, 3, 20));
  // window band on the SE (right) face — moves to the far end when flipped
  const on = (u: number, v: number): Pt => {
    const g = project(2, flu(u) * 0.9);
    return { x: g.x, y: g.y - v };
  };
  body.push(polygon([on(0.05, 18), on(0.35, 18), on(0.35, 12), on(0.05, 12)], { fill: PAPER, strokeWidth: 0.6 }));
  // divider between cab and box
  body.push(line(on(0.4, 4), on(0.4, 20), 0.6, INK));
  body.push(wheel(flx(0.4), 1.0));
  body.push(wheel(flx(1.6), 1.0));
  return group(0, 0, body);
}

// --- car: 2×1, low body with cabin ---------------------------------------
export function car(params?: Record<string, unknown>): string {
  const f = flipped(params);
  const fx = (tx: number): number => (f ? 2 - tx : tx);
  const body: string[] = [isoDiamond(2, 1)];
  body.push(bodyBlock(2, 0.85, 3, 9));
  // cabin: smaller raised block, shifted toward the rear (flips end-for-end)
  const gW = at(fx(0.5), 0.1, 9), gS = at(fx(1.4), 0.1, 9), gE = at(fx(1.4), 0.75, 9), gN = at(fx(0.5), 0.75, 9);
  const rW = at(fx(0.55), 0.15, 15), rS = at(fx(1.35), 0.15, 15), rE = at(fx(1.35), 0.7, 15), rN = at(fx(0.55), 0.7, 15);
  body.push(polygon([gN, gW, rW, rN], { fill: PAPER, strokeWidth: STROKE_THIN }));
  body.push(polygon([gW, gS, rS, rW], { fill: PAPER, strokeWidth: STROKE_THIN }));
  body.push(polygon([rN, rW, rS, rE], { fill: PAPER, strokeWidth: STROKE_THIN }));
  void gE; void rE;
  body.push(wheel(fx(0.45), 0.95));
  body.push(wheel(fx(1.55), 0.95));
  return group(0, 0, body);
}

// --- tram / bus: 3×1, long box with window ribbon ------------------------
export function tram(params?: Record<string, unknown>): string {
  const f = flipped(params);
  const flu = (u: number): number => (f ? 1 - u : u);
  const body: string[] = [isoDiamond(3, 1)];
  body.push(bodyBlock(3, 0.9, 3, 22));
  // window ribbon on the SE (right) face; a driver-cab pane at one end that
  // moves end-for-end when flipped so the tram reads as facing the other way.
  const on = (u: number, v: number): Pt => {
    const g = project(3, u * 0.9);
    return { x: g.x, y: g.y - v };
  };
  body.push(polygon([on(0.06, 18), on(0.94, 18), on(0.94, 12), on(0.06, 12)], { fill: PAPER, strokeWidth: 0.6 }));
  // window mullions
  for (let i = 1; i < 6; i++) {
    const u = 0.06 + (0.88 * i) / 6;
    body.push(line(on(u, 18), on(u, 12), 0.5, INK));
  }
  // cab-end marker pane (front windscreen) — flips end-for-end
  const c0 = flu(0.06), c1 = flu(0.2);
  const cu0 = Math.min(c0, c1), cu1 = Math.max(c0, c1);
  body.push(polygon([on(cu0, 10), on(cu1, 10), on(cu1, 4), on(cu0, 4)], { fill: PAPER, strokeWidth: 0.6 }));
  body.push(wheel(0.6, 1.0));
  body.push(wheel(2.4, 1.0));
  return group(0, 0, body);
}
