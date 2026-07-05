// Department/organisation ground plates and process zones.
// Dashed/dotted diamond outline over a w×d footprint + corner label.

import { project, isoDiamondOutline, text, group } from './primitives.ts';
import { INK, STROKE } from './style.ts';

export interface ZoneParams {
  w: number;
  d: number;
  label?: string;
}

function normalize(params?: Record<string, unknown>): ZoneParams {
  return {
    w: num(params?.w, 3),
    d: num(params?.d, 3),
    label: params?.label as string | undefined,
  };
}

function num(v: unknown, dflt: number): number {
  const x = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(x) && x > 0 ? x : dflt;
}

/** Department / organisation plate: dashed ink outline diamond + corner label. */
export function renderZone(params?: Record<string, unknown>): string {
  const p = normalize(params);
  const frags = [isoDiamondOutline(p.w, p.d, '6 4', INK, STROKE)];
  if (p.label) {
    // corner label near the north (top) vertex
    const nn = project(0, 0);
    frags.push(text(nn.x + 4, nn.y - 4, p.label, { size: 8, weight: 'bold', fill: INK, anchor: 'start' }));
  }
  return group(0, 0, frags);
}

/** Process zone: dotted outline diamond + corner label. */
export function renderProcessZone(params?: Record<string, unknown>): string {
  const p = normalize(params);
  const frags = [isoDiamondOutline(p.w, p.d, '1.5 3', INK, 1)];
  if (p.label) {
    const nn = project(0, 0);
    frags.push(text(nn.x + 4, nn.y - 4, p.label, { size: 7, fill: INK, anchor: 'start' }));
  }
  return group(0, 0, frags);
}
