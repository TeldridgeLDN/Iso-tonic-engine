import { describe, it, expect } from 'vitest';
import { deskLaptopV2, deskWorkstationV2 } from '../src/assets/symbols/desks-v2.ts';

// Regression guard for the drawer-face orientation bug (fixed 2026-07).
//
// A double-pedestal desk must show its three drawer fronts on the SAME face as
// the knee-hole — the long "seat side" (SW/front) face that faces the viewer —
// so the seated user pulls drawers toward themselves. In the authored o0
// geometry a horizontal line lying in that front-face plane has screen slope
// +0.5; a line on the short END (SE) face has slope -0.5. The bug placed the
// seams on the end face (all -0.5). This test asserts they are back on +0.5.
//
// Each drawer seam spans 0.88·pedW of the front edge, which projects to exactly
// 18.0px, letting us isolate the six seams (3 per pedestal × 2 pedestals) from
// the desktop dress-up linework (e.g. the laptop hinge, span 16.9).

interface Seg {
  slope: number;
  span: number;
  sw: number;
}

function thinLines(svg: string): Seg[] {
  const out: Seg[] = [];
  const re =
    /<line x1="(-?[\d.]+)" y1="(-?[\d.]+)" x2="(-?[\d.]+)" y2="(-?[\d.]+)"[^>]*stroke-width="([\d.]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(svg))) {
    const x1 = +m[1];
    const y1 = +m[2];
    const x2 = +m[3];
    const y2 = +m[4];
    const sw = +m[5];
    const dx = x2 - x1;
    if (Math.abs(dx) < 1e-6) continue; // vertical strokes
    out.push({ slope: (y2 - y1) / dx, span: Math.hypot(dx, y2 - y1), sw });
  }
  return out;
}

/** The six drawer seams: thin (sw 1) lines spanning the 18px front edge. */
function drawerSeams(svg: string): Seg[] {
  return thinLines(svg).filter((l) => l.sw === 1 && Math.abs(l.span - 18.0) < 0.3);
}

describe.each([
  ['deskLaptopV2', deskLaptopV2],
  ['deskWorkstationV2', deskWorkstationV2],
])('%s drawer fronts (o0)', (_name, fn) => {
  const seams = drawerSeams(fn({ orientation: 0 }));

  it('has exactly six drawer seams (3 drawers × 2 pedestals)', () => {
    expect(seams.length).toBe(6);
  });

  it('places every seam on the front (knee-hole) face, slope +0.5', () => {
    for (const s of seams) expect(s.slope).toBeCloseTo(0.5, 2);
  });

  it('places no seam on the short end (SE) face, slope -0.5', () => {
    const onEnd = seams.filter((s) => Math.abs(s.slope + 0.5) < 0.05);
    expect(onEnd.length).toBe(0);
  });
});

describe.each([
  ['deskLaptopV2', deskLaptopV2],
  ['deskWorkstationV2', deskWorkstationV2],
])('%s alternate facing (o1)', (_name, fn) => {
  it('mirrors the whole body so seams track the knee-hole face', () => {
    // The alternate facing is a screen mirror of the entire desk body; the
    // seams stay co-planar with the (mirrored) knee-hole face by construction.
    expect(fn({ orientation: 1 })).toMatch(/scale\(-1 1\)/);
  });
});
