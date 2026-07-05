// Asset style-contract tokens. Duplicated from core/iso.ts on purpose:
// assets must have NO imports outside src/assets/.
//
// 2:1 isometric. screen = ((tx − ty)·32, (tx + ty)·16).

export const TILE_W = 64;
export const TILE_H = 32;
export const HALF_W = TILE_W / 2; // 32
export const HALF_H = TILE_H / 2; // 16

export const INK = '#1A1A1A';
export const PAPER = '#FFFFFF';
export const ACCENT = '#E8541D';
export const DIM_OPACITY = 0.15;

export const STROKE = 1.5; // primary outlines
export const STROKE_THIN = 1; // interior detail

export const FONT = 'Helvetica, Arial, sans-serif';

// Grey used for editor grid dots / contact-sheet labels.
export const GRID_GREY = '#B8B8B8';

// Storey height in screen px (contract: 28px).
export const STOREY_H = 28;

// --- Skin-tone palette (5 tones, light → deep) --------------------------
export const SKIN_TONES: Record<string, string> = {
  'tone-1': '#F6D9C2',
  'tone-2': '#EAC29B',
  'tone-3': '#C9975F',
  'tone-4': '#8D5A34',
  'tone-5': '#5A3620',
};

// --- Hair colour palette ------------------------------------------------
export const HAIR_COLORS: Record<string, string> = {
  black: '#1A1A1A',
  brown: '#5A3B25',
  blonde: '#C9A24B',
  auburn: '#8A3B22',
  grey: '#9A9A9A',
};

// --- Clothing colour palette --------------------------------------------
// Line-art style keeps garments mostly white with ink outlines; these are
// used for the occasional filled garment / hi-viz vest.
export const CLOTHING_COLORS: Record<string, string> = {
  white: '#FFFFFF',
  slate: '#3C4653',
  navy: '#26324A',
  teal: '#2F6E6A',
  sand: '#D9C6A5',
  hiviz: '#E8541D', // hi-viz reads as the accent orange
};

/** Round a number to 2dp for compact SVG output. */
export function n(v: number): string {
  return (Math.round(v * 100) / 100).toString();
}
