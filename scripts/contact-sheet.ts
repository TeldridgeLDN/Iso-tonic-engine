// Renders every registry asset (plus varied figurines, building variants and a
// callout sample) onto one SVG contact sheet for visual verification.
// Under each asset: a faint grid of base diamonds so anchor/footprint alignment
// is checkable. Writes contact-sheet.svg at the repo root.
//
//   npm run contact-sheet

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { listAssets, getAsset, type AssetDef } from '../src/assets/library.ts';
import { renderFigurine, randomFigurineParams } from '../src/assets/figurine.ts';
import { renderBuilding } from '../src/assets/building.ts';
import { renderCallout } from '../src/assets/callout.ts';
import { GRID_GREY, INK } from '../src/assets/style.ts';

const HALF_W = 32;
const HALF_H = 16;

function project(tx: number, ty: number): { x: number; y: number } {
  return { x: (tx - ty) * HALF_W, y: (tx + ty) * HALF_H };
}

/** Faint base-diamond grid covering an n×m tile area at local origin. */
function gridDiamonds(w: number, d: number): string {
  const parts: string[] = [];
  for (let tx = 0; tx < w; tx++) {
    for (let ty = 0; ty < d; ty++) {
      const nn = project(tx, ty);
      const e = project(tx + 1, ty);
      const s = project(tx + 1, ty + 1);
      const ww = project(tx, ty + 1);
      parts.push(
        `<polygon points="${nn.x},${nn.y} ${e.x},${e.y} ${s.x},${s.y} ${ww.x},${ww.y}" fill="none" stroke="${GRID_GREY}" stroke-width="0.7"/>`
      );
    }
  }
  return parts.join('');
}

interface Cell {
  id: string;
  svg: string;
  gw: number; // grid tiles wide to draw under it
  gd: number;
}

function cellFor(a: AssetDef): Cell {
  const fp = a.footprint;
  // free-placed assets (no footprint): draw a single reference diamond
  const gw = fp ? fp.w : 1;
  const gd = fp ? fp.d : 1;
  return { id: a.id, svg: a.render(), gw, gd };
}

function build(): string {
  const cells: Cell[] = [];

  // Every registry asset
  for (const a of listAssets()) {
    cells.push(cellFor(a));
  }

  // 8 varied figurines from seeds
  for (let i = 0; i < 8; i++) {
    const params = randomFigurineParams(1000 + i * 37);
    cells.push({ id: `fig-seed-${i}`, svg: renderFigurine(params as unknown as Record<string, unknown>), gw: 1, gd: 1 });
  }

  // 3 building variants (explicit)
  cells.push({ id: 'bld-ribbon-plant', svg: renderBuilding({ widthTiles: 2, depthTiles: 2, storeys: 4, windowStyle: 'ribbon', roof: 'plant', signage: 'EAT & DRINK' }), gw: 2, gd: 2 });
  cells.push({ id: 'bld-grid-pitched', svg: renderBuilding({ widthTiles: 2, depthTiles: 1, storeys: 2, windowStyle: 'grid', roof: 'pitched' }), gw: 2, gd: 1 });
  cells.push({ id: 'bld-tall-grid', svg: renderBuilding({ widthTiles: 1, depthTiles: 1, storeys: 7, windowStyle: 'grid', roof: 'flat' }), gw: 1, gd: 1 });

  // callout sample
  void getAsset;
  cells.push({ id: 'callout-sample', svg: renderCallout({ text: 'PAYMENTS API', leader: true }), gw: 1, gd: 1 });

  // layout grid
  const cols = 6;
  const cellW = 200;
  const cellH = 200;
  // anchor point within each cell (below vertical centre so tall assets fit)
  const anchorX = cellW / 2;
  const anchorY = cellH * 0.72;

  const rows = Math.ceil(cells.length / cols);
  const W = cols * cellW;
  const H = rows * cellH + 40;

  const parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`);
  parts.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="#FFFFFF"/>`);
  parts.push(`<text x="12" y="26" font-family="Helvetica, Arial, sans-serif" font-size="16" font-weight="bold" fill="${INK}">Iso-tonic Engine — Asset Contact Sheet (${cells.length} tiles)</text>`);

  cells.forEach((c, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const ox = col * cellW + anchorX;
    const oy = row * cellH + anchorY + 30;
    // cell frame
    parts.push(`<rect x="${col * cellW}" y="${row * cellH + 30}" width="${cellW}" height="${cellH}" fill="none" stroke="#E4E4E4" stroke-width="1"/>`);
    // grid diamonds under the asset, then the asset, at the anchor
    parts.push(`<g transform="translate(${ox} ${oy})">${gridDiamonds(c.gw, c.gd)}${c.svg}</g>`);
    // label
    parts.push(`<text x="${col * cellW + 6}" y="${row * cellH + 30 + cellH - 8}" font-family="Helvetica, Arial, sans-serif" font-size="10" fill="#888888">${escapeXml(c.id)}</text>`);
  });

  parts.push('</svg>');
  return parts.join('\n');
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const out = join(__dirname, '..', 'contact-sheet.svg');
writeFileSync(out, build(), 'utf8');
console.log(`Wrote ${out}`);
