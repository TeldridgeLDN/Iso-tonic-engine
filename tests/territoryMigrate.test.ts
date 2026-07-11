// Slice 2 (migrate): old zone kinds in saved .iso.json documents become
// territories on load. Document seam ONLY (prior art tests/schema.test.ts):
// raw fixture objects → migrate/validateDocument → migrated document out.
// Expected values are hand-written literals, never recomputed via the code.

import { describe, it, expect } from 'vitest';
import { validateDocument, migrate } from '../src/core/schema.ts';
import { buildDemoScene } from '../src/demo.ts';

function baseDoc(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: 1,
    meta: {
      title: 'old map',
      created: '2025-10-01T00:00:00.000Z',
      modified: '2025-10-01T00:00:00.000Z',
    },
    layers: [],
    entities: [],
    ...over,
  };
}

/** Load a raw doc through the public seam and return the accepted document. */
function load(raw: Record<string, unknown>): Record<string, unknown> {
  const res = validateDocument(raw);
  expect(res.ok).toBe(true);
  if (!res.ok) throw new Error(res.errors.join('; '));
  return res.doc as unknown as Record<string, unknown>;
}

describe('migrate — old zone entities become territories', () => {
  it('rewrites a department zone (label + plaque params) to a territory', () => {
    const doc = load(
      baseDoc({
        entities: [
          {
            id: 'z1',
            type: 'department',
            label: 'Operations',
            placement: { mode: 'grid', x: 0, y: 0, footprint: { w: 4, d: 3 } },
            asset: {
              symbol: 'department-zone',
              params: { w: 4, d: 3, label: 'OPERATIONS', number: 7, userGroups: 'Staff' },
            },
          },
        ],
      })
    );
    expect(doc.entities).toEqual([
      {
        id: 'z1',
        type: 'territory',
        label: 'Operations',
        placement: { mode: 'grid', x: 0, y: 0, footprint: { w: 4, d: 3 } },
        asset: { symbol: 'territory', params: { w: 4, d: 3 } },
      },
    ]);
  });

  it('rewrites a process zone to a territory', () => {
    const doc = load(
      baseDoc({
        entities: [
          {
            id: 'p1',
            type: 'process',
            label: 'Dispatch',
            placement: { mode: 'grid', x: 1, y: 2, footprint: { w: 3, d: 2 } },
            asset: { symbol: 'process-zone', params: { w: 3, d: 2, label: 'DISPATCH' } },
          },
        ],
      })
    );
    expect(doc.entities).toEqual([
      {
        id: 'p1',
        type: 'territory',
        label: 'Dispatch',
        placement: { mode: 'grid', x: 1, y: 2, footprint: { w: 3, d: 2 } },
        asset: { symbol: 'territory', params: { w: 3, d: 2 } },
      },
    ]);
  });

  it('strips userGoal/orgGoal from migrated organisation and team zones', () => {
    const doc = load(
      baseDoc({
        entities: [
          {
            id: 'o1',
            type: 'organisation',
            label: 'Acme',
            userGoal: 'apply for a grant',
            orgGoal: 'process claims',
            placement: { mode: 'grid', x: 0, y: 0, footprint: { w: 8, d: 8 } },
            asset: { symbol: 'department-zone', params: { w: 8, d: 8, label: 'ACME' } },
          },
          {
            id: 't1',
            type: 'team',
            label: 'Blue Team',
            userGoal: 'get help fast',
            placement: { mode: 'grid', x: 10, y: 0, footprint: { w: 2, d: 2 } },
            asset: { symbol: 'department-zone', params: { w: 2, d: 2, label: 'BLUE' } },
          },
        ],
      })
    );
    expect(doc.entities).toEqual([
      {
        id: 'o1',
        type: 'territory',
        label: 'Acme',
        placement: { mode: 'grid', x: 0, y: 0, footprint: { w: 8, d: 8 } },
        asset: { symbol: 'territory', params: { w: 8, d: 8 } },
      },
      {
        id: 't1',
        type: 'territory',
        label: 'Blue Team',
        placement: { mode: 'grid', x: 10, y: 0, footprint: { w: 2, d: 2 } },
        asset: { symbol: 'territory', params: { w: 2, d: 2 } },
      },
    ]);
  });

  it('decorative plates keep their asset ids but their entities become territories', () => {
    const doc = load(
      baseDoc({
        entities: [
          {
            id: 'r1',
            type: 'department',
            label: 'Region',
            placement: { mode: 'grid', x: 0, y: 0, footprint: { w: 4, d: 4 } },
            asset: { symbol: 'region-organic', params: { w: 4, d: 4, label: 'NORTH' } },
          },
          {
            id: 'i1',
            type: 'organisation',
            label: 'Island',
            placement: { mode: 'grid', x: 6, y: 6, footprint: { w: 6, d: 6 } },
            asset: { symbol: 'island-coastline', params: { w: 6, d: 6, label: 'ISLE', number: 2 } },
          },
        ],
      })
    );
    expect(doc.entities).toEqual([
      {
        id: 'r1',
        type: 'territory',
        label: 'Region',
        placement: { mode: 'grid', x: 0, y: 0, footprint: { w: 4, d: 4 } },
        asset: { symbol: 'region-organic', params: { w: 4, d: 4 } },
      },
      {
        id: 'i1',
        type: 'territory',
        label: 'Island',
        placement: { mode: 'grid', x: 6, y: 6, footprint: { w: 6, d: 6 } },
        asset: { symbol: 'island-coastline', params: { w: 6, d: 6 } },
      },
    ]);
  });

  it('leaves non-zone entities untouched (user, physical-infra, route, annotation)', () => {
    const untouched = [
      {
        id: 'f1',
        type: 'user',
        label: 'Citizen',
        placement: { mode: 'free', x: 10, y: 20 },
        asset: { symbol: 'figurine', params: { skin: 'tone-1' } },
      },
      {
        id: 'b1',
        type: 'physical-infra',
        label: 'HQ',
        placement: { mode: 'grid', x: 0, y: 0, footprint: { w: 2, d: 2 } },
        asset: { symbol: 'building', params: { widthTiles: 2, depthTiles: 2, signage: 'HQ' } },
      },
      {
        id: 'rt1',
        type: 'route',
        label: 'Journey',
        placement: { mode: 'free', x: 0, y: 0 },
        asset: { symbol: 'route-path', params: { stops: [{ x: 0, y: 0 }] } },
      },
      {
        id: 'n1',
        type: 'annotation',
        label: 'Note',
        placement: { mode: 'free', x: 5, y: 5 },
        asset: { symbol: 'callout', params: { text: 'HELLO' } },
      },
    ];
    const doc = load(baseDoc({ entities: untouched }));
    expect(doc.entities).toEqual(untouched);
  });

  it('preserves parentId, customLayers, description and unknown fields on migrated zones', () => {
    const doc = load(
      baseDoc({
        layers: [{ id: 'L1', name: 'Focus', visible: true }],
        entities: [
          {
            id: 'root',
            type: 'organisation',
            label: 'Org',
            placement: { mode: 'grid', x: 0, y: 0, footprint: { w: 9, d: 9 } },
            asset: { symbol: 'department-zone', params: { w: 9, d: 9, label: 'ORG' } },
          },
          {
            id: 'z2',
            type: 'department',
            label: 'Ops',
            description: 'Field ops.',
            parentId: 'root',
            customLayers: ['L1'],
            futureProp: { nested: true },
            placement: { mode: 'grid', x: 1, y: 1, footprint: { w: 3, d: 3 } },
            asset: { symbol: 'department-zone', params: { w: 3, d: 3, label: 'OPS' } },
          },
        ],
      })
    );
    expect(doc.entities).toEqual([
      {
        id: 'root',
        type: 'territory',
        label: 'Org',
        placement: { mode: 'grid', x: 0, y: 0, footprint: { w: 9, d: 9 } },
        asset: { symbol: 'territory', params: { w: 9, d: 9 } },
      },
      {
        id: 'z2',
        type: 'territory',
        label: 'Ops',
        description: 'Field ops.',
        parentId: 'root',
        customLayers: ['L1'],
        futureProp: { nested: true },
        placement: { mode: 'grid', x: 1, y: 1, footprint: { w: 3, d: 3 } },
        asset: { symbol: 'territory', params: { w: 3, d: 3 } },
      },
    ]);
  });
});

describe('migrate — typeLayerVisibility folding', () => {
  it('folds old zone keys into territory: visible when ANY old key was visible', () => {
    const doc = load(
      baseDoc({
        typeLayerVisibility: { department: false, process: true, user: false },
      })
    );
    expect(doc.typeLayerVisibility).toEqual({ user: false, territory: true });
  });

  it('folds to hidden when ALL old keys were hidden', () => {
    const doc = load(
      baseDoc({
        typeLayerVisibility: { department: false, organisation: false, team: false },
      })
    );
    expect(doc.typeLayerVisibility).toEqual({ territory: false });
  });

  it('leaves a map with no old zone keys untouched', () => {
    const tlv = { user: false, route: true };
    const doc = load(baseDoc({ typeLayerVisibility: tlv }));
    expect(doc.typeLayerVisibility).toEqual({ user: false, route: true });
  });
});

describe('migrate — idempotence', () => {
  it('migrating twice yields an identical document (deep equality)', () => {
    const raw = baseDoc({
      typeLayerVisibility: { department: true, process: false },
      entities: [
        {
          id: 'z1',
          type: 'department',
          label: 'Ops',
          userGoal: 'get served',
          placement: { mode: 'grid', x: 0, y: 0, footprint: { w: 4, d: 3 } },
          asset: {
            symbol: 'department-zone',
            params: { w: 4, d: 3, label: 'OPS', number: 1, userGroups: 'Staff' },
          },
        },
      ],
    });
    const once = migrate(raw);
    const twice = migrate(JSON.parse(JSON.stringify(once)) as unknown);
    expect(twice).toEqual(once);
  });

  it('demo scene is built on territories: migrate is the identity and it validates', () => {
    const demo = buildDemoScene();
    expect(migrate(demo)).toBe(demo);
    expect(validateDocument(demo).ok).toBe(true);
    // No old zone kinds anywhere in the demo.
    for (const e of demo.entities) {
      expect(['department', 'process', 'organisation', 'team']).not.toContain(e.type);
      expect(['department-zone', 'process-zone']).not.toContain(e.asset.symbol);
    }
  });

  it('is the IDENTITY (same object) on an already-migrated document', () => {
    const migrated = baseDoc({
      typeLayerVisibility: { territory: true, user: false },
      entities: [
        {
          id: 'z1',
          type: 'territory',
          label: 'Ops',
          placement: { mode: 'grid', x: 0, y: 0, footprint: { w: 4, d: 3 } },
          asset: { symbol: 'territory', params: { w: 4, d: 3 } },
        },
      ],
    });
    expect(migrate(migrated)).toBe(migrated);
  });
});
