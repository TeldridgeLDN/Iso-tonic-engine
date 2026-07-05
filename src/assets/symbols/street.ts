// Street furniture & greenery symbols. Grid-anchored.

import { project, isoDiamond, polygon, line, circle, pathFill, group, text, type Pt } from '../primitives.ts';
import { INK, PAPER, STROKE_THIN, n } from '../style.ts';

function centre(w = 1, d = 1): Pt {
  return project(w / 2, d / 2);
}

// --- tree variant A: rounded canopy --------------------------------------
export function treeRound(): string {
  const frags = [isoDiamond(1, 1)];
  const c = centre();
  // trunk
  frags.push(line({ x: c.x, y: c.y }, { x: c.x, y: c.y - 14 }, STROKE_THIN, INK));
  // canopy: overlapping circle cluster
  const cy = c.y - 22;
  frags.push(circle({ x: c.x, y: cy }, 9, { fill: PAPER, stroke: INK, strokeWidth: STROKE_THIN }));
  frags.push(circle({ x: c.x - 5, y: cy + 3 }, 5, { fill: PAPER, stroke: INK, strokeWidth: STROKE_THIN }));
  frags.push(circle({ x: c.x + 5, y: cy + 3 }, 5, { fill: PAPER, stroke: INK, strokeWidth: STROKE_THIN }));
  return group(0, 0, frags);
}

// --- tree variant B: conifer / pointed -----------------------------------
export function treeConifer(): string {
  const frags = [isoDiamond(1, 1)];
  const c = centre();
  frags.push(line({ x: c.x, y: c.y }, { x: c.x, y: c.y - 8 }, STROKE_THIN, INK));
  const apex = { x: c.x, y: c.y - 34 };
  // three stacked triangles
  const tiers = [
    { y: c.y - 8, half: 9 },
    { y: c.y - 16, half: 7 },
    { y: c.y - 24, half: 5 },
  ];
  for (const t of tiers) {
    frags.push(
      polygon(
        [
          { x: c.x - t.half, y: t.y },
          { x: c.x + t.half, y: t.y },
          { x: c.x, y: t.y - 12 },
        ],
        { fill: PAPER, strokeWidth: STROKE_THIN }
      )
    );
  }
  void apex;
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
