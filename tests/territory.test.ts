// Slice 1 (expand): the `territory` registry asset exists end-to-end.
// Tests the two pre-agreed seams for this slice through public interfaces:
//   1. Params/resize seam — resizeBounds / sizeParamKeys / seedSizeParams:
//      territory clamps w/d to 1–100 and seeds w/d WITHOUT a label param.
//   2. Renderer seam — the asset's render() output carries no <text> element.
// Both exercise the REAL registered asset (getAsset), proving the wiring, not a
// local fixture.

import { describe, it, expect } from 'vitest';
import { getAsset } from '../src/assets/library.ts';
import { resizeBounds, sizeParamKeys } from '../src/render/resize.ts';
import { seedSizeParams } from '../src/ui/placement.ts';

const territory = getAsset('territory');

describe('territory asset — params/resize seam', () => {
  it('is registered', () => {
    expect(territory).toBeDefined();
  });

  it('exposes the w/d size-param pair', () => {
    expect(sizeParamKeys(territory)).toEqual({ w: 'w', d: 'd' });
  });

  it('clamps w and d to 1–100', () => {
    expect(resizeBounds(territory)).toEqual({
      w: { min: 1, max: 100 },
      d: { min: 1, max: 100 },
    });
  });

  it('seeds w/d from its footprint with NO label param', () => {
    const seeded = seedSizeParams(territory, 'Territory 1');
    const fp = territory!.footprint!;
    expect(seeded).toEqual({ w: fp.w, d: fp.d });
    expect(seeded).not.toHaveProperty('label');
  });
});

describe('territory asset — renderer seam', () => {
  it('renders no <text> element (unlabeled), even if a label param is passed', () => {
    const svg = territory!.render({ w: 4, d: 3, label: 'IGNORED' });
    expect(svg).not.toContain('<text');
  });
});
