// Demo PNG sprite — a placeholder isometric crate. This is the ~5-line template
// a user copies to drop their own PNG in as a foreground object:
//   1. put your PNG next to this file
//   2. import it with the `?inline` suffix (→ base64 data URI, works in the app
//      build AND vite-node contact-sheet)
//   3. call spriteAsset() with footprint / widthPx / optional anchor
//   4. register it in ../library.ts (id + category, spread the rest)
// See docs/REPLICATING_REFERENCES.md → "Using PNG sprites".

// vite resolves `?inline` to a base64 data URI string (typed via vite/client).
import crate from './demo-crate.png?inline';
import { spriteAsset } from '../sprite.ts';

export const spriteDemo = spriteAsset({
  footprint: { w: 1, d: 1 },
  widthPx: 64, // display width; height follows the PNG's aspect ratio (96×112)
  image: crate,
});
