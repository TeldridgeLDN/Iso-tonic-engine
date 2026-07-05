// Ad-hoc: validate an .iso.json and render it to an SVG for inspection.
// Usage: npx vite-node scripts/preview-doc.ts <doc.json> <out.svg>
import { readFileSync, writeFileSync } from 'node:fs';
import { validateDocument } from '../src/core/schema.ts';
import { stripEditorOnly, computeBBox, assembleSvg } from '../src/io/svg-prep.ts';
import { renderSceneToString } from '../src/render/renderer.ts';

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
writeFileSync(outPath, assembleSvg(fragment, bbox));
console.log('VALID — svg written to', outPath);
