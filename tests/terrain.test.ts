// Seam contract for road/river tiles: every shape crosses a tile edge at the
// edge midpoint, ROAD_HALF wide, spine tangent parallel to that edge's axis.
// We assert it end-to-end on the rendered SVG: the kerb endpoint coordinates
// of corners, T-junctions and crossroads must be EXACTLY the coordinates a
// road-straight emits at the same edge — that identity is what makes any
// tile combination compose seamlessly.

import { describe, it, expect } from 'vitest';
import { roadStraight, roadCorner, roadT, roadCross } from '../src/assets/terrain.ts';
import { n, HALF_W, HALF_H } from '../src/assets/style.ts';

const ROAD_HALF = 10; // keep in sync with terrain.ts

// edge midpoints, clockwise ring as in terrain.ts
const mNE = { x: HALF_W / 2, y: HALF_H / 2 };
const mSE = { x: HALF_W / 2, y: HALF_H * 1.5 };
const mSW = { x: -HALF_W / 2, y: HALF_H * 1.5 };
const mNW = { x: -HALF_W / 2, y: HALF_H / 2 };
const ring = [mNE, mSE, mSW, mNW];

interface Pt { x: number; y: number }

function perp(a: Pt, b: Pt): Pt {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L = Math.hypot(dx, dy);
  return { x: -dy / L, y: dx / L };
}

/** The two kerb crossing points a straight road produces at midpoint m. */
function kerbPoints(m: Pt, axisFrom: Pt, axisTo: Pt): [Pt, Pt] {
  const pv = perp(axisFrom, axisTo);
  return [
    { x: m.x + pv.x * ROAD_HALF, y: m.y + pv.y * ROAD_HALF },
    { x: m.x - pv.x * ROAD_HALF, y: m.y - pv.y * ROAD_HALF },
  ];
}

/** Every coordinate pair the straight road emits at each edge, by ring index. */
function expectedKerbs(i: number): [Pt, Pt] {
  const m = ring[i];
  const opposite = ring[(i + 2) % 4];
  return kerbPoints(m, m, opposite);
}

/** Assert svg contains the coordinate pair (as emitted by line() or polyline()). */
function expectKerbAt(svg: string, p: Pt): void {
  const pair = new RegExp(`${esc(n(p.x))}[," ]+${esc(n(p.y))}`);
  expect(svg).toMatch(pair);
}

function esc(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');
}

describe('road seam contract', () => {
  it('road-straight emits kerbs at the canonical edge crossings (both axes)', () => {
    const sx = roadStraight({ orientation: 0 }); // mNW..mSE
    for (const p of [...expectedKerbs(3), ...expectedKerbs(1)]) expectKerbAt(sx, p);
    const sy = roadStraight({ orientation: 1 }); // mNE..mSW
    for (const p of [...expectedKerbs(0), ...expectedKerbs(2)]) expectKerbAt(sy, p);
  });

  it('road-corner kerb endpoints coincide with the straight-road crossings', () => {
    for (let o = 0; o < 4; o++) {
      const svg = roadCorner({ orientation: o });
      for (const p of [...expectedKerbs(o), ...expectedKerbs((o + 1) % 4)]) {
        expectKerbAt(svg, p);
      }
    }
  });

  it('road-t through and stem kerbs coincide with the straight-road crossings', () => {
    for (let o = 0; o < 4; o++) {
      const svg = roadT({ orientation: o });
      for (const p of [
        ...expectedKerbs(o),
        ...expectedKerbs((o + 2) % 4),
        ...expectedKerbs((o + 1) % 4), // stem mouth
      ]) {
        expectKerbAt(svg, p);
      }
    }
  });

  it('road-cross kerbs coincide with the straight-road crossings at all four edges', () => {
    const svg = roadCross();
    for (let i = 0; i < 4; i++) {
      for (const p of expectedKerbs(i)) expectKerbAt(svg, p);
    }
  });

  it('road-cross junction box stays open (no kerb line passes the centre)', () => {
    // the centre of the tile must not sit on any kerb segment: no emitted
    // <line> may span from one edge crossing to the opposite one unbroken
    const svg = roadCross();
    const lines = [...svg.matchAll(/<line x1="([^"]+)" y1="([^"]+)" x2="([^"]+)" y2="([^"]+)"/g)];
    for (const m of lines) {
      const [x1, y1, x2, y2] = m.slice(1).map(Number);
      const len = Math.hypot(x2 - x1, y2 - y1);
      // a full unbroken kerb would be ~35.8 long; broken segments are shorter
      expect(len).toBeLessThan(30);
    }
  });
});
