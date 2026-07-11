// Hard-coded demo SceneDocument exercising the asset + placement range.
// Loaded on startup (Phase E will gate this behind autosave presence).
// Also serves as the fixture for interaction/render tests.

import type { Entity, SceneDocument } from './core/model.ts';
import { createEmptyDocument } from './core/model.ts';

function ent(e: Entity): Entity {
  return e;
}

/**
 * A small service map: an organisation-wide territory, two nested territories,
 * buildings, digital + physical infra, figurines, a process territory and two
 * callouts (one with a leader to an anchored entity). Territories are
 * unlabeled ground plates (zone kinds collapsed 2026-07).
 */
export function buildDemoScene(): SceneDocument {
  const doc = createEmptyDocument('Demo Service Map', '2026-07-05T00:00:00.000Z');

  const entities: Entity[] = [
    // Organisation-wide ground territory (large dashed diamond under everything).
    ent({
      id: 'org-1',
      type: 'territory',
      label: 'Acme Public Services',
      description: 'The whole organisation footprint.',
      placement: { mode: 'grid', x: -1, y: -1, footprint: { w: 10, d: 8 } },
      asset: { symbol: 'territory', params: { w: 10, d: 8 } },
    }),

    // Two territories inside the org footprint.
    ent({
      id: 'dept-ops',
      type: 'territory',
      label: 'Operations',
      description: 'Field operations & logistics.',
      parentId: 'org-1',
      placement: { mode: 'grid', x: 0, y: 0, footprint: { w: 4, d: 3 } },
      asset: { symbol: 'territory', params: { w: 4, d: 3 } },
    }),
    ent({
      id: 'dept-digital',
      type: 'territory',
      label: 'Digital',
      description: 'Platform & data teams.',
      parentId: 'org-1',
      placement: { mode: 'grid', x: 5, y: 0, footprint: { w: 3, d: 3 } },
      asset: { symbol: 'territory', params: { w: 3, d: 3 } },
    }),

    // Buildings (parametric params exercised).
    ent({
      id: 'bld-office',
      type: 'physical-infra',
      label: 'HQ Office',
      description: 'Five-storey head office.',
      parentId: 'dept-ops',
      placement: { mode: 'grid', x: 0, y: 0, footprint: { w: 2, d: 2 } },
      asset: {
        symbol: 'building',
        params: { widthTiles: 2, depthTiles: 2, storeys: 5, windowStyle: 'grid', roof: 'flat', signage: 'HQ' },
      },
    }),
    ent({
      id: 'bld-depot',
      type: 'physical-infra',
      label: 'Depot',
      description: 'Vehicle & equipment depot.',
      parentId: 'dept-ops',
      placement: { mode: 'grid', x: 2, y: 1, footprint: { w: 2, d: 2 } },
      asset: {
        symbol: 'building',
        params: { widthTiles: 2, depthTiles: 2, storeys: 1, windowStyle: 'sparse', roof: 'pitched' },
      },
    }),

    // Digital infra: server rack + workstation in the Digital dept.
    ent({
      id: 'srv-1',
      type: 'digital-infra',
      label: 'Core Server Rack',
      description: 'Primary compute cluster.',
      parentId: 'dept-digital',
      placement: { mode: 'grid', x: 5, y: 0, footprint: { w: 1, d: 1 } },
      asset: { symbol: 'server-rack' },
    }),
    ent({
      id: 'ws-1',
      type: 'digital-infra',
      label: 'Analyst Workstation',
      description: 'Data analyst desktop.',
      parentId: 'dept-digital',
      placement: { mode: 'grid', x: 7, y: 2, footprint: { w: 1, d: 1 } },
      asset: { symbol: 'desktop-workstation' },
    }),

    // Physical infra: a van in the depot yard.
    ent({
      id: 'van-1',
      type: 'physical-infra',
      label: 'Delivery Van',
      description: 'Field delivery vehicle.',
      parentId: 'dept-ops',
      placement: { mode: 'grid', x: 2, y: 4, footprint: { w: 2, d: 1 } },
      asset: { symbol: 'van' },
    }),

    // ── Wave 2 streetscape ────────────────────────────────────────────────
    // A short road along the street edge (below the org plate). Roads are
    // ground assets and tile edge-to-edge; a straight run reads as the kerb.
    ent({
      id: 'road-1',
      type: 'physical-infra',
      label: 'Street',
      placement: { mode: 'grid', x: 0, y: 7, footprint: { w: 1, d: 1 } },
      asset: { symbol: 'road-straight' },
    }),
    ent({
      id: 'road-2',
      type: 'physical-infra',
      label: 'Street',
      placement: { mode: 'grid', x: 1, y: 7, footprint: { w: 1, d: 1 } },
      asset: { symbol: 'road-straight' },
    }),
    ent({
      id: 'road-3',
      type: 'physical-infra',
      label: 'Street',
      placement: { mode: 'grid', x: 2, y: 7, footprint: { w: 1, d: 1 } },
      asset: { symbol: 'road-straight' },
    }),
    ent({
      id: 'road-4',
      type: 'physical-infra',
      label: 'Street',
      placement: { mode: 'grid', x: 3, y: 7, footprint: { w: 1, d: 1 } },
      asset: { symbol: 'road-straight' },
    }),

    // A shopfront facing the street, with café seating out front.
    ent({
      id: 'shop-1',
      type: 'physical-infra',
      label: 'Corner Café',
      description: 'High-street shopfront with an awning.',
      placement: { mode: 'grid', x: 5, y: 6, footprint: { w: 2, d: 1 } },
      asset: { symbol: 'shop-front', params: { signage: 'CORNER CAFE' } },
    }),
    ent({
      id: 'cafe-1',
      type: 'physical-infra',
      label: 'Café seating',
      description: 'Outdoor tables by the shopfront.',
      placement: { mode: 'grid', x: 7, y: 6, footprint: { w: 1, d: 1 } },
      asset: { symbol: 'cafe-seating' },
    }),

    // A rotated van parked along the street — rotation 1 renders the van's
    // mirrored facing (van declares orientations: 2). Sits on its own tile.
    ent({
      id: 'van-street',
      type: 'physical-infra',
      label: 'Parked Van',
      description: 'Kerbside van, rotated facing.',
      placement: { mode: 'grid', x: 5, y: 8, footprint: { w: 2, d: 1 }, rotation: 1 },
      asset: { symbol: 'van' },
    }),

    // Greenery.
    ent({
      id: 'tree-1',
      type: 'physical-infra',
      label: 'Tree',
      placement: { mode: 'grid', x: 4, y: 3, footprint: { w: 1, d: 1 } },
      asset: { symbol: 'tree-round' },
    }),
    ent({
      id: 'tree-2',
      type: 'physical-infra',
      label: 'Conifer',
      placement: { mode: 'grid', x: 8, y: 5, footprint: { w: 1, d: 1 } },
      asset: { symbol: 'tree-conifer' },
    }),

    // Five figurines (free-placed, varied params). World px near their teams.
    ent({
      id: 'fig-1',
      type: 'user',
      label: 'Ops Lead',
      description: 'Leads field operations.',
      parentId: 'dept-ops',
      placement: { mode: 'free', x: -20, y: 70 },
      asset: { symbol: 'figurine', params: { skin: 'tone-2', hairStyle: 'short', hairColor: 'brown', top: 'jacket', bottom: 'trousers', accessory: 'clipboard' } },
    }),
    ent({
      id: 'fig-2',
      type: 'user',
      label: 'Driver',
      parentId: 'dept-ops',
      placement: { mode: 'free', x: 30, y: 120 },
      asset: { symbol: 'figurine', params: { skin: 'tone-4', hairStyle: 'bald', hairColor: 'black', top: 'hiviz', bottom: 'trousers', accessory: 'hardhat' } },
    }),
    ent({
      id: 'fig-3',
      type: 'user',
      label: 'Data Analyst',
      parentId: 'dept-digital',
      placement: { mode: 'free', x: 150, y: 60 },
      asset: { symbol: 'figurine', params: { skin: 'tone-1', hairStyle: 'long', hairColor: 'blonde', top: 'shirt', bottom: 'skirt', accessory: 'headset' } },
    }),
    ent({
      id: 'fig-4',
      type: 'user',
      label: 'Engineer',
      parentId: 'dept-digital',
      placement: { mode: 'free', x: 190, y: 100 },
      asset: { symbol: 'figurine', params: { skin: 'tone-3', hairStyle: 'curly', hairColor: 'auburn', top: 'hoodie', bottom: 'shorts', accessory: 'none' } },
    }),
    ent({
      id: 'fig-5',
      type: 'user',
      label: 'Citizen',
      description: 'A member of the public using the service.',
      placement: { mode: 'free', x: 70, y: 170 },
      asset: { symbol: 'figurine', params: { skin: 'tone-5', hairStyle: 'bun', hairColor: 'grey', top: 'shirt', bottom: 'trousers', accessory: 'none' } },
    }),

    // Process territory overlapping the operations flow.
    ent({
      id: 'proc-1',
      type: 'territory',
      label: 'Dispatch Process',
      description: 'Order → dispatch → delivery.',
      parentId: 'dept-ops',
      placement: { mode: 'grid', x: 0, y: 3, footprint: { w: 3, d: 2 } },
      asset: { symbol: 'territory', params: { w: 3, d: 2 } },
    }),

    // Two callouts (annotations, always on top). One anchored w/ leader.
    ent({
      id: 'note-1',
      type: 'annotation',
      label: 'HQ note',
      placement: { mode: 'free', x: 40, y: -30 },
      asset: { symbol: 'callout', params: { text: 'HEAD OFFICE', leader: false } },
    }),
    ent({
      id: 'note-2',
      type: 'annotation',
      label: 'Server note',
      anchorEntityId: 'srv-1',
      placement: { mode: 'free', x: 140, y: 0 },
      asset: { symbol: 'callout', params: { text: 'CORE COMPUTE', leader: true } },
    }),
  ];

  return { ...doc, entities };
}
