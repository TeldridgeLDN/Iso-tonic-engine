// Vehicle symbols. Grid-anchored, footprint origin = north vertex of tile (0,0).

import { project, isoDiamond, polygon, line, circle, group, readOrientation, type Pt } from '../primitives.ts';
import { INK, PAPER, STROKE, STROKE_THIN } from '../style.ts';

/**
 * Is this facing the mirrored one? Vehicles keep the SAME iso box (mirroring a
 * 3-face box breaks its silhouette) and instead re-dress features to the far
 * end of the body — the cab/window band moves along the visible faces so it
 * reads as facing the opposite way, while the box stays exactly on the tile.
 */
function flipped(params?: Record<string, unknown>): boolean {
  const o = readOrientation(params);
  return o === 1 || o === 3;
}

function at(tx: number, ty: number, h: number): Pt {
  const g = project(tx, ty);
  return { x: g.x, y: g.y - h };
}

/** A simple iso body block with slanted top, given footprint and heights. */
function bodyBlock(w: number, d: number, floor: number, roof: number): string {
  const gE = at(w, 0, floor), gS = at(w, d, floor), gW = at(0, d, floor);
  const tN = at(0, 0, roof), tE = at(w, 0, roof), tS = at(w, d, roof), tW = at(0, d, roof);
  return [
    polygon([gW, gS, tS, tW], { fill: PAPER, strokeWidth: STROKE }),
    polygon([gS, gE, tE, tS], { fill: PAPER, strokeWidth: STROKE }),
    polygon([tN, tE, tS, tW], { fill: PAPER, strokeWidth: STROKE }),
  ].join('');
}

function wheel(tx: number, ty: number): string {
  const c = project(tx, ty);
  return circle({ x: c.x, y: c.y - 2 }, 2.4, { fill: PAPER, stroke: INK, strokeWidth: STROKE_THIN });
}

// --- van / panel van: 2×1, tall rounded box, cab windscreen, solid side ---
export function van(params?: Record<string, unknown>): string {
  const f = flipped(params);
  const flu = (u: number): number => (f ? 1 - u : u); // flip a face fraction
  const body: string[] = [isoDiamond(2, 1)];
  // tall box body along +x
  const floor = 3, roof = 21;
  body.push(bodyBlock(2, 0.9, floor, roof));

  // SE (right) long side: u in [0,1] runs N→S? we sample along +x length axis.
  // right face lies at ty=0.9 (south edge), tx from 0→2. Parametrise by u=tx/2.
  const onR = (u: number, v: number): Pt => {
    const g = project(flu(u) * 2, 0.9);
    return { x: g.x, y: g.y - v };
  };
  // cab windscreen sits on the near-visible END face, which is ALWAYS the
  // tx=2 end (the SE-most vertical face; the tx=0 end faces away from the
  // viewer). Facing is conveyed by which end the side door/window occupy
  // (they move end-for-end via flu), so the cab always renders on the visible
  // face — no leak onto a hidden plane when flipped.
  const onFront = (uu: number, v: number): Pt => {
    const g = project(2, 0.9 - uu * 0.9); // across the near end face
    return { x: g.x, y: g.y - v };
  };
  // windscreen on the cab front (upper band)
  body.push(polygon([onFront(0.15, roof - 2), onFront(0.85, roof - 2), onFront(0.85, roof - 8), onFront(0.15, roof - 8)], { fill: PAPER, strokeWidth: 0.6 }));
  // headlight hint (small pad low on the front)
  body.push(polygon([onFront(0.2, floor + 3), onFront(0.4, floor + 3), onFront(0.4, floor + 1), onFront(0.2, floor + 1)], { fill: PAPER, strokeWidth: 0.5 }));
  // cab door line on the long side near the cab (near end = onR(1.0)); rest of
  // side is a solid panel (no rear windows) per panel-van reference.
  body.push(line(onR(0.72, floor), onR(0.72, roof), 0.6, INK));
  // small cab-door window on the long side, just behind the cab front
  body.push(polygon([onR(0.74, roof - 3), onR(0.95, roof - 3), onR(0.95, roof - 9), onR(0.74, roof - 9)], { fill: PAPER, strokeWidth: 0.6 }));
  // round wheels
  body.push(wheel(f ? 1.62 : 0.38, 1.0));
  body.push(wheel(f ? 0.38 : 1.62, 1.0));
  return group(0, 0, body);
}

// --- car / saloon: 2×1, rounded body with bonnet/cabin/boot steps ---------
export function car(params?: Record<string, unknown>): string {
  const f = flipped(params);
  const fx = (tx: number): number => (f ? 2 - tx : tx);
  const body: string[] = [isoDiamond(2, 1)];

  // lower body slab (bonnet/boot level) spanning full length
  const lowH = 8;
  body.push(bodyBlock(2, 0.82, 3, lowH));

  // headlight hint on the front end (front = +x end, or 0 when flipped)
  const frontTx = f ? 0 : 2;
  const onFront = (uu: number, v: number): Pt => {
    const g = project(frontTx, 0.82 - uu * 0.82);
    return { x: g.x, y: g.y - v };
  };
  body.push(polygon([onFront(0.2, lowH - 1), onFront(0.45, lowH - 1), onFront(0.45, lowH - 3.5), onFront(0.2, lowH - 3.5)], { fill: PAPER, strokeWidth: 0.5 }));

  // CABIN: raised block over the middle third, leaving a bonnet step at the
  // front and a boot step at the rear (flips end-for-end).
  const cFront = fx(1.42), cRear = fx(0.62); // cabin spans between these along +x
  const cLo = lowH, cHi = 15;
  // cabin ground corners at cabin level (on the low body top)
  const gN = at(cRear, 0.12, cLo), gS = at(cRear, 0.72, cLo);
  const gEn = at(cFront, 0.12, cLo), gEs = at(cFront, 0.72, cLo);
  // cabin roof corners
  const rN = at(cRear + (f ? -0.04 : 0.04), 0.18, cHi), rS = at(cRear + (f ? -0.04 : 0.04), 0.66, cHi);
  const rEn = at(cFront + (f ? 0.04 : -0.04), 0.18, cHi), rEs = at(cFront + (f ? 0.04 : -0.04), 0.66, cHi);
  // rear (west-facing) slope face — the boot pillar
  body.push(polygon([gN, gS, rS, rN], { fill: PAPER, strokeWidth: STROKE_THIN }));
  // long SE (right) side of the cabin: side windows
  body.push(polygon([gS, gEs, rEs, rS], { fill: PAPER, strokeWidth: STROKE_THIN }));
  // windscreen slope at the front
  body.push(polygon([gEn, gEs, rEs, rEn], { fill: PAPER, strokeWidth: STROKE_THIN }));
  // cabin roof
  body.push(polygon([rN, rEn, rEs, rS], { fill: PAPER, strokeWidth: STROKE_THIN }));
  // side-window mullion (splits front door / rear door glass)
  const mid = 0.5;
  body.push(line(
    { x: gS.x + (gEs.x - gS.x) * mid, y: gS.y + (gEs.y - gS.y) * mid },
    { x: rS.x + (rEs.x - rS.x) * mid, y: rS.y + (rEs.y - rS.y) * mid },
    0.5, INK
  ));

  // round wheels (front + rear arches)
  body.push(wheel(fx(0.45), 0.92));
  body.push(wheel(fx(1.55), 0.92));
  return group(0, 0, body);
}

// --- tram: 3×1, modern low-floor articulated tram on rails ---------------
export function tram(params?: Record<string, unknown>): string {
  const f = flipped(params);
  const body: string[] = [];

  // --- RAILS: two thin rails under the tram, running the length (+x) -------
  // draw first so the tram body occludes them where it sits.
  const railTy = [0.32, 0.62];
  for (const ty of railTy) {
    const a = project(0, ty);
    const b = project(3, ty);
    body.push(line(a, b, 0.6, INK));
  }
  // a few sleepers between the rails
  for (let i = 0; i <= 6; i++) {
    const tx = (3 * i) / 6;
    body.push(line(project(tx, railTy[0]), project(tx, railTy[1]), 0.4, INK));
  }

  body.push(isoDiamond(3, 1));

  // --- BODY: long box, floor slightly above rail, modern low profile ------
  const floor = 2, roof = 20;
  body.push(bodyBlock(3, 0.9, floor, roof));

  // SE (right) long face sampler along the +x length axis, u=tx/3.
  const onR = (u: number, v: number): Pt => {
    const g = project(u * 3, 0.9);
    return { x: g.x, y: g.y - v };
  };

  // --- CONTINUOUS RIBBON GLAZING along the side ---------------------------
  body.push(polygon([onR(0.04, roof - 2), onR(0.96, roof - 2), onR(0.96, roof - 9), onR(0.04, roof - 9)], { fill: PAPER, strokeWidth: 0.6 }));

  // --- ARTICULATION JOINTS: two bellows lines splitting 3 sections --------
  // vertical bellows = a pair of close verticals at u≈1/3 and 2/3.
  for (const uj of [1 / 3, 2 / 3]) {
    for (const du of [-0.012, 0.012]) {
      body.push(line(onR(uj + du, floor), onR(uj + du, roof), 0.6, INK));
    }
    // break the ribbon glazing across the joint
    body.push(line(onR(uj, roof - 2), onR(uj, roof - 9), 0.6, INK));
  }
  // a couple of window mullions within each section
  for (const uj of [0.14, 0.52, 0.86]) {
    body.push(line(onR(uj, roof - 2), onR(uj, roof - 9), 0.4, INK));
  }

  // --- SLOPED NOSE + WINDSCREEN at the FRONT end (flips end-for-end) -------
  // Front end face at tx=3 (or tx=0 flipped), across the end (ty 0.9→0).
  const frontTx = f ? 0 : 3;
  const onFront = (uu: number, v: number): Pt => {
    const g = project(frontTx, 0.9 - uu * 0.9);
    return { x: g.x, y: g.y - v };
  };
  // big raked windscreen filling most of the front upper area
  body.push(polygon([onFront(0.12, roof - 1), onFront(0.88, roof - 1), onFront(0.88, roof - 10), onFront(0.12, roof - 10)], { fill: PAPER, strokeWidth: 0.6 }));
  // headlight pads low on the nose
  body.push(polygon([onFront(0.18, floor + 3), onFront(0.36, floor + 3), onFront(0.36, floor + 1), onFront(0.18, floor + 1)], { fill: PAPER, strokeWidth: 0.5 }));
  body.push(polygon([onFront(0.64, floor + 3), onFront(0.82, floor + 3), onFront(0.82, floor + 1), onFront(0.64, floor + 1)], { fill: PAPER, strokeWidth: 0.5 }));

  // --- ROOF PANTOGRAPH: thin zigzag arm reaching up, on the roof centreline
  const pu = f ? 0.60 : 0.40; // sit over the rear-middle roof section
  // roof centreline point: mid-width (ty=0.45) at length pu, lifted to roof.
  const rc = project(pu * 3, 0.45);
  const a1: Pt = { x: rc.x, y: rc.y - roof };
  const a2: Pt = { x: a1.x - 6, y: a1.y - 6 };  // elbow
  const a3: Pt = { x: a1.x + 2, y: a1.y - 11 }; // top of arm
  body.push(line(a1, a2, STROKE_THIN, INK));
  body.push(line(a2, a3, STROKE_THIN, INK));
  // contact bar (horizontal shoe) across the top
  body.push(line({ x: a3.x - 5, y: a3.y }, { x: a3.x + 5, y: a3.y }, 0.7, INK));
  // small base insulator dot on the roof
  body.push(circle(a1, 1, { fill: PAPER, stroke: INK, strokeWidth: 0.5 }));

  return group(0, 0, body);
}
