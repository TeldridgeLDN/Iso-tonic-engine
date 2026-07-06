// ref-overlay — dimensional-calibration tool.
//
// Renders a registry asset semi-transparently OVER a reference PNG so a human
// can eyeball whether the engine's proportions match the reference art. Emits a
// self-contained HTML file (reference image as a data: URI, asset inline SVG).
//
//   npm run ref-overlay -- <assetId> <reference.png> [options]
//
// Options (all optional):
//   --out <path>       output HTML (default: ref-overlay.html at repo root)
//   --scale <n>        multiply the asset SVG by n (default 1)
//   --dx <px> --dy <px>  translate the asset over the image (default 0,0)
//   --opacity <0..1>   asset opacity (default 0.6)
//   --orientation <0..3>  facing to render (default 0)
//   --params <json>    extra render params, e.g. '{"signage":"CAFE"}'
//
// IMPORTANT: this tool cannot itself judge dimensional fidelity — that is the
// human's job with their eyes. It only assembles the overlay. Reference art in
// true 30° isometric will NOT pixel-match this engine's 2:1 projection; use the
// overlay to RE-PROPORTION, not to trace. See docs/REPLICATING_REFERENCES.md.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { getAsset } from '../src/assets/library.ts';

interface Args {
  assetId?: string;
  ref?: string;
  out: string;
  scale: number;
  dx: number;
  dy: number;
  opacity: number;
  orientation: number;
  params: Record<string, unknown>;
}

function parseArgs(argv: string[]): Args {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const a: Args = {
    out: join(__dirname, '..', 'ref-overlay.html'),
    scale: 1,
    dx: 0,
    dy: 0,
    opacity: 0.6,
    orientation: 0,
    params: {},
  };
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    switch (t) {
      case '--out': a.out = argv[++i]; break;
      case '--scale': a.scale = Number(argv[++i]); break;
      case '--dx': a.dx = Number(argv[++i]); break;
      case '--dy': a.dy = Number(argv[++i]); break;
      case '--opacity': a.opacity = Number(argv[++i]); break;
      case '--orientation': a.orientation = Number(argv[++i]); break;
      case '--params': a.params = JSON.parse(argv[++i]); break;
      default: positional.push(t); break;
    }
  }
  a.assetId = positional[0];
  a.ref = positional[1];
  return a;
}

function mimeFor(path: string): string {
  const ext = extname(path).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.svg') return 'image/svg+xml';
  return 'application/octet-stream';
}

function main(): void {
  const a = parseArgs(process.argv.slice(2));
  if (!a.assetId || !a.ref) {
    console.error('usage: npm run ref-overlay -- <assetId> <reference.png> [--scale n --dx px --dy px --opacity 0..1 --orientation 0..3 --params json]');
    process.exit(1);
  }

  const asset = getAsset(a.assetId);
  if (!asset) {
    console.error(`unknown asset id: ${a.assetId}`);
    process.exit(1);
  }

  // reference image → data URI (self-contained output)
  const bytes = readFileSync(a.ref);
  const dataUri = `data:${mimeFor(a.ref)};base64,${bytes.toString('base64')}`;

  // render the asset fragment
  const fragment = asset.render({ ...a.params, orientation: a.orientation });

  // A generous local viewBox centred on the asset origin so tall/negative-x
  // geometry is visible; the human nudges alignment with --dx/--dy/--scale.
  const VB = 200;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${VB}" height="${VB}" viewBox="${-VB / 2} ${-VB * 0.75} ${VB} ${VB}" ` +
    `style="position:absolute;left:${a.dx}px;top:${a.dy}px;transform-origin:top left;transform:scale(${a.scale});opacity:${a.opacity};">` +
    fragment +
    `</svg>`;

  const html =
    `<!doctype html><html><head><meta charset="utf-8"><title>ref-overlay: ${escapeHtml(a.assetId)}</title>` +
    `<style>body{margin:0;background:#ddd;font-family:Helvetica,Arial,sans-serif}` +
    `.stage{position:relative;display:inline-block}` +
    `.stage img{display:block;max-width:none}` +
    `.legend{padding:8px 12px;font-size:12px;color:#333}` +
    `</style></head><body>` +
    `<div class="legend">asset <b>${escapeHtml(a.assetId)}</b> · scale ${a.scale} · dx ${a.dx} dy ${a.dy} · opacity ${a.opacity} · orientation ${a.orientation}` +
    ` — reference art in true 30° iso will not pixel-match the 2:1 engine; re-proportion, don't trace.</div>` +
    `<div class="stage"><img src="${dataUri}" alt="reference"/>${svg}</div>` +
    `</body></html>`;

  writeFileSync(a.out, html, 'utf8');
  console.log(`Wrote ${a.out} (asset=${a.assetId}, ref=${a.ref})`);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

main();
