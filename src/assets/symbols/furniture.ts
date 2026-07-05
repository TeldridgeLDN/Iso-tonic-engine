// Furniture symbols. Grid-anchored.

import { project, isoBox, isoDiamond, polygon, line, group, type Pt } from '../primitives.ts';
import { INK, PAPER, STROKE_THIN } from '../style.ts';

function at(tx: number, ty: number, h: number): Pt {
  const g = project(tx, ty);
  return { x: g.x, y: g.y - h };
}

/** A flat table/desk top slab of given footprint at height h. */
function tableTop(x0: number, y0: number, w: number, d: number, h: number): string {
  const tN = at(x0, y0, h), tE = at(x0 + w, y0, h), tS = at(x0 + w, y0 + d, h), tW = at(x0, y0 + d, h);
  // top + two visible edges (slab thickness 2)
  const bE = at(x0 + w, y0, h - 2), bS = at(x0 + w, y0 + d, h - 2), bW = at(x0, y0 + d, h - 2);
  return [
    polygon([bW, bS, tS, tW], { fill: PAPER, strokeWidth: STROKE_THIN }),
    polygon([bS, bE, tE, tS], { fill: PAPER, strokeWidth: STROKE_THIN }),
    polygon([tN, tE, tS, tW], { fill: PAPER, strokeWidth: STROKE_THIN }),
  ].join('');
}

function leg(tx: number, ty: number, h: number): string {
  const g = project(tx, ty);
  return line({ x: g.x, y: g.y }, { x: g.x, y: g.y - h }, STROKE_THIN, INK);
}

// --- desk cluster: 2×2 of four desks around a core ----------------------
export function deskCluster(): string {
  const frags = [isoDiamond(2, 2)];
  const h = 10;
  const desks: Array<[number, number, number, number]> = [
    [0.05, 0.05, 0.9, 0.55],
    [1.05, 0.05, 0.9, 0.55],
    [0.05, 1.4, 0.9, 0.55],
    [1.05, 1.4, 0.9, 0.55],
  ];
  for (const [x, y, w, d] of desks) {
    frags.push(leg(x, y, h));
    frags.push(leg(x + w, y, h));
    frags.push(leg(x, y + d, h));
    frags.push(leg(x + w, y + d, h));
    frags.push(tableTop(x, y, w, d, h));
  }
  return group(0, 0, frags);
}

// --- meeting table: 2×1 oval-ish table with chairs ----------------------
export function meetingTable(): string {
  const frags = [isoDiamond(2, 1)];
  const h = 10;
  frags.push(leg(0.3, 0.25, h));
  frags.push(leg(1.7, 0.25, h));
  frags.push(leg(0.3, 0.75, h));
  frags.push(leg(1.7, 0.75, h));
  frags.push(tableTop(0.2, 0.2, 1.6, 0.6, h));
  // chairs = little stubs around it
  const chairs: Array<[number, number]> = [
    [0.5, -0.05], [1.0, -0.05], [1.5, -0.05],
    [0.5, 1.05], [1.0, 1.05], [1.5, 1.05],
  ];
  for (const [cx, cy] of chairs) {
    const b = at(cx, cy, 0);
    frags.push(polygon([{ x: b.x - 3, y: b.y - 2 }, { x: b.x + 3, y: b.y - 2 }, { x: b.x + 3, y: b.y - 6 }, { x: b.x - 3, y: b.y - 6 }], { fill: PAPER, strokeWidth: 0.7 }));
  }
  return group(0, 0, frags);
}

// --- shelving unit: 1×1, tall with shelf lines --------------------------
export function shelving(): string {
  const frags = [isoDiamond(1, 1), isoBox(0.85, 0.4, 26)];
  // shelf lines on the right (SE) face
  const on = (u: number, v: number): Pt => {
    const g = project(0.85, u * 0.4);
    return { x: g.x, y: g.y - v };
  };
  for (let i = 1; i <= 4; i++) {
    const v = (26 * i) / 5;
    frags.push(line(on(0.05, v), on(0.95, v), 0.6, INK));
  }
  return group(0, 0, frags);
}

// --- barrier / gate: 1×1 low striped barrier ----------------------------
export function barrier(): string {
  const frags = [isoDiamond(1, 1)];
  // two posts + a boom across
  const p1 = at(0.15, 0.5, 0);
  const p2 = at(0.85, 0.5, 0);
  const postH = 12;
  frags.push(line(p1, { x: p1.x, y: p1.y - postH }, STROKE_THIN, INK));
  frags.push(line(p2, { x: p2.x, y: p2.y - postH }, STROKE_THIN, INK));
  // boom (striped)
  const b1 = { x: p1.x, y: p1.y - postH + 2 };
  const b2 = { x: p2.x, y: p2.y - postH + 2 };
  frags.push(polygon([b1, b2, { x: b2.x, y: b2.y - 3 }, { x: b1.x, y: b1.y - 3 }], { fill: PAPER, strokeWidth: STROKE_THIN }));
  for (let i = 1; i <= 4; i++) {
    const t = i / 5;
    const s = { x: b1.x + (b2.x - b1.x) * t, y: b1.y + (b2.y - b1.y) * t };
    frags.push(line({ x: s.x, y: s.y }, { x: s.x, y: s.y - 3 }, 0.6, INK));
  }
  return group(0, 0, frags);
}
