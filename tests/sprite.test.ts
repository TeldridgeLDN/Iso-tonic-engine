import { describe, it, expect } from 'vitest';
import { spriteAsset, pngIntrinsicSize } from '../src/assets/sprite.ts';
import { computeBBox } from '../src/io/svg-prep.ts';

// A tiny valid 2×1 RGBA PNG built by hand → its data URI, for aspect-ratio and
// element-emission tests without depending on vite's ?inline resolution.
function tinyPngDataUri(w: number, h: number): string {
  // Minimal PNG: signature + IHDR (we only ever read the IHDR for dimensions),
  // a stub IDAT, IEND. pngIntrinsicSize only decodes the IHDR, so a real IDAT
  // is unnecessary for these tests.
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  const ihdrData = [
    (w >>> 24) & 255, (w >>> 16) & 255, (w >>> 8) & 255, w & 255,
    (h >>> 24) & 255, (h >>> 16) & 255, (h >>> 8) & 255, h & 255,
    8, 6, 0, 0, 0,
  ];
  const bytes = [...sig, 0, 0, 0, 13, 73, 72, 68, 82, ...ihdrData, 0, 0, 0, 0];
  const bin = String.fromCharCode(...bytes);
  const b64 = Buffer.from(bin, 'binary').toString('base64');
  return `data:image/png;base64,${b64}`;
}

describe('pngIntrinsicSize', () => {
  it('reads width/height from the IHDR chunk', () => {
    expect(pngIntrinsicSize(tinyPngDataUri(96, 112))).toEqual({ w: 96, h: 112 });
    expect(pngIntrinsicSize(tinyPngDataUri(200, 50))).toEqual({ w: 200, h: 50 });
  });

  it('returns null for non-PNG / malformed input', () => {
    expect(pngIntrinsicSize('data:image/png;base64,notreal')).toBeNull();
    expect(pngIntrinsicSize('nonsense')).toBeNull();
  });
});

describe('spriteAsset', () => {
  const img = tinyPngDataUri(100, 50); // 2:1 aspect

  it('emits a single <image> with a non-empty data URI', () => {
    const svg = spriteAsset({ footprint: { w: 1, d: 1 }, widthPx: 64, image: img }).render();
    expect((svg.match(/<image /g) ?? []).length).toBe(1);
    expect(svg).toContain('href="data:image/png;base64,');
    expect(svg).toContain('xlink:href="data:image/png;base64,');
  });

  it('derives height from the PNG aspect ratio (no distortion)', () => {
    const svg = spriteAsset({ footprint: { w: 1, d: 1 }, widthPx: 64, image: img }).render();
    const w = Number(/width="([\d.]+)"/.exec(svg)![1]);
    const h = Number(/height="([\d.]+)"/.exec(svg)![1]);
    expect(w).toBeCloseTo(64, 5);
    expect(h).toBeCloseTo(32, 1); // 64 / (100/50)
  });

  it('anchors the baseline (bottom-centre) on the footprint diamond centre', () => {
    // 1×1 footprint → centre project(0.5,0.5) = (0,16). Default anchor {0,0}.
    const svg = spriteAsset({ footprint: { w: 1, d: 1 }, widthPx: 64, image: img }).render();
    const x = Number(/ x="([-\d.]+)"/.exec(svg)![1]);
    const y = Number(/ y="([-\d.]+)"/.exec(svg)![1]);
    const w = Number(/width="([\d.]+)"/.exec(svg)![1]);
    const h = Number(/height="([\d.]+)"/.exec(svg)![1]);
    expect(x + w / 2).toBeCloseTo(0, 5); // horizontally centred on diamond centre x
    expect(y + h).toBeCloseTo(16, 5); // baseline sits on diamond centre y
  });

  it('applies the anchor offset', () => {
    const svg = spriteAsset({ footprint: { w: 1, d: 1 }, widthPx: 64, image: img, anchor: { dx: 5, dy: -10 } }).render();
    const x = Number(/ x="([-\d.]+)"/.exec(svg)![1]);
    const y = Number(/ y="([-\d.]+)"/.exec(svg)![1]);
    const w = Number(/width="([\d.]+)"/.exec(svg)![1]);
    const h = Number(/height="([\d.]+)"/.exec(svg)![1]);
    expect(x + w / 2).toBeCloseTo(5, 5);
    expect(y + h).toBeCloseTo(6, 5); // 16 + (-10)
  });

  it('reports orientations=2 (mirror facing) for a single image, 4 for variants', () => {
    const single = spriteAsset({ footprint: { w: 1, d: 1 }, widthPx: 64, image: img });
    expect(single.orientations).toBe(2);
    const varied = spriteAsset({
      footprint: { w: 1, d: 1 },
      widthPx: 64,
      image: [tinyPngDataUri(10, 10), tinyPngDataUri(20, 20)],
    });
    expect(varied.orientations).toBe(4);
  });

  it('mirrors a single-image sprite at odd facings, about its own centre', () => {
    const single = spriteAsset({ footprint: { w: 1, d: 1 }, widthPx: 64, image: img });
    expect(single.render({ orientation: 0 })).not.toContain('scale(-1 1)');
    const odd = single.render({ orientation: 1 });
    expect(odd).toContain('scale(-1 1)');
    // Mirror is about the baseline centre x (footprint diamond centre = 0 for
    // a 1x1 at origin), so translate(2*baseX) = translate(0) and the occupied
    // box is unchanged — export bbox stays valid.
    expect(odd).toContain('transform="translate(0 0) scale(-1 1)"');
    // Per-orientation variant sprites do NOT mirror (each facing has real art).
    const varied = spriteAsset({
      footprint: { w: 1, d: 1 },
      widthPx: 64,
      image: [tinyPngDataUri(10, 10), tinyPngDataUri(20, 20)],
    });
    expect(varied.render({ orientation: 1 })).not.toContain('scale(-1');
  });

  it('reuses image 0 for missing orientation variants', () => {
    const a = spriteAsset({
      footprint: { w: 1, d: 1 },
      widthPx: 64,
      image: [tinyPngDataUri(10, 10)], // only index 0 provided
    });
    // any orientation resolves to the same (index-0) href
    const o0 = a.render({ orientation: 0 });
    const o2 = a.render({ orientation: 2 });
    const href = (s: string): string => /href="([^"]+)"/.exec(s)![1];
    expect(href(o0)).toBe(href(o2));
  });

  it('is included in the export bounding box (not cropped)', () => {
    const svg = spriteAsset({ footprint: { w: 1, d: 1 }, widthPx: 64, image: img }).render();
    const bbox = computeBBox(svg);
    expect(bbox).not.toBeNull();
    // width 64 present in the bbox span
    expect(bbox!.maxX - bbox!.minX).toBeCloseTo(64, 1);
  });
});
