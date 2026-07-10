// gen-sprite — generate sprite art via the OpenAI Images API in the house style.
//
//   npm run gen-sprite -- "<subject>" --name <id> [options]
//
// Options:
//   --name <id>        sprite id (kebab-case); required.
//   --vehicle          grid mode: ONE generation containing a 2x2 grid of all
//                      four facings (much better cross-facing consistency than
//                      four separate calls, which tend to ignore facing text).
//                      Slices + cleans the quadrants but does NOT auto-prep:
//                      the model does not reliably honour quadrant order, so
//                      eyeball each quadrant and run prep-sprite with the
//                      correct --facing yourself (instructions are printed).
//   --footprint WxD    passed through to prep-sprite (default 1x1; use 2x1 for
//                      vehicles).
//   --width-px N       passed through to prep-sprite.
//   --category <cat>   passed through to prep-sprite (default prop).
//   --quality <q>      gpt-image-1 quality: low | medium | high (default high;
//                      high costs roughly $0.17 per generated image).
//   --from <path>      skip the API: use an existing PNG (a manual ChatGPT
//                      download, or a previous grid) as the generation result.
//   --no-clean         skip the shadow/off-white scrub (see below).
//   --dry-run          print the prompt(s) and exit without calling the API.
//
// Pipeline: compose prompt (house style clause + subject) → gpt-image-1 →
// clean: flood-fill from the borders, turning near-background and light
// low-chroma pixels (cast shadows) pure white so prep-sprite's >235 key
// removes them → single mode: prep-sprite is invoked automatically;
// vehicle mode: cleaned quadrants are left as <id>-q0..q3-raw.png for
// facing assignment.
//
// CLEANING CAVEAT: the shadow scrub treats border-connected pixels with
// chroma (max-min) <= 40 and min channel >= 170 as background. A subject that
// is itself pale AND grey (white/silver objects) can be eaten — use --no-clean
// for those and fix the background in the source image instead.
//
// API key: OPENAI_API_KEY in the environment, or an OPENAI_API_KEY=... line in
// src/.env (gitignored — keys must never be committed).

import sharp from 'sharp';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..');
const SPRITES_DIR = join(REPO, 'src', 'assets', 'sprites');

// Verbatim house style clause (docs/REPLICATING_REFERENCES.md), plus an
// explicit no-shadow reinforcement — gpt-image-1 adds ground shadows unless
// told repeatedly not to.
const STYLE_CLAUSE =
  'drawn as a flat vector isometric illustration, viewed from a front-corner three-quarter angle ' +
  'with two faces showing (a corner pointing toward the viewer). Flat solid colour fills, muted ' +
  'slightly-desaturated palette, one lighter and one darker tone per surface pair to model form, ' +
  'no gradients, no outlines heavier than a hairline. Pure white #FFFFFF background. The subject ' +
  'fills the frame with a thin margin. No background scene, no drop shadow, no cast shadow, no ' +
  'ground plane or floor, no text, no border. ABSOLUTELY NO shadows of any kind, no ground ' +
  'shading. Clean minimal commercial isometric-flat style, like premium flat vector stock illustration.';

/** "a coffee mug" → "coffee mug", for slots that supply their own article. */
function stripArticle(subject: string): string {
  return subject.replace(/^(a|an|the)\s+/i, '');
}

function gridPrompt(subject: string): string {
  return (
    `A 2x2 grid showing THE SAME ${stripArticle(subject)} from four different isometric viewpoints, like game ` +
    'asset rotation sheets: facing north-east, south-east, south-west and north-west along the ' +
    'isometric ground axes (front pointing upper-right, lower-right, lower-left, upper-left — one ' +
    'per quadrant). Identical subject in all four: same proportions, same colours, same details. ' +
    STYLE_CLAUSE +
    ' No labels, no grid lines, no borders between quadrants.'
  );
}

function singlePrompt(subject: string): string {
  return `A ${stripArticle(subject)}, ${STYLE_CLAUSE}`;
}

interface Args {
  subject: string;
  name: string;
  vehicle: boolean;
  footprint: string;
  widthPx?: string;
  category?: string;
  quality: string;
  from?: string;
  clean: boolean;
  dryRun: boolean;
}

function parseArgs(argv: string[]): Args {
  const positional: string[] = [];
  const opts: Record<string, string | true> = {};
  const flags = new Set(['vehicle', 'no-clean', 'dry-run']);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      if (flags.has(key)) {
        opts[key] = true;
      } else {
        const val = argv[i + 1];
        if (val === undefined || val.startsWith('--')) throw new Error(`option --${key} needs a value`);
        opts[key] = val;
        i++;
      }
    } else {
      positional.push(a);
    }
  }
  if (positional.length !== 1 || typeof opts.name !== 'string') {
    throw new Error('usage: npm run gen-sprite -- "<subject>" --name <id> [--vehicle] [--footprint WxD] [--width-px N] [--category cat] [--quality q] [--from path] [--no-clean] [--dry-run]');
  }
  const quality = typeof opts.quality === 'string' ? opts.quality : 'high';
  if (!['low', 'medium', 'high'].includes(quality)) throw new Error(`--quality must be low|medium|high, got "${quality}"`);
  return {
    subject: positional[0],
    name: opts.name,
    vehicle: opts.vehicle === true,
    footprint: typeof opts.footprint === 'string' ? opts.footprint : '1x1',
    widthPx: typeof opts['width-px'] === 'string' ? opts['width-px'] : undefined,
    category: typeof opts.category === 'string' ? opts.category : undefined,
    quality,
    from: typeof opts.from === 'string' ? opts.from : undefined,
    clean: opts['no-clean'] !== true,
    dryRun: opts['dry-run'] === true,
  };
}

function apiKey(): string {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  const envPath = join(REPO, 'src', '.env');
  if (existsSync(envPath)) {
    const m = readFileSync(envPath, 'utf8').match(/^OPENAI_API_KEY=(.+)$/m);
    if (m) return m[1].trim();
  }
  throw new Error('no OPENAI_API_KEY in the environment or src/.env');
}

async function generate(prompt: string, quality: string): Promise<Buffer> {
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-image-1', prompt, size: '1024x1024', quality }),
  });
  if (!res.ok) throw new Error(`OpenAI API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as { data: Array<{ b64_json: string }> };
  return Buffer.from(json.data[0].b64_json, 'base64');
}

/**
 * Flood-fill from the image borders, whitening background and cast-shadow
 * pixels: anything within colour-distance 40 of the corner-sampled background,
 * or light and low-chroma (shadows), or already pure white. Interior whites
 * (headlights, paper) are safe — only border-connected regions are touched.
 */
async function cleanBackground(png: Buffer): Promise<Buffer> {
  const img = sharp(png).ensureAlpha();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels } = info;
  const bg = [data[(2 * w + 2) * channels], data[(2 * w + 2) * channels + 1], data[(2 * w + 2) * channels + 2]];
  const bgish = (i: number): boolean => {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const d2 = (r - bg[0]) ** 2 + (g - bg[1]) ** 2 + (b - bg[2]) ** 2;
    const lo = Math.min(r, g, b), hi = Math.max(r, g, b);
    return d2 < 1600 || (hi - lo <= 40 && lo >= 170) || (r === 255 && g === 255 && b === 255);
  };
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  const push = (x: number, y: number) => {
    const p = y * w + x;
    if (!seen[p] && bgish(p * channels)) { seen[p] = 1; stack.push(p); }
  };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  while (stack.length) {
    const p = stack.pop() as number;
    const i = p * channels;
    data[i] = 255; data[i + 1] = 255; data[i + 2] = 255;
    const x = p % w, y = (p / w) | 0;
    if (x > 0) push(x - 1, y);
    if (x < w - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < h - 1) push(x, y + 1);
  }
  return sharp(data, { raw: { width: w, height: h, channels } }).png().toBuffer();
}

function prep(rawPath: string, a: Args, facing?: number): void {
  const args = ['run', 'prep-sprite', '--', rawPath, '--name', a.name, '--footprint', a.footprint];
  if (a.widthPx) args.push('--width-px', a.widthPx);
  if (a.category) args.push('--category', a.category);
  if (facing !== undefined) args.push('--facing', String(facing));
  execFileSync('npm', args, { stdio: 'inherit', cwd: REPO });
}

async function main(): Promise<void> {
  const a = parseArgs(process.argv.slice(2));
  const prompt = a.vehicle ? gridPrompt(a.subject) : singlePrompt(a.subject);

  if (a.dryRun) {
    console.log(`gen-sprite (dry run) — ${a.vehicle ? 'vehicle 2x2 grid' : 'single facing'}:\n\n${prompt}`);
    return;
  }

  let png: Buffer;
  if (a.from) {
    png = readFileSync(a.from);
    console.log(`gen-sprite: using existing image ${a.from}`);
  } else {
    console.log(`gen-sprite: generating via gpt-image-1 (quality ${a.quality})…`);
    png = await generate(prompt, a.quality);
  }

  if (!a.vehicle) {
    const cleaned = a.clean ? await cleanBackground(png) : png;
    const rawPath = join(SPRITES_DIR, `${a.name}-gen-raw.png`);
    writeFileSync(rawPath, cleaned);
    prep(rawPath, a);
    execFileSync('rm', [rawPath]);
    console.log(`gen-sprite: done — ${a.name} prepped and registered. Eyeball it with "npm run contact-sheet".`);
    return;
  }

  // Vehicle grid: slice quadrants, clean each, leave for manual facing assignment.
  const meta = await sharp(png).metadata();
  const qw = Math.floor((meta.width ?? 1024) / 2);
  const qh = Math.floor((meta.height ?? 1024) / 2);
  const quads: Array<[number, number]> = [[0, 0], [qw, 0], [0, qh], [qw, qh]];
  for (let i = 0; i < 4; i++) {
    const [left, top] = quads[i];
    let quad = await sharp(png).extract({ left, top, width: qw, height: qh }).png().toBuffer();
    if (a.clean) quad = await cleanBackground(quad);
    writeFileSync(join(SPRITES_DIR, `${a.name}-q${i}-raw.png`), quad);
  }
  console.log(
    `gen-sprite: wrote 4 cleaned quadrants to src/assets/sprites/${a.name}-q0..q3-raw.png\n` +
      'The model does NOT reliably order facings — eyeball each quadrant, then per quadrant run:\n' +
      `  npm run prep-sprite -- src/assets/sprites/${a.name}-q<N>-raw.png --name ${a.name} --footprint ${a.footprint} --facing <0=NE|1=SE|2=SW|3=NW>\n` +
      `then delete the ${a.name}-q*-raw.png drops.`
  );
}

main().catch((err) => {
  console.error(`gen-sprite: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
