// High-street / neighbourhood symbols: shopfronts and outdoor café furniture.
// Same style contract as the rest of the library. Text (signage, never mirrors)
// is rendered upright outside any mirror group.

import { project, polygon, polyline, line, circle, ellipse, group, mirrorX, bboxCentreX, readOrientation, text, type Pt } from '../primitives.ts';
import { INK, PAPER, STROKE, STROKE_THIN, STOREY_H, n } from '../style.ts';

function at(tx: number, ty: number, h: number): Pt {
  const g = project(tx, ty);
  return { x: g.x, y: g.y - h };
}

/** Solid iso box body over a w×d footprint, height h px. Three faces back-to-front. */
function boxBody(w: number, d: number, h: number): string {
  const gE = at(w, 0, 0), gS = at(w, d, 0), gW = at(0, d, 0);
  const tN = at(0, 0, h), tE = at(w, 0, h), tS = at(w, d, h), tW = at(0, d, h);
  return [
    polygon([gW, gS, tS, tW], { fill: PAPER, strokeWidth: STROKE }),
    polygon([gS, gE, tE, tS], { fill: PAPER, strokeWidth: STROKE }),
    polygon([tN, tE, tS, tW], { fill: PAPER, strokeWidth: STROKE }),
  ].join('');
}

/** Point on the RIGHT (SE) face of a w×d box: u in [0,1] along E→S, v px up. */
function rightPt(w: number, d: number, u: number, v: number): Pt {
  const g = project(w, u * d);
  return { x: g.x, y: g.y - v };
}

/**
 * A striped fabric awning projecting out over the RIGHT (SE) shopfront face.
 * Drawn as a slanted quad from the wall out toward the viewer, with a scalloped
 * (zig-zag) front valance and stripe lines. Body-only (no text).
 */
function awningRight(w: number, d: number, sillV: number): string {
  const frags: string[] = [];
  // wall attachment line at height sillV, across the face u=0.05..0.95
  const wA = rightPt(w, d, 0.05, sillV);
  const wB = rightPt(w, d, 0.95, sillV);
  // project outward (toward SE viewer = screen down-right) and slightly down
  const outX = 10;
  const outY = 7;
  const fA = { x: wA.x + outX, y: wA.y + outY };
  const fB = { x: wB.x + outX, y: wB.y + outY };
  // canopy top surface (opaque, occludes window behind)
  frags.push(polygon([wA, wB, fB, fA], { fill: PAPER, stroke: INK, strokeWidth: STROKE }));
  // stripe lines from wall to front edge
  for (let i = 1; i < 6; i++) {
    const t = i / 6;
    const p0 = { x: wA.x + (wB.x - wA.x) * t, y: wA.y + (wB.y - wA.y) * t };
    const p1 = { x: fA.x + (fB.x - fA.x) * t, y: fA.y + (fB.y - fA.y) * t };
    frags.push(line(p0, p1, 0.6, INK));
  }
  // scalloped valance hanging off the front edge
  const scallops = 6;
  const drop = 4;
  const val: Pt[] = [];
  for (let i = 0; i <= scallops; i++) {
    const t = i / scallops;
    const base = { x: fA.x + (fB.x - fA.x) * t, y: fA.y + (fB.y - fA.y) * t };
    val.push(base);
    if (i < scallops) {
      const tm = (i + 0.5) / scallops;
      const mid = { x: fA.x + (fB.x - fA.x) * tm, y: fA.y + (fB.y - fA.y) * tm + drop };
      val.push(mid);
    }
  }
  frags.push(polyline(val, STROKE_THIN, INK));
  return frags.join('');
}

/** Shopfront display window + door on the RIGHT (SE) ground face. Body-only. */
function shopfrontRight(w: number, d: number): string {
  const frags: string[] = [];
  const sillTop = STOREY_H - 5; // top of the ground-floor glazing
  // big display window spanning most of the face
  frags.push(
    polygon(
      [rightPt(w, d, 0.08, 3), rightPt(w, d, 0.62, 3), rightPt(w, d, 0.62, sillTop), rightPt(w, d, 0.08, sillTop)],
      { fill: PAPER, stroke: INK, strokeWidth: STROKE_THIN }
    )
  );
  // window transom + mullion
  frags.push(line(rightPt(w, d, 0.08, sillTop - 4), rightPt(w, d, 0.62, sillTop - 4), 0.6, INK));
  frags.push(line(rightPt(w, d, 0.35, 3), rightPt(w, d, 0.35, sillTop), 0.6, INK));
  // door on the right of the window
  frags.push(
    polygon(
      [rightPt(w, d, 0.7, 2), rightPt(w, d, 0.9, 2), rightPt(w, d, 0.9, sillTop + 2), rightPt(w, d, 0.7, sillTop + 2)],
      { fill: PAPER, stroke: INK, strokeWidth: STROKE_THIN }
    )
  );
  frags.push(line(rightPt(w, d, 0.8, 2), rightPt(w, d, 0.8, sillTop + 2), 0.5, INK));
  return frags.join('');
}

/** Upright signboard TEXT centred over the SE face, above the awning. */
function shopSignage(w: number, d: number, label: string, boardV: number): string {
  const c = rightPt(w, d, 0.5, boardV);
  const halfLen = Math.max(18, label.length * 3.0);
  const boardH = 10;
  const top = c.y - boardH;
  const bot = c.y;
  const frags: string[] = [];
  frags.push(
    polygon(
      [
        { x: c.x - halfLen, y: top },
        { x: c.x + halfLen, y: top },
        { x: c.x + halfLen, y: bot },
        { x: c.x - halfLen, y: bot },
      ],
      { fill: PAPER, stroke: INK, strokeWidth: STROKE_THIN }
    )
  );
  const esc = label.toUpperCase().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  frags.push(
    `<text x="${n(c.x)}" y="${n((top + bot) / 2 + 3)}" font-family="Helvetica, Arial, sans-serif" font-size="7.5" font-weight="bold" fill="${INK}" text-anchor="middle" letter-spacing="0.3">${esc}</text>`
  );
  return frags.join('');
}

// --- shop-front: 2×1, 2-storey, shopfront + awning + signage --------------
export function shopFront(params?: Record<string, unknown>): string {
  const w = 2, d = 1;
  const storeys = 2;
  const bodyH = storeys * STOREY_H;
  const sillV = STOREY_H - 3; // awning sits just above the ground-floor glazing
  const label = ((params?.signage as string) || 'CAFE').toString();
  const o = readOrientation(params);

  const ground = at(0, 0, 0); void ground;
  const bodyFrags: string[] = [];
  bodyFrags.push(boxBody(w, d, bodyH));
  // upper-storey windows (two simple panes on the SE face)
  const uTop = bodyH - 7, uBot = STOREY_H + 6;
  for (const [u0, u1] of [[0.12, 0.42], [0.58, 0.88]] as Array<[number, number]>) {
    bodyFrags.push(
      polygon(
        [rightPt(w, d, u0, uBot), rightPt(w, d, u1, uBot), rightPt(w, d, u1, uTop), rightPt(w, d, u0, uTop)],
        { fill: PAPER, stroke: INK, strokeWidth: STROKE_THIN }
      )
    );
  }
  bodyFrags.push(shopfrontRight(w, d));
  bodyFrags.push(awningRight(w, d, sillV));

  // signage text — rendered upright OUTSIDE the mirror, positioned to match
  // whichever face the shopfront ended up on.
  const boardV = STOREY_H + 8; // above the awning, below the first-floor windows
  const frags: string[] = [];
  if (o === 1 || o === 3) {
    const joined = bodyFrags.join('');
    const ax = bboxCentreX(joined);
    frags.push(mirrorX([joined], ax));
    // mirror the signage anchor x about the same axis, keep text upright
    const c = rightPt(w, d, 0.5, boardV);
    frags.push(shopSignageAt(2 * ax - c.x, c.y, label));
  } else {
    frags.push(...bodyFrags);
    frags.push(shopSignage(w, d, label, boardV));
  }
  return group(0, 0, frags);
}

/** Signage board at an explicit centre (used for the mirrored facing). */
function shopSignageAt(cx: number, cy: number, label: string): string {
  const halfLen = Math.max(18, label.length * 3.0);
  const boardH = 10;
  const top = cy - boardH;
  const bot = cy;
  const frags: string[] = [];
  frags.push(
    polygon(
      [
        { x: cx - halfLen, y: top },
        { x: cx + halfLen, y: top },
        { x: cx + halfLen, y: bot },
        { x: cx - halfLen, y: bot },
      ],
      { fill: PAPER, stroke: INK, strokeWidth: STROKE_THIN }
    )
  );
  const esc = label.toUpperCase().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  frags.push(
    `<text x="${n(cx)}" y="${n((top + bot) / 2 + 3)}" font-family="Helvetica, Arial, sans-serif" font-size="7.5" font-weight="bold" fill="${INK}" text-anchor="middle" letter-spacing="0.3">${esc}</text>`
  );
  return frags.join('');
}

// --- corner-shop: 1×1, 2-storey, pitched roof, display window + signage ---
export function cornerShop(params?: Record<string, unknown>): string {
  const w = 1, d = 1;
  const storeys = 2;
  const bodyH = storeys * STOREY_H;
  const label = ((params?.signage as string) || 'SHOP').toString();
  const o = readOrientation(params);

  const bodyFrags: string[] = [];
  bodyFrags.push(boxBody(w, d, bodyH));
  // pitched roof (gable ridge along +x at mid-depth)
  bodyFrags.push(pitchedRoof(w, d, bodyH));
  // upper window on SE face
  bodyFrags.push(
    polygon(
      [rightPt(w, d, 0.28, bodyH - 6), rightPt(w, d, 0.72, bodyH - 6), rightPt(w, d, 0.72, STOREY_H + 6), rightPt(w, d, 0.28, STOREY_H + 6)],
      { fill: PAPER, stroke: INK, strokeWidth: STROKE_THIN }
    )
  );
  // ground display window + door
  const sillTop = STOREY_H - 5;
  bodyFrags.push(
    polygon(
      [rightPt(w, d, 0.1, 3), rightPt(w, d, 0.6, 3), rightPt(w, d, 0.6, sillTop), rightPt(w, d, 0.1, sillTop)],
      { fill: PAPER, stroke: INK, strokeWidth: STROKE_THIN }
    )
  );
  bodyFrags.push(
    polygon(
      [rightPt(w, d, 0.68, 2), rightPt(w, d, 0.9, 2), rightPt(w, d, 0.9, sillTop + 2), rightPt(w, d, 0.68, sillTop + 2)],
      { fill: PAPER, stroke: INK, strokeWidth: STROKE_THIN }
    )
  );

  const boardV = STOREY_H + 2;
  const frags: string[] = [];
  if (o === 1 || o === 3) {
    const joined = bodyFrags.join('');
    const ax = bboxCentreX(joined);
    frags.push(mirrorX([joined], ax));
    const c = rightPt(w, d, 0.5, boardV);
    frags.push(shopSignageAt(2 * ax - c.x, c.y, label));
  } else {
    frags.push(...bodyFrags);
    frags.push(shopSignage(w, d, label, boardV));
  }
  return group(0, 0, frags);
}

function pitchedRoof(w: number, d: number, baseH: number): string {
  const peak = 12;
  const eN = at(0, 0, baseH), eE = at(w, 0, baseH), eS = at(w, d, baseH), eW = at(0, d, baseH);
  const ridgeN = at(0, d / 2, baseH + peak);
  const ridgeS = at(w, d / 2, baseH + peak);
  return [
    polygon([eW, eS, ridgeS, ridgeN], { fill: PAPER, stroke: INK, strokeWidth: STROKE }),
    polygon([eE, eS, ridgeS], { fill: PAPER, stroke: INK, strokeWidth: STROKE }),
    polygon([eN, eW, ridgeN], { fill: PAPER, stroke: INK, strokeWidth: STROKE }),
    polygon([eN, ridgeN, ridgeS, eE], { fill: PAPER, stroke: INK, strokeWidth: STROKE }),
  ].join('');
}

// --- cafe-seating: 1×1, two round tables + chairs + parasol ---------------
export function cafeSeating(params?: Record<string, unknown>): string {
  const o = readOrientation(params);
  const body: string[] = [];
  // two little café sets at diagonal positions
  body.push(cafeSet(0.3, 0.34));
  body.push(cafeSet(0.74, 0.7, true));
  if (o === 1 || o === 3) {
    const joined = body.join('');
    return group(0, 0, [mirrorX([joined], bboxCentreX(joined))]);
  }
  return group(0, 0, body);
}

/** One round bistro table with two chairs and (optionally) a parasol. */
function cafeSet(tx: number, ty: number, parasol = false): string {
  const g = project(tx, ty);
  const frags: string[] = [];
  const topH = 11;
  // two chairs first (behind), then table (in front) — painter's order.
  // chair = seat ellipse on a stalk + a short seat-back riser.
  const chairs: Array<[number, number]> = [[-11, -1], [11, 3]];
  for (const [dx, dy] of chairs) {
    const cb = { x: g.x + dx, y: g.y + dy };
    frags.push(ellipse(cb.x, cb.y - 4, 3.4, 1.9, { fill: PAPER, stroke: INK, strokeWidth: STROKE_THIN }));
    frags.push(line({ x: cb.x, y: cb.y - 4 }, { x: cb.x, y: cb.y }, STROKE_THIN, INK));
    // seat back (rises on the far side of the seat)
    frags.push(line({ x: cb.x + (dx < 0 ? -2.6 : 2.6), y: cb.y - 4 }, { x: cb.x + (dx < 0 ? -2.6 : 2.6), y: cb.y - 9 }, STROKE_THIN, INK));
  }
  // pedestal + round table top
  frags.push(line({ x: g.x, y: g.y - topH }, { x: g.x, y: g.y }, STROKE, INK));
  frags.push(ellipse(g.x, g.y, 3.4, 1.5, { fill: PAPER, stroke: INK, strokeWidth: 0.6 }));
  frags.push(ellipse(g.x, g.y - topH, 6.5, 3.4, { fill: PAPER, stroke: INK, strokeWidth: STROKE }));
  if (parasol) {
    const px = g.x, py = g.y - topH;
    const poleTop = py - 30;
    frags.push(line({ x: px, y: py }, { x: px, y: poleTop }, STROKE, INK));
    // canopy: a domed cap with a scalloped hem, opaque so the pole reads behind
    const rr = 15;
    const hemY = poleTop + 9;
    // dome top
    frags.push(
      `<path d="M ${n(px - rr)} ${n(hemY)} Q ${n(px)} ${n(poleTop - 5)} ${n(px + rr)} ${n(hemY)}" fill="${PAPER}" stroke="${INK}" stroke-width="${n(STROKE)}"/>`
    );
    // scalloped hem
    const seg = 5;
    const hem: Pt[] = [];
    for (let i = 0; i <= seg; i++) {
      const t = i / seg;
      hem.push({ x: px - rr + 2 * rr * t, y: hemY });
      if (i < seg) {
        const tm = (i + 0.5) / seg;
        hem.push({ x: px - rr + 2 * rr * tm, y: hemY + 3 });
      }
    }
    frags.push(polyline(hem, STROKE_THIN, INK));
    // tiny finial
    frags.push(line({ x: px, y: poleTop }, { x: px, y: poleTop - 3 }, STROKE_THIN, INK));
  }
  return frags.join('');
}

// --- market-stall: 1×1, simple canopy stall -------------------------------
export function marketStall(params?: Record<string, unknown>): string {
  const o = readOrientation(params);
  const body: string[] = [];
  const w = 1, d = 1;
  // four corner posts
  const postH = 20;
  const posts: Array<[number, number]> = [[0.15, 0.15], [0.85, 0.15], [0.15, 0.85], [0.85, 0.85]];
  for (const [tx, ty] of posts) {
    const g = project(tx, ty);
    body.push(line({ x: g.x, y: g.y }, { x: g.x, y: g.y - postH }, STROKE_THIN, INK));
  }
  // counter (a low table slab across the front, SE side)
  const cN = at(0.15, 0.55, 9), cE = at(0.85, 0.55, 9), cS = at(0.85, 0.9, 9), cW = at(0.15, 0.9, 9);
  const bE = at(0.85, 0.55, 0), bS = at(0.85, 0.9, 0), bW = at(0.15, 0.9, 0); void bE;
  body.push(polygon([cW, cS, bS, bW], { fill: PAPER, strokeWidth: STROKE_THIN }));
  body.push(polygon([cN, cE, cS, cW], { fill: PAPER, strokeWidth: STROKE_THIN }));
  // striped canopy roof (a shallow ridge slab on top of the posts)
  const rN = at(0, 0, postH), rE = at(w, 0, postH), rS = at(w, d, postH), rW = at(0, d, postH);
  const ridgeN = at(0, d / 2, postH + 8), ridgeS = at(w, d / 2, postH + 8);
  body.push(polygon([rW, rS, ridgeS, ridgeN], { fill: PAPER, stroke: INK, strokeWidth: STROKE }));
  body.push(polygon([rN, ridgeN, ridgeS, rE], { fill: PAPER, stroke: INK, strokeWidth: STROKE }));
  // canopy stripes on the near (SE) slope
  for (let i = 1; i < 4; i++) {
    const t = i / 4;
    const p0 = { x: rN.x + (rE.x - rN.x) * t, y: rN.y + (rE.y - rN.y) * t };
    const p1 = { x: ridgeN.x + (ridgeS.x - ridgeN.x) * t, y: ridgeN.y + (ridgeS.y - ridgeN.y) * t };
    body.push(line(p0, p1, 0.6, INK));
  }
  // scalloped front valance hanging off the SE eave (rN→rE)
  const scallops = 5, drop = 3;
  const val: Pt[] = [];
  for (let i = 0; i <= scallops; i++) {
    const t = i / scallops;
    val.push({ x: rN.x + (rE.x - rN.x) * t, y: rN.y + (rE.y - rN.y) * t });
    if (i < scallops) {
      const tm = (i + 0.5) / scallops;
      val.push({ x: rN.x + (rE.x - rN.x) * tm, y: rN.y + (rE.y - rN.y) * tm + drop });
    }
  }
  body.push(polyline(val, STROKE_THIN, INK));

  void circle; void text;
  if (o === 1 || o === 3) {
    const joined = body.join('');
    return group(0, 0, [mirrorX([joined], bboxCentreX(joined))]);
  }
  return group(0, 0, body);
}
