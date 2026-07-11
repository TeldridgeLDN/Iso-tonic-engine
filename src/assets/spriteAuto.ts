// Zero-step PNG sprite discovery. Drop a PNG in src/assets/sprites/ and it
// appears in the library, palette, and contact sheet — no registration file,
// no library edit.
//
// MECHANISM
// ---------
// `import.meta.glob('./sprites/*.png', { query: '?url', import: 'default',
// eager: true })` asks vite for every matching PNG's URL — a hashed asset URL
// in `vite build` (the bytes ship as a separate cacheable file, NOT base64 in
// the JS bundle), and a root-relative dev path like `/src/assets/sprites/x.png`
// under `vite-node`. The billboard aspect ratio comes from each sprite's sidecar
// `intrinsic` (backfilled by prep-sprite), so no image bytes are decoded here.
// Scripts that need a viewable stand-alone SVG (contact-sheet, preview-doc)
// re-inline these URLs from disk; export re-inlines them via fetch. Sidecar JSON
// overrides come from a parallel `*.json` glob.
//
// All the decision logic (id derivation, sidecar merge, orientation grouping,
// collision policy) lives in spriteAutoCore.ts as pure functions so it is
// unit-testable without a vite context; this file is only the wiring.

import { spriteAsset, type AssetLike } from './sprite.ts';
import { groupSprites, type DiscoveredSprite } from './spriteAutoCore.ts';

// Eager PNG URLs: key = './sprites/<file>.png', value = hashed asset URL string
// (dev/vite-node: a root-relative `/src/assets/sprites/<file>.png` path).
const PNG_GLOB = import.meta.glob('./sprites/*.png', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>;

// Eager JSON sidecars: key = './sprites/<file>.json', value = parsed object.
// vite parses .json to a JS object by default (import: 'default').
const JSON_GLOB = import.meta.glob('./sprites/*.json', {
  import: 'default',
  eager: true,
}) as Record<string, unknown>;

/** An auto-discovered sprite ready to spread into a library AssetDef entry. */
export interface AutoSpriteEntry {
  id: string;
  category: string;
  footprint: { w: number; d: number };
  orientations: AssetLike['orientations'];
  render: AssetLike['render'];
}

/** Turn one discovered sprite into an AssetLike via the existing machinery. */
function toEntry(s: DiscoveredSprite): AutoSpriteEntry {
  const variants = s.images.filter(Boolean) as string[];
  const image = variants.length > 1 ? (s.images as [string, string?, string?, string?]) : s.images[0];
  const asset = spriteAsset({
    footprint: s.footprint,
    widthPx: s.widthPx,
    anchor: s.anchor,
    intrinsic: s.intrinsic,
    image,
  });
  return {
    id: s.id,
    category: s.category,
    footprint: asset.footprint,
    orientations: asset.orientations,
    render: asset.render,
  };
}

/**
 * All auto-discovered sprites, keyed and de-duplicated by kebab id, sorted by
 * id. Pure grouping is delegated to spriteAutoCore; this only maps the result
 * through spriteAsset(). Recomputed once at module load.
 */
export function discoverSprites(): AutoSpriteEntry[] {
  return groupSprites(PNG_GLOB, JSON_GLOB).map(toEntry);
}
