// Parametric standing figurine, Arup line-art style.
// Origin = feet centre (standing point). Height ~46px; figure rises in −y.
// Parts composited in render order: body → bottom → top → head → hair → accessory.

import { polygon, polyline, line, circle, pathFill, group, type Pt } from './primitives.ts';
import {
  INK,
  PAPER,
  SKIN_TONES,
  HAIR_COLORS,
  CLOTHING_COLORS,
  STROKE_THIN,
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

function limbStroke(): number {
  return STROKE_THIN + 0.5; // 1.5, matches outline weight for simple figures
}

// --- BODY (skin: neck + arms + legs skeleton as outlined shapes) --------
function body(p: FigurineParams): string {
  const skin = SKIN_TONES[p.skin] ?? SKIN_TONES['tone-2'];
  const frags: string[] = [];
  // Neck
  frags.push(
    polygon(
      [
        { x: -2, y: NECK_Y },
        { x: 2, y: NECK_Y },
        { x: 2, y: NECK_Y + 4 },
        { x: -2, y: NECK_Y + 4 },
      ],
      { fill: skin, stroke: INK, strokeWidth: limbStroke() }
    )
  );
  return frags.join('');
}

// --- BOTTOM (legs) ------------------------------------------------------
function bottom(p: FigurineParams): string {
  const frags: string[] = [];
  const isSkirt = p.bottom === 'skirt';
  const isShorts = p.bottom === 'shorts';
  const fill = CLOTHING_COLORS[p.bottom === 'skirt' ? 'slate' : 'navy'] ? PAPER : PAPER;
  // legs drawn white/outlined for line-art feel
  if (isSkirt) {
    // A-line skirt from hip to ~ -6, then two lower legs (skin) to feet.
    const skirtBottom = -7;
    frags.push(
      polygon(
        [
          { x: -HALF_HIP, y: HIP_Y },
          { x: HALF_HIP, y: HIP_Y },
          { x: HALF_HIP + 3, y: skirtBottom },
          { x: -HALF_HIP - 3, y: skirtBottom },
        ],
        { fill, strokeWidth: limbStroke() }
      )
    );
    // lower legs
    frags.push(legShape(-2.5, skirtBottom, PAPER));
    frags.push(legShape(2.5, skirtBottom, PAPER));
  } else {
    const legTop = HIP_Y;
    const legBottom = isShorts ? -8 : FEET_Y;
    // two trouser/short legs
    frags.push(trouserLeg(-3.4, legTop, legBottom, fill));
    frags.push(trouserLeg(3.4, legTop, legBottom, fill));
    if (isShorts) {
      // lower legs skin below shorts
      frags.push(legShape(-3.4, -8, PAPER));
      frags.push(legShape(3.4, -8, PAPER));
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
    { fill, strokeWidth: limbStroke() }
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
    { fill, strokeWidth: limbStroke() }
  );
}

function foot(cx: number): string {
  // small shoe: forward-pointing rounded shape
  return pathFill(
    `M ${n(cx - 2.4)} ${n(FEET_Y - 1)} L ${n(cx + 3.2)} ${n(FEET_Y - 1)} L ${n(cx + 3.6)} ${n(FEET_Y)} L ${n(cx - 2.6)} ${n(FEET_Y)} Z`,
    { fill: INK, stroke: INK, strokeWidth: STROKE_THIN }
  );
}

// --- TOP (torso + arms) -------------------------------------------------
function top(p: FigurineParams): string {
  const frags: string[] = [];
  let fill = PAPER;
  if (p.top === 'hiviz') fill = CLOTHING_COLORS['hiviz'];
  else if (p.top === 'jacket') fill = CLOTHING_COLORS['slate'];
  else if (p.top === 'hoodie') fill = CLOTHING_COLORS['teal'];
  // torso trapezoid: shoulders wider than hips
  const torso: Pt[] = [
    { x: -HALF_SHOULDER, y: SHOULDER_Y },
    { x: HALF_SHOULDER, y: SHOULDER_Y },
    { x: HALF_HIP + 1, y: HIP_Y },
    { x: -HALF_HIP - 1, y: HIP_Y },
  ];
  frags.push(polygon(torso, { fill, strokeWidth: limbStroke() }));

  // arms hang at sides (skin hands, sleeve = top colour)
  const skin = SKIN_TONES[p.skin] ?? SKIN_TONES['tone-2'];
  const armTop = SHOULDER_Y + 1;
  const armBottom = HIP_Y - 1;
  frags.push(arm(-HALF_SHOULDER - 0.5, armTop, armBottom, fill, skin));
  frags.push(arm(HALF_SHOULDER + 0.5, armTop, armBottom, fill, skin, true));

  // hi-viz detail: two fine reflective bands
  if (p.top === 'hiviz') {
    frags.push(line({ x: -HALF_SHOULDER + 1, y: -27 }, { x: HALF_SHOULDER - 1, y: -27 }, 0.7, PAPER));
    frags.push(line({ x: -HALF_HIP, y: -22 }, { x: HALF_HIP, y: -22 }, 0.7, PAPER));
  }
  // hoodie detail: hood collar
  if (p.top === 'hoodie') {
    frags.push(polyline([{ x: -3, y: SHOULDER_Y }, { x: 0, y: SHOULDER_Y + 3 }, { x: 3, y: SHOULDER_Y }], 0.9, INK));
  }
  // jacket detail: centre zip
  if (p.top === 'jacket') {
    frags.push(line({ x: 0, y: SHOULDER_Y + 1 }, { x: 0, y: HIP_Y }, 0.7, INK));
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
      { fill: sleeveFill, strokeWidth: limbStroke() }
    )
  );
  // hand
  frags.push(circle({ x: cx + dir * 1.5, y: handY }, 1.6, { fill: skin, stroke: INK, strokeWidth: STROKE_THIN }));
  return frags.join('');
}

// --- HEAD ---------------------------------------------------------------
function head(p: FigurineParams): string {
  const skin = SKIN_TONES[p.skin] ?? SKIN_TONES['tone-2'];
  const frags: string[] = [];
  frags.push(circle({ x: 0, y: HEAD_CY }, HEAD_R, { fill: skin, stroke: INK, strokeWidth: limbStroke() }));
  // minimal face: two dot eyes
  frags.push(circle({ x: -1.8, y: HEAD_CY - 0.5 }, 0.55, { fill: INK, stroke: INK, strokeWidth: 0 }));
  frags.push(circle({ x: 1.8, y: HEAD_CY - 0.5 }, 0.55, { fill: INK, stroke: INK, strokeWidth: 0 }));
  return frags.join('');
}

// --- HAIR (filled ink shape in hairColor) -------------------------------
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
          { fill: col, stroke: INK, strokeWidth: STROKE_THIN }
        )
      );
      break;
    case 'bun':
      frags.push(circle({ x: 0, y: cy - r - 1.5 }, 2.4, { fill: col, stroke: INK, strokeWidth: STROKE_THIN }));
      frags.push(hairCap(col, cy, r));
      break;
    case 'curly':
      frags.push(hairCap(col, cy, r));
      // little curl bumps around the top
      for (const dx of [-4, -1.5, 1.5, 4]) {
        frags.push(circle({ x: dx, y: cy - r + 0.5 }, 1.6, { fill: col, stroke: INK, strokeWidth: STROKE_THIN }));
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
    { fill: col, stroke: INK, strokeWidth: STROKE_THIN }
  );
}

// --- ACCESSORY ----------------------------------------------------------
function accessory(p: FigurineParams): string {
  const cy = HEAD_CY;
  const r = HEAD_R;
  switch (p.accessory) {
    case 'hardhat':
      return (
        pathFill(
          `M ${n(-r - 1.5)} ${n(cy - r + 2)} A ${n(r + 1.5)} ${n(r + 1.5)} 0 0 1 ${n(r + 1.5)} ${n(cy - r + 2)} Z`,
          { fill: CLOTHING_COLORS['hiviz'], stroke: INK, strokeWidth: STROKE_THIN }
        ) +
        line({ x: -r - 1.5, y: cy - r + 2 }, { x: r + 1.5, y: cy - r + 2 }, STROKE_THIN, INK) +
        line({ x: 0, y: cy - r - 2.5 }, { x: 0, y: cy - r + 2 }, 0.7, INK)
      );
    case 'headset':
      return (
        pathFill(`M ${n(-r)} ${n(cy)} A ${n(r)} ${n(r)} 0 0 1 ${n(r)} ${n(cy)}`, { fill: 'none', stroke: INK, strokeWidth: STROKE_THIN }) +
        circle({ x: -r, y: cy }, 1.3, { fill: PAPER, stroke: INK, strokeWidth: STROKE_THIN }) +
        circle({ x: r, y: cy }, 1.3, { fill: PAPER, stroke: INK, strokeWidth: STROKE_THIN }) +
        // mic boom
        polyline([{ x: -r, y: cy }, { x: -r - 1, y: cy + 3 }, { x: -1.5, y: cy + 3.5 }], 0.8, INK)
      );
    case 'clipboard':
      // held in front of torso
      return (
        polygon(
          [
            { x: 1, y: -24 },
            { x: 7, y: -24 },
            { x: 7, y: -16 },
            { x: 1, y: -16 },
          ],
          { fill: PAPER, stroke: INK, strokeWidth: STROKE_THIN }
        ) +
        line({ x: 2, y: -22 }, { x: 6, y: -22 }, 0.6, INK) +
        line({ x: 2, y: -20 }, { x: 6, y: -20 }, 0.6, INK) +
        line({ x: 2, y: -18 }, { x: 5, y: -18 }, 0.6, INK)
      );
    default:
      return '';
  }
}

/** Render the figurine as an SVG fragment (local coords, feet at origin). */
export function renderFigurine(params?: Record<string, unknown>): string {
  const p = normalize(params);
  const frags = [body(p), bottom(p), top(p), head(p), hair(p), accessory(p)];
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
