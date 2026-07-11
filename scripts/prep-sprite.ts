// prep-sprite — one command from raw art to a registered sprite.
//
//   npm run prep-sprite -- <input.png|jpg> [options]
//
// Options:
//   --name <id>        output basename (default: input filename stem).
//                      Auto-discovery kebab-cases this into the asset id.
//   --footprint WxD    ground footprint in tiles, e.g. 2x1 (default 1x1)
//   --width-px N       on-screen billboard width in px (default 64)
//   --category <cat>   palette category (default prop)
//   --facing N         write <name>.oN.png (orientation 0-3) instead of
//                      <name>.png, for per-facing variants (e.g. a car).
//
// Pipeline (sharp): load → key near-white (r,g,b all > 235) to transparent →
// trim to the content bounding box → downscale so the longest side is <= 512px →
// write an optimized PNG into src/assets/sprites/<name>[.oN].png, and scaffold a
// <name>.json sidecar (created if absent; provided flags merged if it exists).
//
// After this runs, the sprite is auto-discovered by spriteAuto.ts — it appears
// in the library, the app palette, and the contact sheet with no further edits.
//
// Image library choice: `sharp` (devDependency). It installed and ran cleanly on
// this machine (verified: raw RGBA round-trip, alpha preserved). No Python/PIL
// fallback was needed.

import sharp from 'sharp';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename, extname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..');
const SPRITES_DIR = join(REPO, 'src', 'assets', 'sprites');

const MAX_SIDE = 512;
const WHITE_THRESHOLD = 235; // r,g,b ALL strictly greater than this ⇒ background

interface Args {
  input: string;
  name?: string;
  footprint?: { w: number; d: number };
  widthPx?: number;
  category?: string;
  facing?: number;
}

/** Parse argv into typed options; throw a helpful error on misuse. */
function parseArgs(argv: string[]): Args {
  const positional: string[] = [];
  const opts: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const val = argv[i + 1];
      if (val === undefined || val.startsWith('--')) {
        throw new Error(`option --${key} needs a value`);
      }
      opts[key] = val;
      i++;
    } else {
      positional.push(a);
    }
  }
  if (positional.length === 0) {
    throw new Error(
      'usage: npm run prep-sprite -- <input.png|jpg> [--name id] [--footprint WxD] [--width-px N] [--category cat] [--facing N]'
    );
  }

  const out: Args = { input: positional[0] };
  if (opts.name) out.name = sanitizeName(opts.name);
  if (opts.footprint) out.footprint = parseFootprint(opts.footprint);
  if (opts['width-px']) {
    const n = Number(opts['width-px']);
    if (!Number.isFinite(n) || n <= 0) throw new Error(`--width-px must be a positive number, got "${opts['width-px']}"`);
    out.widthPx = n;
  }
  if (opts.category) out.category = opts.category;
  if (opts.facing !== undefined) {
    const f = Number(opts.facing);
    if (!Number.isInteger(f) || f < 0 || f > 3) throw new Error(`--facing must be an integer 0-3, got "${opts.facing}"`);
    out.facing = f;
  }
  return out;
}

function parseFootprint(s: string): { w: number; d: number } {
  const m = /^(\d+)\s*[xX]\s*(\d+)$/.exec(s.trim());
  if (!m) throw new Error(`--footprint must look like WxD (e.g. 2x1), got "${s}"`);
  const w = Number(m[1]);
  const d = Number(m[2]);
  if (w <= 0 || d <= 0) throw new Error(`--footprint dimensions must be positive, got "${s}"`);
  return { w, d };
}

/** Keep a filesystem-safe stem: letters, digits, dot, dash, underscore. */
function sanitizeName(raw: string): string {
  const cleaned = raw.replace(/\.(png|jpe?g)$/i, '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  if (!cleaned) throw new Error(`--name "${raw}" sanitized to empty`);
  return cleaned;
}

interface Bbox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface KeyResult {
  bbox: Bbox | null;
  /** True if any pixel inside the bbox is transparent (a non-rectangular cut-out). */
  transparentInsideBbox: boolean;
}

/**
 * Key near-white to transparent IN PLACE on an RGBA buffer, and return the
 * bounding box of the remaining opaque content. Pixels already transparent in
 * the source (alpha 0) do not count toward the bbox. Also reports whether any
 * transparent pixel falls INSIDE that bbox — a fully-opaque rectangular subject
 * has none, and its output PNG legitimately carries no alpha channel.
 */
function keyWhiteAndBbox(data: Buffer, width: number, height: number, channels: number): KeyResult {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      if (r > WHITE_THRESHOLD && g > WHITE_THRESHOLD && b > WHITE_THRESHOLD) {
        data[idx + 3] = 0; // background ⇒ fully transparent
      }
      if (data[idx + 3] > 0) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return { bbox: null, transparentInsideBbox: false };
  const bbox: Bbox = { minX, minY, maxX, maxY };
  let transparentInsideBbox = false;
  for (let y = minY; y <= maxY && !transparentInsideBbox; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (data[(y * width + x) * channels + 3] === 0) {
        transparentInsideBbox = true;
        break;
      }
    }
  }
  return { bbox, transparentInsideBbox };
}

/**
 * Merge provided flag values into a (possibly existing) sidecar object. When
 * `baseIntrinsic` is supplied (i.e. we just wrote the orientation-0 base image),
 * record the PNG's pixel size so the runtime derives the billboard aspect ratio
 * without decoding image bytes. Variant (`.oN`) writes leave any existing
 * intrinsic untouched — it describes the base image only.
 */
function buildSidecar(
  existing: Record<string, unknown>,
  args: Args,
  baseIntrinsic?: { w: number; h: number }
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...existing };
  // Only write keys the user provided, or defaults when the sidecar is brand new.
  const brandNew = Object.keys(existing).length === 0;
  if (args.footprint) out.footprint = args.footprint;
  else if (brandNew) out.footprint = { w: 1, d: 1 };
  if (args.widthPx !== undefined) out.widthPx = args.widthPx;
  else if (brandNew) out.widthPx = 64;
  if (args.category) out.category = args.category;
  else if (brandNew) out.category = 'prop';
  if (baseIntrinsic) out.intrinsic = baseIntrinsic;
  return out;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const inputPath = resolve(process.cwd(), args.input);
  if (!existsSync(inputPath)) throw new Error(`input not found: ${inputPath}`);

  const name = args.name ?? sanitizeName(basename(inputPath, extname(inputPath)));
  const outFile = args.facing !== undefined ? `${name}.o${args.facing}.png` : `${name}.png`;
  const outPath = join(SPRITES_DIR, outFile);
  const sidecarPath = join(SPRITES_DIR, `${name}.json`);

  if (!existsSync(SPRITES_DIR)) mkdirSync(SPRITES_DIR, { recursive: true });

  // 1. load → RGBA raw
  const { data, info } = await sharp(inputPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  if (channels !== 4) throw new Error(`expected 4 (RGBA) channels after ensureAlpha, got ${channels}`);

  // 2. key near-white → transparent, and 3. find content bbox
  const { bbox, transparentInsideBbox } = keyWhiteAndBbox(data, width, height, channels);
  if (!bbox) throw new Error('after keying near-white, no opaque content remained — nothing to trim to');
  const bw = bbox.maxX - bbox.minX + 1;
  const bh = bbox.maxY - bbox.minY + 1;

  // rebuild a sharp pipeline from the keyed raw buffer, trimmed to the bbox
  let img = sharp(data, { raw: { width, height, channels } }).extract({
    left: bbox.minX,
    top: bbox.minY,
    width: bw,
    height: bh,
  });

  // 4. downscale so the longest side ≤ MAX_SIDE (never upscale)
  const longest = Math.max(bw, bh);
  if (longest > MAX_SIDE) {
    if (bw >= bh) img = img.resize({ width: MAX_SIDE });
    else img = img.resize({ height: MAX_SIDE });
  }

  // 5. write optimized PNG (lossless, max compression). ensureAlpha() forces a
  // 4-channel RGBA output even when the trimmed subject happens to be fully
  // opaque (a rectangular subject), so a sprite billboard always carries an
  // alpha channel for consistent compositing/export.
  await img.ensureAlpha().png({ compressionLevel: 9, effort: 10 }).toFile(outPath);

  // read back the written PNG's pixel size (drives the sidecar `intrinsic`).
  const outMeta = await sharp(outPath).metadata();

  // sidecar: create if absent, merge provided flags if present. Only the
  // orientation-0 base write records `intrinsic` (variants describe facings).
  const isBaseWrite = args.facing === undefined;
  const baseIntrinsic =
    isBaseWrite && outMeta.width && outMeta.height
      ? { w: outMeta.width, h: outMeta.height }
      : undefined;
  const existing: Record<string, unknown> = existsSync(sidecarPath)
    ? (JSON.parse(readFileSync(sidecarPath, 'utf8')) as Record<string, unknown>)
    : {};
  const sidecar = buildSidecar(existing, args, baseIntrinsic);
  writeFileSync(sidecarPath, JSON.stringify(sidecar, null, 2) + '\n', 'utf8');

  // verify + report
  const hasAlpha = outMeta.hasAlpha === true;
  const okSize = (outMeta.width ?? 0) <= MAX_SIDE && (outMeta.height ?? 0) <= MAX_SIDE;
  // A cut-out with transparent pixels inside its bbox MUST retain an alpha
  // channel; a fully-opaque rectangular subject legitimately has none.
  const okAlpha = transparentInsideBbox ? hasAlpha : true;
  // eslint-disable-next-line no-console
  console.log(`\nprep-sprite: wrote ${outPath}`);
  // eslint-disable-next-line no-console
  console.log(
    `  source ${width}×${height} → trimmed ${bw}×${bh} → output ${outMeta.width}×${outMeta.height} ` +
      `(alpha=${hasAlpha}${transparentInsideBbox ? '' : ', subject fully opaque — no alpha needed'})`
  );
  // eslint-disable-next-line no-console
  console.log(`  sidecar ${sidecarPath}: ${JSON.stringify(sidecar)}`);
  if (!okAlpha || !okSize) {
    throw new Error(`output verification FAILED (alphaOK=${okAlpha}, ≤${MAX_SIDE}px=${okSize})`);
  }
  // eslint-disable-next-line no-console
  console.log(`  OK — drop-in complete; run "npm run contact-sheet" to see it.`);
}

main().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error(`prep-sprite: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
