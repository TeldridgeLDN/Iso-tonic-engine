// Department/organisation ground plates and process zones.
// Dashed/dotted diamond outline over a w×d footprint + corner label.

import { project, isoDiamondOutline, text, group } from './primitives.ts';
import { plaqueBlock } from './terrain.ts';
import { INK, STROKE } from './style.ts';

export interface ZoneParams {
  w: number;
  d: number;
  label?: string;
  number?: number;
  userGroups?: string[];
}

function normalize(params?: Record<string, unknown>): ZoneParams {
  return {
    w: num(params?.w, 3),
    d: num(params?.d, 3),
    label: params?.label as string | undefined,
    number: toNum(params?.number),
    userGroups: parseGroups(params?.userGroups),
  };
}

function num(v: unknown, dflt: number): number {
  const x = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(x) && x > 0 ? x : dflt;
}

function toNum(v: unknown): number | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const x = Number(v);
  return Number.isFinite(x) ? x : undefined;
}

function parseGroups(v: unknown): string[] | undefined {
  if (Array.isArray(v)) return (v as unknown[]).map(String).filter(Boolean);
  if (typeof v === 'string' && v.trim()) return v.split(',').map((s) => s.trim()).filter(Boolean);
  return undefined;
}

/**
 * Invisible interior hit-area so pointer clicks anywhere INSIDE the zone hit
 * it (the dashed outline alone is a near-impossible 1.5px target). A painted
 * fill with zero opacity is hit-testable under default pointer-events;
 * entities inside the zone still win because they paint (and hit-test) later.
 */
export function zoneHitArea(w: number, d: number): string {
  const a = project(0, 0);
  const b = project(w, 0);
  const c = project(w, d);
  const e = project(0, d);
  return `<polygon points="${a.x},${a.y} ${b.x},${b.y} ${c.x},${c.y} ${e.x},${e.y}" fill="#FFFFFF" fill-opacity="0" stroke="none"/>`;
}

/** Department / organisation plate: dashed ink outline diamond + plaque block. */
export function renderZone(params?: Record<string, unknown>): string {
  const p = normalize(params);
  const frags = [zoneHitArea(p.w, p.d), isoDiamondOutline(p.w, p.d, '6 4', INK, STROKE)];
  if (p.number !== undefined || p.userGroups) {
    // full plaque (badge + title + user-group glyphs) near the origin corner
    frags.push(plaqueBlock(p.label, p.number, p.userGroups));
  } else if (p.label) {
    // plain corner label near the north (top) vertex (unchanged legacy path)
    const nn = project(0, 0);
    frags.push(text(nn.x + 4, nn.y - 4, p.label, { size: 8, weight: 'bold', fill: INK, anchor: 'start' }));
  }
  return group(0, 0, frags);
}

/** Process zone: dotted outline diamond + corner label. */
export function renderProcessZone(params?: Record<string, unknown>): string {
  const p = normalize(params);
  const frags = [zoneHitArea(p.w, p.d), isoDiamondOutline(p.w, p.d, '1.5 3', INK, 1)];
  if (p.label) {
    const nn = project(0, 0);
    frags.push(text(nn.x + 4, nn.y - 4, p.label, { size: 7, fill: INK, anchor: 'start' }));
  }
  return group(0, 0, frags);
}
