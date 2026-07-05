// Digital infrastructure symbols. Footprint-anchored (grid) assets.
// Local origin = north vertex of footprint tile (0,0).

import { project, isoBox, isoDiamond, polygon, line, group, type Pt } from '../primitives.ts';
import { INK, PAPER, STROKE_THIN } from '../style.ts';

// helper: point on top face of a box at tile (tx,ty), raised `h` px
function topPt(tx: number, ty: number, h: number): Pt {
  const g = project(tx, ty);
  return { x: g.x, y: g.y - h };
}

// --- server rack: tall cabinet, 1×1, with horizontal unit slots ---------
export function serverRack(): string {
  const h = 34;
  const frags = [isoBox(0.7, 0.5, h)];
  // rack units drawn on the right (SE) face: horizontal lines
  const on = (u: number, v: number): Pt => {
    const g = project(0.7, u * 0.5);
    return { x: g.x, y: g.y - v };
  };
  for (let i = 1; i <= 6; i++) {
    const v = (h - 4) * (i / 7) + 3;
    frags.push(line(on(0.12, v), on(0.88, v), 0.6, INK));
  }
  // status LEDs on left (SW) face
  const onL = (u: number, v: number): Pt => {
    const g = project(u * 0.7, 0.5);
    return { x: g.x, y: g.y - v };
  };
  frags.push(polygon([onL(0.2, h - 5), onL(0.3, h - 5), onL(0.3, h - 3), onL(0.2, h - 3)], { fill: PAPER, strokeWidth: 0.6 }));
  return group(0, 0, frags);
}

// --- desktop workstation: monitor + tower on a small desk, 1×1 ----------
export function desktopWorkstation(): string {
  const frags = [isoDiamond(1, 1)];
  // desk box
  frags.push(isoBox(0.9, 0.6, 8));
  // monitor: upright screen standing on the desk, facing the SE (right).
  // Base sits along a short segment on the desk top; screen rises vertically.
  const b0 = topPt(0.3, 0.3, 8); // left foot of the screen
  const b1 = topPt(0.75, 0.55, 8); // right foot (toward SE)
  const scrH = 13;
  const up = (p: Pt): Pt => ({ x: p.x, y: p.y - scrH });
  // stand
  const mid = { x: (b0.x + b1.x) / 2, y: (b0.y + b1.y) / 2 };
  frags.push(line(mid, { x: mid.x, y: mid.y - 3 }, STROKE_THIN, INK));
  // screen panel
  frags.push(polygon([{ x: b0.x, y: b0.y - 3 }, { x: b1.x, y: b1.y - 3 }, up(b1), up(b0)], { fill: PAPER, strokeWidth: STROKE_THIN }));
  // tower box beside the desk
  const t = topPt(0.15, 0.15, 8);
  frags.push(polygon([{ x: t.x, y: t.y }, { x: t.x + 4, y: t.y + 2 }, { x: t.x + 4, y: t.y - 8 }, { x: t.x, y: t.y - 10 }], { fill: PAPER, strokeWidth: STROKE_THIN }));
  return group(0, 0, frags);
}

// --- laptop on a desk, 1×1 ----------------------------------------------
export function laptopDesk(): string {
  const frags = [isoDiamond(1, 1), isoBox(0.9, 0.7, 7)];
  const t = topPt(0.45, 0.35, 7);
  const p = (dx: number, dy: number): Pt => ({ x: t.x + dx, y: t.y + dy });
  // keyboard base (small parallelogram on top)
  frags.push(polygon([p(-7, 0), p(3, 5), p(9, 1), p(-1, -4)], { fill: PAPER, strokeWidth: STROKE_THIN }));
  // screen tilted up
  frags.push(polygon([p(-7, 0), p(-1, -4), p(2, -13), p(-4, -9)], { fill: PAPER, strokeWidth: STROKE_THIN }));
  return group(0, 0, frags);
}

// --- large wall screen / dashboard, 2×1 ---------------------------------
export function wallScreen(): string {
  const frags = [isoDiamond(2, 1)];
  // stand feet
  frags.push(isoBox(2, 0.15, 3));
  // big upright panel standing along +x on the far edge
  const a = topPt(0.1, 0.1, 3);
  const b = topPt(1.9, 0.1, 3);
  const panelH = 26;
  frags.push(
    polygon(
      [
        { x: a.x, y: a.y },
        { x: b.x, y: b.y },
        { x: b.x, y: b.y - panelH },
        { x: a.x, y: a.y - panelH },
      ],
      { fill: PAPER, strokeWidth: STROKE_THIN }
    )
  );
  // dashboard content lines
  for (let i = 1; i <= 4; i++) {
    const y = a.y - 5 - i * 4;
    frags.push(line({ x: a.x + 3, y }, { x: b.x - 3, y }, 0.6, INK));
  }
  return group(0, 0, frags);
}

// --- phone kiosk / booth, 1×1 -------------------------------------------
export function phoneKiosk(): string {
  const frags = [isoDiamond(1, 1), isoBox(0.6, 0.6, 30)];
  // door line on right face
  const on = (u: number, v: number): Pt => {
    const g = project(0.6, u * 0.6);
    return { x: g.x, y: g.y - v };
  };
  frags.push(line(on(0.5, 2), on(0.5, 26), 0.6, INK));
  // window on left face
  const onL = (u: number, v: number): Pt => {
    const g = project(u * 0.6, 0.6);
    return { x: g.x, y: g.y - v };
  };
  frags.push(polygon([onL(0.2, 24), onL(0.8, 24), onL(0.8, 16), onL(0.2, 16)], { fill: PAPER, strokeWidth: 0.6 }));
  return group(0, 0, frags);
}

// --- network mast / antenna tower, 1×1 ----------------------------------
export function networkMast(): string {
  const frags = [isoDiamond(1, 1)];
  const base = project(0.5, 0.5);
  const topY = base.y - 40;
  // tapering lattice: two legs + cross braces
  const legL = { x: base.x - 6, y: base.y };
  const legR = { x: base.x + 6, y: base.y };
  const apex = { x: base.x, y: topY };
  frags.push(line(legL, apex, STROKE_THIN, INK));
  frags.push(line(legR, apex, STROKE_THIN, INK));
  frags.push(line({ x: base.x, y: base.y }, apex, STROKE_THIN, INK));
  for (let i = 1; i <= 4; i++) {
    const t = i / 5;
    const yl = { x: legL.x + (apex.x - legL.x) * t, y: legL.y + (apex.y - legL.y) * t };
    const yr = { x: legR.x + (apex.x - legR.x) * t, y: legR.y + (apex.y - legR.y) * t };
    frags.push(line(yl, yr, 0.6, INK));
  }
  // signal arcs at top
  frags.push(line(apex, { x: apex.x - 5, y: apex.y - 4 }, 0.8, INK));
  frags.push(line(apex, { x: apex.x + 5, y: apex.y - 4 }, 0.8, INK));
  return group(0, 0, frags);
}
