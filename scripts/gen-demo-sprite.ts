// Generate the placeholder demo sprite PNG (src/assets/sprites/demo-crate.png).
// A simple isometric-ish crate on a transparent background, drawn pixel-by-pixel
// and encoded as a minimal RGBA PNG via zlib — no image libraries needed. This
// is a PLACEHOLDER for a user's real art; re-run to regenerate.
//
//   npx vite-node scripts/gen-demo-sprite.ts

import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const W = 96;
const H = 112;

// RGBA canvas, transparent.
const px = new Uint8Array(W * H * 4);
function set(x: number, y: number, r: number, g: number, b: number, a = 255): void {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4;
  px[i] = r;
  px[i + 1] = g;
  px[i + 2] = b;
  px[i + 3] = a;
}

const INK: [number, number, number] = [26, 26, 26];
const PAPER: [number, number, number] = [255, 255, 255];

// Fill a convex quad (4 pts) with a flat colour by scanline point-in-poly.
function fillQuad(pts: Array<[number, number]>, c: [number, number, number]): void {
  const ys = pts.map((p) => p[1]);
  const y0 = Math.floor(Math.min(...ys));
  const y1 = Math.ceil(Math.max(...ys));
  for (let y = y0; y <= y1; y++) {
    const xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i];
      const [bx, by] = pts[(i + 1) % pts.length];
      if (ay === by) continue;
      if ((y >= ay && y < by) || (y >= by && y < ay)) {
        xs.push(ax + ((y - ay) / (by - ay)) * (bx - ax));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      for (let x = Math.floor(xs[k]); x <= Math.ceil(xs[k + 1]); x++) set(x, y, ...c);
    }
  }
}

function stroke(a: [number, number], b: [number, number]): void {
  const steps = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = Math.round(a[0] + (b[0] - a[0]) * t);
    const y = Math.round(a[1] + (b[1] - a[1]) * t);
    for (const [ox, oy] of [[0, 0], [1, 0], [0, 1]] as const) set(x + ox, y + oy, ...INK);
  }
}

// An iso crate: top diamond + two side faces. Coords in the 96×112 canvas,
// bottom-anchored (the base vertex sits near the bottom-centre).
const cx = W / 2;
const topY = 24;
const midY = 56;
const botY = 96;
const halfW = 40;

const tN: [number, number] = [cx, topY];
const tE: [number, number] = [cx + halfW, topY + 20];
const tS: [number, number] = [cx, topY + 40];
const tW: [number, number] = [cx - halfW, topY + 20];
const bE: [number, number] = [cx + halfW, midY + 20];
const bS: [number, number] = [cx, midY + 40];
const bW: [number, number] = [cx - halfW, midY + 20];
void botY;

// faces (paper fill) then edges (ink)
fillQuad([tW, tS, bS, bW], PAPER); // left face
fillQuad([tS, tE, bE, bS], PAPER); // right face
fillQuad([tN, tE, tS, tW], PAPER); // top
for (const [a, b] of [
  [tN, tE], [tE, tS], [tS, tW], [tW, tN], // top diamond
  [tW, bW], [tS, bS], [tE, bE], // verticals
  [bW, bS], [bS, bE], // bottom edges
] as Array<[[number, number], [number, number]]>) stroke(a, b);

// ---- encode as PNG ----
function chunk(type: string, data: Uint8Array): Uint8Array {
  const len = data.length;
  const out = new Uint8Array(12 + len);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, len);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  const crcBuf = out.subarray(4, 8 + len);
  dv.setUint32(8 + len, crc32(crcBuf));
  return out;
}

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const ihdr = new Uint8Array(13);
const idv = new DataView(ihdr.buffer);
idv.setUint32(0, W);
idv.setUint32(4, H);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // colour type RGBA
// filter method 0 per scanline
const raw = new Uint8Array(H * (1 + W * 4));
for (let y = 0; y < H; y++) {
  raw[y * (1 + W * 4)] = 0;
  raw.set(px.subarray(y * W * 4, (y + 1) * W * 4), y * (1 + W * 4) + 1);
}
const idat = deflateSync(raw);
const png = Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', new Uint8Array(0))]);

const __dirname = dirname(fileURLToPath(import.meta.url));
const out = join(__dirname, '..', 'src', 'assets', 'sprites', 'demo-crate.png');
writeFileSync(out, png);
console.log(`Wrote ${out} (${png.length} bytes, ${W}×${H})`);
