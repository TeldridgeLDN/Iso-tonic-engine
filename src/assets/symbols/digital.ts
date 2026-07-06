// Digital infrastructure symbols. Footprint-anchored (grid) assets.
// Local origin = north vertex of footprint tile (0,0).

import { project, isoBox, isoDiamond, polygon, polyline, line, group, mirrorX, bboxCentreX, readOrientation, type Pt } from '../primitives.ts';
import { INK, PAPER, STROKE, STROKE_THIN } from '../style.ts';

// helper: point on top face of a box at tile (tx,ty), raised `h` px
function topPt(tx: number, ty: number, h: number): Pt {
  const g = project(tx, ty);
  return { x: g.x, y: g.y - h };
}

// lift a screen point straight up (−y) by v px
function up(p: Pt, v: number): Pt {
  return { x: p.x, y: p.y - v };
}

// linear interpolate between two screen points
function lerp(a: Pt, b: Pt, t: number): Pt {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** ground diamond kept upright; body mirrors about its own bbox centre for 1|3. No text in these assets. */
function orient(params: Record<string, unknown> | undefined, _w: number, _d: number, ground: string, body: string[]): string {
  const o = readOrientation(params);
  if (o === 1 || o === 3) {
    const joined = body.join('');
    return group(0, 0, [ground, mirrorX([joined], bboxCentreX(joined))]);
  }
  return group(0, 0, [ground, ...body]);
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

// ========================================================================
// desktop-workstation — iMac-style ALL-IN-ONE + low keyboard in front, 1×1
// Big screen with bezel, a "chin" below the screen, a small trapezoid foot
// stand, plus a separate low keyboard with a key grid. No tower.
// Matches ref-workstation2. White fills, ink outline.
// ========================================================================
export function desktopWorkstation(params?: Record<string, unknown>): string {
  const frags: string[] = [];

  // --- KEYBOARD: low slab in front (south), drawn first (furthest back in
  //     painter order is fine — it sits lower/nearer but the AIO is behind it)
  const kN = project(0.20, 0.50);
  const kE = project(0.72, 0.60);
  const kS = project(0.60, 0.92);
  const kW = project(0.08, 0.82);
  frags.push(polygon([kN, kE, kS, kW], { fill: PAPER, strokeWidth: STROKE_THIN }));
  // key-grid hint: rows + cols of thin strokes
  for (let r = 1; r <= 4; r++) {
    const t = r / 5;
    frags.push(line(lerp(kN, kW, t), lerp(kE, kS, t), 0.4, INK));
  }
  for (let c = 1; c <= 3; c++) {
    const t = c / 4;
    frags.push(line(lerp(kN, kE, t), lerp(kW, kS, t), 0.4, INK));
  }

  // --- ALL-IN-ONE display standing near the back (north) edge -------------
  // Foot line of the panel runs along +x; panel rises vertically.
  const a = project(0.20, 0.22); // left base
  const b = project(0.90, 0.22); // right base
  const standH = 5;    // little foot stand height
  const chinH = 5;     // body chin below the screen
  const screenH = 20;  // screen area height
  const bezel = 2;

  // trapezoid foot stand under the panel centre
  const fc = lerp(a, b, 0.5);
  frags.push(polygon(
    [
      { x: fc.x - 6, y: fc.y + 2 },
      { x: fc.x + 6, y: fc.y + 2 },
      { x: fc.x + 3.5, y: fc.y - standH },
      { x: fc.x - 3.5, y: fc.y - standH },
    ],
    { fill: PAPER, strokeWidth: STROKE_THIN }
  ));

  // panel body raised on the stand
  const bl = up(a, standH);
  const br = up(b, standH);
  const totalH = chinH + screenH;
  const tl = up(bl, totalH);
  const tr = up(br, totalH);
  // outer body (bezel + chin) — heavy silhouette
  frags.push(polygon([bl, br, tr, tl], { fill: PAPER, strokeWidth: STROKE }));
  // screen area (white, inset by bezel top/sides, chin at bottom)
  const sbl = up(lerp(bl, br, 0.05), chinH);
  const sbr = up(lerp(bl, br, 0.95), chinH);
  const stl = up(lerp(tl, tr, 0.05), -bezel);
  const str = up(lerp(tl, tr, 0.95), -bezel);
  frags.push(polygon([sbl, sbr, str, stl], { fill: PAPER, strokeWidth: STROKE_THIN }));
  // chin divider line + a tiny logo dot centred on the chin
  frags.push(line(sbl, sbr, 0.6, INK));
  const chinC = lerp(up(lerp(bl, br, 0.5), chinH * 0.45), up(lerp(bl, br, 0.5), chinH * 0.45), 0);
  frags.push(polygon(
    [
      { x: chinC.x - 0.8, y: chinC.y },
      { x: chinC.x + 0.8, y: chinC.y },
      { x: chinC.x + 0.8, y: chinC.y + 1.6 },
      { x: chinC.x - 0.8, y: chinC.y + 1.6 },
    ],
    { fill: PAPER, strokeWidth: 0.4 }
  ));

  return orient(params, 1, 1, isoDiamond(1, 1), frags);
}

// ========================================================================
// laptop-desk — OPEN laptop hero on a slim desk slab, 1×1
// Screen raised at the back (north) hinge; keyboard deck sloping to viewer
// with a fine key grid + trackpad. Matches ref-laptop.
// ========================================================================
export function laptopDesk(params?: Record<string, unknown>): string {
  const frags: string[] = [];

  // slim low desk slab so the tile reads as a workplace
  const deskH = 4;
  frags.push(isoBox(0.98, 0.72, deskH));

  const T = (tx: number, ty: number): Pt => topPt(tx, ty, deskH);

  // --- BASE (keyboard deck): a flat parallelogram on the desk top ---------
  // Hinge runs along the back (north-west to north-east). Corners:
  const hL = T(0.16, 0.30); // hinge left (back-left)
  const hR = T(0.62, 0.16); // hinge right (back-right)
  const fR = T(0.90, 0.56); // front-right (near viewer)
  const fL = T(0.44, 0.70); // front-left (near viewer)
  // base slab thickness
  const baseTh = 3;
  // base top face
  frags.push(polygon([hL, hR, fR, fL], { fill: PAPER, strokeWidth: STROKE }));
  // base front edge (thickness) — the two viewer-facing side faces
  frags.push(polygon([fL, fR, up(fR, -baseTh), up(fL, -baseTh)], { fill: PAPER, strokeWidth: STROKE }));
  frags.push(polygon([hL, fL, up(fL, -baseTh), up(hL, -baseTh)], { fill: PAPER, strokeWidth: STROKE }));

  // --- KEY GRID on the deck ----------------------------------------------
  // inset the key area from base edges
  const kHL = lerp(lerp(hL, fL, 0.12), lerp(hR, fR, 0.12), 0.10);
  const kHR = lerp(lerp(hL, fL, 0.12), lerp(hR, fR, 0.12), 0.86);
  const kFL = lerp(lerp(hL, fL, 0.62), lerp(hR, fR, 0.62), 0.10);
  const kFR = lerp(lerp(hL, fL, 0.62), lerp(hR, fR, 0.62), 0.86);
  // grid lines along both axes (thin)
  const nCols = 7, nRows = 4;
  for (let c = 1; c < nCols; c++) {
    const t = c / nCols;
    frags.push(line(lerp(kHL, kHR, t), lerp(kFL, kFR, t), 0.45, INK));
  }
  for (let r = 1; r < nRows; r++) {
    const t = r / nRows;
    frags.push(line(lerp(kHL, kFL, t), lerp(kHR, kFR, t), 0.45, INK));
  }
  // key-area outline
  frags.push(polygon([kHL, kHR, kFR, kFL], { fill: 'none', stroke: INK, strokeWidth: 0.5 }));

  // --- TRACKPAD: small rectangle near the front centre -------------------
  const tpN = lerp(lerp(hL, fL, 0.70), lerp(hR, fR, 0.70), 0.36);
  const tpE = lerp(lerp(hL, fL, 0.70), lerp(hR, fR, 0.70), 0.62);
  const tpS = lerp(lerp(hL, fL, 0.90), lerp(hR, fR, 0.90), 0.62);
  const tpW = lerp(lerp(hL, fL, 0.90), lerp(hR, fR, 0.90), 0.36);
  frags.push(polygon([tpN, tpE, tpS, tpW], { fill: 'none', stroke: INK, strokeWidth: 0.5 }));

  // --- SCREEN: raised panel hinged along hL→hR, tilting back (up + north) -
  const screenH = 22;      // vertical rise
  const backLean = 5;      // how far the top leans toward the back (north-ish)
  // top corners: rise vertically and shift toward the back (screen-up +north)
  // north direction on screen ≈ toward −y and toward hinge; we lean by moving
  // the top edge up and slightly back-left in screen space.
  const leanVec = { x: -backLean * 0.4, y: -backLean * 0.9 };
  const sTL = { x: hL.x + leanVec.x, y: hL.y - screenH + leanVec.y };
  const sTR = { x: hR.x + leanVec.x, y: hR.y - screenH + leanVec.y };
  // screen outer panel (lid) — white fill, heavy outline
  frags.push(polygon([hL, hR, sTR, sTL], { fill: PAPER, strokeWidth: STROKE }));
  // inner display area (bezel inset), white
  const dBL = lerp(lerp(hL, sTL, 0.10), lerp(hR, sTR, 0.10), 0.08);
  const dBR = lerp(lerp(hL, sTL, 0.10), lerp(hR, sTR, 0.10), 0.92);
  const dTL = lerp(lerp(hL, sTL, 0.90), lerp(hR, sTR, 0.90), 0.08);
  const dTR = lerp(lerp(hL, sTL, 0.90), lerp(hR, sTR, 0.90), 0.92);
  frags.push(polygon([dBL, dBR, dTR, dTL], { fill: PAPER, strokeWidth: STROKE_THIN }));

  return orient(params, 1, 1, isoDiamond(1, 1), frags);
}

// ========================================================================
// wall-screen — large thin flat-panel TV on two splayed feet, 2×1
// Matches ref-tv: thin panel + big white screen + two little splayed legs.
// ========================================================================
export function wallScreen(params?: Record<string, unknown>): string {
  const frags: string[] = [];

  // The panel stands on the far (north) edge, spanning +x (2 tiles wide).
  // Foot line along the back of the footprint.
  const a = project(0.15, 0.25); // left base of panel
  const b = project(1.85, 0.25); // right base of panel
  const panelH = 30;
  const footRise = 6; // panel bottom sits this high on its legs

  // --- SPLAYED FEET: two short angled struts under the panel --------------
  // Each foot is a slim strut splaying down-and-out from the panel base,
  // like the two feet in the reference TV. Drawn as thin quadrilaterals.
  const flC = lerp(a, b, 0.20);
  const frC = lerp(a, b, 0.80);
  const footLen = 7, footSpread = 5, footW = 1.6;
  for (const c of [flC, frC]) {
    // left-splaying leg and right-splaying leg from a shared top at c
    for (const dir of [-1, 1]) {
      const top = { x: c.x, y: c.y - footRise + 1 };
      const toe = { x: c.x + dir * footSpread, y: c.y + footLen - footRise + 1 };
      frags.push(polygon(
        [
          { x: top.x - footW, y: top.y },
          { x: top.x + footW, y: top.y },
          { x: toe.x + footW, y: toe.y },
          { x: toe.x - footW, y: toe.y },
        ],
        { fill: PAPER, strokeWidth: STROKE_THIN }
      ));
    }
  }

  // --- PANEL: thin flat rectangle raised on the feet ----------------------
  const pbL = up(a, footRise);
  const pbR = up(b, footRise);
  const ptL = up(pbL, panelH);
  const ptR = up(pbR, panelH);
  // panel outer (thin bezel) — heavy outline
  frags.push(polygon([pbL, pbR, ptR, ptL], { fill: PAPER, strokeWidth: STROKE }));
  // big inner screen face, thin-bezel inset
  const bz = 2.5;
  const sbL = up(lerp(pbL, pbR, 0.035), bz);
  const sbR = up(lerp(pbL, pbR, 0.965), bz);
  const stL = up(lerp(ptL, ptR, 0.035), -bz);
  const stR = up(lerp(ptL, ptR, 0.965), -bz);
  frags.push(polygon([sbL, sbR, stR, stL], { fill: PAPER, strokeWidth: STROKE_THIN }));

  return orient(params, 2, 1, isoDiamond(2, 1), frags);
}

// ========================================================================
// telephone (formerly phone-kiosk) — iso desk landline, 1×1
// Wedge body, handset resting on the left with earpiece/mouthpiece bulges,
// keypad grid on the sloped top, small display, short curly cord.
// Matches ref-phone.
// ========================================================================
export function telephone(params?: Record<string, unknown>): string {
  const frags: string[] = [];

  const bodyH = 6;   // back height of the wedge
  const frontH = 3;  // front (south) height — wedge slopes down to the viewer

  // footprint corners of the phone body (inset within the tile)
  const bN = project(0.12, 0.16); // back (north)
  const bE = project(0.88, 0.16); // east
  const bS = project(0.88, 0.88); // south-east
  const bW = project(0.12, 0.88); // south-west
  // top corners: back edge high (bodyH), front edge low (frontH) → sloped top
  const tN = up(bN, bodyH);
  const tE = up(bE, bodyH);       // back-right stays high
  const tS = up(bS, frontH);
  const tW = up(bW, frontH);

  // --- BODY faces back-to-front -------------------------------------------
  // left (SW) face: bW→bS ground, up to tS,tW  (this is the front-left slope side)
  frags.push(polygon([bW, bS, tS, tW], { fill: PAPER, strokeWidth: STROKE }));
  // right (SE) face: bS→bE ground, up to tE,tS
  frags.push(polygon([bS, bE, tE, tS], { fill: PAPER, strokeWidth: STROKE }));
  // sloped top face
  frags.push(polygon([tN, tE, tS, tW], { fill: PAPER, strokeWidth: STROKE }));

  // top-face basis helpers: bilinear over (u along N→...E? we build from corners)
  // parametrise top face by (u: W→E across, v: back→front). Use corners:
  // tN..tE is back edge; tW..tS is front edge.
  const topAt = (u: number, v: number): Pt => {
    const back = lerp(tN, tE, u);
    const front = lerp(tW, tS, u);
    return lerp(back, front, v);
  };

  // --- KEYPAD: 3×4 grid of small keys on the right portion of the top -----
  const kU0 = 0.52, kU1 = 0.92, kV0 = 0.30, kV1 = 0.92;
  const cols = 3, rows = 4;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const u0 = kU0 + (kU1 - kU0) * (c / cols) + 0.015;
      const u1 = kU0 + (kU1 - kU0) * ((c + 1) / cols) - 0.015;
      const v0 = kV0 + (kV1 - kV0) * (r / rows) + 0.02;
      const v1 = kV0 + (kV1 - kV0) * ((r + 1) / rows) - 0.02;
      frags.push(polygon(
        [topAt(u0, v0), topAt(u1, v0), topAt(u1, v1), topAt(u0, v1)],
        { fill: PAPER, strokeWidth: 0.5 }
      ));
    }
  }

  // --- DISPLAY: small rectangle at the back-right of the top --------------
  frags.push(polygon(
    [topAt(0.5, 0.06), topAt(0.92, 0.06), topAt(0.92, 0.24), topAt(0.5, 0.24)],
    { fill: PAPER, strokeWidth: 0.6 }
  ));

  // --- HANDSET: a flat "bone" shape lying in a cradle on the left column ---
  // Built on the top-face plane (topAt) so it sits flat like the reference,
  // lifted a touch so it reads as resting above the deck. Centre axis runs
  // back→front along the left column (u≈0.24), widening at both ends.
  const hLift = 3;
  const HU = 0.26;              // handset centre column
  const hw = 0.10;             // half-width of the ear/mouth pads (in u units)
  const sw = 0.045;            // half-width of the slim shaft
  const P = (u: number, v: number): Pt => up(topAt(u, v), hLift);
  // clean symmetric "bone": rounded earpiece (back) + shaft + mouthpiece (front)
  frags.push(polygon([
    P(HU - hw, 0.14), P(HU, 0.10), P(HU + hw, 0.14),   // earpiece cap
    P(HU + sw, 0.28),                                   // neck in
    P(HU + sw, 0.68),                                   // shaft
    P(HU + hw, 0.82), P(HU, 0.86), P(HU - hw, 0.82),   // mouthpiece cap
    P(HU - sw, 0.68),                                   // neck
    P(HU - sw, 0.28),                                   // shaft back
  ], { fill: PAPER, strokeWidth: STROKE_THIN }));

  // --- CURLY CORD: tidy coil trailing off the front-left corner -----------
  // starts at the mouthpiece end, spirals down-left off the tile.
  const c0 = P(HU, 0.86);
  const cordPts: Pt[] = [c0];
  const seg = 26;
  const dropX = -15, dropY = 16; // overall travel down-left off the tile
  for (let i = 1; i <= seg; i++) {
    const t = i / seg;
    const bx = c0.x + dropX * t;
    const by = c0.y + dropY * t;
    const ang = t * 3 * Math.PI * 2; // 3 coils
    // iso-projected coil: wider on x, shallow on y, so loops read as a curl
    cordPts.push({ x: bx + (Math.cos(ang) - 1) * 3.2, y: by + Math.sin(ang) * 1.6 });
  }
  frags.push(polyline(cordPts, 0.8, INK));

  return orient(params, 1, 1, isoDiamond(1, 1), frags);
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
