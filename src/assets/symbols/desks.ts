// Staffed-workplace desk assets: a person seated at a single desk, a two-person
// meeting table, and an L-shaped reception counter. Grid-anchored.
//
// Local origin = north vertex of footprint tile (0,0). Structures rise in −y.
// Baked-in figures are static monochrome line-art (ink outline + white fill),
// consistent with figurine.ts but with NO customisation params.
//
// Painter order matters: within a staffed desk the seated figure is drawn
// BEFORE the desk so the desk front occludes the sitter's hidden lower body
// (torso reads above the desktop, legs vanish behind the front panel).

import { project, isoDiamond, polygon, polyline, line, circle, pathFill, group, mirrorX, bboxCentreX, readOrientation, type Pt } from '../primitives.ts';
import { INK, PAPER, STROKE, STROKE_THIN } from '../style.ts';

// --- small local helpers -------------------------------------------------

function at(tx: number, ty: number, h: number): Pt {
  const g = project(tx, ty);
  return { x: g.x, y: g.y - h };
}
function lerp(a: Pt, b: Pt, t: number): Pt {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** ground diamond kept upright; body mirrors about its own bbox centre for 1|3. */
function orient(params: Record<string, unknown> | undefined, ground: string, body: string[]): string {
  const o = readOrientation(params);
  if (o === 1 || o === 3) {
    const joined = body.join('');
    return group(0, 0, [ground, mirrorX([joined], bboxCentreX(joined))]);
  }
  return group(0, 0, [ground, ...body]);
}

/** A flat slab top of footprint w×d (local tiles) at screen height h, thickness th. */
function slabTop(x0: number, y0: number, w: number, d: number, h: number, th = 2, sw = STROKE_THIN): string {
  const tN = at(x0, y0, h), tE = at(x0 + w, y0, h), tS = at(x0 + w, y0 + d, h), tW = at(x0, y0 + d, h);
  const bE = at(x0 + w, y0, h - th), bS = at(x0 + w, y0 + d, h - th), bW = at(x0, y0 + d, h - th);
  return [
    polygon([bW, bS, tS, tW], { fill: PAPER, strokeWidth: sw }), // left (SW) edge
    polygon([bS, bE, tE, tS], { fill: PAPER, strokeWidth: sw }), // right (SE) edge
    polygon([tN, tE, tS, tW], { fill: PAPER, strokeWidth: sw }), // top
  ].join('');
}

function leg(tx: number, ty: number, h: number): string {
  const g = project(tx, ty);
  return line({ x: g.x, y: g.y }, { x: g.x, y: g.y - h }, STROKE_THIN, INK);
}

// ========================================================================
// SEATED FIGURE — a static line-art person, seated, torso facing +y (screen
// up-left / away from viewer when placed at the north of a desk). Reads as
// "someone working here". Drawn feet-less: hips + torso + bent arms + head.
// Centred on screen point `c`, seat height `seatY` px above `c.y`.
// arms bring hands toward `desk` screen point (toward the desktop in front).
// ========================================================================
function seatedFigure(c: Pt, opts: { hipY?: number; facing?: 1 | -1 } = {}): string {
  // facing: +1 → hands reach toward −x (screen left / +y desk); −1 mirror.
  const f = opts.facing ?? 1;
  const hipY = opts.hipY ?? 0; // seat pan top relative to c.y
  const frags: string[] = [];

  // Vertical layout (screen px up from the seat pan at c.y + hipY):
  const seat = { x: c.x, y: c.y + hipY };
  const HIP = 0;
  const SHOULDER = 16;
  const NECK = 18;
  const HEAD_CY = 23;
  const HEAD_R = 4.6;
  const HALF_SH = 6;
  const HALF_HIP = 5;
  const P = (dx: number, upPx: number): Pt => ({ x: seat.x + dx * f, y: seat.y - upPx });

  // thigh: a short horizontal-ish slab from the hip forward toward the desk
  // (screen forward = toward the viewer & desk = +x-ish here we keep subtle).
  frags.push(
    polygon(
      [P(-HALF_HIP, HIP), P(HALF_HIP, HIP), P(HALF_HIP + 1.5, HIP - 5), P(-HALF_HIP - 1.5, HIP - 5)],
      { fill: PAPER, strokeWidth: STROKE_THIN }
    )
  );

  // torso trapezoid: shoulders wider than hips, leaning very slightly forward
  const torso: Pt[] = [
    P(-HALF_SH, SHOULDER),
    P(HALF_SH, SHOULDER),
    P(HALF_HIP + 1, HIP),
    P(-HALF_HIP - 1, HIP),
  ];
  frags.push(polygon(torso, { fill: PAPER, strokeWidth: STROKE }));

  // arms: shoulders bend forward-down so hands rest toward the desktop.
  // near arm (viewer side) sweeps across the front of the torso.
  const shO = P(HALF_SH, SHOULDER - 1); // outer shoulder
  const shI = P(-HALF_SH, SHOULDER - 1); // inner shoulder
  const handF = P(HALF_HIP + 6, SHOULDER - 12); // forward hand (near desk)
  const handN = P(-HALF_HIP - 1, SHOULDER - 13); // other hand (near desk, left)
  // far arm (drawn first so near arm overlaps it)
  frags.push(polyline([shI, { x: shI.x + f * 2, y: shI.y - 6 }, handN], STROKE, INK));
  frags.push(circle(handN, 1.6, { fill: PAPER, stroke: INK, strokeWidth: STROKE_THIN }));
  // near/leading arm bent at elbow toward the desk
  const elbow = P(HALF_SH + 3.5, SHOULDER - 8);
  frags.push(polyline([shO, elbow, handF], STROKE, INK));
  frags.push(circle(handF, 1.7, { fill: PAPER, stroke: INK, strokeWidth: STROKE_THIN }));

  // neck
  frags.push(polygon([P(-2, NECK), P(2, NECK), P(2, NECK - 3), P(-2, NECK - 3)], { fill: PAPER, strokeWidth: STROKE_THIN }));

  // head (three-quarter back view: circle + hair cap, faint jaw hint, no face)
  const head = P(0, HEAD_CY);
  frags.push(circle(head, HEAD_R, { fill: PAPER, stroke: INK, strokeWidth: STROKE }));
  // hair cap: solid ink dome over the top-back of the head
  frags.push(
    pathFill(
      `M ${head.x - HEAD_R - 0.4} ${head.y + 1.2} ` +
        `A ${HEAD_R + 0.4} ${HEAD_R + 0.4} 0 0 1 ${head.x + HEAD_R + 0.4} ${head.y + 1.2} ` +
        `L ${head.x + HEAD_R - 1} ${head.y + 2.5} ` +
        `A ${HEAD_R - 1} ${HEAD_R - 1} 0 0 0 ${head.x - HEAD_R + 1} ${head.y + 2.5} Z`,
      { fill: INK, stroke: INK, strokeWidth: STROKE_THIN }
    )
  );

  return frags.join('');
}

// ========================================================================
// OFFICE CHAIR — a swivel task chair: a backrest panel rising behind the
// seat, seat pan, a central post and a splayed 4-star base with castors.
// Centred on screen point `c` (seat-pan centre at c.y). `backDir`: +1 back
// rises to screen-up-left (north), matching a sitter facing away from viewer.
// Occlusion note: caller decides order (empty chair → chair after desk;
// chair-with-sitter → back drawn behind sitter, base under desk).
// ========================================================================
function officeChairBase(c: Pt): string {
  // post + 4-star base with castors, low to the ground.
  const frags: string[] = [];
  const postTop = { x: c.x, y: c.y - 2 };
  const postBot = { x: c.x, y: c.y + 9 };
  frags.push(line(postTop, postBot, STROKE, INK));
  // 5 splayed feet (star base) radiating from postBot
  const feet: Array<[number, number]> = [
    [-11, 4], [-6, 7], [6, 7], [11, 4], [0, 8.5],
  ];
  for (const [dx, dy] of feet) {
    const toe = { x: postBot.x + dx, y: postBot.y + dy };
    frags.push(line(postBot, toe, STROKE_THIN, INK));
    frags.push(circle(toe, 1.2, { fill: PAPER, stroke: INK, strokeWidth: STROKE_THIN }));
  }
  return frags.join('');
}

function officeChairSeat(c: Pt): string {
  // a small padded seat pan as a shallow iso slab centred on c.
  const frags: string[] = [];
  const w = 9, d = 7, h = 2;
  const n0 = { x: c.x, y: c.y - h };
  const e0 = { x: c.x + w, y: c.y - h + d * 0.5 };
  const s0 = { x: c.x, y: c.y - h + d };
  const w0 = { x: c.x - w, y: c.y - h + d * 0.5 };
  // slab thickness
  const eB = { x: e0.x, y: e0.y + h }, sB = { x: s0.x, y: s0.y + h }, wB = { x: w0.x, y: w0.y + h };
  frags.push(polygon([w0, s0, sB, wB], { fill: PAPER, strokeWidth: STROKE_THIN }));
  frags.push(polygon([s0, e0, eB, sB], { fill: PAPER, strokeWidth: STROKE_THIN }));
  frags.push(polygon([n0, e0, s0, w0], { fill: PAPER, strokeWidth: STROKE_THIN }));
  return frags.join('');
}

function officeChairBack(c: Pt): string {
  // tall backrest panel rising behind the seat (toward screen-up), tilted.
  const frags: string[] = [];
  const baseL = { x: c.x - 7, y: c.y - 1 };
  const baseR = { x: c.x + 7, y: c.y - 4 };
  const backH = 22;
  const lean = 3;
  const topL = { x: baseL.x - lean * 0.4, y: baseL.y - backH };
  const topR = { x: baseR.x - lean * 0.4, y: baseR.y - backH };
  frags.push(polygon([baseL, baseR, topR, topL], { fill: PAPER, strokeWidth: STROKE }));
  return frags.join('');
}

// ========================================================================
// 1. desk-single — a desk with a SEATED person behind it, a laptop + paper
//    stack on the desktop, and a waste bin beside the desk. Footprint 2×1.
//    Per ref-desk-single. orientations 2.
// ========================================================================
export function deskSingle(params?: Record<string, unknown>): string {
  const body: string[] = [];
  const deskH = 13; // desktop screen height

  // Desk occupies the front/south band of the footprint; person sits at north.
  const dx0 = 0.15, dy0 = 0.42, dw = 1.7, dd = 0.5;

  // --- 1. CHAIR + SITTER behind the desk (north side), drawn first --------
  // seat-pan centre in screen space, behind the desktop line. Sit low enough
  // that the desktop crosses the sitter around the elbow (ref-desk-single).
  const seatC = at(0.98, 0.08, 4);
  body.push(officeChairBack({ x: seatC.x, y: seatC.y - 6 })); // tall back rises behind sitter
  body.push(officeChairBase(seatC));
  body.push(officeChairSeat(seatC));
  // sitter seated on the pan, hips just above the seat top
  body.push(seatedFigure({ x: seatC.x, y: seatC.y - 4 }, { hipY: 0 }));

  // --- 2. DESK (drawn after, so the front panel occludes the sitter's legs)
  // Four legs first (behind top)
  body.push(leg(dx0, dy0, deskH));
  body.push(leg(dx0 + dw, dy0, deskH));
  body.push(leg(dx0, dy0 + dd, deskH));
  body.push(leg(dx0 + dw, dy0 + dd, deskH));
  // A solid front apron panel below the desktop on the SW+SE faces so it reads
  // as a heavy dark desk and hides the sitter's lower half.
  const fW = at(dx0, dy0 + dd, deskH);
  const fS = at(dx0 + dw, dy0 + dd, deskH);
  const fWb = at(dx0, dy0 + dd, 2);
  const fSb = at(dx0 + dw, dy0 + dd, 2);
  body.push(polygon([fWb, fSb, fS, fW], { fill: PAPER, strokeWidth: STROKE_THIN }));
  // desktop slab on top
  body.push(slabTop(dx0, dy0, dw, dd, deskH, 2, STROKE));

  // --- 3. items ON the desktop -------------------------------------------
  // paper stack (left), laptop (centre), phone (right) — from ref.
  // paper stack: a small block sitting on the top face, left side.
  const stackC = at(0.5, 0.62, deskH);
  const sw0 = 9, sd0 = 5, sh0 = 7;
  const pN = { x: stackC.x, y: stackC.y - sh0 };
  const pE = { x: stackC.x + sw0, y: stackC.y - sh0 + sd0 * 0.5 };
  const pS = { x: stackC.x, y: stackC.y - sh0 + sd0 };
  const pW = { x: stackC.x - sw0, y: stackC.y - sh0 + sd0 * 0.5 };
  const pEb = { x: pE.x, y: pE.y + sh0 }, pSb = { x: pS.x, y: pS.y + sh0 }, pWb = { x: pW.x, y: pW.y + sh0 };
  body.push(polygon([pW, pS, pSb, pWb], { fill: PAPER, strokeWidth: STROKE_THIN }));
  body.push(polygon([pS, pE, pEb, pSb], { fill: PAPER, strokeWidth: STROKE_THIN }));
  body.push(polygon([pN, pE, pS, pW], { fill: PAPER, strokeWidth: STROKE_THIN }));
  // ream sheet lines on the SW face
  for (let i = 1; i <= 3; i++) {
    const t = i / 4;
    body.push(line({ x: pW.x, y: pW.y + sh0 * t }, { x: pS.x, y: pS.y + sh0 * t }, 0.5, INK));
  }

  // laptop: open, on the top centre. base slab + tilted screen.
  const lc = at(1.0, 0.66, deskH);
  const lw = 11, ld = 7;
  const lN = { x: lc.x, y: lc.y }, lE = { x: lc.x + lw, y: lc.y + ld * 0.5 }, lS = { x: lc.x, y: lc.y + ld }, lW = { x: lc.x - lw, y: lc.y + ld * 0.5 };
  body.push(polygon([lN, lE, lS, lW], { fill: PAPER, strokeWidth: STROKE_THIN })); // base/keyboard deck
  body.push(line(lerp(lN, lW, 0.5), lerp(lE, lS, 0.5), 0.4, INK)); // key hint
  // screen hinged along lN→lE, tilting up-back
  const scH = 13;
  const sTN = { x: lN.x - 2, y: lN.y - scH }, sTE = { x: lE.x - 2, y: lE.y - scH };
  body.push(polygon([lN, lE, sTE, sTN], { fill: PAPER, strokeWidth: STROKE }));
  const iBL = lerp(lerp(lN, sTN, 0.12), lerp(lE, sTE, 0.12), 0.08);
  const iBR = lerp(lerp(lN, sTN, 0.12), lerp(lE, sTE, 0.12), 0.92);
  const iTL = lerp(lerp(lN, sTN, 0.9), lerp(lE, sTE, 0.9), 0.08);
  const iTR = lerp(lerp(lN, sTN, 0.9), lerp(lE, sTE, 0.9), 0.92);
  body.push(polygon([iBL, iBR, iTR, iTL], { fill: PAPER, strokeWidth: STROKE_THIN }));

  // small phone/keypad rectangle front-right on the desk
  const ph = at(1.45, 0.72, deskH);
  const phw = 5, phd = 3;
  body.push(polygon([
    { x: ph.x, y: ph.y }, { x: ph.x + phw, y: ph.y + phd * 0.5 }, { x: ph.x, y: ph.y + phd }, { x: ph.x - phw, y: ph.y + phd * 0.5 },
  ], { fill: PAPER, strokeWidth: STROKE_THIN }));

  // --- 4. WASTE BIN beside the desk (SW / left of the desk) ---------------
  const bin = at(-0.02, 0.62, 0);
  const binTopR = 5, binBotR = 3.5, binH = 11;
  const bt = { x: bin.x, y: bin.y - binH };
  // simple mesh bin: trapezoid body + elliptical rim, drawn as outlines
  body.push(polygon([
    { x: bt.x - binTopR, y: bt.y }, { x: bt.x + binTopR, y: bt.y },
    { x: bin.x + binBotR, y: bin.y }, { x: bin.x - binBotR, y: bin.y },
  ], { fill: PAPER, strokeWidth: STROKE_THIN }));
  // rim ellipse (as two arcs)
  body.push(pathFill(
    `M ${bt.x - binTopR} ${bt.y} A ${binTopR} ${binTopR * 0.42} 0 0 0 ${bt.x + binTopR} ${bt.y} ` +
    `A ${binTopR} ${binTopR * 0.42} 0 0 0 ${bt.x - binTopR} ${bt.y} Z`,
    { fill: PAPER, stroke: INK, strokeWidth: STROKE_THIN }
  ));
  // cross-hatch mesh on the body
  for (let i = 1; i <= 3; i++) {
    const t = i / 4;
    const yy = bt.y + binH * t;
    const rr = binTopR + (binBotR - binTopR) * t;
    body.push(line({ x: bt.x - rr, y: yy }, { x: bt.x + rr, y: yy }, 0.4, INK));
  }
  body.push(line({ x: bt.x - binTopR + 1, y: bt.y + 1 }, { x: bin.x - binBotR + 1, y: bin.y }, 0.4, INK));
  body.push(line({ x: bt.x + binTopR - 1, y: bt.y + 1 }, { x: bin.x + binBotR - 1, y: bin.y }, 0.4, INK));

  return orient(params, isoDiamond(2, 1), body);
}

// ========================================================================
// 2. desk-meeting — a table with TWO seated figures facing each other across
//    it, a sheet of paper between them. Footprint 2×1. orientations 2.
//    Per ref-desk-meeting.
// ========================================================================
export function deskMeeting(params?: Record<string, unknown>): string {
  const body: string[] = [];
  const tableH = 12;
  const tx0 = 0.12, ty0 = 0.22, tw = 1.76, td = 0.56;

  // FAR figure (north side, behind the table) — drawn first, table occludes legs.
  // Seat sits close to the table's back edge and low, so the sitter reads as
  // seated AT the table with the desktop crossing near the elbow.
  // Sits LOW so the tabletop crosses the torso near elbow height (the table is
  // drawn after and occludes everything below that line).
  const farC = at(0.45, 0.14, 0);
  body.push(officeChairBack({ x: farC.x, y: farC.y - 4 }));
  body.push(officeChairBase(farC));
  body.push(officeChairSeat(farC));
  body.push(seatedFigure({ x: farC.x, y: farC.y - 2 }, { hipY: 0, facing: 1 }));

  // TABLE
  body.push(leg(tx0, ty0, tableH));
  body.push(leg(tx0 + tw, ty0, tableH));
  body.push(leg(tx0, ty0 + td, tableH));
  body.push(leg(tx0 + tw, ty0 + td, tableH));
  body.push(slabTop(tx0, ty0, tw, td, tableH, 2.5, STROKE));

  // sheet of paper on the table between the two sitters
  const sheet = at(1.02, 0.5, tableH);
  const shw = 7, shd = 4;
  body.push(polygon([
    { x: sheet.x, y: sheet.y }, { x: sheet.x + shw, y: sheet.y + shd * 0.5 },
    { x: sheet.x, y: sheet.y + shd }, { x: sheet.x - shw, y: sheet.y + shd * 0.5 },
  ], { fill: PAPER, strokeWidth: STROKE_THIN }));
  body.push(line({ x: sheet.x - shw * 0.5, y: sheet.y + shd * 0.25 }, { x: sheet.x + shw * 0.5, y: sheet.y + shd * 0.75 }, 0.4, INK));

  // NEAR figure (south side, in front of the table, back to viewer) — drawn
  // last so it sits over the table's front edge (reads as leaning in). The
  // backrest is nearest the viewer, so draw it BEHIND the sitter's torso here
  // (chair back is on the viewer's side but the person's back hides most of it).
  // Screen-x of this seat (≈(tx−ty)·32 = 14.7) sits close to the body bbox
  // centre (~16) so the o1 mirror barely moves it — it stays mid-south-edge in
  // both facings instead of landing on the mirrored table's corner.
  const nearC = at(1.48, 1.02, 4);
  body.push(officeChairBase(nearC));
  body.push(officeChairSeat(nearC));
  body.push(officeChairBack({ x: nearC.x, y: nearC.y - 5 }));
  body.push(seatedFigure({ x: nearC.x, y: nearC.y - 3 }, { hipY: 0, facing: -1 }));

  return orient(params, isoDiamond(2, 1), body);
}

// ========================================================================
// 3. desk-reception — an L-shaped counter with a RAISED outer front panel
//    (counter-over-desk profile), an empty office chair behind the inner
//    corner, and a small monitor on the counter. Footprint 2×2, 4 facings
//    via true redraw of the L per quarter-turn. Per ref-desk-reception.
// ========================================================================
export function deskReception(params?: Record<string, unknown>): string {
  const o = readOrientation(params);

  // The L is defined for orientation 0 then rotated by remapping tile coords.
  // Base (o=0): the L hugs the north+east edges — a wing along +x (the back)
  // and a wing along +y (the right), leaving the SW quadrant open (chair area).
  // We express every tile coord through a rotation map so 4 facings truly
  // redraw the silhouette rather than mirror.
  const R = (tx: number, ty: number): Pt => {
    // rotate (tx,ty) within a 2×2 footprint by o quarter-turns (clockwise),
    // pivoting so the footprint stays in [0,2]×[0,2].
    let x = tx, y = ty;
    for (let k = 0; k < o; k++) {
      const nx = 2 - y;
      const ny = x;
      x = nx; y = ny;
    }
    return project(x, y);
  };
  const A = (tx: number, ty: number, h: number): Pt => {
    const g = R(tx, ty);
    return { x: g.x, y: g.y - h };
  };

  const frags: string[] = [];
  const deskH = 11;     // inner working-surface height
  const counterH = 17;  // raised front counter height
  const apronDrop = 2;  // slab thickness

  // Desk surface (inner, lower) — the L's inner working top: an L-polygon.
  // We build the L from two overlapping rectangular tops on the desk plane.
  // Wing A (back, along +x): tiles x∈[0.1,1.9], y∈[0.1,0.9]
  // Wing B (right, along +y): tiles x∈[1.1,1.9], y∈[0.1,1.9]
  const deskWingA = slabTopR(A, 0.1, 0.1, 1.8, 0.8, deskH, apronDrop, STROKE_THIN);
  const deskWingB = slabTopR(A, 1.1, 0.1, 0.8, 1.8, deskH, apronDrop, STROKE_THIN);

  // inner desk tops (back-most structure)
  frags.push(deskWingA);
  frags.push(deskWingB);

  // RAISED FRONT COUNTER: a taller lip running along the two OUTER edges of
  // the L that face the visitor (the SW-facing front of wing A and the
  // SW/​SE-facing front of wing B). Drawn as a thin raised slab above the desk.
  // Front of wing A faces south (its S edge y=0.9) → counter band.
  frags.push(counterBand(A, 0.1, 0.9, 1.0, 0.9, deskH, counterH)); // wing A front (partial, up to the elbow)
  frags.push(counterBand(A, 1.1, 1.9, 1.9, 1.9, deskH, counterH)); // wing B front (south edge)
  frags.push(counterBand(A, 1.9, 0.1, 1.9, 1.9, deskH, counterH)); // wing B outer (east edge)

  // small monitor sitting on the inner desk top (wing A), facing the chair.
  const mon = A(1.5, 0.5, deskH);
  const mw = 9, mh = 11;
  const mbL = { x: mon.x - mw * 0.5, y: mon.y }, mbR = { x: mon.x + mw * 0.5, y: mon.y - mw * 0.5 * 0.5 };
  // stand
  frags.push(line({ x: mon.x, y: mon.y - 2 }, { x: mon.x, y: mon.y - 6 }, STROKE_THIN, INK));
  frags.push(line({ x: mon.x - 3, y: mon.y - 1 }, { x: mon.x + 3, y: mon.y - 1 }, STROKE_THIN, INK));
  // panel (raised)
  const pbL = { x: mbL.x, y: mbL.y - 6 }, pbR = { x: mbR.x, y: mbR.y - 6 };
  const ptL = { x: pbL.x, y: pbL.y - mh }, ptR = { x: pbR.x, y: pbR.y - mh };
  frags.push(polygon([pbL, pbR, ptR, ptL], { fill: PAPER, strokeWidth: STROKE }));
  const inset = 1.4;
  frags.push(polygon([
    { x: pbL.x + inset, y: pbL.y - inset }, { x: pbR.x - inset, y: pbR.y - inset },
    { x: ptR.x - inset, y: ptR.y + inset }, { x: ptL.x + inset, y: ptL.y + inset },
  ], { fill: PAPER, strokeWidth: STROKE_THIN }));

  // Empty office chair in the open notch of the L, nearest the viewer so it
  // stands clear (ref-desk-reception has a prominent central chair). Drawn last.
  const chairC = A(0.62, 1.28, 6);
  frags.push(officeChairBack({ x: chairC.x, y: chairC.y - 8 }));
  frags.push(officeChairBase(chairC));
  frags.push(officeChairSeat(chairC));

  // ground diamond (2×2, upright — not rotated; footprint square is symmetric)
  return group(0, 0, [isoDiamond(2, 2), ...frags]);
}

// L-shaped counter helpers -------------------------------------------------

/** Slab top over a sub-rectangle using an arbitrary projector A(tx,ty,h). */
function slabTopR(
  A: (tx: number, ty: number, h: number) => Pt,
  x0: number, y0: number, w: number, d: number, h: number, th: number, sw: number
): string {
  const tN = A(x0, y0, h), tE = A(x0 + w, y0, h), tS = A(x0 + w, y0 + d, h), tW = A(x0, y0 + d, h);
  const bE = A(x0 + w, y0, h - th), bS = A(x0 + w, y0 + d, h - th), bW = A(x0, y0 + d, h - th);
  return [
    polygon([bW, bS, tS, tW], { fill: PAPER, strokeWidth: sw }),
    polygon([bS, bE, tE, tS], { fill: PAPER, strokeWidth: sw }),
    polygon([tN, tE, tS, tW], { fill: PAPER, strokeWidth: sw }),
  ].join('');
}

/**
 * A raised counter band standing on the desk edge from tile (ax,ay) to (bx,by),
 * rising from deskH to counterH. Reads as the reception's over-the-desk lip:
 * an outward vertical face + a thin top cap. Uses projector A.
 */
function counterBand(
  A: (tx: number, ty: number, h: number) => Pt,
  ax: number, ay: number, bx: number, by: number, deskH: number, counterH: number
): string {
  const frags: string[] = [];
  const g0 = A(ax, ay, deskH);
  const g1 = A(bx, by, deskH);
  const t0 = A(ax, ay, counterH);
  const t1 = A(bx, by, counterH);
  // outward vertical face
  frags.push(polygon([g0, g1, t1, t0], { fill: PAPER, strokeWidth: STROKE }));
  // thin top cap (project a shallow lip toward the desk interior)
  const capDepth = 0.14;
  // interior direction: perpendicular to the edge, toward the desk. Approx by
  // nudging the tile coords inward along the smaller axis.
  const inx = ax === bx ? -capDepth : 0; // vertical edge → nudge in x
  const iny = ay === by ? -capDepth : 0; // horizontal edge → nudge in y
  const c0 = A(ax + inx, ay + iny, counterH);
  const c1 = A(bx + inx, by + iny, counterH);
  frags.push(polygon([t0, t1, c1, c0], { fill: PAPER, strokeWidth: STROKE_THIN }));
  return frags.join('');
}
