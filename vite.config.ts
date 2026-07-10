import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

// BASE_PATH is set by the GitHub Pages workflow (/Iso-tonic-engine/);
// local dev and plain builds serve from root.
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
      output: {
        // Sprite bundle-weight mitigation. spriteAuto.ts inlines every
        // src/assets/sprites/*.png as a base64 data URI (~100 KB/sprite). Left in
        // the default graph these land in the MAIN app chunk, which then grows
        // ~100 KB per sprite (a hard scaling ceiling at 25-30 sprites). Route the
        // inlined-PNG modules into a dedicated `sprites` chunk so the main app
        // chunk stays lean and the (rarely-changing) sprite bytes become a
        // separately-cacheable file — editing app code no longer re-downloads the
        // sprites, and vice-versa.
        //
        // Why not hashed asset URLs (fully outside JS)? sprite.ts derives each
        // billboard's height by reading the PNG IHDR bytes out of the inlined
        // base64 *synchronously* at module load, and the asset registry
        // (getAsset/listAssets) is synchronous across ~10 consumers incl. the
        // renderer. Switching to URLs would either mis-size every sprite or force
        // an async registry — a change too invasive to verify safely here. This
        // keeps `?inline` (so intrinsic sizing + self-contained SVG/PNG/PDF export
        // are untouched) and only relocates the chunk. See the Task-3 notes.
        manualChunks(id: string): string | undefined {
          // The inlined PNG modules resolve with a `?inline` query on a path
          // under src/assets/sprites/. Bucket those (and the tiny discovery
          // wiring) into one chunk.
          if (id.includes('/assets/sprites/') || id.includes('assets/spriteAuto')) {
            return 'sprites';
          }
          return undefined;
        },
      },
    },
  },
});
