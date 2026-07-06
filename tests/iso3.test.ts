import { describe, it, expect } from 'vitest';
import {
  MM_PER_TILE,
  MM_PER_PX_Z,
  VZ,
  mm,
  mmZ,
  projectWorld,
  orientWorld,
  box,
  slab,
  laptop,
} from '../src/assets/iso3.ts';
import { project } from '../src/assets/primitives.ts';

// Every numeric coordinate that appears in an emitted SVG fragment. Used to
// assert no NaN / Infinity leaks into output.
function coords(frag: string): number[] {
  const out: number[] = [];
  const re = /-?\d+(?:\.\d+)?|NaN|Infinity/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(frag))) out.push(Number(m[0]));
  return out;
}

function polygonCount(frag: string): number {
  return (frag.match(/<polygon/g) ?? []).length;
}

describe('iso3 scale constants', () => {
  it('ground scale is anchored on the desk footprint (700mm/tile)', () => {
    expect(MM_PER_TILE).toBe(700);
    expect(mm(1400)).toBeCloseTo(2, 10); // a 1400mm desk spans 2 tiles
    expect(mm(700)).toBeCloseTo(1, 10);
  });

  it('vertical scale is anchored on the ~46px/1750mm figurine', () => {
    expect(MM_PER_PX_Z).toBeCloseTo(1750 / 46, 10);
    // VZ derived, not free: one world-z unit == MM_PER_TILE mm of height.
    expect(VZ).toBeCloseTo(MM_PER_TILE / MM_PER_PX_Z, 10);
    // sanity: a 1750mm figure in world-z units projects to ~46px of rise.
    expect(mmZ(1750) * VZ).toBeCloseTo(46, 6);
  });
});

describe('projectWorld', () => {
  it('z=0 matches the ground projection exactly', () => {
    for (const [x, y] of [[0, 0], [1, 0], [2, 1], [0.5, 0.5]]) {
      const g = project(x, y);
      const w = projectWorld(x, y, 0);
      expect(w).toEqual(g);
    }
  });

  it('height rises in screen −y', () => {
    const base = projectWorld(1, 1, 0);
    const up = projectWorld(1, 1, 1);
    expect(up.x).toBe(base.x);
    expect(up.y).toBeCloseTo(base.y - VZ, 10);
  });
});

describe('box faces', () => {
  const b = box(0, 0, 0, 2, 1, mmZ(740));

  it('emits exactly three faces (left, right, top)', () => {
    expect(polygonCount(b)).toBe(3);
  });

  it('produces no NaN / Infinity coordinates', () => {
    for (const c of coords(b)) expect(Number.isFinite(c)).toBe(true);
  });

  it('top-only mode emits a single face', () => {
    expect(polygonCount(box(0, 0, 0, 1, 1, 0.2, { topOnly: true }))).toBe(1);
  });

  it('a raised base sits entirely above the same box at z=0', () => {
    // Parse only the y-values (second number of each "x,y" pair) so x-columns
    // (which are identical for both boxes) don't contaminate the comparison.
    const ys = (frag: string): number[] => {
      const out: number[] = [];
      const re = /points="([^"]+)"/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(frag))) {
        for (const pair of m[1].trim().split(/\s+/)) out.push(Number(pair.split(',')[1]));
      }
      return out;
    };
    const ground = ys(box(0, 0, 0, 1, 1, 0.5));
    const raised = ys(box(0, 0, 0.5, 1, 1, 0.5));
    // Same box lifted by z=0.5: EVERY vertex shifts up (−y) by exactly 0.5·VZ.
    expect(raised.length).toBe(ground.length);
    for (let i = 0; i < ground.length; i++) {
      expect(raised[i]).toBeCloseTo(ground[i] - 0.5 * VZ, 6);
    }
  });
});

describe('slab', () => {
  it('is a thin box: three faces, finite coords', () => {
    const s = slab(0.2, 0.2, 0, 1.6, 0.6, mmZ(30));
    expect(polygonCount(s)).toBe(3);
    for (const c of coords(s)) expect(Number.isFinite(c)).toBe(true);
  });
});

describe('laptop', () => {
  const l = laptop(0.5, 0.4, mmZ(740), mm(330), mm(230), mmZ(230));

  it('emits a deck (3 faces) + screen quad + inset (>=5 polygons)', () => {
    expect(polygonCount(l)).toBeGreaterThanOrEqual(5);
  });

  it('produces no NaN / Infinity coordinates', () => {
    for (const c of coords(l)) expect(Number.isFinite(c)).toBe(true);
  });
});

describe('orientWorld', () => {
  it('o=0 is identity', () => {
    expect(orientWorld(0.3, 0.7, 0, 2, 1)).toEqual({ x: 0.3, y: 0.7 });
  });

  it('four clockwise quarter-turns return to origin', () => {
    const start = { x: 0.4, y: 0.9 };
    let p = start;
    // apply o=1 four times by composing — but orientWorld takes absolute o, and
    // footprint bounds swap each turn, so verify the full o=4 ≡ o=0 identity.
    p = orientWorld(start.x, start.y, 4, 2, 1);
    expect(p.x).toBeCloseTo(start.x, 10);
    expect(p.y).toBeCloseTo(start.y, 10);
  });

  it('a corner maps within the swapped footprint bounds on an odd turn', () => {
    // footprint 2×1, o=1 → bounds become 1×2. Point (0,0) must land in [0,1]×[0,2].
    const p = orientWorld(0, 0, 1, 2, 1);
    expect(p.x).toBeGreaterThanOrEqual(0);
    expect(p.x).toBeLessThanOrEqual(1);
    expect(p.y).toBeGreaterThanOrEqual(0);
    expect(p.y).toBeLessThanOrEqual(2);
  });
});
