import { describe, it, expect } from 'vitest';
import { depthKey, sortForRender } from '../src/core/depth.ts';
import type { Entity } from '../src/core/model.ts';
import { tileToScreen } from '../src/core/iso.ts';

function gridEnt(id: string, x: number, y: number, w = 1, d = 1): Entity {
  return {
    id,
    type: 'department',
    label: id,
    placement: { mode: 'grid', x, y, footprint: { w, d } },
    asset: { symbol: 'z' },
  };
}

function freeEnt(id: string, sx: number, sy: number): Entity {
  return {
    id,
    type: 'user',
    label: id,
    placement: { mode: 'free', x: sx, y: sy },
    asset: { symbol: 'z' },
  };
}

function annoEnt(id: string): Entity {
  return {
    id,
    type: 'annotation',
    label: id,
    placement: { mode: 'free', x: 0, y: 0 },
    asset: { symbol: 'callout' },
  };
}

describe('depthKey', () => {
  it('grid uses far corner (x+w-1)+(y+d-1)', () => {
    expect(depthKey(gridEnt('a', 0, 0, 1, 1))).toBe(0);
    expect(depthKey(gridEnt('b', 2, 3, 2, 2))).toBe(2 + 1 + 3 + 1); // 7
  });

  it('free derives tx+ty from world position', () => {
    const s = tileToScreen(3, 4); // tx+ty = 7
    expect(depthKey(freeEnt('f', s.x, s.y))).toBeCloseTo(7, 10);
  });

  it('annotations are +Infinity', () => {
    expect(depthKey(annoEnt('a'))).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('sortForRender', () => {
  it('orders grid entities back-to-front', () => {
    const near = gridEnt('near', 5, 5); // key 10
    const far = gridEnt('far', 0, 0); // key 0
    const out = sortForRender([near, far]).map((e) => e.id);
    expect(out).toEqual(['far', 'near']);
  });

  it('interleaves free and grid by depth', () => {
    const g1 = gridEnt('g1', 0, 0); // key 0
    const sMid = tileToScreen(1, 1); // key 2
    const fMid = freeEnt('fMid', sMid.x, sMid.y);
    const g2 = gridEnt('g2', 3, 3); // key 6
    const out = sortForRender([g2, fMid, g1]).map((e) => e.id);
    expect(out).toEqual(['g1', 'fMid', 'g2']);
  });

  it('always sorts annotations last, preserving their input order', () => {
    const a1 = annoEnt('a1');
    const a2 = annoEnt('a2');
    const g = gridEnt('g', 9, 9); // large finite key
    const out = sortForRender([a1, g, a2]).map((e) => e.id);
    expect(out).toEqual(['g', 'a1', 'a2']);
  });

  it('is stable for equal keys', () => {
    const x = gridEnt('x', 1, 0); // key 1
    const y = gridEnt('y', 0, 1); // key 1
    const out = sortForRender([x, y]).map((e) => e.id);
    expect(out).toEqual(['x', 'y']);
  });

  it('does not mutate the input array', () => {
    const arr = [gridEnt('b', 5, 5), gridEnt('a', 0, 0)];
    const copy = arr.slice();
    sortForRender(arr);
    expect(arr).toEqual(copy);
  });

  it('renders ground entities beneath structures regardless of footprint depth', () => {
    // Large zone plate: far-corner key 14 would otherwise draw it AFTER
    // (on top of) the building standing inside it (key 4).
    const zone = gridEnt('zone', 0, 0, 8, 8);
    const building = gridEnt('building', 1, 1, 2, 2);
    const anno = annoEnt('anno');
    const isGround = (e: Entity) => e.id === 'zone';

    const withTier = sortForRender([building, anno, zone], isGround).map((e) => e.id);
    expect(withTier).toEqual(['zone', 'building', 'anno']);

    // Without the predicate the old (broken-looking) order is preserved.
    const without = sortForRender([building, anno, zone]).map((e) => e.id);
    expect(without).toEqual(['building', 'zone', 'anno']);
  });

  it('sorts multiple ground plates among themselves by depth key', () => {
    const org = gridEnt('org', 0, 0, 10, 10);
    const dept = gridEnt('dept', 1, 1, 4, 4);
    const isGround = () => true;
    const out = sortForRender([org, dept], isGround).map((e) => e.id);
    expect(out).toEqual(['dept', 'org']);
  });
});
