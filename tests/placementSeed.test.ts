import { describe, it, expect } from 'vitest';
import { seedSizeParams } from '../src/ui/placement.ts';
import { backfillSizeParams } from '../src/render/docMigrate.ts';
import type { AssetDef } from '../src/assets/library.ts';
import type { Entity, SceneDocument, GridPlacement } from '../src/core/model.ts';
import { createEmptyDocument } from '../src/core/model.ts';

// --- fixtures ---------------------------------------------------------------

const regionDef: AssetDef = {
  id: 'region-organic',
  category: 'department',
  footprint: { w: 4, d: 4 },
  ground: true,
  render: () => '',
  paramSchema: [
    { key: 'w', label: 'Width', kind: 'number', min: 1, max: 12 },
    { key: 'd', label: 'Depth', kind: 'number', min: 1, max: 12 },
    { key: 'label', label: 'Title', kind: 'text' },
  ],
};

const buildingDef: AssetDef = {
  id: 'office-block',
  category: 'physical-infra',
  footprint: { w: 3, d: 2 },
  render: () => '',
  paramSchema: [
    { key: 'widthTiles', label: 'W', kind: 'number', min: 1, max: 8 },
    { key: 'depthTiles', label: 'D', kind: 'number', min: 1, max: 8 },
  ],
};

// A footprint-less zone (department-zone): size falls back to schema mins.
const bareZoneDef: AssetDef = {
  id: 'department-zone',
  category: 'department',
  ground: true,
  render: () => '',
  paramSchema: [
    { key: 'w', label: 'W', kind: 'number', min: 2, max: 12 },
    { key: 'd', label: 'D', kind: 'number', min: 2, max: 12 },
    { key: 'label', label: 'Title', kind: 'text' },
  ],
};

const propDef: AssetDef = {
  id: 'tree-round',
  category: 'prop',
  footprint: { w: 1, d: 1 },
  render: () => '',
};

// --- seedSizeParams (placement) ---------------------------------------------

describe('seedSizeParams', () => {
  it('seeds a zone w/d from the registry footprint + label from the entity label', () => {
    expect(seedSizeParams(regionDef, 'Region 1')).toEqual({
      w: 4,
      d: 4,
      label: 'Region 1',
    });
  });

  it('seeds a building widthTiles/depthTiles from the footprint (no label field → no label)', () => {
    expect(seedSizeParams(buildingDef, 'Office 1')).toEqual({
      widthTiles: 3,
      depthTiles: 2,
    });
  });

  it('falls back to schema min when the asset has no registry footprint', () => {
    expect(seedSizeParams(bareZoneDef, 'Ops')).toEqual({
      w: 2,
      d: 2,
      label: 'Ops',
    });
  });

  it('returns undefined for an asset with no size params and no label field', () => {
    expect(seedSizeParams(propDef, 'Tree 1')).toBeUndefined();
  });

  it('returns undefined for an undefined def', () => {
    expect(seedSizeParams(undefined, 'x')).toBeUndefined();
  });
});

// --- backfillSizeParams (migration) -----------------------------------------

function docWith(...entities: Entity[]): SceneDocument {
  const doc = createEmptyDocument('t', '2026-01-01T00:00:00.000Z');
  return { ...doc, entities };
}

function region(over: Partial<Entity> = {}): Entity {
  return {
    id: 'r',
    type: 'department',
    label: 'Region',
    placement: { mode: 'grid', x: 0, y: 0, footprint: { w: 5, d: 3 } },
    asset: { symbol: 'region-organic' }, // NO params → the reported saved-map bug
    ...over,
  };
}

describe('backfillSizeParams', () => {
  it('backfills a grid zone missing w/d from placement.footprint', () => {
    const next = backfillSizeParams(docWith(region()));
    expect(next.entities[0].asset.params).toEqual({ w: 5, d: 3 });
  });

  it('backfills only the missing key, preserving existing params', () => {
    const partial = region({
      asset: { symbol: 'region-organic', params: { w: 9, label: 'OLD' } },
    });
    const next = backfillSizeParams(docWith(partial));
    // w kept as authored param (9), d backfilled from footprint (3), label kept.
    expect(next.entities[0].asset.params).toEqual({ w: 9, d: 3, label: 'OLD' });
  });

  it('backfills a building missing widthTiles/depthTiles from its footprint', () => {
    const bldg: Entity = {
      id: 'b',
      type: 'physical-infra',
      label: 'Office',
      placement: { mode: 'grid', x: 0, y: 0, footprint: { w: 3, d: 2 } },
      asset: { symbol: 'office-block' }, // no params
    };
    const next = backfillSizeParams(docWith(bldg));
    expect(next.entities[0].asset.params).toEqual({ widthTiles: 3, depthTiles: 2 });
  });

  it('is a no-op (returns the same object) when everything already has size params', () => {
    const ok = region({ asset: { symbol: 'region-organic', params: { w: 5, d: 3 } } });
    const doc = docWith(ok);
    expect(backfillSizeParams(doc)).toBe(doc);
  });

  it('leaves free-placed and non-size assets untouched', () => {
    const free: Entity = {
      id: 'f',
      type: 'user',
      label: 'Fig',
      placement: { mode: 'free', x: 1, y: 2 },
      asset: { symbol: 'figurine' },
    };
    const doc = docWith(free);
    expect(backfillSizeParams(doc)).toBe(doc);
  });

  it('healed footprint matches what the resize handle would use (no drift)', () => {
    const next = backfillSizeParams(docWith(region()));
    const p = next.entities[0].placement as GridPlacement;
    const params = next.entities[0].asset.params!;
    expect(params.w).toBe(p.footprint.w);
    expect(params.d).toBe(p.footprint.d);
  });
});
