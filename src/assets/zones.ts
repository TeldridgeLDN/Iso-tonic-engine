// Territory ground plate: unlabeled dashed diamond outline over a w×d
// footprint. The old labeled department/process zone renderers were deleted
// when all zone kinds collapsed into territory (2026-07).

import { project, isoDiamondOutline, group } from './primitives.ts';
import { INK, STROKE } from './style.ts';

function num(v: unknown, dflt: number): number {
  const x = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(x) && x > 0 ? x : dflt;
}

/**
 * Invisible interior hit-area so pointer clicks anywhere INSIDE the territory
 * hit it (the dashed outline alone is a near-impossible 1.5px target). A
 * painted fill with zero opacity is hit-testable under default pointer-events;
 * entities inside the territory still win because they paint (and hit-test)
 * later.
 */
export function zoneHitArea(w: number, d: number): string {
  const a = project(0, 0);
  const b = project(w, 0);
  const c = project(w, d);
  const e = project(0, d);
  return `<polygon points="${a.x},${a.y} ${b.x},${b.y} ${c.x},${c.y} ${e.x},${e.y}" fill="#FFFFFF" fill-opacity="0" stroke="none"/>`;
}

/**
 * Territory ground plate: dashed ink outline diamond + invisible interior
 * hit-area, and NOTHING else. Unlabeled by design — no plaque, no title, no
 * text (any label/number/userGroups params are ignored).
 */
export function renderTerritory(params?: Record<string, unknown>): string {
  const w = num(params?.w, 3);
  const d = num(params?.d, 3);
  return group(0, 0, [zoneHitArea(w, d), isoDiamondOutline(w, d, '6 4', INK, STROKE)]);
}
