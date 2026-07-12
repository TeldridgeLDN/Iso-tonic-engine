import { describe, it, expect } from 'vitest';
import {
  canSwap,
  isSwappableEntity,
  resolveSwap,
  swapOverlaps,
  type SwapAssetDef,
} from '../src/render/swap.ts';
import { SwapAsset } from '../src/core/commands.ts';
import { createEmptyDocument, resolveRouteStops } from '../src/core/model.ts';
import type { Entity, SceneDocument } from '../src/core/model.ts';

// --- asset-def fixtures (mirror the registry shapes we care about) ----------

const SPRITE_A: SwapAssetDef = {
  id: 'telephone',
  category: 'digital-infra',
  footprint: { w: 1, d: 1 },
};
const SPRITE_B: SwapAssetDef = {
  id: 'human-support',
  category: 'digital-infra',
  footprint: { w: 1, d: 1 },
};
// A digital sprite that carries a shared text param (signage) so carry-over
// can be exercised without a registry.
const SPRITE_SIGN_A: SwapAssetDef = {
  id: 'shop-a',
  category: 'physical-infra',
  footprint: { w: 1, d: 1 },
  paramSchema: [{ key: 'signage', kind: 'text' }],
};
const SPRITE_SIGN_B: SwapAssetDef = {
  id: 'shop-b',
  category: 'physical-infra',
  footprint: { w: 1, d: 1 },
  paramSchema: [{ key: 'signage', kind: 'text' }],
};
const CAR: SwapAssetDef = {
  id: 'car',
  category: 'physical-infra',
  footprint: { w: 1, d: 1 },
  orientations: 4,
};
const FIXED_SPRITE: SwapAssetDef = {
  id: 'planter',
  category: 'physical-infra',
  footprint: { w: 1, d: 1 },
  orientations: 1,
};
const TERRITORY: SwapAssetDef = {
  id: 'territory',
  category: 'territory',
  ground: true,
  footprint: { w: 3, d: 3 },
  paramSchema: [
    { key: 'w', kind: 'number', min: 1, max: 100 },
    { key: 'd', kind: 'number', min: 1, max: 100 },
  ],
};
const REGION: SwapAssetDef = {
  id: 'region-organic',
  category: 'territory',
  ground: true,
  footprint: { w: 4, d: 4 },
  paramSchema: [
    { key: 'w', kind: 'number', min: 1, max: 100 },
    { key: 'd', kind: 'number', min: 1, max: 100 },
  ],
};
const BUILDING: SwapAssetDef = {
  id: 'building',
  category: 'physical-infra',
  footprint: { w: 2, d: 2 },
  orientations: 4,
  paramSchema: [
    { key: 'widthTiles', kind: 'number', min: 1, max: 8 },
    { key: 'depthTiles', kind: 'number', min: 1, max: 8 },
    { key: 'signage', kind: 'text' },
  ],
};
const FIGURINE: SwapAssetDef = { id: 'figurine', category: 'user' };
const CALLOUT: SwapAssetDef = { id: 'callout', category: 'annotation' };

// --- entity fixtures --------------------------------------------------------

function gridEntity(over: Partial<Entity> = {}): Entity {
  return {
    id: 'sys-phone',
    type: 'digital-infra',
    label: 'Support line',
    description: 'A phone.',
    parentId: 'team-support',
    customLayers: ['layer-fallback'],
    placement: { mode: 'grid', x: 15, y: 3, footprint: { w: 1, d: 1 } },
    asset: { symbol: 'telephone' },
    ...over,
  };
}

const isGround = (e: Entity): boolean =>
  e.asset.symbol === 'territory' || e.asset.symbol === 'region-organic';

// ---------------------------------------------------------------------------

describe('swap compatibility guard', () => {
  it('allows sprite → sprite in the same non-territory realm', () => {
    expect(canSwap(SPRITE_A, SPRITE_B)).toBe(true);
  });

  it('rejects grid ↔ figurine / callout (not grid-placeable)', () => {
    expect(canSwap(SPRITE_A, FIGURINE)).toBe(false);
    expect(canSwap(FIGURINE, SPRITE_A)).toBe(false);
    expect(canSwap(SPRITE_A, CALLOUT)).toBe(false);
    expect(canSwap(CALLOUT, SPRITE_A)).toBe(false);
  });

  it('rejects territory ↔ non-territory in both directions', () => {
    expect(canSwap(TERRITORY, SPRITE_A)).toBe(false);
    expect(canSwap(SPRITE_A, TERRITORY)).toBe(false);
    expect(canSwap(TERRITORY, REGION)).toBe(true);
  });

  it('isSwappableEntity: grid non-route yes; free/route no', () => {
    expect(isSwappableEntity(gridEntity(), SPRITE_A)).toBe(true);
    expect(
      isSwappableEntity(
        gridEntity({ placement: { mode: 'free', x: 0, y: 0 } }),
        FIGURINE
      )
    ).toBe(false);
    expect(
      isSwappableEntity(gridEntity({ type: 'route' }), undefined)
    ).toBe(false);
  });
});

describe('resolveSwap — metadata preservation + footprint change (a)', () => {
  it('changes symbol + footprint but the command keeps id/label/etc + origin', () => {
    const doc = docWith([gridEntity()]);
    const res = resolveSwap(gridEntity(), SPRITE_A, {
      ...SPRITE_B,
      footprint: { w: 2, d: 1 },
    });
    expect(res).not.toBeNull();
    expect(res!.nextAsset.symbol).toBe('human-support');
    expect(res!.nextPlacement).toMatchObject({ mode: 'grid', x: 15, y: 3, footprint: { w: 2, d: 1 } });

    const applied = new SwapAsset({
      entityId: 'sys-phone',
      nextAsset: res!.nextAsset,
      nextPlacement: res!.nextPlacement,
    }).apply(doc);
    const e = applied.entities[0];
    expect(e.id).toBe('sys-phone');
    expect(e.label).toBe('Support line');
    expect(e.description).toBe('A phone.');
    expect(e.parentId).toBe('team-support');
    expect(e.customLayers).toEqual(['layer-fallback']);
    expect(e.placement).toMatchObject({ x: 15, y: 3 });
    expect(e.asset.symbol).toBe('human-support');
  });
});

describe('SwapAsset command — single-step undo (b)', () => {
  it('invert restores the exact prior asset + placement', () => {
    const before = gridEntity({ asset: { symbol: 'telephone', params: { note: 'x' } } });
    const doc = docWith([before]);
    const res = resolveSwap(before, SPRITE_A, BUILDING)!;
    const cmd = new SwapAsset({
      entityId: 'sys-phone',
      nextAsset: res.nextAsset,
      nextPlacement: res.nextPlacement,
    });
    const applied = cmd.apply(doc);
    // Building carries no `note`, footprint became 2×2, widthTiles seeded.
    expect(applied.entities[0].asset.symbol).toBe('building');
    expect(applied.entities[0].placement).toMatchObject({ footprint: { w: 2, d: 2 } });
    const reverted = cmd.invert(applied);
    expect(reverted).toEqual(doc);
  });
});

describe('resolveSwap — params carry-over rule (c)', () => {
  it('keeps signage when both schemas declare it', () => {
    const e = gridEntity({
      type: 'physical-infra',
      asset: { symbol: 'shop-a', params: { signage: 'POST', bogus: 42 } },
    });
    const res = resolveSwap(e, SPRITE_SIGN_A, SPRITE_SIGN_B)!;
    expect(res.nextAsset.params).toEqual({ signage: 'POST' });
  });

  it('drops params the target schema does not declare', () => {
    const e = gridEntity({
      type: 'physical-infra',
      asset: { symbol: 'shop-a', params: { signage: 'POST' } },
    });
    // target sprite has no paramSchema at all
    const res = resolveSwap(e, SPRITE_SIGN_A, SPRITE_B)!;
    expect(res.nextAsset.params).toBeUndefined();
  });

  it('carries w/d for territory → territory and keeps footprint synced', () => {
    const e = gridEntity({
      type: 'territory',
      asset: { symbol: 'territory', params: { w: 6, d: 5 } },
      placement: { mode: 'grid', x: 2, y: 2, footprint: { w: 6, d: 5 } },
    });
    const res = resolveSwap(e, TERRITORY, REGION)!;
    expect(res.nextPlacement.footprint).toEqual({ w: 6, d: 5 });
    expect(res.nextAsset.params).toEqual({ w: 6, d: 5 });
    expect(res.nextAsset.symbol).toBe('region-organic');
  });

  it('seeds size params from the registry footprint for a fixed → parametric swap', () => {
    const e = gridEntity({ type: 'physical-infra', asset: { symbol: 'planter' } });
    const res = resolveSwap(e, FIXED_SPRITE, BUILDING)!;
    expect(res.nextPlacement.footprint).toEqual({ w: 2, d: 2 });
    expect(res.nextAsset.params).toEqual({ widthTiles: 2, depthTiles: 2 });
  });
});

describe('resolveSwap — rotation rule (d)', () => {
  it('keeps rotation when the target supports orientations', () => {
    const e = gridEntity({
      type: 'physical-infra',
      asset: { symbol: 'car' },
      placement: { mode: 'grid', x: 1, y: 1, footprint: { w: 1, d: 1 }, rotation: 3 },
    });
    const res = resolveSwap(e, CAR, { ...BUILDING, footprint: { w: 1, d: 1 } })!;
    expect(res.nextPlacement.rotation).toBe(3);
  });

  it('drops rotation when the target is fixed (orientations 1)', () => {
    const e = gridEntity({
      type: 'physical-infra',
      asset: { symbol: 'car' },
      placement: { mode: 'grid', x: 1, y: 1, footprint: { w: 1, d: 1 }, rotation: 3 },
    });
    const res = resolveSwap(e, CAR, FIXED_SPRITE)!;
    expect(res.nextPlacement.rotation).toBeUndefined();
  });
});

describe('rejection (e)', () => {
  it('resolveSwap returns null for a figurine/callout/route source or target', () => {
    const free = gridEntity({ type: 'user', placement: { mode: 'free', x: 0, y: 0 }, asset: { symbol: 'figurine' } });
    expect(resolveSwap(free, FIGURINE, SPRITE_A)).toBeNull();
    expect(resolveSwap(gridEntity(), SPRITE_A, CALLOUT)).toBeNull();
    const route = gridEntity({ type: 'route', asset: { symbol: 'route-path' } });
    expect(resolveSwap(route, undefined, SPRITE_A)).toBeNull();
  });

  it('resolveSwap returns null for territory → non-territory', () => {
    const e = gridEntity({ type: 'territory', asset: { symbol: 'territory', params: { w: 3, d: 3 } } });
    expect(resolveSwap(e, TERRITORY, SPRITE_A)).toBeNull();
  });

  it('swapOverlaps flags a grown footprint landing on a foreign entity', () => {
    const phone = gridEntity();
    const neighbour = gridEntity({
      id: 'sys-other',
      parentId: undefined,
      placement: { mode: 'grid', x: 16, y: 3, footprint: { w: 1, d: 1 } },
      asset: { symbol: 'human-support' },
    });
    const doc = docWith([phone, neighbour]);
    // Same 1×1 origin → no overlap.
    const ok = resolveSwap(phone, SPRITE_A, SPRITE_B)!;
    expect(swapOverlaps(phone, ok.nextPlacement, doc, isGround)).toBe(false);
    // Grow to 2×1 → now covers tile (16,3) → overlaps the neighbour.
    const grown = resolveSwap(phone, SPRITE_A, { ...SPRITE_B, footprint: { w: 2, d: 1 } })!;
    expect(swapOverlaps(phone, grown.nextPlacement, doc, isGround)).toBe(true);
  });

  it('swapOverlaps ignores ground plates and nested descendants', () => {
    const plate = gridEntity({
      id: 'plate',
      type: 'territory',
      parentId: undefined,
      placement: { mode: 'grid', x: 15, y: 3, footprint: { w: 5, d: 5 } },
      asset: { symbol: 'territory', params: { w: 5, d: 5 } },
    });
    const phone = gridEntity({ parentId: 'plate' });
    const doc = docWith([plate, phone]);
    const grown = resolveSwap(phone, SPRITE_A, { ...SPRITE_B, footprint: { w: 2, d: 2 } })!;
    // Overlaps the ground plate (exempt) and shares nesting → not rejected.
    expect(swapOverlaps(phone, grown.nextPlacement, doc, isGround)).toBe(false);
  });
});

describe('route stops still resolve after swapping a stop entity (f)', () => {
  it('a route referencing the swapped entity keeps resolving to its origin', () => {
    const phone = gridEntity();
    const route: Entity = {
      id: 'route-assisted',
      type: 'route',
      label: 'r',
      placement: { mode: 'free', x: 0, y: 0 },
      asset: { symbol: 'route-path', params: { stops: [{ entityId: 'sys-phone' }] } },
    };
    let doc = docWith([phone, route]);
    const before = resolveRouteStops(doc, doc.entities[1]);
    expect(before).toHaveLength(1);
    expect(before[0].entityId).toBe('sys-phone');

    const res = resolveSwap(phone, SPRITE_A, SPRITE_B)!;
    doc = new SwapAsset({
      entityId: 'sys-phone',
      nextAsset: res.nextAsset,
      nextPlacement: res.nextPlacement,
    }).apply(doc);

    const after = resolveRouteStops(doc, doc.entities[1]);
    expect(after).toEqual(before); // same resolved point, still attached
  });
});

// --- helpers ----------------------------------------------------------------

function docWith(entities: Entity[]): SceneDocument {
  const d = createEmptyDocument('t', '2020-01-01T00:00:00.000Z');
  d.entities = entities;
  return d;
}
