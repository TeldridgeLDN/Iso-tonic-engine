// Parametric building generator. Footprint w×d tiles, storeys high.
// Storey height = 28px. Windows skewed onto the correct face plane.

import { project, polygon, line, group, readOrientation, type Pt } from './primitives.ts';
import { INK, PAPER, STROKE, STROKE_THIN, STOREY_H, n } from './style.ts';

export interface BuildingParams {
  widthTiles: number;
  depthTiles: number;
  storeys: number;
  windowStyle: 'grid' | 'ribbon' | 'sparse';
  roof: 'flat' | 'pitched' | 'plant';
  signage?: string;
}

function normalize(params?: Record<string, unknown>): BuildingParams {
  return {
    widthTiles: num(params?.widthTiles, 2),
    depthTiles: num(params?.depthTiles, 2),
    storeys: num(params?.storeys, 3),
    windowStyle: (params?.windowStyle as BuildingParams['windowStyle']) ?? 'grid',
    roof: (params?.roof as BuildingParams['roof']) ?? 'flat',
    signage: params?.signage as string | undefined,
  };
}

function num(v: unknown, dflt: number): number {
  const x = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(x) && x > 0 ? x : dflt;
}

/** Point on the RIGHT (SE) face: E(w,0)→S(w,d). u in [0,1], v px up. */
function rightPt(w: number, d: number, u: number, v: number): Pt {
  const g = project(w, u * d);
  return { x: g.x, y: g.y - v };
}

/** Point on the LEFT (SW) face: W(0,d)→S(w,d). u in [0,1], v px up. */
function leftFacePt(w: number, d: number, u: number, v: number): Pt {
  const g = project(u * w, d);
  return { x: g.x, y: g.y - v };
}

function faceRect(p0: Pt, p1: Pt, p2: Pt, p3: Pt, sw: number): string {
  return polygon([p0, p1, p2, p3], { fill: PAPER, stroke: INK, strokeWidth: sw });
}

/** Windows for one face, given a face-point function fp(u,v). */
function windowsForFace(
  fp: (u: number, v: number) => Pt,
  style: BuildingParams['windowStyle'],
  storeys: number,
  spanTiles: number
): string {
  const totalH = storeys * STOREY_H;
  const frags: string[] = [];
  const cols =
    style === 'ribbon'
      ? Math.max(3, Math.round(spanTiles * 3))
      : style === 'sparse'
        ? Math.max(1, Math.round(spanTiles * 1.2))
        : Math.max(2, Math.round(spanTiles * 2));

  for (let s = 0; s < storeys; s++) {
    const vBase = s * STOREY_H;
    if (style === 'ribbon') {
      // one horizontal ribbon per storey
      const u0 = 0.08;
      const u1 = 0.92;
      const vy0 = vBase + 8;
      const vy1 = vBase + STOREY_H - 6;
      frags.push(
        faceRect(fp(u0, vy0), fp(u1, vy0), fp(u1, vy1), fp(u0, vy1), STROKE_THIN)
      );
      // vertical mullions
      for (let c = 1; c < cols; c++) {
        const u = u0 + (u1 - u0) * (c / cols);
        frags.push(line(fp(u, vy0), fp(u, vy1), 0.6, INK));
      }
    } else {
      const margin = 0.12;
      const usable = 1 - margin * 2;
      const cellW = usable / cols;
      const winW = cellW * 0.6;
      const vy0 = vBase + 9;
      const vy1 = vBase + STOREY_H - 7;
      for (let c = 0; c < cols; c++) {
        if (style === 'sparse' && (c % 2 === 1)) continue;
        const uc = margin + cellW * c + cellW * 0.5;
        const u0 = uc - winW / 2;
        const u1 = uc + winW / 2;
        frags.push(
          faceRect(fp(u0, vy0), fp(u1, vy0), fp(u1, vy1), fp(u0, vy1), STROKE_THIN)
        );
      }
    }
    void totalH;
  }
  return frags.join('');
}

/**
 * An entrance door + a small canopy line, drawn on the face described by the
 * face-point function fp(u,v) (u along the face 0..1, v px up from ground).
 * Used to give the building a legible "front" so quarter-turns read as
 * genuinely different facings.
 */
function doorForFace(fp: (u: number, v: number) => Pt): string {
  const uC = 0.5;
  const halfU = 0.09;
  const doorH = STOREY_H - 4;
  const frags: string[] = [];
  frags.push(
    faceRect(fp(uC - halfU, 2), fp(uC + halfU, 2), fp(uC + halfU, doorH), fp(uC - halfU, doorH), STROKE_THIN)
  );
  // centre mullion (double-door feel)
  frags.push(line(fp(uC, 2), fp(uC, doorH), 0.6, INK));
  // canopy lintel line just above the door
  frags.push(line(fp(uC - halfU - 0.04, doorH + 1.5), fp(uC + halfU + 0.04, doorH + 1.5), 0.8, INK));
  return frags.join('');
}

function roofPitched(w: number, d: number, baseH: number): string {
  // Gable ridge running along the +x direction at mid-depth (ty = d/2).
  const eaveH = baseH;
  const peak = 14; // ridge rise above eaves
  const at = (tx: number, ty: number, up: number): Pt => {
    const g = project(tx, ty);
    return { x: g.x, y: g.y - up };
  };
  // Eave corners (top of walls)
  const eN = at(0, 0, eaveH); // north
  const eE = at(w, 0, eaveH); // east
  const eS = at(w, d, eaveH); // south
  const eW = at(0, d, eaveH); // west
  // Ridge line at mid-depth, raised by `peak`
  const ridgeN = at(0, d / 2, eaveH + peak); // over the N-W eave midline end
  const ridgeS = at(w, d / 2, eaveH + peak); // over the E-S eave midline end

  const frags: string[] = [];
  // Back-to-front. The two roof planes + two triangular gable ends.
  // West/left slope (W eave to ridge), faces SW — draw first.
  frags.push(polygon([eW, eS, ridgeS, ridgeN], { fill: PAPER, stroke: INK, strokeWidth: STROKE }));
  // Gable triangle on the south end (E-S) — visible front-right.
  frags.push(polygon([eE, eS, ridgeS], { fill: PAPER, stroke: INK, strokeWidth: STROKE }));
  // Gable triangle on the north end (N-W).
  frags.push(polygon([eN, eW, ridgeN], { fill: PAPER, stroke: INK, strokeWidth: STROKE }));
  // East/right slope (N-E eave to ridge), faces SE — draw last (nearest).
  frags.push(polygon([eN, ridgeN, ridgeS, eE], { fill: PAPER, stroke: INK, strokeWidth: STROKE }));
  return frags.join('');
}

function roofPlant(w: number, d: number, baseH: number): string {
  // Flat roof + a few small plant/AC boxes sitting on top.
  const frags: string[] = [];
  const boxes: Array<[number, number]> = [
    [w * 0.3, d * 0.3],
    [w * 0.7, d * 0.55],
    [w * 0.45, d * 0.75],
  ];
  for (const [bx, by] of boxes) {
    frags.push(smallBox(bx, by, 0.35, 0.35, 7, baseH));
  }
  return frags.join('');
}

/** A small box sitting on the roof at tile (bx,by), size in tiles, height px. */
function smallBox(bx: number, by: number, sw: number, sd: number, h: number, roofH: number): string {
  const at = (tx: number, ty: number, up: number): Pt => {
    const g = project(tx, ty);
    return { x: g.x, y: g.y - roofH - up };
  };
  const gE = at(bx + sw, by, 0);
  const gS = at(bx + sw, by + sd, 0);
  const gW = at(bx, by + sd, 0);
  const tN = at(bx, by, h);
  const tE = at(bx + sw, by, h);
  const tS = at(bx + sw, by + sd, h);
  const tW = at(bx, by + sd, h);
  return [
    polygon([gW, gS, tS, tW], { fill: PAPER, strokeWidth: STROKE_THIN }),
    polygon([gS, gE, tE, tS], { fill: PAPER, strokeWidth: STROKE_THIN }),
    polygon([tN, tE, tS, tW], { fill: PAPER, strokeWidth: STROKE_THIN }),
  ].join('');
}

/**
 * Rooftop signage: a viewer-facing billboard standing on the roof apex. Two
 * thin support posts rise from the roof top-centre to a horizontal panel
 * carrying bold letters, read left-to-right in screen space (Arup
 * 'EAT & DRINK' style). Kept horizontal so it stays legible at any footprint.
 */
function signage(w: number, d: number, baseH: number, s: string): string {
  const label = s.toUpperCase();
  const roofC = project(w / 2, d / 2);
  const cx = roofC.x;
  const roofY = roofC.y - baseH;
  const postH = 6;
  const boardH = 12;
  const halfLen = Math.max(20, label.length * 3.2);
  const boardTop = roofY - postH - boardH;
  const boardBot = roofY - postH;
  const frags: string[] = [];
  // two posts
  frags.push(line({ x: cx - halfLen * 0.6, y: boardBot }, { x: cx - halfLen * 0.6, y: roofY }, STROKE_THIN, INK));
  frags.push(line({ x: cx + halfLen * 0.6, y: boardBot }, { x: cx + halfLen * 0.6, y: roofY }, STROKE_THIN, INK));
  // panel (opaque so posts/roof behind are occluded)
  frags.push(
    polygon(
      [
        { x: cx - halfLen, y: boardTop },
        { x: cx + halfLen, y: boardTop },
        { x: cx + halfLen, y: boardBot },
        { x: cx - halfLen, y: boardBot },
      ],
      { fill: PAPER, stroke: INK, strokeWidth: STROKE_THIN }
    )
  );
  const esc = label.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  frags.push(
    `<text x="${n(cx)}" y="${n((boardTop + boardBot) / 2 + 3)}" font-family="Helvetica, Arial, sans-serif" font-size="8" font-weight="bold" fill="${INK}" text-anchor="middle" letter-spacing="0.4">${esc}</text>`
  );
  return frags.join('');
}

export function renderBuilding(params?: Record<string, unknown>): string {
  const p = normalize(params);
  const o = readOrientation(params); // 0–3 quarter-turns clockwise

  // True quarter-turn: odd orientations swap the visible width/depth so the
  // footprint the box occupies matches core effectiveFootprint().
  const w = o % 2 === 0 ? p.widthTiles : p.depthTiles;
  const d = o % 2 === 0 ? p.depthTiles : p.widthTiles;
  const baseH = p.storeys * STOREY_H;

  // Which visible face carries the entrance for this facing:
  //  o=0 → right (SE), o=1 → left (SW); o=2/3 → entrance faces away (hidden),
  //  so the two visible faces are dressed as plain elevations.
  const doorFace: 'left' | 'right' | 'none' = o === 0 ? 'right' : o === 1 ? 'left' : 'none';

  const frags: string[] = [];

  // --- box body (three faces back-to-front) ---
  const gN = project(0, 0);
  const gE = project(w, 0);
  const gS = project(w, d);
  const gW = project(0, d);
  const up = (pt: Pt, h: number): Pt => ({ x: pt.x, y: pt.y - h });

  // Left (SW) face + windows (+ door if the entrance faces this way)
  frags.push(
    polygon([gW, gS, up(gS, baseH), up(gW, baseH)], { fill: PAPER, stroke: INK, strokeWidth: STROKE })
  );
  frags.push(windowsForFace((u, v) => leftFacePt(w, d, u, v), p.windowStyle, p.storeys, d));
  if (doorFace === 'left') frags.push(doorForFace((u, v) => leftFacePt(w, d, u, v)));

  // Right (SE) face + windows (+ door if the entrance faces this way)
  frags.push(
    polygon([gS, gE, up(gE, baseH), up(gS, baseH)], { fill: PAPER, stroke: INK, strokeWidth: STROKE })
  );
  frags.push(windowsForFace((u, v) => rightPt(w, d, u, v), p.windowStyle, p.storeys, w));
  if (doorFace === 'right') frags.push(doorForFace((u, v) => rightPt(w, d, u, v)));

  // storey divider lines across both faces
  for (let s = 1; s < p.storeys; s++) {
    const v = s * STOREY_H;
    frags.push(line(leftFacePt(w, d, 0, v), leftFacePt(w, d, 1, v), 0.6, INK));
    frags.push(line(rightPt(w, d, 0, v), rightPt(w, d, 1, v), 0.6, INK));
  }

  // --- roof ---
  if (p.roof === 'pitched') {
    frags.push(roofPitched(w, d, baseH));
  } else {
    // flat top face
    frags.push(
      polygon(
        [up(gN, baseH), up(gE, baseH), up(gS, baseH), up(gW, baseH)],
        { fill: PAPER, stroke: INK, strokeWidth: STROKE }
      )
    );
    if (p.roof === 'plant') frags.push(roofPlant(w, d, baseH));
  }

  // --- signage ---
  if (p.signage) frags.push(signage(w, d, p.roof === 'pitched' ? baseH + 14 : baseH, p.signage));

  return group(0, 0, frags);
}
