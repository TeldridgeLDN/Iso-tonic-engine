// Street furniture & greenery symbols. Grid-anchored.

import { project, isoDiamond, polygon, line, circle, pathFill, group, text, type Pt } from '../primitives.ts';
import { INK, PAPER, STROKE_THIN, n } from '../style.ts';

function centre(w = 1, d = 1): Pt {
  return project(w / 2, d / 2);
}

// --- tree variant A: classic lobed canopy on a flared, forked trunk ------
// Silhouette-set shape (broad deciduous tree), drawn as outlines: white fill,
// ink stroke. Trunk flares at the base; branch fork visible below the canopy.
export function treeRound(): string {
  const frags = [isoDiamond(1, 1)];
  const c = centre();

  // Flared trunk (closed shape), base sitting on the tile centre.
  const trunk =
    `M ${n(c.x - 6.5)} ${n(c.y)} ` +
    `Q ${n(c.x - 2.5)} ${n(c.y - 3)} ${n(c.x - 2.2)} ${n(c.y - 8)} ` +
    `L ${n(c.x - 2.2)} ${n(c.y - 16)} ` +
    `L ${n(c.x + 2.2)} ${n(c.y - 16)} ` +
    `L ${n(c.x + 2.2)} ${n(c.y - 8)} ` +
    `Q ${n(c.x + 2.5)} ${n(c.y - 3)} ${n(c.x + 6.5)} ${n(c.y)} Z`;
  frags.push(pathFill(trunk, { fill: PAPER, stroke: INK, strokeWidth: STROKE_THIN }));

  // Branch fork rising from the trunk into the canopy.
  frags.push(line({ x: c.x, y: c.y - 15 }, { x: c.x - 7, y: c.y - 25 }, STROKE_THIN, INK));
  frags.push(line({ x: c.x, y: c.y - 15 }, { x: c.x + 6, y: c.y - 26 }, STROKE_THIN, INK));
  frags.push(line({ x: c.x, y: c.y - 16 }, { x: c.x, y: c.y - 27 }, STROKE_THIN, INK));

  // Lobed canopy: quadratic bumps around an ellipse (rx 17, ry 12.5).
  const cx = c.x;
  const cy = c.y - 32;
  const rx = 17;
  const ry = 12.5;
  const lobes = 8;
  const pt = (deg: number, f = 1): Pt => {
    const a = (deg * Math.PI) / 180;
    return { x: cx + Math.cos(a) * rx * f, y: cy + Math.sin(a) * ry * f };
  };
  let d = '';
  for (let i = 0; i < lobes; i++) {
    const a0 = i * (360 / lobes);
    const aMid = a0 + 360 / lobes / 2;
    const a1 = (i + 1) * (360 / lobes);
    const p0 = pt(a0);
    const ctrl = pt(aMid, 1.45);
    const p1 = pt(a1);
    d += i === 0 ? `M ${n(p0.x)} ${n(p0.y)} ` : '';
    d += `Q ${n(ctrl.x)} ${n(ctrl.y)} ${n(p1.x)} ${n(p1.y)} `;
  }
  frags.push(pathFill(d + 'Z', { fill: PAPER, stroke: INK, strokeWidth: STROKE_THIN }));

  return group(0, 0, frags);
}

// --- tree variant B: pine with drooping tiered branches ------------------
// Silhouette-set pine: one closed outline — apex, three drooping tiers with
// inward notches, flared trunk base. White fill, ink stroke.
export function treeConifer(): string {
  const frags = [isoDiamond(1, 1)];
  const c = centre();
  const p = (dx: number, dy: number): string => `${n(c.x + dx)} ${n(c.y + dy)} `;

  const d =
    `M ${p(0, -46)}` + // apex
    `L ${p(6.5, -33)}Q ${p(7.5, -31.5)}${p(5.5, -32)}L ${p(2.8, -32.5)}` + // tier 1 tip (droop) + notch
    `L ${p(10, -21)}Q ${p(11, -19.5)}${p(9, -20)}L ${p(4, -21)}` + // tier 2
    `L ${p(13.5, -9)}Q ${p(14.5, -7.5)}${p(12.5, -8)}L ${p(2.2, -9.5)}` + // tier 3 (widest)
    `Q ${p(2.4, -3)}${p(6, 0)}` + // trunk flare right
    `L ${p(-6, 0)}` + // base
    `Q ${p(-2.4, -3)}${p(-2.2, -9.5)}` + // trunk flare left
    `L ${p(-12.5, -8)}Q ${p(-14.5, -7.5)}${p(-13.5, -9)}L ${p(-4, -21)}` + // tier 3 left
    `L ${p(-9, -20)}Q ${p(-11, -19.5)}${p(-10, -21)}L ${p(-2.8, -32.5)}` + // tier 2 left
    `L ${p(-5.5, -32)}Q ${p(-7.5, -31.5)}${p(-6.5, -33)}Z`; // tier 1 left, close to apex
  frags.push(pathFill(d, { fill: PAPER, stroke: INK, strokeWidth: STROKE_THIN }));

  return group(0, 0, frags);
}

// --- planter: 1×1 low box with foliage tuft -----------------------------
export function planter(): string {
  const frags = [isoDiamond(1, 1)];
  const at = (tx: number, ty: number, h: number): Pt => {
    const g = project(tx, ty);
    return { x: g.x, y: g.y - h };
  };
  const h = 7;
  const gE = at(0.85, 0.15, 0), gS = at(0.85, 0.85, 0), gW = at(0.15, 0.85, 0);
  const tN = at(0.15, 0.15, h), tE = at(0.85, 0.15, h), tS = at(0.85, 0.85, h), tW = at(0.15, 0.85, h);
  frags.push(polygon([gW, gS, tS, tW], { fill: PAPER, strokeWidth: STROKE_THIN }));
  frags.push(polygon([gS, gE, tE, tS], { fill: PAPER, strokeWidth: STROKE_THIN }));
  frags.push(polygon([tN, tE, tS, tW], { fill: PAPER, strokeWidth: STROKE_THIN }));
  // foliage
  const c = centre();
  frags.push(circle({ x: c.x - 3, y: c.y - h - 3 }, 3, { fill: PAPER, stroke: INK, strokeWidth: STROKE_THIN }));
  frags.push(circle({ x: c.x + 3, y: c.y - h - 3 }, 3, { fill: PAPER, stroke: INK, strokeWidth: STROKE_THIN }));
  frags.push(circle({ x: c.x, y: c.y - h - 6 }, 3, { fill: PAPER, stroke: INK, strokeWidth: STROKE_THIN }));
  return group(0, 0, frags);
}

// --- street lamp: 1×1 pole with curved arm + lamp -----------------------
export function streetLamp(): string {
  const frags = [isoDiamond(1, 1)];
  const c = centre();
  const top = { x: c.x, y: c.y - 40 };
  frags.push(line({ x: c.x, y: c.y }, top, STROKE_THIN, INK));
  // curved arm
  frags.push(
    pathFill(
      `M ${n(top.x)} ${n(top.y)} Q ${n(top.x + 8)} ${n(top.y - 4)} ${n(top.x + 12)} ${n(top.y + 2)}`,
      { fill: 'none', stroke: INK, strokeWidth: STROKE_THIN }
    )
  );
  // lamp head
  frags.push(
    polygon(
      [
        { x: top.x + 10, y: top.y + 2 },
        { x: top.x + 15, y: top.y + 2 },
        { x: top.x + 14, y: top.y + 5 },
        { x: top.x + 11, y: top.y + 5 },
      ],
      { fill: PAPER, strokeWidth: STROKE_THIN }
    )
  );
  return group(0, 0, frags);
}

// --- signpost: 1×1 pole with a rectangular sign -------------------------
export function signpost(): string {
  const frags = [isoDiamond(1, 1)];
  const c = centre();
  const top = { x: c.x, y: c.y - 30 };
  frags.push(line({ x: c.x, y: c.y }, top, STROKE_THIN, INK));
  // sign board
  frags.push(
    polygon(
      [
        { x: top.x, y: top.y },
        { x: top.x + 16, y: top.y - 2 },
        { x: top.x + 16, y: top.y - 11 },
        { x: top.x, y: top.y - 9 },
      ],
      { fill: PAPER, strokeWidth: STROKE_THIN }
    )
  );
  frags.push(text(top.x + 3, top.y - 3, 'i', { size: 6, fill: INK }));
  return group(0, 0, frags);
}
