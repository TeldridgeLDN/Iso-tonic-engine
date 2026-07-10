// PNG sprite assets — drop a raster PNG in as a first-class foreground object.
//
// WHY THIS EXISTS
// ---------------
// Every other asset is line-art authored through primitives.ts. Sometimes you
// just want to place a bitmap (a logo, a photo cut-out, a piece of pre-drawn
// art) into a scene as an object. spriteAsset() wraps a PNG (embedded as a
// base64 data URI) in an SVG <image> billboard that participates in the scene
// exactly like any other AssetDef: it has a footprint, sorts by depth, and
// exports through the SVG/PNG paths.
//
// A sprite is a flat, camera-facing BILLBOARD, not geometry projected onto the
// ground plane. That is deliberate: a PNG cannot be foreshortened onto the 2:1
// iso ground without smearing, so we stand it upright and anchor its baseline
// on the footprint. Trade-offs (no token restyle, scaling artifacts if enlarged
// past native px, one image per orientation) are documented in
// docs/REPLICATING_REFERENCES.md.
//
// ZERO-STEP REGISTRATION: you normally never call spriteAsset() by hand. Drop a
// PNG in src/assets/sprites/ and spriteAuto.ts auto-discovers it (id = kebab
// filename, optional sidecar JSON + `.oN.png` variants). This function is the
// underlying machinery both the auto path and any rare hand-registration use.
//
// DATA URI MECHANISM
// ------------------
// The PNG is imported with vite's `?inline` suffix, which resolves to a
// `data:image/png;base64,...` string in BOTH the app build and vite-node
// (verified: `import png from './x.png?inline'` yields the same data URI in
// `vite build` and in `vite-node scripts/contact-sheet.ts`). No filesystem read
// at runtime, no separate asset file to ship — the bytes live in the bundle.

import { project } from './primitives.ts';
import { n } from './style.ts';

/** A PNG image provided as a base64 `data:image/png;base64,...` URI. */
export type PngDataUri = string;

export interface SpriteOptions {
  /** Footprint in tiles (drives the ground diamond + depth sorting). */
  footprint: { w: number; d: number };
  /**
   * Display width of the billboard in screen px. Height is derived from the
   * PNG's intrinsic aspect ratio (read from the PNG header at module init), so
   * the image is never distorted.
   */
  widthPx: number;
  /**
   * Anchor offset (screen px) of the sprite's BASELINE relative to the ground
   * point it stands on. The baseline is the bottom-centre of the billboard.
   *
   * The ground point it stands on is the CENTRE of the footprint diamond,
   * `project(w/2, d/2)` — consistent with the contract's "origin = north vertex
   * of the footprint origin tile, structures rise in −y". `anchor.dx`/`dy` nudge
   * the baseline from there (dy negative lifts the sprite; positive sinks it).
   * Default {dx:0, dy:0} stands the sprite bottom-centre on the diamond centre.
   */
  anchor?: { dx: number; dy: number };
  /**
   * The image(s). Either a single data URI (reused for all four orientations)
   * or a length-4 array indexed by orientation 0–3. Missing entries in a
   * sparse array fall back to index 0.
   */
  image: PngDataUri | [PngDataUri, PngDataUri?, PngDataUri?, PngDataUri?];
}

/**
 * Read a PNG's intrinsic width/height from its IHDR chunk. A PNG data URI is
 * `data:image/png;base64,<b64>`; the IHDR width is a big-endian u32 at byte
 * offset 16, height at 20 (8-byte signature + 4-byte length + "IHDR" = 16).
 * Returns null if the input isn't a decodable PNG (caller falls back to 1:1).
 */
export function pngIntrinsicSize(dataUri: string): { w: number; h: number } | null {
  const comma = dataUri.indexOf(',');
  if (comma < 0) return null;
  const b64 = dataUri.slice(comma + 1);
  // Decode just the first bytes (64 base64 chars → 48 bytes, covers the IHDR).
  // atob is a standard global in the DOM and in Node/vite-node.
  let bytes: Uint8Array;
  try {
    const bin = atob(b64.slice(0, 64));
    bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  } catch {
    return null;
  }
  if (bytes.length < 24) return null;
  // PNG signature check (137 80 78 71 13 10 26 10).
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < 8; i++) if (bytes[i] !== sig[i]) return null;
  const u32 = (o: number): number => (bytes[o] << 24) | (bytes[o + 1] << 16) | (bytes[o + 2] << 8) | bytes[o + 3];
  const w = u32(16) >>> 0;
  const h = u32(20) >>> 0;
  if (w <= 0 || h <= 0) return null;
  return { w, h };
}

/** Pick the orientation variant, falling back to index 0 for a scalar or gap. */
function variantFor(image: SpriteOptions['image'], orientation: number): PngDataUri {
  if (typeof image === 'string') return image;
  const o = ((Math.round(orientation) % 4) + 4) % 4;
  return image[o] ?? image[0];
}

export interface AssetLike {
  footprint: { w: number; d: number };
  orientations: 1 | 2 | 4;
  render(params?: Record<string, unknown>): string;
}

/**
 * Build an AssetDef-compatible sprite renderer. The returned object exposes
 * `footprint`, `orientations`, and `render()` — spread it into a library entry
 * (id/category) to register. `orientations` is 4 when per-orientation variants
 * are supplied, else 2: a single billboard shown as-is at even facings and
 * HORIZONTALLY MIRRORED at odd facings. A billboard can't be truly rotated
 * (it's a flat picture), but the mirror reads as "facing the other way" and
 * lets the existing rotate UI (R key / properties-panel button) work on
 * dropped-in sprites with zero extra art.
 */
export function spriteAsset(opts: SpriteOptions): AssetLike {
  const { footprint, widthPx } = opts;
  const anchor = opts.anchor ?? { dx: 0, dy: 0 };
  const hasVariants = Array.isArray(opts.image) && opts.image.filter(Boolean).length > 1;

  // Aspect ratio from the base image (index 0). Fall back to square if the PNG
  // header can't be read, so a bad asset degrades to a visible square rather
  // than a zero-height (invisible) image.
  const base = variantFor(opts.image, 0);
  const size = pngIntrinsicSize(base);
  const aspect = size ? size.w / size.h : 1;
  const heightPx = widthPx / aspect;

  const render = (params?: Record<string, unknown>): string => {
    const o = typeof params?.orientation === 'number' ? params.orientation : Number(params?.orientation ?? 0);
    const href = variantFor(opts.image, Number.isFinite(o) ? o : 0);

    // Ground point the billboard stands on: centre of the footprint diamond.
    const g = project(footprint.w / 2, footprint.d / 2);
    // Baseline (bottom-centre) after the anchor nudge.
    const baseX = g.x + anchor.dx;
    const baseY = g.y + anchor.dy;
    // <image> top-left so the image is horizontally centred on baseX and its
    // bottom edge sits on baseY (billboard rises in −y).
    const x = baseX - widthPx / 2;
    const y = baseY - heightPx;

    // Single-image sprites mirror at odd facings: reflect about the vertical
    // line x = baseX. Because the billboard is centred on baseX, the mirrored
    // rect occupies EXACTLY the same box (x/y/width/height attrs unchanged), so
    // export bbox maths in svg-prep.ts stays valid without knowing about it.
    const mirrored = !hasVariants && ((Math.round(o) % 4) + 4) % 4 % 2 === 1;
    const transform = mirrored ? ` transform="translate(${n(2 * baseX)} 0) scale(-1 1)"` : '';

    // Emit BOTH href (SVG2, used by browsers rasterising SVG-in-<img> for PNG
    // export) and xlink:href (svg2pdf reads this first for PDF export). Both
    // point at the same base64 data URI — same-origin, so the PNG-export canvas
    // is NOT tainted and toBlob() succeeds.
    return (
      `<image href="${href}" xlink:href="${href}" x="${n(x)}" y="${n(y)}" ` +
      `width="${n(widthPx)}" height="${n(heightPx)}" ` +
      `preserveAspectRatio="xMidYMax meet"${transform}/>`
    );
  };

  return { footprint, orientations: hasVariants ? 4 : 2, render };
}
