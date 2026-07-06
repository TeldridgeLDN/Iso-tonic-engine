import { describe, it, expect } from 'vitest';
import {
  isResizable,
  resizeBounds,
  resolveResizeDrag,
  resolveResizeTarget,
  resizeHandleScreen,
  DEFAULT_MIN,
  DEFAULT_MAX,
  type ResizeAssetDef,
} from '../src/render/resize.ts';
import { ResizeEntity } from '../src/core/commands.ts';
import { tileToScreen } from '../src/core/iso.ts';
import type { Entity, GridPlacement, SceneDocument } from '../src/core/model.ts';
import { createEmptyDocument } from '../src/core/model.ts';

// --- fixtures ---------------------------------------------------------------

const zoneDef: ResizeAssetDef = {
  ground: true,
  paramSchema: [
    { key: 'w', kind: 'number', min: 1, max: 12 },
    { key: 'd', kind: 'number', min: 1, max: 12 },
    { key: 'label', kind: 'text' },
  ],
};

function zoneEntity(over: Partial<Entity> = {}): Entity {
  return {
    id: 'z',
    type: 'department',
    label: 'z',
    placement: { mode: 'grid', x: 0, y: 0, footprint: { w: 4, d: 3 } },
    asset: { symbol: 'department-zone', params: { w: 4, d: 3, label: 'OPS' } },
    ...over,
  };
}

function docWith(...entities: Entity[]): SceneDocument {
  const doc = createEmptyDocument('t', '2026-01-01T00:00:00.000Z');
  return { ...doc, entities };
}

// --- isResizable ------------------------------------------------------------

describe('isResizable', () => {
  it('true for a grid ground asset with numeric w and d params', () => {
    expect(isResizable(zoneEntity(), zoneDef)).toBe(true);
  });

  it('false when the asset is not ground', () => {
    expect(isResizable(zoneEntity(), { ...zoneDef, ground: false })).toBe(false);
  });

  it('false when the placement is free (not grid)', () => {
    const free = zoneEntity({ placement: { mode: 'free', x: 10, y: 20 } });
    expect(isResizable(free, zoneDef)).toBe(false);
  });

  it('false when w/d params are missing (e.g. a road tile)', () => {
    const roadDef: ResizeAssetDef = { ground: true, paramSchema: [] };
    expect(isResizable(zoneEntity(), roadDef)).toBe(false);
  });

  it('false for an undefined asset def', () => {
    expect(isResizable(zoneEntity(), undefined)).toBe(false);
  });
});

// --- resizeBounds -----------------------------------------------------------

describe('resizeBounds', () => {
  it('reads min/max from the w/d param fields', () => {
    expect(resizeBounds(zoneDef)).toEqual({
      w: { min: 1, max: 12 },
      d: { min: 1, max: 12 },
    });
  });

  it('falls back to DEFAULT_MIN/MAX when a field omits bounds', () => {
    const def: ResizeAssetDef = {
      ground: true,
      paramSchema: [
        { key: 'w', kind: 'number' },
        { key: 'd', kind: 'number' },
      ],
    };
    expect(resizeBounds(def)).toEqual({
      w: { min: DEFAULT_MIN, max: DEFAULT_MAX },
      d: { min: DEFAULT_MIN, max: DEFAULT_MAX },
    });
  });
});

// --- resolveResizeDrag ------------------------------------------------------

describe('resolveResizeDrag', () => {
  const bounds = { w: { min: 1, max: 12 }, d: { min: 1, max: 12 } };

  it('grows the footprint when dragging the far corner outward', () => {
    // origin (0,0), pointer at tile (6,5) → effective 6×5, rotation 0 → authored
    const authored = resolveResizeDrag({ tx: 0, ty: 0 }, { tx: 6, ty: 5 }, bounds, 0);
    expect(authored).toEqual({ w: 6, d: 5 });
  });

  it('shrinks the footprint when dragging inward', () => {
    const authored = resolveResizeDrag({ tx: 0, ty: 0 }, { tx: 2, ty: 1 }, bounds, 0);
    expect(authored).toEqual({ w: 2, d: 1 });
  });

  it('rounds fractional pointer tiles to whole tiles', () => {
    const authored = resolveResizeDrag({ tx: 0, ty: 0 }, { tx: 3.4, ty: 2.6 }, bounds, 0);
    expect(authored).toEqual({ w: 3, d: 3 });
  });

  it('clamps at the maximum bound', () => {
    const authored = resolveResizeDrag({ tx: 0, ty: 0 }, { tx: 99, ty: 99 }, bounds, 0);
    expect(authored).toEqual({ w: 12, d: 12 });
  });

  it('clamps at the minimum bound (never below 1, even if pointer is behind origin)', () => {
    const authored = resolveResizeDrag({ tx: 5, ty: 5 }, { tx: 1, ty: 0 }, bounds, 0);
    expect(authored).toEqual({ w: 1, d: 1 });
  });

  it('converts effective→authored for odd rotation (swaps w/d)', () => {
    // rotation 1: effective x-axis is authored d, effective y-axis is authored w.
    // pointer at (6,5) from origin → effective 6×5 → authored { w:5, d:6 }.
    const authored = resolveResizeDrag({ tx: 0, ty: 0 }, { tx: 6, ty: 5 }, bounds, 1);
    expect(authored).toEqual({ w: 5, d: 6 });
  });

  it('applies per-axis bounds in effective space for odd rotation', () => {
    // asymmetric bounds: authored w capped at 3, authored d capped at 10.
    const asym = { w: { min: 1, max: 3 }, d: { min: 1, max: 10 } };
    // rotation 1, pointer effective (20,20). effWBounds = d (max 10), effDBounds = w (max 3).
    // effW=10, effD=3 → authored { w: effD=3, d: effW=10 }.
    const authored = resolveResizeDrag({ tx: 0, ty: 0 }, { tx: 20, ty: 20 }, asym, 1);
    expect(authored).toEqual({ w: 3, d: 10 });
  });
});

// --- resizeHandleScreen -----------------------------------------------------

describe('resizeHandleScreen', () => {
  it('sits at the far (south) corner of an unrotated footprint', () => {
    const p: GridPlacement = { mode: 'grid', x: 0, y: 0, footprint: { w: 4, d: 3 } };
    expect(resizeHandleScreen(p)).toEqual(tileToScreen(4, 3));
  });

  it('uses the EFFECTIVE footprint (swapped) for an odd rotation', () => {
    const p: GridPlacement = {
      mode: 'grid',
      x: 2,
      y: 1,
      footprint: { w: 4, d: 3 },
      rotation: 1,
    };
    // effective is 3×4, so far corner is (x+3, y+4) = (5,5)
    expect(resizeHandleScreen(p)).toEqual(tileToScreen(5, 5));
  });
});

// --- ResizeEntity command (apply / invert round-trip) -----------------------

describe('ResizeEntity', () => {
  it('updates BOTH placement.footprint and params.w/d atomically', () => {
    const doc = docWith(zoneEntity());
    const cmd = new ResizeEntity({
      entityId: 'z',
      from: { w: 4, d: 3 },
      to: { w: 7, d: 6 },
    });
    const next = cmd.apply(doc);
    const e = next.entities[0];
    expect((e.placement as GridPlacement).footprint).toEqual({ w: 7, d: 6 });
    expect(e.asset.params).toEqual({ w: 7, d: 6, label: 'OPS' });
  });

  it('round-trips exactly on invert (footprint + params restored)', () => {
    const doc = docWith(zoneEntity());
    const cmd = new ResizeEntity({
      entityId: 'z',
      from: { w: 4, d: 3 },
      to: { w: 7, d: 6 },
    });
    const applied = cmd.apply(doc);
    const restored = cmd.invert(applied);
    expect(restored.entities[0]).toEqual(doc.entities[0]);
  });

  it('resizes a params-less asset by footprint only (no params key introduced)', () => {
    const bare = zoneEntity({
      id: 'b',
      asset: { symbol: 'department-zone' }, // no params
    });
    const doc = docWith(bare);
    const cmd = new ResizeEntity({
      entityId: 'b',
      from: { w: 4, d: 3 },
      to: { w: 2, d: 2 },
    });
    const next = cmd.apply(doc);
    const e = next.entities[0];
    expect((e.placement as GridPlacement).footprint).toEqual({ w: 2, d: 2 });
    expect(e.asset.params).toBeUndefined();
    // invert restores params-less state exactly
    expect(cmd.invert(next).entities[0]).toEqual(doc.entities[0]);
  });

  it('preserves rotation and other params on resize', () => {
    const rotated = zoneEntity({
      placement: { mode: 'grid', x: 0, y: 0, footprint: { w: 4, d: 3 }, rotation: 1 },
      asset: { symbol: 'department-zone', params: { w: 4, d: 3, label: 'OPS', number: 5 } },
    });
    const doc = docWith(rotated);
    const cmd = new ResizeEntity({ entityId: 'z', from: { w: 4, d: 3 }, to: { w: 5, d: 5 } });
    const next = cmd.apply(doc);
    const e = next.entities[0];
    expect((e.placement as GridPlacement).rotation).toBe(1);
    expect(e.asset.params).toEqual({ w: 5, d: 5, label: 'OPS', number: 5 });
  });

  it('throws when applied to a non-grid (free) placement', () => {
    const free = zoneEntity({ placement: { mode: 'free', x: 0, y: 0 } });
    const doc = docWith(free);
    const cmd = new ResizeEntity({ entityId: 'z', from: { w: 1, d: 1 }, to: { w: 2, d: 2 } });
    expect(() => cmd.apply(doc)).toThrow(/not a grid placement/);
  });
});

// --- resolveResizeTarget (resize-tool press target resolution) --------------

describe('resolveResizeTarget', () => {
  // A non-resizable entity (figurine): no ground / no w,d params.
  const figurineDef: ResizeAssetDef = { ground: false, paramSchema: [] };
  const figurine: Entity = {
    id: 'fig',
    type: 'user',
    label: 'fig',
    placement: { mode: 'grid', x: 1, y: 1, footprint: { w: 1, d: 1 } },
    asset: { symbol: 'figurine' },
  };
  const zone = zoneEntity();

  // def lookup keyed by asset symbol.
  const defOf = (e: Entity): ResizeAssetDef | undefined =>
    e.asset.symbol === 'department-zone' ? zoneDef : figurineDef;

  it('targets the resizable zone directly under the pointer', () => {
    expect(resolveResizeTarget(zone, undefined, defOf)).toBe(zone);
  });

  it('falls back to the selected resizable zone when the press lands on a non-resizable entity', () => {
    // pressed a figurine INSIDE the selected zone → resize the zone.
    expect(resolveResizeTarget(figurine, zone, defOf)).toBe(zone);
  });

  it('falls back to the selected zone when the press misses everything', () => {
    expect(resolveResizeTarget(undefined, zone, defOf)).toBe(zone);
  });

  it('prefers the pressed zone over a different selected zone', () => {
    const other = zoneEntity({ id: 'z2' });
    expect(resolveResizeTarget(zone, other, defOf)).toBe(zone);
  });

  it('returns undefined when nothing resolves (empty press, no selection)', () => {
    expect(resolveResizeTarget(undefined, undefined, defOf)).toBeUndefined();
  });

  it('returns undefined when press is non-resizable and selection is non-resizable', () => {
    expect(resolveResizeTarget(figurine, figurine, defOf)).toBeUndefined();
  });

  it('ignores a pressed non-resizable entity but still returns undefined without a resizable selection', () => {
    expect(resolveResizeTarget(figurine, undefined, defOf)).toBeUndefined();
  });
});
