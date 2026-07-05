import { defineConfig } from 'vite';

// BASE_PATH is set by the GitHub Pages workflow (/Iso-tonic-engine/);
// local dev and plain builds serve from root.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
});
