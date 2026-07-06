// Asset registry: id → renderer + metadata. The single lookup surface used by
// the renderer and the properties panel.

import { renderFigurine } from './figurine.ts';
import { renderBuilding } from './building.ts';
import { renderZone, renderProcessZone } from './zones.ts';
import {
  roadStraight,
  roadCorner,
  roadT,
  riverStraight,
  riverBend,
  renderRegionOrganic,
  renderIslandCoastline,
} from './terrain.ts';
import { renderCallout } from './callout.ts';
import { serverRack, desktopWorkstation, laptopDesk, wallScreen, telephone, networkMast } from './symbols/digital.ts';
import { van, car, tram } from './symbols/vehicles.ts';
import { deskCluster, meetingTable, shelving, barrier } from './symbols/furniture.ts';
import { deskSingle, deskMeeting, deskReception } from './symbols/desks.ts';
import { deskLaptopV2, deskWorkstationV2 } from './symbols/desks-v2.ts';
import { treeRound, treeConifer, planter, streetLamp, signpost } from './symbols/street.ts';
import { shopFront, cornerShop, cafeSeating, marketStall } from './symbols/highstreet.ts';
import { discoverSprites } from './spriteAuto.ts';
import { SKIN_TONES, HAIR_COLORS } from './style.ts';

// EntityType mirrors SCHEMA.md (duplicated: assets must not import outside assets/).
export type EntityType =
  | 'user'
  | 'team'
  | 'process'
  | 'department'
  | 'organisation'
  | 'physical-infra'
  | 'digital-infra'
  | 'annotation';

export interface ParamField {
  key: string;
  label: string;
  kind: 'select' | 'text' | 'number' | 'color';
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
}

export interface AssetDef {
  id: string;
  category: EntityType | 'prop';
  footprint?: { w: number; d: number };
  /** Flat ground-plane content (zone plates): always renders beneath structures. */
  ground?: boolean;
  /**
   * How many distinct facings this asset renders (default 1 = fixed).
   * The effective facing reaches render() as the reserved param key
   * `orientation` (0–3). 2 ⇒ 1|3 render the mirrored facing; 4 ⇒ true
   * quarter-turns. Absent/0 always reproduces the current output.
   */
  orientations?: 1 | 2 | 4;
  render(params?: Record<string, unknown>): string;
  paramSchema?: ParamField[];
}

// --- param schemas -------------------------------------------------------

function opts(values: string[]): { value: string; label: string }[] {
  return values.map((v) => ({ value: v, label: v.charAt(0).toUpperCase() + v.slice(1) }));
}

function colorOpts(palette: Record<string, string>): { value: string; label: string }[] {
  return Object.keys(palette).map((k) => ({ value: k, label: k }));
}

const figurineSchema: ParamField[] = [
  { key: 'skin', label: 'Skin tone', kind: 'select', options: colorOpts(SKIN_TONES) },
  { key: 'hairStyle', label: 'Hair', kind: 'select', options: opts(['short', 'long', 'bun', 'curly', 'bald']) },
  { key: 'hairColor', label: 'Hair colour', kind: 'select', options: colorOpts(HAIR_COLORS) },
  { key: 'top', label: 'Top', kind: 'select', options: opts(['shirt', 'jacket', 'hoodie', 'hiviz']) },
  { key: 'bottom', label: 'Bottom', kind: 'select', options: opts(['trousers', 'skirt', 'shorts']) },
  { key: 'accessory', label: 'Accessory', kind: 'select', options: opts(['none', 'hardhat', 'headset', 'clipboard']) },
];

const buildingSchema: ParamField[] = [
  { key: 'widthTiles', label: 'Width (tiles)', kind: 'number', min: 1, max: 8 },
  { key: 'depthTiles', label: 'Depth (tiles)', kind: 'number', min: 1, max: 8 },
  { key: 'storeys', label: 'Storeys', kind: 'number', min: 1, max: 10 },
  { key: 'windowStyle', label: 'Windows', kind: 'select', options: opts(['grid', 'ribbon', 'sparse']) },
  { key: 'roof', label: 'Roof', kind: 'select', options: opts(['flat', 'pitched', 'plant']) },
  { key: 'signage', label: 'Signage', kind: 'text' },
];

const zoneSchema: ParamField[] = [
  { key: 'w', label: 'Width (tiles)', kind: 'number', min: 1, max: 12 },
  { key: 'd', label: 'Depth (tiles)', kind: 'number', min: 1, max: 12 },
  { key: 'label', label: 'Title', kind: 'text' },
  { key: 'number', label: 'Plaque number', kind: 'number', min: 0, max: 999 },
  { key: 'userGroups', label: 'User groups (comma-separated)', kind: 'text' },
];

const shopSchema: ParamField[] = [
  { key: 'signage', label: 'Shop sign', kind: 'text' },
];

const calloutSchema: ParamField[] = [
  { key: 'text', label: 'Text', kind: 'text' },
  { key: 'angle', label: 'Angle', kind: 'number', min: -90, max: 90 },
];

// --- building preset wrapper ---------------------------------------------

function buildingPreset(preset: Record<string, unknown>): AssetDef['render'] {
  return (params?: Record<string, unknown>) => renderBuilding({ ...preset, ...(params ?? {}) });
}

// --- registry ------------------------------------------------------------

// Hand-registered assets. Auto-discovered PNG sprites (src/assets/sprites/*.png,
// see spriteAuto.ts) are merged in below; on an id collision the hand-registered
// entry wins so a deliberate registration always overrides a dropped-in file.
const HAND_ASSETS: AssetDef[] = [
  // Figurine (free-placed)
  { id: 'figurine', category: 'user', orientations: 2, render: renderFigurine, paramSchema: figurineSchema },

  // Parametric building + presets
  { id: 'building', category: 'physical-infra', footprint: { w: 2, d: 2 }, orientations: 4, render: renderBuilding, paramSchema: buildingSchema },
  {
    id: 'office-block',
    category: 'physical-infra',
    footprint: { w: 2, d: 2 },
    orientations: 4,
    render: buildingPreset({ widthTiles: 2, depthTiles: 2, storeys: 5, windowStyle: 'grid', roof: 'flat' }),
    paramSchema: buildingSchema,
  },
  {
    id: 'terraced',
    category: 'physical-infra',
    footprint: { w: 3, d: 1 },
    orientations: 4,
    render: buildingPreset({ widthTiles: 3, depthTiles: 1, storeys: 2, windowStyle: 'sparse', roof: 'pitched' }),
    paramSchema: buildingSchema,
  },
  {
    id: 'warehouse',
    category: 'physical-infra',
    footprint: { w: 3, d: 3 },
    orientations: 4,
    render: buildingPreset({ widthTiles: 3, depthTiles: 3, storeys: 1, windowStyle: 'sparse', roof: 'flat' }),
    paramSchema: buildingSchema,
  },
  {
    id: 'civic',
    category: 'organisation',
    footprint: { w: 3, d: 2 },
    orientations: 4,
    render: buildingPreset({ widthTiles: 3, depthTiles: 2, storeys: 3, windowStyle: 'ribbon', roof: 'flat', signage: 'CIVIC' }),
    paramSchema: buildingSchema,
  },

  // High street / neighbourhood (dedicated renderers, mirror-based)
  { id: 'shop-front', category: 'physical-infra', footprint: { w: 2, d: 1 }, orientations: 2, render: shopFront, paramSchema: shopSchema },
  { id: 'corner-shop', category: 'physical-infra', footprint: { w: 1, d: 1 }, orientations: 2, render: cornerShop, paramSchema: shopSchema },
  { id: 'cafe-seating', category: 'prop', footprint: { w: 1, d: 1 }, orientations: 2, render: cafeSeating },
  { id: 'market-stall', category: 'prop', footprint: { w: 1, d: 1 }, orientations: 2, render: marketStall },

  // Digital infra
  { id: 'server-rack', category: 'digital-infra', footprint: { w: 1, d: 1 }, render: serverRack },
  { id: 'desktop-workstation', category: 'digital-infra', footprint: { w: 1, d: 1 }, orientations: 2, render: desktopWorkstation },
  { id: 'laptop-desk', category: 'digital-infra', footprint: { w: 1, d: 1 }, orientations: 2, render: laptopDesk },
  { id: 'wall-screen', category: 'digital-infra', footprint: { w: 2, d: 1 }, orientations: 2, render: wallScreen },
  { id: 'telephone', category: 'digital-infra', footprint: { w: 1, d: 1 }, orientations: 2, render: telephone },
  { id: 'network-mast', category: 'digital-infra', footprint: { w: 1, d: 1 }, render: networkMast },

  // Vehicles (physical infra)
  { id: 'van', category: 'physical-infra', footprint: { w: 2, d: 1 }, orientations: 2, render: van },
  { id: 'car', category: 'physical-infra', footprint: { w: 2, d: 1 }, orientations: 2, render: car },
  { id: 'tram', category: 'physical-infra', footprint: { w: 3, d: 1 }, orientations: 2, render: tram },

  // Furniture (props)
  { id: 'desk-cluster', category: 'prop', footprint: { w: 2, d: 2 }, orientations: 2, render: deskCluster },
  { id: 'meeting-table', category: 'prop', footprint: { w: 2, d: 1 }, orientations: 2, render: meetingTable },
  { id: 'desk-single', category: 'prop', footprint: { w: 2, d: 1 }, orientations: 2, render: deskSingle },
  { id: 'desk-meeting', category: 'prop', footprint: { w: 2, d: 1 }, orientations: 2, render: deskMeeting },
  { id: 'desk-reception', category: 'prop', footprint: { w: 2, d: 2 }, orientations: 4, render: deskReception },
  // World-space (iso3) pilot rebuilds — double-pedestal desk with dress-ups.
  { id: 'desk-laptop-v2', category: 'prop', footprint: { w: 2, d: 1 }, orientations: 2, render: deskLaptopV2 },
  { id: 'desk-workstation-v2', category: 'prop', footprint: { w: 2, d: 1 }, orientations: 2, render: deskWorkstationV2 },
  { id: 'shelving', category: 'prop', footprint: { w: 1, d: 1 }, orientations: 2, render: shelving },
  { id: 'barrier', category: 'prop', footprint: { w: 1, d: 1 }, render: barrier },

  // Street / greenery (props) — radially symmetric, orientations 1
  { id: 'tree-round', category: 'prop', footprint: { w: 1, d: 1 }, render: treeRound },
  { id: 'tree-conifer', category: 'prop', footprint: { w: 1, d: 1 }, render: treeConifer },
  { id: 'planter', category: 'prop', footprint: { w: 1, d: 1 }, render: planter },
  { id: 'street-lamp', category: 'prop', footprint: { w: 1, d: 1 }, render: streetLamp },
  { id: 'signpost', category: 'prop', footprint: { w: 1, d: 1 }, render: signpost },

  // Terrain (ground plane — renders beneath structures)
  { id: 'road-straight', category: 'prop', footprint: { w: 1, d: 1 }, ground: true, orientations: 2, render: roadStraight },
  { id: 'road-corner', category: 'prop', footprint: { w: 1, d: 1 }, ground: true, orientations: 4, render: roadCorner },
  { id: 'road-t', category: 'prop', footprint: { w: 1, d: 1 }, ground: true, orientations: 4, render: roadT },
  { id: 'river-straight', category: 'prop', footprint: { w: 1, d: 1 }, ground: true, orientations: 2, render: riverStraight },
  { id: 'river-bend', category: 'prop', footprint: { w: 1, d: 1 }, ground: true, orientations: 4, render: riverBend },
  { id: 'region-organic', category: 'department', footprint: { w: 4, d: 4 }, ground: true, render: renderRegionOrganic, paramSchema: zoneSchema },
  { id: 'island-coastline', category: 'organisation', footprint: { w: 6, d: 6 }, ground: true, render: renderIslandCoastline, paramSchema: zoneSchema },

  // Zones
  { id: 'department-zone', category: 'department', ground: true, render: renderZone, paramSchema: zoneSchema },
  { id: 'process-zone', category: 'process', ground: true, render: renderProcessZone, paramSchema: zoneSchema },

  // Annotation
  { id: 'callout', category: 'annotation', render: renderCallout, paramSchema: calloutSchema },
];

// Merge auto-discovered sprites: hand-registered ids win; a colliding sprite is
// dropped (warned once). The auto entries carry a string category from a
// sidecar; narrow to AssetDef['category'] (fallback 'prop' if unrecognised) so
// the palette groups them.
const CATEGORIES: ReadonlySet<AssetDef['category']> = new Set<AssetDef['category']>([
  'user',
  'team',
  'process',
  'department',
  'organisation',
  'physical-infra',
  'digital-infra',
  'annotation',
  'prop',
]);

function mergeAutoSprites(hand: AssetDef[]): AssetDef[] {
  const handIds = new Set(hand.map((a) => a.id));
  const merged = hand.slice();
  for (const s of discoverSprites()) {
    if (handIds.has(s.id)) {
      // eslint-disable-next-line no-console
      console.warn(`[assets] auto-sprite "${s.id}" ignored — a hand-registered asset owns that id.`);
      continue;
    }
    const category = (CATEGORIES.has(s.category as AssetDef['category'])
      ? (s.category as AssetDef['category'])
      : 'prop');
    merged.push({ id: s.id, category, footprint: s.footprint, orientations: s.orientations, render: s.render });
  }
  return merged;
}

const ASSETS: AssetDef[] = mergeAutoSprites(HAND_ASSETS);

const BY_ID = new Map<string, AssetDef>(ASSETS.map((a) => [a.id, a]));

// Back-compat id aliases: old registry ids that were renamed. Resolving keeps
// previously-saved documents loadable; the alias is NOT listed (no duplicate in
// listAssets / the palette). 'phone-kiosk' → 'telephone' (renamed 2026-07).
const ID_ALIASES: Record<string, string> = {
  'phone-kiosk': 'telephone',
  // The demo crate moved from a manual registration (id 'sprite-demo') to the
  // auto-discovery path, where its id derives from the filename 'demo-crate.png'.
  'sprite-demo': 'demo-crate',
  // Vector house replaced by the auto-discovered PNG sprite (2026-07-06).
  'house': 'house-small',
};

export function getAsset(id: string): AssetDef | undefined {
  return BY_ID.get(id) ?? BY_ID.get(ID_ALIASES[id] ?? '');
}

export function listAssets(): AssetDef[] {
  return ASSETS.slice();
}

export function listByCategory(category: AssetDef['category']): AssetDef[] {
  return ASSETS.filter((a) => a.category === category);
}
