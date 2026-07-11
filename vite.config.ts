import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

// BASE_PATH is set by the GitHub Pages workflow (/Iso-tonic-engine/);
// local dev and plain builds serve from root.
//
// Sprites ship as hashed asset URLs. spriteAuto.ts imports every
// src/assets/sprites/*.png with `?url`, so each PNG is emitted as its own
// content-hashed file under dist/assets/ (individually cacheable, and only
// re-downloaded when that one sprite changes). The bytes no longer live in the
// JS bundle, so the old `manualChunks` sprite-bucketing — which existed solely
// to hoist ~3.7 MB of base64 `?inline` data out of the main app chunk — is gone;
// the sprite-discovery wiring is now a few KB of URL strings that belong in the
// normal module graph. Export self-containment is restored at export time by an
// async inline pass (src/io/svg-prep.ts → inlineImageHrefs) rather than by
// inlining at build time.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  build: {
    rollupOptions: {
      // Multi-page: root = view-only public entry, /edit/ = full editor
      // (StatiCrypt-encrypted in CI). Output lands at dist/edit/index.html.
      input: {
        main: fileURLToPath(new URL('index.html', import.meta.url)),
        edit: fileURLToPath(new URL('edit/index.html', import.meta.url)),
      },
    },
  },
});
