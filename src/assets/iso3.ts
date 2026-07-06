// iso3 — world-space authoring layer.
//
// PROBLEM THIS SOLVES
// -------------------
// The hand-authored assets in symbols/*.ts declare geometry directly in
// PROJECTED SCREEN PIXELS (e.g. `const deskH = 13; slabTop(0.15, 0.42, 1.7, ...)`).
// Screen-pixel maths mixes the ground-plane tile grid, the vertical rise, and
// the 2:1 projection in one's head, so real-world proportions drift silently
// between assets. iso3 lets you author a solid in WORLD coordinates —
//   x, y : tile units on the ground plane (same axes as `project`)
//   z    : height in tile-equivalent WORLD units (see VERTICAL SCALE below)
// — and projects the visible faces mechanically through the SAME low-level
// primitives (so output stays inside the style-contract SVG dialect).
//
// COORDINATE SYSTEM
// -----------------
// Ground: identical to primitives.project — screen = ((x−y)·32, (x+y)·16).
// Origin (0,0,0) = projected north vertex of footprint tile (0,0), matching
// every existing asset. Height rises in −y (screen up), z world-units × VZ px.
//
// SCALE ANCHORS (derivation — see docs/REPLICATING_REFERENCES.md)
// ---------------------------------------------------------------
// Two INDEPENDENT anchors are used because a 2:1 iso ground plane is
// foreshortened and cannot share one linear mm scale with the un-foreshortened
// vertical without making furniture tiles absurdly large (a known, documented
// tension — reference art in true 30° iso will not pixel-match this engine).
//
//  1. GROUND (mm per tile): anchored on the desk footprint. The single desk is
//     a 2×1-tile asset representing a ~1400×700 mm desktop ⇒ 1 tile ≈ 700 mm on
//     the ground plane. MM_PER_TILE = 700.
//
//  2. VERTICAL (mm per screen-px of rise): anchored anthropometrically on the
//     standing figurine — style contract fixes it at ~46 px for a ~1750 mm
//     adult ⇒ MM_PER_PX_Z = 1750 / 46 ≈ 38.04 mm/px.
//     Consequence, documented per the task: the style contract's 28-px storey
//     therefore represents 28 × 38.04 ≈ 1065 mm of world height. That is
//     deliberately SHORT for a real 2.8–3.0 m storey — the engine's storey is a
//     stylised line-art unit, not a literal mm height. We keep STOREY_H as the
//     canonical building unit and only use MM_PER_PX_Z for object-scale props
//     (desks, monitors, mugs) authored from real mm dimensions.
//
// Everything emits through primitives.ts, so faces obey the allowed-element and
// stroke rules automatically.

import { project, polygon, line, type Pt, type FaceOpts } from './primitives.ts';
import { INK, PAPER, STROKE, STROKE_THIN } from './style.ts';

// --- scale constants -----------------------------------------------------

/** Ground-plane scale: millimetres represented by one tile edge. Anchored on
 *  the 2×1-tile single desk ≈ 1400 mm wide ⇒ 700 mm per tile. */
export const MM_PER_TILE = 700;

/** Vertical scale: millimetres of world height per screen pixel of rise.
 *  Anchored on the ~46 px / ~1750 mm standing figurine. */
export const MM_PER_PX_Z = 1750 / 46; // ≈ 38.04

/** Screen pixels of rise per WORLD Z unit. One world Z unit == one tile edge in
 *  mm (MM_PER_TILE), so the height axis reads in the SAME "tile" unit as x/y:
 *  z = 1 is "one tile tall". Converting: (MM_PER_TILE mm) / (MM_PER_PX_Z mm/px). */
export const VZ = MM_PER_TILE / MM_PER_PX_Z; // ≈ 18.4 px per world-z unit

// --- conversion helpers --------------------------------------------------

/** Convert a real-world millimetre length to ground tile units. */
export function mm(lengthMm: number): number {
  return lengthMm / MM_PER_TILE;
}

/** Convert a real-world millimetre HEIGHT to world z units (tile-equivalent). */
export function mmZ(heightMm: number): number {
  return heightMm / MM_PER_TILE;
}

/**
 * Project a world point (x,y on the ground, z up) to a screen point.
 * z is in world tile-units; VZ maps it to screen px of −y rise.
 */
export function projectWorld(x: number, y: number, z: number): Pt {
  const g = project(x, y);
  return { x: g.x, y: g.y - z * VZ };
}

// --- orientation ---------------------------------------------------------

/**
 * Rotate a world (x,y) about the centre of a wxd footprint by `o` clockwise
 * quarter-turns, keeping the footprint inside [0,w]×[0,d] on even turns and
 * [0,d]×[0,w] on odd turns (matches the true-redraw convention used by
 * deskReception / parametric assets, NOT a screen mirror). z is unaffected.
 *
 * NB the footprint bounds swap on odd turns; callers author for o=0 and this
 * remaps every coordinate so the silhouette truly redraws per facing.
 */
export function orientWorld(x: number, y: number, o: number, fw: number, fd: number): Pt {
  let px = x;
  let py = y;
  let w = fw;
  let d = fd;
  for (let k = 0; k < ((o % 4) + 4) % 4; k++) {
    // clockwise quarter-turn within [0,w]×[0,d] → new footprint [0,d]×[0,w]
    const nx = d - py;
    const ny = px;
    px = nx;
    py = ny;
    const tmp = w;
    w = d;
    d = tmp;
  }
  return { x: px, y: py };
}

// --- box ------------------------------------------------------------------

export interface BoxOpts extends FaceOpts {
  /** Draw only the top face (used to stack a thin cap without re-drawing sides). */
  topOnly?: boolean;
}

/**
 * A world-space solid box. Footprint w (along +x) × d (along +y) at ground
 * position (x,y), height h in world z-units, its base at z (default 0).
 *
 * Renders the THREE faces visible from the fixed 2:1 camera, back-to-front so
 * opaque PAPER fills occlude correctly WITHIN the box:
 *   left  (SW face) → right (SE face) → top.
 * Outline strokes follow the house style (STROKE primary; interior detail is
 * the caller's business). Matches primitives.isoBox exactly but authored from
 * world coords with an explicit base height and fill/stroke opts.
 *
 * Corner naming (ground, at base z): N=(x,y) E=(x+w,y) S=(x+w,y+d) W=(x,y+d).
 */
export function box(
  x: number,
  y: number,
  z: number,
  w: number,
  d: number,
  h: number,
  opts: BoxOpts = {}
): string {
  const fill = opts.fill ?? PAPER;
  const stroke = opts.stroke ?? INK;
  const sw = opts.strokeWidth ?? STROKE;

  const zBot = z;
  const zTop = z + h;

  // (north-bottom corner gN is never a visible-face vertex, so it is omitted)
  const gE = projectWorld(x + w, y, zBot);
  const gS = projectWorld(x + w, y + d, zBot);
  const gW = projectWorld(x, y + d, zBot);
  const tN = projectWorld(x, y, zTop);
  const tE = projectWorld(x + w, y, zTop);
  const tS = projectWorld(x + w, y + d, zTop);
  const tW = projectWorld(x, y + d, zTop);

  const faces: string[] = [];
  if (!opts.topOnly) {
    // Left face (SW): visible west/left side.  W→S on the ground, up to top.
    faces.push(polygon([gW, gS, tS, tW], { fill, stroke, strokeWidth: sw }));
    // Right face (SE): visible east/right side. S→E on the ground, up to top.
    faces.push(polygon([gS, gE, tE, tS], { fill, stroke, strokeWidth: sw }));
  }
  // Top face — drawn last (nearest the viewer at the apex).
  faces.push(polygon([tN, tE, tS, tW], { fill, stroke, strokeWidth: sw }));
  return faces.join('');
}

/**
 * A thin box convenience — a slab of world-thickness `th` (z-units) sitting
 * with its BOTTOM at height z. Same three visible faces as box(); use for
 * worktops, keyboards, screens laid flat, etc.
 */
export function slab(
  x: number,
  y: number,
  z: number,
  w: number,
  d: number,
  th: number,
  opts: BoxOpts = {}
): string {
  return box(x, y, z, w, d, th, opts);
}

// --- open laptop ----------------------------------------------------------

export interface LaptopOpts {
  /** Screen tilt: fraction of the screen's rise that leans back over +y (0..1). */
  lean?: number;
}

/**
 * An open laptop: a thin base slab (keyboard deck) of footprint w×d at height z,
 * plus a hinged screen slab rising from the deck's FAR (north, +y-min) edge and
 * leaning back. Screen dimensions mirror the base (w wide, screenH tall).
 *
 * Expressed only through box/slab + one hinge line, so it stays in-dialect.
 * The hinge runs along the base's north edge y=y (from x to x+w). The screen is
 * drawn as a near-vertical quad standing on that edge, tilted back by `lean`.
 */
export function laptop(
  x: number,
  y: number,
  z: number,
  w: number,
  d: number,
  screenH: number,
  opts: LaptopOpts = {}
): string {
  const lean = opts.lean ?? 0.25;
  const deckTh = mmZ(20); // ~20mm keyboard deck
  const frags: string[] = [];

  // keyboard deck
  frags.push(slab(x, y, z, w, d, deckTh, { strokeWidth: STROKE_THIN }));

  // hinge line along the north edge at deck top
  const zDeck = z + deckTh;
  const hL = projectWorld(x, y, zDeck);
  const hR = projectWorld(x + w, y, zDeck);
  frags.push(line(hL, hR, STROKE_THIN, INK));

  // screen: stands on the hinge edge, leans back over +y (screen goes up in z
  // and back a little in +y). Top edge is offset back by lean·screenH in y.
  const yBack = y + lean * screenH;
  const zTop = zDeck + screenH;
  const bL = projectWorld(x, y, zDeck);
  const bR = projectWorld(x + w, y, zDeck);
  const tR = projectWorld(x + w, yBack, zTop);
  const tL = projectWorld(x, yBack, zTop);
  frags.push(polygon([bL, bR, tR, tL], { fill: PAPER, stroke: INK, strokeWidth: STROKE }));
  // inset screen glass
  const inset = 0.06;
  const iBL = lerp(bL, tL, 0.14);
  const iBR = lerp(bR, tR, 0.14);
  const iTL = lerp(tL, bL, 0.14);
  const iTR = lerp(tR, bR, 0.14);
  const gBL = lerp(iBL, iBR, inset);
  const gBR = lerp(iBR, iBL, inset);
  const gTL = lerp(iTL, iTR, inset);
  const gTR = lerp(iTR, iTL, inset);
  frags.push(polygon([gBL, gBR, gTR, gTL], { fill: PAPER, stroke: INK, strokeWidth: STROKE_THIN }));
  return frags.join('');
}

// --- tiny shared helper (kept local; primitives has no lerp export) -------
function lerp(a: Pt, b: Pt, t: number): Pt {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}
