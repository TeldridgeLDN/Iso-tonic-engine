// Pilot rebuild of two desks authored in WORLD units via iso3 (not screen-pixel
// maths). A shared double-pedestal desk base + two different desktop dress-ups:
//   deskLaptopV2      — open laptop, mug, potted plant
//   deskWorkstationV2 — monitor on a stand, keyboard, mouse, potted plant
//
// These are NEW assets; the hand-authored desk-single / desk-meeting are left
// untouched. Footprint 2×1 tiles (≈1400×700 mm) like the existing single desk.
//
// OCCLUSION (painter's order, back-to-front — we own occlusion inside an asset;
// the engine's sortForRender only orders BETWEEN assets):
//   1. pedestals (far, +y/left first; near, right last)
//   2. worktop slab (overhangs, drawn after pedestals so its front edge reads)
//   3. desktop items, far/back (small y) → near/front (large y), and the
//      right-rear plant early since it sits at the back.
//
// Corner convention (ground): N=(0,0) E=(w,0) S=(w,d) W=(0,d). Viewer is to the
// SOUTH, so "front" = the S edge, "right rear" = near the E corner (x≈w, y≈0).

import { box, slab, laptop, mm, mmZ, projectWorld } from '../iso3.ts';
import {
  isoDiamond,
  polygon,
  polyline,
  line,
  group,
  mirrorX,
  bboxCentreX,
  readOrientation,
  type Pt,
} from '../primitives.ts';
import { INK, PAPER, STROKE, STROKE_THIN } from '../style.ts';

// --- world dimensions (mm), shared -----------------------------------------
const TOP_W_MM = 1400; // desktop width  (along +x) → 2 tiles
const TOP_D_MM = 700; //  desktop depth  (along +y) → 1 tile
const TOP_H_MM = 740; //  worktop top height
const TOP_TH_MM = 30; //  worktop thickness
const PED_W_MM = 400; //  pedestal width
const PED_D_MM = 560; //  pedestal depth (inset from the 700mm top)
const OVERHANG_MM = 40; // top overhang past the pedestal on the front/ends

// world-unit conversions
const topW = mm(TOP_W_MM); // 2
const topD = mm(TOP_D_MM); // 1
const topZ = mmZ(TOP_H_MM); // worktop TOP height
const topTh = mmZ(TOP_TH_MM);
const pedW = mm(PED_W_MM);
const pedD = mm(PED_D_MM);
const overhang = mm(OVERHANG_MM);

// pedestal height = up to the underside of the worktop
const pedH = topZ - topTh;

// ---------------------------------------------------------------------------
// One 3-drawer pedestal at ground (x,y), width pedW × depth pedD, height pedH.
// Draws the box then three drawer-front seams + handle marks on its visible
// FRONT (SW/left, south-facing) face — the same face as the desk knee-hole, so
// the drawers face the seated user like a real double-pedestal desk. Handles
// are short ink dashes centred on each drawer.
//
// Face geometry (see iso3.box corners N=(x,y) E=(x+w,y) S=(x+w,y+d) W=(x,y+d)):
//   The SW/left face is the plane at constant y = y+pedD spanning W→S. A line of
//   fixed height on it varies x, giving screen slope +0.5 (the long front-face
//   plane). The SE/right face (constant x) would give slope −0.5 — that is the
//   short END face and was the previous, wrong, placement (drawers read 90°
//   anticlockwise). We param along the FRONT face:
//     u ∈ [0,1] from W (x) to S (x+pedW) at fixed y = y+pedD; v = height fraction.
// ---------------------------------------------------------------------------
function pedestal(x: number, y: number): string {
  const frags: string[] = [];
  frags.push(box(x, y, 0, pedW, pedD, pedH, { strokeWidth: STROKE }));

  const faceY = y + pedD;
  const onFace = (u: number, vFrac: number): Pt =>
    projectWorld(x + pedW * u, faceY, vFrac * pedH);
  for (let i = 0; i < 3; i++) {
    const vTop = (i + 1) / 3;
    // horizontal seam across the face at this drawer's top
    frags.push(line(onFace(0.06, vTop), onFace(0.94, vTop), STROKE_THIN, INK));
    // handle: short vertical-ish dash centred in the drawer
    const vMid = (i + 0.5) / 3;
    frags.push(line(onFace(0.42, vMid), onFace(0.58, vMid), STROKE, INK));
  }
  return frags.join('');
}

// ---------------------------------------------------------------------------
// Shared double-pedestal desk base. Pedestals at each end, overhanging worktop.
// Returns fragments in painter order (far pedestal → near pedestal → worktop).
// ---------------------------------------------------------------------------
function deskBase(): string[] {
  const frags: string[] = [];
  // pedestal depth centred within the 700mm top depth; inset from front & back
  const pedY = (topD - pedD) / 2;
  // LEFT pedestal (west end, x≈0) is farther in screen depth than the RIGHT
  // (east end) because larger x is nearer. Draw left/far first.
  const leftX = overhang;
  const rightX = topW - overhang - pedW;
  // far first: the one with the smaller (x+ ...) far-corner reads deeper. The
  // right pedestal has larger x so it's nearer → draw LEFT first, RIGHT second.
  frags.push(pedestal(leftX, pedY));
  frags.push(pedestal(rightX, pedY));
  // worktop: full footprint, overhangs the pedestals on all sides.
  frags.push(slab(0, 0, topZ - topTh, topW, topD, topTh, { strokeWidth: STROKE }));
  return frags;
}

// --- desktop-item helpers (small solids sitting on the worktop) -------------

/** A short cylinder (mug / pot) approximated by two ellipse rims + body edges.
 *  Centred on world (cx,cy) standing on the worktop, radius r (tiles), height h
 *  (world-z). Kept in-dialect: ellipses drawn as <path> arcs via polygon-free
 *  primitives is overkill here, so we use a simple iso oval built from a polygon
 *  ring is not smooth — instead reuse the project maths for top/bottom rims. */
function cylinder(cx: number, cy: number, r: number, h: number): string {
  const frags: string[] = [];
  const zTop = topZ + h;
  const zBot = topZ;
  // rim ellipse radii in screen px: rx along screen-x, ry foreshortened.
  const c0 = projectWorld(cx, cy, zBot);
  const cT = projectWorld(cx, cy, zTop);
  const rx = r * 32; // tile→px half-width along screen x (project scales x by 32)
  const ry = r * 16; // foreshortened vertical radius on the ground plane
  const oval = (cxp: number, cyp: number): string =>
    `<path d="M ${cxp - rx} ${cyp} A ${rx} ${ry} 0 0 0 ${cxp + rx} ${cyp} ` +
    `A ${rx} ${ry} 0 0 0 ${cxp - rx} ${cyp} Z" fill="${PAPER}" stroke="${INK}" stroke-width="${STROKE_THIN}" stroke-linejoin="round"/>`;
  // body side edges
  frags.push(line({ x: c0.x - rx, y: c0.y }, { x: cT.x - rx, y: cT.y }, STROKE_THIN, INK));
  frags.push(line({ x: c0.x + rx, y: c0.y }, { x: cT.x + rx, y: cT.y }, STROKE_THIN, INK));
  frags.push(oval(cT.x, cT.y)); // top rim (drawn last-ish so it caps)
  return frags.join('');
}

/** Mug = a small cylinder + a handle arc on its right side. */
function mug(cx: number, cy: number): string {
  const r = mm(45); // ~90mm dia
  const h = mmZ(95);
  const frags: string[] = [cylinder(cx, cy, r, h)];
  const mid = projectWorld(cx, cy, topZ + h * 0.5);
  const rx = r * 32;
  frags.push(
    `<path d="M ${mid.x + rx} ${mid.y - 3} q 6 3 0 8" fill="none" stroke="${INK}" stroke-width="${STROKE_THIN}" stroke-linecap="round"/>`
  );
  return frags.join('');
}

/** Potted plant = a pot cylinder + a few leaf strokes rising from its top. */
function pottedPlant(cx: number, cy: number): string {
  const r = mm(70);
  const potH = mmZ(150);
  const frags: string[] = [cylinder(cx, cy, r, potH)];
  const top = projectWorld(cx, cy, topZ + potH);
  // a few leaf strokes fanning up from the pot rim
  const leaves: Array<[number, number]> = [
    [-7, -20], [-3, -26], [2, -27], [6, -22], [0, -30],
  ];
  for (const [dx, dy] of leaves) {
    frags.push(
      polyline([{ x: top.x, y: top.y }, { x: top.x + dx * 0.5, y: top.y + dy * 0.5 }, { x: top.x + dx, y: top.y + dy }], STROKE_THIN, INK)
    );
  }
  return frags.join('');
}

// ---------------------------------------------------------------------------
// orientation wrapper — matches desks.ts: keep the ground diamond upright,
// mirror the body about its own bbox centre for facings 1|3.
// ---------------------------------------------------------------------------
function orient(params: Record<string, unknown> | undefined, body: string[]): string {
  const ground = isoDiamond(2, 1);
  const o = readOrientation(params);
  if (o === 1 || o === 3) {
    const joined = body.join('');
    return group(0, 0, [ground, mirrorX([joined], bboxCentreX(joined))]);
  }
  return group(0, 0, [ground, ...body]);
}

// Common item anchors on the worktop (world coords). Front = large y.
// Right-rear plant sits near the E corner (x≈w, y small).
const PLANT = { x: topW - mm(180), y: mm(120) };

// ===========================================================================
// deskLaptopV2 — open laptop centre, mug to its left, plant right-rear.
// ===========================================================================
export function deskLaptopV2(params?: Record<string, unknown>): string {
  const body = deskBase();

  // plant first (back / right-rear)
  body.push(pottedPlant(PLANT.x, PLANT.y));

  // laptop, centred, slightly toward the front. base ~330×230mm, screen ~230mm.
  const lw = mm(330);
  const ld = mm(230);
  const lx = topW / 2 - lw / 2;
  const ly = topD / 2 - ld / 2 + mm(40);
  body.push(laptop(lx, ly, topZ, lw, ld, mmZ(230), { lean: 0.28 }));

  // mug to the LEFT of the laptop (smaller x), roughly same depth band.
  body.push(mug(lx - mm(140), ly + ld * 0.5));

  return orient(params, body);
}

// ===========================================================================
// deskWorkstationV2 — monitor on a stand (rear-centre), keyboard in front,
// mouse right of the keyboard, plant right-rear.
// ===========================================================================
export function deskWorkstationV2(params?: Record<string, unknown>): string {
  const body = deskBase();

  // plant (right-rear)
  body.push(pottedPlant(PLANT.x, PLANT.y));

  // monitor: a thin upright slab (~600mm wide, ~360mm tall) on a small foot,
  // set toward the rear-centre so the keyboard sits in front of it.
  const monW = mm(600);
  const monX = topW / 2 - monW / 2;
  const monY = mm(120); // rear band
  // foot: a small slab under the stand
  body.push(slab(monX + monW / 2 - mm(80), monY, topZ, mm(160), mm(120), mmZ(20), { strokeWidth: STROKE_THIN }));
  // stand upright (thin box)
  body.push(box(monX + monW / 2 - mm(30), monY + mm(40), topZ + mmZ(20), mm(60), mm(40), mmZ(120), { strokeWidth: STROKE_THIN }));
  // panel: a thin upright slab standing on the stand top, facing the viewer.
  const panelZ = topZ + mmZ(140);
  const panelTh = mm(40);
  body.push(box(monX, monY + mm(20), panelZ, monW, panelTh, mmZ(360), { strokeWidth: STROKE }));
  // screen inset on the front (SE) face of the panel
  {
    const faceY = monY + mm(20) + panelTh;
    const on = (uFrac: number, vFrac: number): Pt =>
      projectWorld(monX + monW * uFrac, faceY, panelZ + vFrac * mmZ(360));
    body.push(
      polygon(
        [on(0.08, 0.12), on(0.92, 0.12), on(0.92, 0.88), on(0.08, 0.88)],
        { fill: PAPER, stroke: INK, strokeWidth: STROKE_THIN }
      )
    );
  }

  // keyboard: a very thin slab in front of the monitor (~440×140mm).
  const kbW = mm(440);
  body.push(slab(topW / 2 - kbW / 2, mm(430), topZ, kbW, mm(140), mmZ(20), { strokeWidth: STROKE_THIN }));

  // mouse: a tiny slab to the RIGHT of the keyboard.
  body.push(slab(topW / 2 + kbW / 2 + mm(40), mm(470), topZ, mm(70), mm(110), mmZ(25), { strokeWidth: STROKE_THIN }));

  return orient(params, body);
}
