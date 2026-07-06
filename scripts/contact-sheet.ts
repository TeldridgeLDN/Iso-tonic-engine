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
import {
  roadStraight,
  roadCorner,
  roadT,
  riverStraight,
  riverBend,
  renderRegionOrganic,
} from '../src/assets/terrain.ts';
import { renderZone } from '../src/assets/zones.ts';
import { van } from '../src/assets/symbols/vehicles.ts';
import { deskSingle, deskMeeting, deskReception } from '../src/assets/symbols/desks.ts';
import { shopFront, cornerShop, cafeSeating, marketStall } from '../src/assets/symbols/highstreet.ts';
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
  const gridW = cols * cellW;
  const gridH = rows * cellH + 40;

  // --- special sections laid out below the standard grid ---
  const SECTION_Y = gridH + 10;
  const special = buildSpecialSections(SECTION_Y);
  const W = Math.max(gridW, special.width);
  const H = SECTION_Y + special.height + 20;

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

  parts.push(special.svg);
  parts.push('</svg>');
  return parts.join('\n');
}

// ========================================================================
// Special composed sections: tiling network, plaque'd zone, orientation strip,
// high-street set.
// ========================================================================

function sectionTitle(x: number, y: number, s: string): string {
  return `<text x="${x}" y="${y}" font-family="Helvetica, Arial, sans-serif" font-size="13" font-weight="bold" fill="${INK}">${escapeXml(s)}</text>`;
}

/** Place one ground tile of `svg` at tile coords (tx,ty) within a patch group. */
function tileAt(tx: number, ty: number, svg: string): string {
  const p = project(tx, ty);
  const grid = `<polygon points="${project(tx, ty).x},${project(tx, ty).y} ${project(tx + 1, ty).x},${project(tx + 1, ty).y} ${project(tx + 1, ty + 1).x},${project(tx + 1, ty + 1).y} ${project(tx, ty + 1).x},${project(tx, ty + 1).y}" fill="none" stroke="${GRID_GREY}" stroke-width="0.6"/>`;
  return `${grid}<g transform="translate(${p.x} ${p.y})">${svg}</g>`;
}

interface Section { svg: string; width: number; height: number }

function buildSpecialSections(topY: number): Section {
  const parts: string[] = [];
  let y = topY;
  const left = 24;

  // --- 1. Road & river 3×3 tiled network patch ---------------------------
  parts.push(sectionTitle(left, y + 4, '3×3 road + river network — seamless tiling'));
  y += 20;
  {
    // A little road network: a corner/T/straight layout, with a river running
    // diagonally, all on a shared 3×3 patch so joints can be inspected.
    const patch: string[] = [];
    // Roads: horizontal straight across middle row, a corner + T making a junction.
    // orientation convention: straight o=0 → +x axis, o=1 → +y axis.
    // row ty=1 straight run of +x roads across tx=0..2, with a T at (1,1) feeding a +y branch up.
    patch.push(tileAt(0, 1, roadStraight({ orientation: 0 })));
    patch.push(tileAt(1, 1, roadT({ orientation: 0 })));       // through +x + stem
    patch.push(tileAt(2, 1, roadStraight({ orientation: 0 })));
    // branch going up (+y axis) from the T stem: T stem points to ring[o+1]=mSE (down) for o=0…
    // so connect a +y straight below at (1,2) and a corner turning at (1,0) above.
    patch.push(tileAt(1, 2, roadStraight({ orientation: 1 })));
    patch.push(tileAt(1, 0, roadStraight({ orientation: 1 })));
    // River: a diagonal run using straight (o=1, +y axis) down the left column and a bend.
    patch.push(tileAt(0, 0, riverStraight({ orientation: 1 })));
    patch.push(tileAt(0, 2, riverBend({ orientation: 3 })));
    // fill remaining corners with a road corner to show 4-orientations join cleanly
    patch.push(tileAt(2, 0, roadCorner({ orientation: 2 })));
    patch.push(tileAt(2, 2, roadCorner({ orientation: 0 })));

    // patch origin: shift so the 3×3 diamond sits fully to the right of x=0
    const px = left + 130;
    const py = y + 20;
    parts.push(`<g transform="translate(${px} ${py})">${patch.join('')}</g>`);
    // a second, purpose-built river straight line proving river tiling across 3
    const rpx = left + 360;
    const river: string[] = [];
    river.push(tileAt(0, 0, riverStraight({ orientation: 0 })));
    river.push(tileAt(1, 1, riverStraight({ orientation: 0 })));
    river.push(tileAt(2, 2, riverStraight({ orientation: 0 })));
    // that is a diagonal; instead show a straight +x river run along one row:
    river.length = 0;
    river.push(tileAt(0, 0, riverStraight({ orientation: 0 })));
    river.push(tileAt(1, 0, riverStraight({ orientation: 0 })));
    river.push(tileAt(2, 0, riverStraight({ orientation: 0 })));
    // and a straight road run beneath it
    river.push(tileAt(0, 1, roadStraight({ orientation: 0 })));
    river.push(tileAt(1, 1, roadStraight({ orientation: 0 })));
    river.push(tileAt(2, 1, roadStraight({ orientation: 0 })));
    parts.push(`<g transform="translate(${rpx} ${py})">${river.join('')}</g>`);
    parts.push(`<text x="${px - 40}" y="${py + 130}" font-family="Helvetica, Arial, sans-serif" font-size="10" fill="#888888">junction patch</text>`);
    parts.push(`<text x="${rpx - 40}" y="${py + 130}" font-family="Helvetica, Arial, sans-serif" font-size="10" fill="#888888">straight runs</text>`);
  }
  y += 170;

  // --- 2. Plaque'd zone sample (number 3, title, 3 user groups) ----------
  parts.push(sectionTitle(left, y + 4, "Zone plaque — number 3, title, 3 user groups"));
  y += 20;
  {
    const zx = left + 160;
    const zy = y + 40;
    const zone = renderZone({ w: 4, d: 3, label: 'ONBOARDING', number: 3, userGroups: 'New joiner, Manager, IT admin' });
    parts.push(`<g transform="translate(${zx} ${zy})">${gridDiamonds(4, 3)}${zone}</g>`);
    // and an organic region with plaque
    const rx = left + 520;
    const region = renderRegionOrganic({ w: 5, d: 4, label: 'SUPPORT', number: 5, userGroups: 'Caller, Agent' });
    parts.push(`<g transform="translate(${rx} ${zy})">${region}</g>`);
    parts.push(`<text x="${rx - 60}" y="${zy + 90}" font-family="Helvetica, Arial, sans-serif" font-size="10" fill="#888888">region-organic + plaque</text>`);
  }
  y += 150;

  // --- 3. Orientation strip: van, figurine, 2×3 building at each facing ---
  parts.push(sectionTitle(left, y + 4, 'Orientation strip — van (×2), figurine (×2), 2×3 building (×4)'));
  y += 20;
  {
    const rowY = y + 90;
    let x = left + 60;
    // van orientations 0,1
    for (const o of [0, 1]) {
      parts.push(`<g transform="translate(${x} ${rowY})">${gridDiamonds(2, 1)}${van({ orientation: o })}</g>`);
      parts.push(labelSmall(x - 10, rowY + 40, `van o${o}`));
      x += 130;
    }
    // figurine orientations 0,1
    for (const o of [0, 1]) {
      const f = renderFigurine({ skin: 'tone-3', hairStyle: 'long', hairColor: 'brown', top: 'jacket', bottom: 'trousers', accessory: 'clipboard', orientation: o });
      parts.push(`<g transform="translate(${x} ${rowY})">${gridDiamonds(1, 1)}${f}</g>`);
      parts.push(labelSmall(x - 10, rowY + 40, `fig o${o}`));
      x += 90;
    }
    // building 2×3 orientations 0,1,2,3
    for (const o of [0, 1, 2, 3]) {
      const gw = o % 2 === 0 ? 2 : 3;
      const gd = o % 2 === 0 ? 3 : 2;
      const b = renderBuilding({ widthTiles: 2, depthTiles: 3, storeys: 3, windowStyle: 'grid', roof: 'flat', signage: 'ACME', orientation: o });
      parts.push(`<g transform="translate(${x} ${rowY})">${gridDiamonds(gw, gd)}${b}</g>`);
      parts.push(labelSmall(x - 10, rowY + 55, `bld o${o}`));
      x += 150;
    }
  }
  y += 160;

  // --- 3b. Staffed-desk orientation strip -------------------------------
  parts.push(sectionTitle(left, y + 4, 'Staffed desks — desk-single (×2), desk-meeting (×2), desk-reception (×4)'));
  y += 20;
  {
    const rowY = y + 100;
    let x = left + 90;
    for (const o of [0, 1]) {
      parts.push(`<g transform="translate(${x} ${rowY})">${gridDiamonds(2, 1)}${deskSingle({ orientation: o })}</g>`);
      parts.push(labelSmall(x - 20, rowY + 45, `desk-single o${o}`));
      x += 190;
    }
    for (const o of [0, 1]) {
      parts.push(`<g transform="translate(${x} ${rowY})">${gridDiamonds(2, 1)}${deskMeeting({ orientation: o })}</g>`);
      parts.push(labelSmall(x - 20, rowY + 45, `desk-meeting o${o}`));
      x += 190;
    }
    // reception 4 facings on a second row
    const rowY2 = rowY + 150;
    let x2 = left + 100;
    for (const o of [0, 1, 2, 3]) {
      parts.push(`<g transform="translate(${x2} ${rowY2})">${gridDiamonds(2, 2)}${deskReception({ orientation: o })}</g>`);
      parts.push(labelSmall(x2 - 20, rowY2 + 55, `reception o${o}`));
      x2 += 200;
    }
  }
  y += 320;

  // --- 4. High-street set -----------------------------------------------
  parts.push(sectionTitle(left, y + 4, 'High-street set — shop-front, corner-shop, café seating, market stall'));
  y += 20;
  {
    const rowY = y + 90;
    let x = left + 90;
    parts.push(`<g transform="translate(${x} ${rowY})">${gridDiamonds(2, 1)}${shopFront({ signage: 'CAFE' })}</g>`);
    parts.push(labelSmall(x - 20, rowY + 45, 'shop-front CAFE'));
    x += 210;
    parts.push(`<g transform="translate(${x} ${rowY})">${gridDiamonds(2, 1)}${shopFront({ signage: 'BAKERY', orientation: 1 })}</g>`);
    parts.push(labelSmall(x - 20, rowY + 45, 'shop-front o1'));
    x += 210;
    parts.push(`<g transform="translate(${x} ${rowY})">${gridDiamonds(1, 1)}${cornerShop({ signage: 'DELI' })}</g>`);
    parts.push(labelSmall(x - 20, rowY + 45, 'corner-shop DELI'));
    x += 160;
    // second row for props
    const rowY2 = rowY + 130;
    let x2 = left + 90;
    parts.push(`<g transform="translate(${x2} ${rowY2})">${gridDiamonds(1, 1)}${cafeSeating()}</g>`);
    parts.push(labelSmall(x2 - 20, rowY2 + 40, 'cafe-seating'));
    x2 += 160;
    parts.push(`<g transform="translate(${x2} ${rowY2})">${gridDiamonds(1, 1)}${marketStall()}</g>`);
    parts.push(labelSmall(x2 - 20, rowY2 + 40, 'market-stall'));
  }
  y += 300;

  return { svg: parts.join('\n'), width: 1200, height: y - topY + 20 };
}

function labelSmall(x: number, y: number, s: string): string {
  return `<text x="${x}" y="${y}" font-family="Helvetica, Arial, sans-serif" font-size="9" fill="#888888">${escapeXml(s)}</text>`;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const out = join(__dirname, '..', 'contact-sheet.svg');
writeFileSync(out, build(), 'utf8');
console.log(`Wrote ${out}`);
