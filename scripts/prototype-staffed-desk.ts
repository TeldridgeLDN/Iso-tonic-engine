// ============================================================================
// PROTOTYPE — THROWAWAY.  Do NOT ship, do NOT register in library.ts.
// ============================================================================
// Design question this prototype answers:
//   "Which rendering approach makes STAFFED desks read accurately —
//    (A) the current vectors, (B) PNG/JPEG sprites, or (C) improved posed
//    vectors?"
//
// It generates a single self-contained HTML file (prototype-staffed-desk.html)
// at the repo root showing, side by side at 2× and 1× scale, with the reference
// student-desk image pinned in a fixed comparison panel:
//
//   Variant A — CURRENT : desk-single + desk-meeting exactly as the library
//                         renders them today (baseline).
//   Variant B — SPRITE  : the reference JPEG embedded as a data URI and shown
//                         at tile scale (~112 px wide) as a sprite billboard
//                         would be. Demonstrates pixel-fidelity of the sprite
//                         path. (White→transparent cleaning is NOT applied —
//                         see the SPRITE note below and the notes .md.)
//   Variant C — POSED   : a NEW throwaway `deskSingleV3` (defined in THIS file,
//                         never registered) that fixes the three failure modes
//                         by COPYING THE REFERENCE IMAGE'S COMPOSITION — desk on
//                         the FAR side, figure seated on the NEAR side with its
//                         BACK TO CAMERA, chair nearest of all:
//                           1. properly seated figure — bent legs reaching
//                              forward into the desk knee-hole, torso leaning
//                              slightly forward, upper arms angling forward and
//                              DOWN so the forearms end ON the desktop plane
//                              (desktop height computed from the iso3 /
//                              desks-v2 world-unit conventions), head a single
//                              filled circle (no halo ring);
//                           2. FILLED flat-grey shapes for the figure instead
//                              of outline-only line art;
//                           3. a simple four-leg chair (seat + back) VISIBLE
//                              behind/beneath the figure — the chair back is
//                              the nearest element and is painted LAST so it
//                              partially occludes the figure's lower torso.
//                         Painter order: ground → desk (legs, front, top) →
//                         figure legs → torso → head → arms over the desktop →
//                         chair legs/seat/back last (nearest to camera).
//
// A floating bottom-centre switcher pill cycles A/B/C via ?variant= (reload
// stable) and the ← / → arrow keys.
//
//   npm run prototype:staffed-desk
//
// This script also performs the mechanical self-checks on Variant C that can be
// judged without human eyes (no NaN, forearm endpoints on the desktop plane,
// figure feet on the ground plane, desk → figure → chair-back painter order,
// chair-back/torso bbox overlap so the occlusion direction is verifiable) and
// prints PASS/FAIL to the console. Aesthetic judgement is the human's.
// ============================================================================

import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { deskSingle, deskMeeting } from '../src/assets/symbols/desks.ts';
import { projectWorld, mm, mmZ } from '../src/assets/iso3.ts';
import {
  project,
  isoDiamond,
  polygon,
  polyline,
  line,
  circle,
  type Pt,
} from '../src/assets/primitives.ts';
import { INK, PAPER, STROKE, STROKE_THIN, GRID_GREY, n } from '../src/assets/style.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..');

// ----------------------------------------------------------------------------
// Reference image (licensed stock — NEVER committed). Copy into a gitignored
// repo-local path at runtime, then embed as a data URI.
// ----------------------------------------------------------------------------
const REF_SRC =
  '/private/tmp/claude-502/-Users-tomeldridge-Momentum-Squared/bc892b22-b98b-4af3-a4c9-17341bb2f1a4/scratchpad/ref-student-desk.jpg';
const REF_LOCAL = join(REPO, 'ref-student-desk.jpg');

function refDataUri(): string {
  if (!existsSync(REF_LOCAL)) {
    if (!existsSync(REF_SRC)) {
      throw new Error(`reference image not found at ${REF_LOCAL} or ${REF_SRC}`);
    }
    copyFileSync(REF_SRC, REF_LOCAL); // gitignored copy
  }
  const bytes = readFileSync(REF_LOCAL);
  return `data:image/jpeg;base64,${bytes.toString('base64')}`;
}

// ============================================================================
// Flat greys for the Variant C figure.
// NOTE: style.ts ships exactly ONE grey token — GRID_GREY (#B8B8B8). A figure
// wants light/mid/dark separation, so this throwaway derives two extra shades
// of that same grey locally. GREY_MID *is* the real token; GREY_DARK/LIGHT are
// prototype-local. (Honest flag: "2–3 flat greys from style.ts tokens" is only
// partly satisfiable — the token vocabulary has a single grey.)
// ============================================================================
const GREY_DARK = '#8C8C8C';
const GREY_MID = GRID_GREY; // '#B8B8B8' — the one real style.ts grey token
const GREY_LIGHT = '#DCDCDC';

// world-unit desk conventions, lifted from desks-v2.ts
const TOP_H_MM = 740; // worktop TOP height
const TOP_TH_MM = 30; // worktop thickness
const SEAT_H_MM = 460; // chair seat-pan height
const topZ = mmZ(TOP_H_MM); // desktop TOP in world-z units
const topTh = mmZ(TOP_TH_MM);
const seatZ = mmZ(SEAT_H_MM);

/** Filled limb tube between two screen points, perpendicular half-widths wa,wb. */
function limb(a: Pt, b: Pt, wa: number, wb: number, fill: string): string {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1; // guard: no division by zero → no NaN
  const nx = -dy / len;
  const ny = dx / len;
  return polygon(
    [
      { x: a.x + nx * wa, y: a.y + ny * wa },
      { x: b.x + nx * wb, y: b.y + ny * wb },
      { x: b.x - nx * wb, y: b.y - ny * wb },
      { x: a.x - nx * wa, y: a.y - ny * wa },
    ],
    { fill, stroke: INK, strokeWidth: STROKE_THIN }
  );
}

interface Bbox {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

function bboxOf(pts: Pt[]): Bbox {
  return {
    minX: Math.min(...pts.map((p) => p.x)),
    maxX: Math.max(...pts.map((p) => p.x)),
    minY: Math.min(...pts.map((p) => p.y)),
    maxY: Math.max(...pts.map((p) => p.y)),
  };
}

function fmtBbox(b: Bbox): string {
  return `x[${n(b.minX)}..${n(b.maxX)}] y[${n(b.minY)}..${n(b.maxY)}]`;
}

interface V3Checks {
  order: string[];
  topZ: number;
  hands: Array<{ tx: number; ty: number; screen: Pt }>;
  feet: Array<{ tx: number; ty: number; screen: Pt }>;
  /** screen bbox of the torso polygon (for the occlusion-direction check) */
  torsoBbox: Bbox;
  /** screen bbox of the chair-back polygon (must overlap torso + paint later) */
  chairBackBbox: Bbox;
}

interface V3Result {
  svg: string; // just the inner fragment (no <svg> wrapper)
  checks: V3Checks;
}

// ============================================================================
// deskSingleV3 — THROWAWAY posed-vector single desk with a seated figure.
// Footprint 2×1. Local origin = north vertex of tile (0,0), same contract as
// every other asset.
//
// COMPOSITION (copied from the reference image — this is why it works):
//   The desk sits on the FAR (north) band of the footprint, ty ∈ [0, 0.6].
//   The figure sits on the NEAR side of the desk's long front edge, back to
//   camera (between the viewer and the desk). The chair is the NEAREST element
//   and is painted LAST, its back partially occluding the figure's lower torso.
//
// Painter order (back-to-front):
//   ground → desk-legs → desk-front → desk-top → figure-legs (reaching forward
//   into the knee-hole) → figure-torso → figure-head → figure-arms (over the
//   desktop) → chair-legs → chair-seat → chair-back (nearest to camera).
//
// Returns the raw fragment plus the data needed for the mechanical self-checks.
// ============================================================================
function deskSingleV3(): V3Result {
  const ordered: Array<{ label: string; frag: string }> = [];
  const push = (label: string, frag: string): void => {
    ordered.push({ label, frag });
  };

  // ---- key world anchors ---------------------------------------------------
  const DESK_D = 0.6; // desk depth band: ty ∈ [0, DESK_D] (FAR side of the tile pair)
  const figTx = 1.0; // figure centred on the 2-wide desk
  const figSeatTy = 0.76; // NEAR side of the desk's long front edge
  const seat = projectWorld(figTx, figSeatTy, seatZ);

  // -------- 1. ground diamond --------
  push('ground', isoDiamond(2, 1, { fill: PAPER, stroke: GRID_GREY, strokeWidth: STROKE_THIN }));

  // -------- 2. DESK (far side): legs → front apron → top --------
  const deskLegTiles: Array<[number, number]> = [
    [0.12, 0.1],
    [1.88, 0.1],
    [0.12, 0.5],
    [1.88, 0.5],
  ];
  const deskLegs = deskLegTiles
    .map(([tx, ty]) => line(projectWorld(tx, ty, topZ - topTh), projectWorld(tx, ty, 0), STROKE, INK))
    .join('');
  push('desk-legs', deskLegs);

  // front apron / modesty skirt on the two viewer-facing faces below the top.
  // Desk box corners (ground): N=(0,0) E=(2,0) S=(2,DESK_D) W=(0,DESK_D).
  // Left face spans W→S, right face spans S→E; both from the top underside down
  // to the knee-hole line so the figure's shins stay visible in the gap below.
  const apronTop = topZ - topTh;
  const apronBot = mmZ(560); // knee-hole top
  const wTop = projectWorld(0, DESK_D, apronTop);
  const sTop = projectWorld(2, DESK_D, apronTop);
  const eTop = projectWorld(2, 0, apronTop);
  const wBot = projectWorld(0, DESK_D, apronBot);
  const sBot = projectWorld(2, DESK_D, apronBot);
  const eBot = projectWorld(2, 0, apronBot);
  const apron = [
    polygon([wBot, sBot, sTop, wTop], { fill: PAPER, stroke: INK, strokeWidth: STROKE }), // left face
    polygon([sBot, eBot, eTop, sTop], { fill: PAPER, stroke: INK, strokeWidth: STROKE }), // right face
  ].join('');
  push('desk-front', apron);

  // desktop slab top (2 × DESK_D band) — three faces of a thin slab
  const tN = projectWorld(0, 0, topZ);
  const tE = projectWorld(2, 0, topZ);
  const tS = projectWorld(2, DESK_D, topZ);
  const tW = projectWorld(0, DESK_D, topZ);
  const uE = projectWorld(2, 0, topZ - topTh);
  const uS = projectWorld(2, DESK_D, topZ - topTh);
  const uW = projectWorld(0, DESK_D, topZ - topTh);
  const deskTop = [
    polygon([uW, uS, tS, tW], { fill: PAPER, stroke: INK, strokeWidth: STROKE }), // left edge
    polygon([uS, uE, tE, tS], { fill: PAPER, stroke: INK, strokeWidth: STROKE }), // right edge
    polygon([tN, tE, tS, tW], { fill: PAPER, stroke: INK, strokeWidth: STROKE }), // top
  ].join('');
  push('desk-top', deskTop);

  // -------- 3. figure LEGS — reach forward into the knee-hole --------
  // Knees/feet stop just SOUTH of the desk front plane (ty = DESK_D) so the
  // limbs sit in the visible knee-hole gap without painting over the apron.
  const hipL = { x: seat.x - 4, y: seat.y };
  const hipR = { x: seat.x + 4, y: seat.y };
  const kneeTy = 0.62;
  const footTy = 0.62;
  const kneeL = projectWorld(figTx - 0.14, kneeTy, seatZ); // thighs ~level at seat height
  const kneeR = projectWorld(figTx + 0.14, kneeTy, seatZ);
  const footL = projectWorld(figTx - 0.14, footTy, 0); // shins down to the floor
  const footR = projectWorld(figTx + 0.14, footTy, 0);
  const legFrags = [
    limb(hipL, kneeL, 5, 4, GREY_DARK), // left thigh
    limb(kneeL, footL, 4, 3, GREY_DARK), // left shin
    limb(hipR, kneeR, 5, 4, GREY_DARK), // right thigh
    limb(kneeR, footR, 4, 3, GREY_DARK), // right shin
    circle(footL, 2, { fill: GREY_DARK, stroke: INK, strokeWidth: STROKE_THIN }),
    circle(footR, 2, { fill: GREY_DARK, stroke: INK, strokeWidth: STROKE_THIN }),
  ].join('');
  push('figure-legs', legFrags);

  // -------- 4. figure TORSO + HEAD (back to camera, leaning forward) --------
  // Shoulders lean toward the desk (smaller ty) and rise to seated shoulder
  // height (~1150 mm). Head is a SINGLE filled circle (no hair ring → no halo).
  const shoulderCentre = projectWorld(figTx, 0.7, mmZ(1150));
  const HALF_SH = 7;
  const torsoPts: Pt[] = [
    hipL,
    hipR,
    { x: shoulderCentre.x + HALF_SH, y: shoulderCentre.y },
    { x: shoulderCentre.x - HALF_SH, y: shoulderCentre.y },
  ];
  push('figure-torso', polygon(torsoPts, { fill: GREY_MID, stroke: INK, strokeWidth: STROKE }));
  const headC = projectWorld(figTx, 0.69, mmZ(1300));
  push('figure-head', circle(headC, 5.2, { fill: GREY_LIGHT, stroke: INK, strokeWidth: STROKE }));

  // -------- 5. figure ARMS — upper arms angle forward and DOWN onto the desk;
  // forearms END on the desktop plane. Both hands are placed at z = topZ so
  // their screen point IS the desktop surface point at that tile. Drawn AFTER
  // desk-top so the forearms rest visibly on it. --------
  const handLTile = { tx: 0.78, ty: 0.46 };
  const handRTile = { tx: 1.22, ty: 0.46 };
  const handL = projectWorld(handLTile.tx, handLTile.ty, topZ);
  const handR = projectWorld(handRTile.tx, handRTile.ty, topZ);
  const shoulderL = { x: shoulderCentre.x - HALF_SH, y: shoulderCentre.y + 2 };
  const shoulderR = { x: shoulderCentre.x + HALF_SH, y: shoulderCentre.y + 2 };
  const elbowL = { x: (shoulderL.x + handL.x) / 2 - 3, y: (shoulderL.y + handL.y) / 2 + 3 };
  const elbowR = { x: (shoulderR.x + handR.x) / 2 + 3, y: (shoulderR.y + handR.y) / 2 + 3 };
  const arms = [
    limb(shoulderL, elbowL, 3.5, 3, GREY_MID), // left upper arm
    limb(elbowL, handL, 3, 2.5, GREY_LIGHT), // left forearm
    limb(shoulderR, elbowR, 3.5, 3, GREY_MID), // right upper arm
    limb(elbowR, handR, 3, 2.5, GREY_LIGHT), // right forearm
    circle(handL, 2, { fill: GREY_LIGHT, stroke: INK, strokeWidth: STROKE_THIN }),
    circle(handR, 2, { fill: GREY_LIGHT, stroke: INK, strokeWidth: STROKE_THIN }),
  ].join('');
  push('figure-arms', arms);

  // -------- 6. CHAIR — nearest element, painted LAST --------
  // Four legs + seat pan + back. The back rises from the pan's SOUTH edge
  // (largest ty = nearest the camera) and partially occludes the lower torso.
  // pan tx range is shifted +0.06 east of the figure's tx so the BACK panel
  // (at larger ty, which the 2:1 projection slides screen-left) lands centred
  // behind the torso instead of hanging off its left side.
  const panN = { tx: 0.96, ty: 0.64 };
  const panS = { tx: 1.26, ty: 0.88 };
  const chairLegTiles: Array<[number, number]> = [
    [0.98, 0.66],
    [1.24, 0.66],
    [0.98, 0.86],
    [1.24, 0.86],
  ];
  const chairLegs = chairLegTiles
    .map(([tx, ty]) => line(projectWorld(tx, ty, seatZ - mmZ(40)), projectWorld(tx, ty, 0), STROKE_THIN, INK))
    .join('');
  push('chair-legs', chairLegs);
  const pan = {
    n: projectWorld(panN.tx, panN.ty, seatZ),
    e: projectWorld(panS.tx, panN.ty, seatZ),
    s: projectWorld(panS.tx, panS.ty, seatZ),
    w: projectWorld(panN.tx, panS.ty, seatZ),
  };
  push('chair-seat', polygon([pan.n, pan.e, pan.s, pan.w], { fill: PAPER, stroke: INK, strokeWidth: STROKE }));
  // backrest: panel rising from the pan's south edge (W→S corners), nearest to
  // camera — drawn last of all so it occludes the figure's lower torso.
  const backBaseL = projectWorld(panN.tx, panS.ty, seatZ);
  const backBaseR = projectWorld(panS.tx, panS.ty, seatZ);
  const backTopL = projectWorld(panN.tx, panS.ty, seatZ + mmZ(450));
  const backTopR = projectWorld(panS.tx, panS.ty, seatZ + mmZ(450));
  const chairBackPts: Pt[] = [backBaseL, backBaseR, backTopR, backTopL];
  push('chair-back', polygon(chairBackPts, { fill: PAPER, stroke: INK, strokeWidth: STROKE }));

  return {
    svg: ordered.map((o) => o.frag).join(''),
    checks: {
      order: ordered.map((o) => o.label),
      topZ,
      hands: [
        { tx: handLTile.tx, ty: handLTile.ty, screen: handL },
        { tx: handRTile.tx, ty: handRTile.ty, screen: handR },
      ],
      feet: [
        { tx: figTx - 0.14, ty: footTy, screen: footL },
        { tx: figTx + 0.14, ty: footTy, screen: footR },
      ],
      torsoBbox: bboxOf(torsoPts),
      chairBackBbox: bboxOf(chairBackPts),
    },
  };
}

// ============================================================================
// Mechanical self-checks on Variant C.
// ============================================================================
interface CheckResult {
  name: string;
  pass: boolean;
  detail: string;
}

function runChecks(v3: V3Result): CheckResult[] {
  const results: CheckResult[] = [];
  const EPS = 1e-6;

  // 1. no NaN anywhere in the emitted SVG
  results.push({
    name: 'no NaN in SVG',
    pass: !/NaN/.test(v3.svg),
    detail: /NaN/.test(v3.svg) ? 'found "NaN" token in output' : 'clean',
  });

  // 2. each forearm endpoint lies on the desktop plane: recompute
  //    projectWorld(handTile, topZ) independently and compare to the emitted
  //    point, and confirm a hand circle at that (rounded) point exists.
  for (const [i, h] of v3.checks.hands.entries()) {
    const recomputed = projectWorld(h.tx, h.ty, v3.checks.topZ);
    const near = Math.abs(recomputed.x - h.screen.x) < EPS && Math.abs(recomputed.y - h.screen.y) < EPS;
    const circleInSvg = v3.svg.includes(`cx="${n(h.screen.x)}"`) && v3.svg.includes(`cy="${n(h.screen.y)}"`);
    results.push({
      name: `forearm ${i === 0 ? 'L' : 'R'} endpoint on desktop plane`,
      pass: near && circleInSvg,
      detail: `recomputed=(${n(recomputed.x)},${n(recomputed.y)}) emitted=(${n(h.screen.x)},${n(
        h.screen.y
      )}) planeMatch=${near} handCircleDrawn=${circleInSvg}`,
    });
  }

  // 3. figure feet rest on the GROUND plane (z=0): the emitted foot point must
  //    equal projectWorld(footTile, 0).
  let feetOk = true;
  const feetDetail: string[] = [];
  for (const [i, f] of v3.checks.feet.entries()) {
    const ground = projectWorld(f.tx, f.ty, 0);
    const ok = Math.abs(ground.x - f.screen.x) < EPS && Math.abs(ground.y - f.screen.y) < EPS;
    feetOk = feetOk && ok;
    feetDetail.push(`${i === 0 ? 'L' : 'R'}:${ok}`);
  }
  // consistency: both feet share the same ground ty band (same floor line rule)
  const sameTy = Math.abs(v3.checks.feet[0].ty - v3.checks.feet[1].ty) < EPS;
  results.push({
    name: 'figure feet on ground plane, consistent baseline',
    pass: feetOk && sameTy,
    detail: `onGround=[${feetDetail.join(',')}] sameFootTy=${sameTy}`,
  });

  // 4. painter order (near-side composition): desk fully painted BEFORE the
  //    figure (figure is in front of the desk), figure before the chair, and
  //    the chair-back is the very LAST element (nearest to camera).
  const idx = (label: string): number => v3.checks.order.indexOf(label);
  const orderOk =
    idx('desk-top') >= 0 &&
    idx('desk-top') < idx('figure-legs') &&
    idx('figure-legs') < idx('figure-torso') &&
    idx('figure-torso') < idx('figure-arms') &&
    idx('figure-arms') < idx('chair-back') &&
    idx('chair-back') === v3.checks.order.length - 1;
  results.push({
    name: 'painter order: desk → figure → arms → chair-back last',
    pass: orderOk,
    detail: `order=[${v3.checks.order.join(' → ')}]`,
  });

  // 5. occlusion direction: the chair-back must be painted AFTER the torso AND
  //    its screen bbox must actually overlap the torso bbox — otherwise "the
  //    chair back occludes the lower torso" would be vacuously true. Bounding
  //    coordinates printed so the direction is verifiable by eye.
  const tB = v3.checks.torsoBbox;
  const cB = v3.checks.chairBackBbox;
  const overlapX = Math.min(tB.maxX, cB.maxX) - Math.max(tB.minX, cB.minX);
  const overlapY = Math.min(tB.maxY, cB.maxY) - Math.max(tB.minY, cB.minY);
  const paintedAfter = idx('chair-back') > idx('figure-torso');
  // the back must cover the LOWER torso: its top edge sits below the torso's
  // top (shoulders stay visible) and its bbox reaches the torso's bottom (hips)
  const coversLower = cB.minY > tB.minY && cB.maxY >= tB.maxY - EPS;
  results.push({
    name: 'occlusion: chair-back overlaps + covers lower torso, painted after it',
    pass: paintedAfter && overlapX > 0 && overlapY > 0 && coversLower,
    detail:
      `torsoBbox=${fmtBbox(tB)} chairBackBbox=${fmtBbox(cB)} ` +
      `overlap=(${n(overlapX)}px × ${n(overlapY)}px) paintedAfter=${paintedAfter} coversLowerTorso=${coversLower}`,
  });

  return results;
}

// ============================================================================
// HTML assembly.
// ============================================================================

// Fixed viewBox for every vector render. Content: x∈[-32,64], up to ~-45 (head/
// chair back), down to ~+50 (desk front). Generous, centred.
const VB = { x: -90, y: -116, w: 200, h: 196 };

function vectorFrame(frag: string, scale: number): string {
  const w = VB.w * scale;
  const h = VB.h * scale;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n(w)}" height="${n(h)}" ` +
    `viewBox="${VB.x} ${VB.y} ${VB.w} ${VB.h}" style="background:#fafafa;border:1px solid #e0e0e0">` +
    `<rect x="${VB.x}" y="${VB.y}" width="${VB.w}" height="${VB.h}" fill="#fafafa"/>` +
    frag +
    `</svg>`
  );
}

function scaledPair(frag: string, caption: string): string {
  return (
    `<figure class="pair">` +
    `<div class="row">` +
    `<div class="scaled"><div class="tag">2×</div>${vectorFrame(frag, 2)}</div>` +
    `<div class="scaled"><div class="tag">1×</div>${vectorFrame(frag, 1)}</div>` +
    `</div>` +
    `<figcaption>${caption}</figcaption>` +
    `</figure>`
  );
}

function spritePair(dataUri: string, caption: string): string {
  // Sprite billboard at tile scale: a 2×1 desk ⇒ ~112 px wide (sprite.ts convention).
  const w1 = 112;
  const w2 = 224;
  const frame = (w: number, lbl: string): string =>
    `<div class="scaled"><div class="tag">${lbl}</div>` +
    `<div class="spritebox" style="width:${w}px"><img src="${dataUri}" alt="sprite" style="width:${w}px;image-rendering:auto"/></div>` +
    `</div>`;
  return (
    `<figure class="pair">` +
    `<div class="row">${frame(w2, '2× (224px)')}${frame(w1, '1× (112px)')}</div>` +
    `<figcaption>${caption}</figcaption>` +
    `</figure>`
  );
}

function build(): { html: string; checks: CheckResult[] } {
  const refUri = refDataUri();
  const v3 = deskSingleV3();
  const checks = runChecks(v3);

  // Variant A — current library renders
  const variantA =
    `<div class="variant-body">` +
    scaledPair(deskSingle(), 'desk-single (current library render)') +
    scaledPair(deskMeeting(), 'desk-meeting (current library render)') +
    `</div>`;

  // Variant B — sprite (reference JPEG embedded, uncleaned)
  const variantB =
    `<div class="variant-body">` +
    spritePair(refUri, 'reference JPEG as a sprite billboard at tile scale') +
    `<p class="note"><b>SPRITE note:</b> white→transparent cleaning is <b>NOT</b> applied. ` +
    `The source is a JPEG (no alpha channel) and Node ships no built-in JPEG decoder, so ` +
    `matte removal would require a new dependency (sharp/jimp) — out of scope for a throwaway. ` +
    `Embedded as-is; a real sprite would be a PNG cut-out on transparency.</p>` +
    `</div>`;

  // Variant C — posed vector + checks readout
  const checkRows = checks
    .map(
      (c) =>
        `<tr class="${c.pass ? 'ok' : 'bad'}"><td>${c.pass ? 'PASS' : 'FAIL'}</td><td>${c.name}</td><td>${escapeHtml(
          c.detail
        )}</td></tr>`
    )
    .join('');
  const variantC =
    `<div class="variant-body">` +
    scaledPair(
      v3.svg,
      'deskSingleV3 — reference composition: desk far, figure seated NEAR side with back to camera, chair nearest (THROWAWAY)'
    ) +
    `<div class="checks"><h3>Mechanical self-checks</h3>` +
    `<table><thead><tr><th>result</th><th>check</th><th>detail</th></tr></thead><tbody>${checkRows}</tbody></table>` +
    `<p class="note">Aesthetic quality (does it <i>read</i> as a seated student?) is the human's call — ` +
    `these checks only prove geometry: no NaN, forearms land on the computed desktop plane, feet on the ` +
    `ground plane, desk → figure → chair-back painter order, and chair-back/torso bounding-box overlap ` +
    `(so the chair back genuinely occludes the lower torso rather than passing vacuously).</p></div>` +
    `</div>`;

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>PROTOTYPE — Staffed desk rendering (THROWAWAY)</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Helvetica, Arial, sans-serif; color: #1a1a1a; background: #f2f2f2; }
  .banner { background: #E8541D; color: #fff; padding: 10px 16px; font-weight: bold; letter-spacing: .3px; }
  .banner small { font-weight: normal; opacity: .9; }
  .layout { display: flex; gap: 16px; padding: 16px; align-items: flex-start; }
  .main { flex: 1 1 auto; min-width: 0; }
  .refpanel { position: sticky; top: 16px; flex: 0 0 260px; background: #fff; border: 1px solid #ddd; border-radius: 8px; padding: 12px; }
  .refpanel h2 { margin: 0 0 8px; font-size: 13px; text-transform: uppercase; letter-spacing: .5px; color: #666; }
  .refpanel img { width: 100%; display: block; border: 1px solid #eee; border-radius: 4px; }
  .refpanel p { font-size: 11px; color: #888; margin: 8px 0 0; }
  .variant { background: #fff; border: 1px solid #ddd; border-radius: 8px; padding: 16px; }
  .variant h1 { font-size: 16px; margin: 0 0 4px; }
  .variant .sub { font-size: 12px; color: #777; margin: 0 0 14px; }
  .variant-body { display: flex; flex-direction: column; gap: 18px; }
  .pair { margin: 0; }
  .row { display: flex; gap: 18px; align-items: flex-end; flex-wrap: wrap; }
  .scaled { position: relative; }
  .scaled .tag { font-size: 10px; color: #999; margin-bottom: 4px; }
  .spritebox { border: 1px solid #e0e0e0; background: #fafafa; }
  figcaption { font-size: 12px; color: #555; margin-top: 8px; }
  .note { font-size: 12px; color: #666; background: #fbf6f2; border-left: 3px solid #E8541D; padding: 8px 10px; border-radius: 0 4px 4px 0; }
  .checks { margin-top: 6px; }
  .checks h3 { font-size: 13px; margin: 0 0 8px; }
  table { border-collapse: collapse; width: 100%; font-size: 12px; }
  th, td { text-align: left; padding: 5px 8px; border-bottom: 1px solid #eee; vertical-align: top; }
  tr.ok td:first-child { color: #1a7a1a; font-weight: bold; }
  tr.bad td:first-child { color: #c01818; font-weight: bold; }
  .pill { position: fixed; bottom: 18px; left: 50%; transform: translateX(-50%);
          background: #1a1a1a; color: #fff; border-radius: 999px; padding: 8px 8px;
          display: flex; align-items: center; gap: 4px; box-shadow: 0 4px 16px rgba(0,0,0,.3); z-index: 50; }
  .pill button { background: #333; color: #fff; border: none; width: 34px; height: 34px; border-radius: 50%;
                 font-size: 18px; cursor: pointer; }
  .pill button:hover { background: #E8541D; }
  .pill .label { min-width: 190px; text-align: center; font-size: 13px; font-weight: bold; padding: 0 6px; }
  .hint { font-size: 11px; color: #999; text-align: center; padding: 4px 0 70px; }
</style>
</head>
<body>
  <div class="banner">PROTOTYPE — THROWAWAY &nbsp; <small>Which rendering approach makes staffed desks read accurately? · generated by scripts/prototype-staffed-desk.ts · do not ship</small></div>
  <div class="layout">
    <div class="main">
      <section class="variant" data-variant="A">
        <h1>Variant A — CURRENT (baseline)</h1>
        <p class="sub">desk-single &amp; desk-meeting exactly as <code>library.ts</code> renders them today.</p>
        ${variantA}
      </section>
      <section class="variant" data-variant="B" hidden>
        <h1>Variant B — SPRITE</h1>
        <p class="sub">The reference image embedded as a data-URI billboard at tile scale (pixel fidelity of the sprite path).</p>
        ${variantB}
      </section>
      <section class="variant" data-variant="C" hidden>
        <h1>Variant C — POSED VECTOR</h1>
        <p class="sub">New throwaway <code>deskSingleV3</code> — reference composition (figure NEAR side, back to camera, chair nearest &amp; painted last), filled greys, four-leg chair.</p>
        ${variantC}
      </section>
    </div>
    <aside class="refpanel">
      <h2>Reference</h2>
      <img src="${refUri}" alt="reference student desk"/>
      <p>Licensed stock — held in a gitignored file, never committed. Isometric student: seated, forearms on desk, chair tucked under, filled flat shapes.</p>
    </aside>
  </div>

  <div class="pill">
    <button id="prev" aria-label="previous variant">&larr;</button>
    <div class="label" id="vlabel">Variant A</div>
    <button id="next" aria-label="next variant">&rarr;</button>
  </div>
  <div class="hint">← / → arrow keys or the buttons cycle variants · state stored in the ?variant= URL param</div>

<script>
  var VARIANTS = ['A', 'B', 'C'];
  var LABELS = { A: 'Variant A — Current', B: 'Variant B — Sprite', C: 'Variant C — Posed vector' };
  function currentVariant() {
    var p = new URLSearchParams(location.search).get('variant');
    p = (p || 'A').toUpperCase();
    return VARIANTS.indexOf(p) >= 0 ? p : 'A';
  }
  function show(v) {
    document.querySelectorAll('.variant').forEach(function (el) {
      el.hidden = el.getAttribute('data-variant') !== v;
    });
    document.getElementById('vlabel').textContent = LABELS[v];
  }
  function go(v) {
    var u = new URLSearchParams(location.search);
    u.set('variant', v);
    // reload-stable: update the URL then re-show (no full reload needed)
    history.replaceState(null, '', location.pathname + '?' + u.toString());
    show(v);
  }
  function step(delta) {
    var i = VARIANTS.indexOf(currentVariant());
    go(VARIANTS[(i + delta + VARIANTS.length) % VARIANTS.length]);
  }
  document.getElementById('prev').addEventListener('click', function () { step(-1); });
  document.getElementById('next').addEventListener('click', function () { step(1); });
  document.addEventListener('keydown', function (e) {
    var t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (e.key === 'ArrowLeft') { step(-1); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { step(1); e.preventDefault(); }
  });
  show(currentVariant());
</script>
</body>
</html>`;

  return { html, checks };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ----------------------------------------------------------------------------
const { html, checks } = build();
const outPath = join(REPO, 'prototype-staffed-desk.html');
writeFileSync(outPath, html, 'utf8');

// eslint-disable-next-line no-console
console.log(`\nPROTOTYPE — THROWAWAY. Wrote ${outPath}`);
// eslint-disable-next-line no-console
console.log('Variant C mechanical self-checks:');
let allPass = true;
for (const c of checks) {
  allPass = allPass && c.pass;
  // eslint-disable-next-line no-console
  console.log(`  [${c.pass ? 'PASS' : 'FAIL'}] ${c.name} — ${c.detail}`);
}
// eslint-disable-next-line no-console
console.log(allPass ? '\nAll Variant C mechanical checks PASSED.' : '\nSOME Variant C checks FAILED (see above).');
