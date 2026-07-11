// Parametric standing figurine, Variant-B flat-colour style: muted fills with
// tone-on-tone edges (each shape outlined in a darker shade of its own fill,
// never black ink), matching the sprite people. Restyled 2026-07-10 from the
// original line-art after a treatment prototype; sleeves render one tone
// darker than the torso per the sprite style contract's surface-pair rule.
// Origin = feet centre (standing point). Height ~46px; figure rises in −y.
// Parts composited in render order: body → bottom → top → head → hair → accessory.

import { polygon, polyline, line, circle, pathFill, group, mirrorX, readOrientation, type Pt } from './primitives.ts';
import {
  INK,
  PAPER,
  SKIN_TONES,
  HAIR_COLORS,
  CLOTHING_COLORS,
  n,
} from './style.ts';

export interface FigurineParams {
  skin: string; // key in SKIN_TONES
  hairStyle: string; // short | long | bun | curly | bald
  hairColor: string; // key in HAIR_COLORS
  top: string; // shirt | jacket | hoodie | hiviz
  bottom: string; // trousers | skirt | shorts
  accessory?: string; // hardhat | headset | clipboard | none
  preset?: string;
}

// --- vertical layout (px up from feet at y=0) ---------------------------
// Total ~46px. Head centre ~ -40, torso -18..-33, legs 0..-18.
const FEET_Y = 0;
const HIP_Y = -18;
const SHOULDER_Y = -33;
const NECK_Y = -34;
const HEAD_CY = -40;
const HEAD_R = 5;
const HALF_SHOULDER = 6.5;
const HALF_HIP = 5;

const EDGE_W = 0.9;

/** Darken a #rrggbb fill by factor — the tone-on-tone edge colour. */
function darken(hex: string, f = 0.72): string {
  const v = parseInt(hex.slice(1), 16);
  const c = (x: number): string => Math.round(x * f).toString(16).padStart(2, '0');
  return `#${c((v >> 16) & 255)}${c((v >> 8) & 255)}${c(v & 255)}`;
}

/** Fill + its tone-on-tone edge, ready to spread into a shape's options. */
function toned(fill: string): { fill: string; stroke: string; strokeWidth: number } {
  return { fill, stroke: darken(fill), strokeWidth: EDGE_W };
}

const TOP_FILL: Record<string, string> = {
  shirt: CLOTHING_COLORS['sand'],
  jacket: CLOTHING_COLORS['slate'],
  hoodie: CLOTHING_COLORS['teal'],
  hiviz: CLOTHING_COLORS['hiviz'],
};

const BOTTOM_FILL: Record<string, string> = {
  trousers: CLOTHING_COLORS['navy'],
  skirt: CLOTHING_COLORS['slate'],
  shorts: CLOTHING_COLORS['navy'],
};

const SHOE = darken(CLOTHING_COLORS['slate']);

// --- BODY (skin: neck) ---------------------------------------------------
function body(p: FigurineParams): string {
  const skin = SKIN_TONES[p.skin] ?? SKIN_TONES['tone-2'];
  return polygon(
    [
      { x: -2, y: NECK_Y },
      { x: 2, y: NECK_Y },
      { x: 2, y: NECK_Y + 4 },
      { x: -2, y: NECK_Y + 4 },
    ],
    toned(skin)
  );
}

// --- BOTTOM (legs) ------------------------------------------------------
function bottom(p: FigurineParams): string {
  const frags: string[] = [];
  const isSkirt = p.bottom === 'skirt';
  const isShorts = p.bottom === 'shorts';
  const skin = SKIN_TONES[p.skin] ?? SKIN_TONES['tone-2'];
  const fill = BOTTOM_FILL[p.bottom] ?? BOTTOM_FILL['trousers'];
  if (isSkirt) {
    // A-line skirt from hip to ~ -7, then two lower legs (skin) to feet.
    const skirtBottom = -7;
    frags.push(
      polygon(
        [
          { x: -HALF_HIP, y: HIP_Y },
          { x: HALF_HIP, y: HIP_Y },
          { x: HALF_HIP + 3, y: skirtBottom },
          { x: -HALF_HIP - 3, y: skirtBottom },
        ],
        toned(fill)
      )
    );
    // lower legs
    frags.push(legShape(-2.5, skirtBottom, skin));
    frags.push(legShape(2.5, skirtBottom, skin));
  } else {
    const legTop = HIP_Y;
    const legBottom = isShorts ? -8 : FEET_Y;
    // two trouser/short legs
    frags.push(trouserLeg(-3.4, legTop, legBottom, fill));
    frags.push(trouserLeg(3.4, legTop, legBottom, fill));
    if (isShorts) {
      // lower legs skin below shorts
      frags.push(legShape(-3.4, -8, skin));
      frags.push(legShape(3.4, -8, skin));
    }
  }
  // feet
  frags.push(foot(-3.4));
  frags.push(foot(3.4));
  return frags.join('');
}

function trouserLeg(cx: number, top: number, bottom: number, fill: string): string {
  const halfW = 2.6;
  return polygon(
    [
      { x: cx - halfW, y: top },
      { x: cx + halfW, y: top },
      { x: cx + halfW, y: bottom },
      { x: cx - halfW, y: bottom },
    ],
    toned(fill)
  );
}

function legShape(cx: number, top: number, fill: string): string {
  const halfW = 1.9;
  return polygon(
    [
      { x: cx - halfW, y: top },
      { x: cx + halfW, y: top },
      { x: cx + halfW, y: FEET_Y },
      { x: cx - halfW, y: FEET_Y },
    ],
    toned(fill)
  );
}

function foot(cx: number): string {
  // small shoe: forward-pointing rounded shape, dark for grounding
  return pathFill(
    `M ${n(cx - 2.4)} ${n(FEET_Y - 1)} L ${n(cx + 3.2)} ${n(FEET_Y - 1)} L ${n(cx + 3.6)} ${n(FEET_Y)} L ${n(cx - 2.6)} ${n(FEET_Y)} Z`,
    { fill: SHOE, stroke: SHOE, strokeWidth: 0 }
  );
}

// --- TOP (torso + arms) -------------------------------------------------
function top(p: FigurineParams): string {
  const frags: string[] = [];
  const fill = TOP_FILL[p.top] ?? TOP_FILL['shirt'];
  // torso trapezoid: shoulders wider than hips
  const torso: Pt[] = [
    { x: -HALF_SHOULDER, y: SHOULDER_Y },
    { x: HALF_SHOULDER, y: SHOULDER_Y },
    { x: HALF_HIP + 1, y: HIP_Y },
    { x: -HALF_HIP - 1, y: HIP_Y },
  ];
  frags.push(polygon(torso, toned(fill)));

  // arms hang at sides (skin hands, sleeve one tone darker than the torso)
  const skin = SKIN_TONES[p.skin] ?? SKIN_TONES['tone-2'];
  const armTop = SHOULDER_Y + 1;
  const armBottom = HIP_Y - 1;
  const sleeve = darken(fill, 0.86);
  frags.push(arm(-HALF_SHOULDER - 0.5, armTop, armBottom, sleeve, skin));
  frags.push(arm(HALF_SHOULDER + 0.5, armTop, armBottom, sleeve, skin, true));

  // hi-viz detail: two fine reflective bands
  if (p.top === 'hiviz') {
    frags.push(line({ x: -HALF_SHOULDER + 1, y: -27 }, { x: HALF_SHOULDER - 1, y: -27 }, 0.7, PAPER));
    frags.push(line({ x: -HALF_HIP, y: -22 }, { x: HALF_HIP, y: -22 }, 0.7, PAPER));
  }
  // hoodie detail: hood collar
  if (p.top === 'hoodie') {
    frags.push(polyline([{ x: -3, y: SHOULDER_Y }, { x: 0, y: SHOULDER_Y + 3 }, { x: 3, y: SHOULDER_Y }], 0.9, darken(fill)));
  }
  // jacket detail: centre zip
  if (p.top === 'jacket') {
    frags.push(line({ x: 0, y: SHOULDER_Y + 1 }, { x: 0, y: HIP_Y }, 0.7, darken(fill)));
  }
  return frags.join('');
}

function arm(cx: number, top: number, bottom: number, sleeveFill: string, skin: string, mirror = false): string {
  const halfW = 2;
  const handY = bottom + 1.5;
  const dir = mirror ? 1 : -1;
  const frags: string[] = [];
  // sleeve
  frags.push(
    polygon(
      [
        { x: cx - halfW, y: top },
        { x: cx + halfW, y: top },
        { x: cx + halfW + dir * 1.5, y: bottom },
        { x: cx - halfW + dir * 1.5, y: bottom },
      ],
      toned(sleeveFill)
    )
  );
  // hand
  frags.push(circle({ x: cx + dir * 1.5, y: handY }, 1.6, toned(skin)));
  return frags.join('');
}

// --- HEAD ---------------------------------------------------------------
function head(p: FigurineParams): string {
  const skin = SKIN_TONES[p.skin] ?? SKIN_TONES['tone-2'];
  const frags: string[] = [];
  frags.push(circle({ x: 0, y: HEAD_CY }, HEAD_R, toned(skin)));
  // minimal face: two dot eyes (ink — the one deliberate black detail)
  frags.push(circle({ x: -1.8, y: HEAD_CY - 0.5 }, 0.55, { fill: INK, stroke: INK, strokeWidth: 0 }));
  frags.push(circle({ x: 1.8, y: HEAD_CY - 0.5 }, 0.55, { fill: INK, stroke: INK, strokeWidth: 0 }));
  return frags.join('');
}

// --- HAIR (filled shape in hairColor, tone-on-tone edge) -----------------
function hair(p: FigurineParams): string {
  if (p.hairStyle === 'bald') return '';
  const col = HAIR_COLORS[p.hairColor] ?? HAIR_COLORS['brown'];
  const cy = HEAD_CY;
  const r = HEAD_R;
  const frags: string[] = [];
  switch (p.hairStyle) {
    case 'long':
      // cap + two panels down past the shoulders
      frags.push(
        pathFill(
          `M ${n(-r - 0.5)} ${n(cy)} A ${n(r + 0.5)} ${n(r + 0.5)} 0 0 1 ${n(r + 0.5)} ${n(cy)} L ${n(r + 0.5)} ${n(cy + 8)} L ${n(r - 1)} ${n(cy + 8)} L ${n(r - 1)} ${n(cy + 1)} L ${n(-r + 1)} ${n(cy + 1)} L ${n(-r + 1)} ${n(cy + 8)} L ${n(-r - 0.5)} ${n(cy + 8)} Z`,
          toned(col)
        )
      );
      break;
    case 'bun':
      frags.push(circle({ x: 0, y: cy - r - 1.5 }, 2.4, toned(col)));
      frags.push(hairCap(col, cy, r));
      break;
    case 'curly':
      frags.push(hairCap(col, cy, r));
      // little curl bumps around the top
      for (const dx of [-4, -1.5, 1.5, 4]) {
        frags.push(circle({ x: dx, y: cy - r + 0.5 }, 1.6, toned(col)));
      }
      break;
    case 'short':
    default:
      frags.push(hairCap(col, cy, r));
      break;
  }
  return frags.join('');
}

function hairCap(col: string, cy: number, r: number): string {
  // upper dome of the head, from left ear to right ear over the top
  return pathFill(
    `M ${n(-r - 0.4)} ${n(cy + 0.5)} A ${n(r + 0.4)} ${n(r + 0.4)} 0 0 1 ${n(r + 0.4)} ${n(cy + 0.5)} L ${n(r - 0.6)} ${n(cy + 0.2)} A ${n(r - 0.6)} ${n(r - 0.6)} 0 0 0 ${n(-r + 0.6)} ${n(cy + 0.2)} Z`,
    toned(col)
  );
}

// --- ACCESSORY ----------------------------------------------------------
function accessory(p: FigurineParams): string {
  const cy = HEAD_CY;
  const r = HEAD_R;
  const slateDark = darken(CLOTHING_COLORS['slate']);
  switch (p.accessory) {
    case 'hardhat': {
      const hv = CLOTHING_COLORS['hiviz'];
      return (
        pathFill(
          `M ${n(-r - 1.5)} ${n(cy - r + 2)} A ${n(r + 1.5)} ${n(r + 1.5)} 0 0 1 ${n(r + 1.5)} ${n(cy - r + 2)} Z`,
          toned(hv)
        ) +
        line({ x: -r - 1.5, y: cy - r + 2 }, { x: r + 1.5, y: cy - r + 2 }, EDGE_W, darken(hv)) +
        line({ x: 0, y: cy - r - 2.5 }, { x: 0, y: cy - r + 2 }, 0.7, darken(hv))
      );
    }
    case 'headset':
      return (
        pathFill(`M ${n(-r)} ${n(cy)} A ${n(r)} ${n(r)} 0 0 1 ${n(r)} ${n(cy)}`, { fill: 'none', stroke: slateDark, strokeWidth: 1 }) +
        circle({ x: -r, y: cy }, 1.3, { fill: slateDark, stroke: slateDark, strokeWidth: 0 }) +
        circle({ x: r, y: cy }, 1.3, { fill: slateDark, stroke: slateDark, strokeWidth: 0 }) +
        // mic boom
        polyline([{ x: -r, y: cy }, { x: -r - 1, y: cy + 3 }, { x: -1.5, y: cy + 3.5 }], 0.8, slateDark)
      );
    case 'clipboard':
      // held in front of torso: cream board, slate rule lines
      return (
        polygon(
          [
            { x: 1, y: -24 },
            { x: 7, y: -24 },
            { x: 7, y: -16 },
            { x: 1, y: -16 },
          ],
          toned(CLOTHING_COLORS['sand'])
        ) +
        line({ x: 2, y: -22 }, { x: 6, y: -22 }, 0.6, slateDark) +
        line({ x: 2, y: -20 }, { x: 6, y: -20 }, 0.6, slateDark) +
        line({ x: 2, y: -18 }, { x: 5, y: -18 }, 0.6, slateDark)
      );
    default:
      return '';
  }
}

/** Render the figurine as an SVG fragment (local coords, feet at origin). */
export function renderFigurine(params?: Record<string, unknown>): string {
  const p = normalize(params);
  const frags = [body(p), bottom(p), top(p), head(p), hair(p), accessory(p)];
  // orientations: 2 — facing 1|3 mirror about the feet anchor (x=0). No text
  // inside the figurine, so a plain scale(-1,1) is safe.
  const o = readOrientation(params);
  if (o === 1 || o === 3) return mirrorX(frags, 0);
  return group(0, 0, frags);
}

function normalize(params?: Record<string, unknown>): FigurineParams {
  const d = defaultFigurine();
  if (!params) return d;
  return {
    skin: (params.skin as string) ?? d.skin,
    hairStyle: (params.hairStyle as string) ?? d.hairStyle,
    hairColor: (params.hairColor as string) ?? d.hairColor,
    top: (params.top as string) ?? d.top,
    bottom: (params.bottom as string) ?? d.bottom,
    accessory: (params.accessory as string) ?? d.accessory,
    preset: params.preset as string | undefined,
  };
}

export function defaultFigurine(): FigurineParams {
  return {
    skin: 'tone-2',
    hairStyle: 'short',
    hairColor: 'brown',
    top: 'shirt',
    bottom: 'trousers',
    accessory: 'none',
  };
}

// --- deterministic randomiser -------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomFigurineParams(rngSeed: number): FigurineParams {
  const rnd = mulberry32(rngSeed);
  const pick = <T>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)];
  return {
    skin: pick(Object.keys(SKIN_TONES)),
    hairStyle: pick(['short', 'long', 'bun', 'curly', 'bald']),
    hairColor: pick(Object.keys(HAIR_COLORS)),
    top: pick(['shirt', 'jacket', 'hoodie', 'hiviz']),
    bottom: pick(['trousers', 'skirt', 'shorts']),
    accessory: pick(['hardhat', 'headset', 'clipboard', 'none']),
  };
}
