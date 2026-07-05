// Vehicle symbols. Grid-anchored, footprint origin = north vertex of tile (0,0).

import { project, isoDiamond, polygon, line, circle, group, type Pt } from '../primitives.ts';
import { INK, PAPER, STROKE, STROKE_THIN } from '../style.ts';

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
export function van(): string {
  const frags = [isoDiamond(2, 1)];
  // cab lower + box higher: do two blocks
  frags.push(bodyBlock(2, 0.9, 3, 20));
  // window band on right (SE) face
  const on = (u: number, v: number): Pt => {
    const g = project(2, u * 0.9);
    return { x: g.x, y: g.y - v };
  };
  frags.push(polygon([on(0.05, 18), on(0.35, 18), on(0.35, 12), on(0.05, 12)], { fill: PAPER, strokeWidth: 0.6 }));
  // divider between cab and box
  frags.push(line(on(0.4, 4), on(0.4, 20), 0.6, INK));
  frags.push(wheel(0.4, 1.0));
  frags.push(wheel(1.6, 1.0));
  return group(0, 0, frags);
}

// --- car: 2×1, low body with cabin ---------------------------------------
export function car(): string {
  const frags = [isoDiamond(2, 1)];
  frags.push(bodyBlock(2, 0.85, 3, 9));
  // cabin: smaller raised block in the middle
  const gW = at(0.5, 0.1, 9), gS = at(1.4, 0.1, 9), gE = at(1.4, 0.75, 9), gN = at(0.5, 0.75, 9);
  const rW = at(0.55, 0.15, 15), rS = at(1.35, 0.15, 15), rE = at(1.35, 0.7, 15), rN = at(0.55, 0.7, 15);
  frags.push(polygon([gN, gW, rW, rN], { fill: PAPER, strokeWidth: STROKE_THIN }));
  frags.push(polygon([gW, gS, rS, rW], { fill: PAPER, strokeWidth: STROKE_THIN }));
  frags.push(polygon([rN, rW, rS, rE], { fill: PAPER, strokeWidth: STROKE_THIN }));
  void gE; void rE;
  frags.push(wheel(0.45, 0.95));
  frags.push(wheel(1.55, 0.95));
  return group(0, 0, frags);
}

// --- tram / bus: 3×1, long box with window ribbon ------------------------
export function tram(): string {
  const frags = [isoDiamond(3, 1)];
  frags.push(bodyBlock(3, 0.9, 3, 22));
  // window ribbon on right (SE) face
  const on = (u: number, v: number): Pt => {
    const g = project(3, u * 0.9);
    return { x: g.x, y: g.y - v };
  };
  frags.push(polygon([on(0.06, 18), on(0.94, 18), on(0.94, 12), on(0.06, 12)], { fill: PAPER, strokeWidth: 0.6 }));
  // window mullions
  for (let i = 1; i < 6; i++) {
    const u = 0.06 + (0.88 * i) / 6;
    frags.push(line(on(u, 18), on(u, 12), 0.5, INK));
  }
  frags.push(wheel(0.6, 1.0));
  frags.push(wheel(2.4, 1.0));
  return group(0, 0, frags);
}
