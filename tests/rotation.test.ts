import { describe, it, expect } from 'vitest';
import { planRotation } from '../src/render/rotation.ts';
import type { Entity, SceneDocument } from '../src/core/model.ts';
import { createEmptyDocument } from '../src/core/model.ts';

function docWith(...entities: Entity[]): SceneDocument {
  const doc = createEmptyDocument('t', '2026-01-01T00:00:00.000Z');
  return { ...doc, entities };
}

/** A rotatable grid entity (van has orientations 2 in the registry). */
function van(id: string, x: number, y: number, rotation?: 0 | 1 | 2 | 3): Entity {
  return {
    id,
    type: 'physical-infra',
    label: id,
    placement: { mode: 'grid', x, y, footprint: { w: 2, d: 1 }, ...(rotation !== undefined ? { rotation } : {}) },
    asset: { symbol: 'van' },
  };
}

describe('planRotation', () => {
  it('returns null for a fixed asset (orientations 1 / absent)', () => {
    // road-cross has no orientations declared (rotationally symmetric) → fixed.
    // (server-rack, the previous example, now aliases to the rotatable
    // gov-laptop sprite.)
    const e: Entity = {
      id: 'r',
      type: 'digital-infra',
      label: 'r',
      placement: { mode: 'grid', x: 0, y: 0, footprint: { w: 1, d: 1 } },
      asset: { symbol: 'road-cross' },
    };
    expect(planRotation(docWith(e), e)).toBeNull();
  });

  it('cycles 0→1→2→3→0 for a rotatable asset', () => {
    const steps: Array<[0 | 1 | 2 | 3 | undefined, number]> = [
      [undefined, 1],
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 0],
    ];
    for (const [start, expected] of steps) {
      const e = van('v', 0, 0, start);
      const plan = planRotation(docWith(e), e)!;
      expect(plan.to).toBe(expected);
    }
  });

  it('flags a collision when the rotated footprint overlaps another entity', () => {
    // v at (0,0) w2d1: unrotated tiles (0,0),(1,0). rotation 1 → 1x2 → (0,0),(0,1).
    // Put a blocker at (0,1) so the rotation collides but the current pose does not.
    const v = van('v', 0, 0, 0);
    const blocker = van('b', 0, 1, 0); // occupies (0,1),(1,1)
    const plan = planRotation(docWith(v, blocker), v)!;
    expect(plan.from).toBe(0);
    expect(plan.to).toBe(1);
    expect(plan.collides).toBe(true);
  });

  it('does NOT flag a collision when the rotated footprint is clear', () => {
    const v = van('v', 0, 0, 0);
    const far = van('b', 5, 5, 0);
    const plan = planRotation(docWith(v, far), v)!;
    expect(plan.collides).toBe(false);
  });
});
