// Ad-hoc: validate an .iso.json and render it to an SVG for inspection.
// Usage: npx vite-node scripts/preview-doc.ts <doc.json> <out.svg>
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { validateDocument } from '../src/core/schema.ts';
import { stripEditorOnly, computeBBox, assembleSvg, inlineImageHrefs } from '../src/io/svg-prep.ts';
import { renderSceneToString } from '../src/render/renderer.ts';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Sprite PNGs render as `?url` paths under vite-node; inline them from disk so
// the written SVG is viewable stand-alone (mirrors the app's export inline pass).
const diskDataUri = async (url: string): Promise<string | null> => {
  try {
    const clean = url.split('?')[0];
    const repoRel = join(REPO_ROOT, clean.replace(/^\//, ''));
    const abs = existsSync(repoRel) ? repoRel : clean;
    return `data:image/png;base64,${readFileSync(abs).toString('base64')}`;
  } catch {
    return null;
  }
};

const [docPath, outPath] = process.argv.slice(2);
const raw = JSON.parse(readFileSync(docPath, 'utf8'));
const result = validateDocument(raw);
if (!result.ok) {
  console.error('INVALID:', JSON.stringify(result.errors, null, 2));
  process.exit(1);
}
if (result.warnings?.length) console.log('warnings:', JSON.stringify(result.warnings));
const fragment = stripEditorOnly(renderSceneToString(result.doc));
const bbox = computeBBox(fragment);
if (!bbox) throw new Error('empty scene');
writeFileSync(outPath, await inlineImageHrefs(assembleSvg(fragment, bbox), diskDataUri));
console.log('VALID — svg written to', outPath);
