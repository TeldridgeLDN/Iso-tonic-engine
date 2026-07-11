// Asset registry: id → renderer + metadata. The single lookup surface used by
// the renderer and the properties panel.

import { renderFigurine } from './figurine.ts';
import { renderBuilding } from './building.ts';
import { renderZone, renderProcessZone, renderTerritory } from './zones.ts';
import {
  roadStraight,
  roadCorner,
  roadT,
  roadCross,
  riverStraight,
  riverBend,
  renderRegionOrganic,
  renderIslandCoastline,
} from './terrain.ts';
import { renderCallout } from './callout.ts';
import { shopFront, cornerShop } from './symbols/highstreet.ts';
import { discoverSprites } from './spriteAuto.ts';
import { SKIN_TONES, HAIR_COLORS } from './style.ts';

// EntityType mirrors SCHEMA.md (duplicated: assets must not import outside assets/).
export type EntityType =
  | 'user'
  | 'team'
  | 'process'
  | 'department'
  | 'organisation'
  | 'territory'
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

// Territory: an unlabeled ground plate. Only w/d, resizable up to 100×100.
const territorySchema: ParamField[] = [
  { key: 'w', label: 'Width (tiles)', kind: 'number', min: 1, max: 100 },
  { key: 'd', label: 'Depth (tiles)', kind: 'number', min: 1, max: 100 },
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
  // 'cafe-seating' vector retired 2026-07-10 — replaced by the Variant-B
  // flat-colour sprite in sprites/cafe-seating.png (same id, auto-discovered).
  // 'market-stall' vector retired 2026-07-10 — replaced by the Variant-B
  // flat-colour sprite in sprites/market-stall.png (same id, auto-discovered).

  // Digital infra
  // 'server-rack', 'desktop-workstation', 'laptop-desk', 'wall-screen' and
  // 'network-mast' vectors removed 2026-07-10 — superseded by the gov-laptop
  // sprite (all five ids alias to it so saved documents still load).
  // 'telephone' vector retired 2026-07-10 — replaced by the Variant-B flat-colour
  // sprite in sprites/telephone.png (same id, auto-discovered).

  // Vehicles (physical infra)
  // 'van' vector retired 2026-07-10 — replaced by the Variant-B flat-colour
  // four-facing sprite in sprites/van.o0-3.png (same id, auto-discovered).
  // 'car' vector retired 2026-07-10 — replaced by the Variant-B flat-colour
  // four-facing sprite in sprites/car.o0-3.png (same id, auto-discovered).
  // 'tram' vector retired 2026-07-10 — replaced by the Variant-B flat-colour
  // four-facing sprite in sprites/tram.o0-3.png (same id, auto-discovered).

  // Furniture (props)
  // 'desk-cluster' and 'meeting-table' vectors retired 2026-07-10 — replaced by
  // Variant-B flat-colour sprites (same ids, auto-discovered).
  // 'desk-single' vector retired 2026-07-10 — replaced by the Variant-B flat-colour
  // sprite in sprites/desk-single.png (same id, auto-discovered; deskSingle render kept
  // in desks.ts for reference until the staffed-desk migration completes).
  // 'desk-meeting' (citizen + agent scene) and 'desk-reception' vectors retired
  // 2026-07-10 — replaced by Variant-B flat-colour sprites (same ids).
  // World-space (iso3) pilot rebuilds — double-pedestal desk with dress-ups.
  // 'desk-laptop-v2', 'desk-workstation-v2', 'shelving' and 'barrier' vectors
  // retired 2026-07-10 — replaced by Variant-B flat-colour sprites (same ids).

  // Street / greenery (props) — radially symmetric, orientations 1
  // 'tree-round', 'tree-conifer', 'planter', 'street-lamp' and 'signpost'
  // vectors retired 2026-07-10 — replaced by Variant-B flat-colour sprites
  // (same ids, auto-discovered; street.ts import removed).

  // Terrain (ground plane — renders beneath structures)
  { id: 'road-straight', category: 'prop', footprint: { w: 1, d: 1 }, ground: true, orientations: 2, render: roadStraight },
  { id: 'road-corner', category: 'prop', footprint: { w: 1, d: 1 }, ground: true, orientations: 4, render: roadCorner },
  { id: 'road-t', category: 'prop', footprint: { w: 1, d: 1 }, ground: true, orientations: 4, render: roadT },
  { id: 'road-cross', category: 'prop', footprint: { w: 1, d: 1 }, ground: true, render: roadCross },
  { id: 'river-straight', category: 'prop', footprint: { w: 1, d: 1 }, ground: true, orientations: 2, render: riverStraight },
  { id: 'river-bend', category: 'prop', footprint: { w: 1, d: 1 }, ground: true, orientations: 4, render: riverBend },
  { id: 'region-organic', category: 'department', footprint: { w: 4, d: 4 }, ground: true, render: renderRegionOrganic, paramSchema: zoneSchema },
  { id: 'island-coastline', category: 'organisation', footprint: { w: 6, d: 6 }, ground: true, render: renderIslandCoastline, paramSchema: zoneSchema },

  // Zones
  { id: 'department-zone', category: 'department', ground: true, render: renderZone, paramSchema: zoneSchema },
  { id: 'process-zone', category: 'process', ground: true, render: renderProcessZone, paramSchema: zoneSchema },

  // Territory (unlabeled ground plate; expand step of the zone → territory migration)
  { id: 'territory', category: 'territory', footprint: { w: 3, d: 3 }, ground: true, render: renderTerritory, paramSchema: territorySchema },

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
  'territory',
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
  // "Intelligent prompt" is deliberately the same concept as the AI agent
  // (2026-07-10 government-service concept set) — one sprite, two names.
  'intelligent-prompt': 'ai-agent',
  // Legacy digital-infra vectors removed 2026-07-10, superseded by gov-laptop.
  'server-rack': 'gov-laptop',
  'desktop-workstation': 'gov-laptop',
  'laptop-desk': 'gov-laptop',
  'wall-screen': 'gov-laptop',
  'network-mast': 'gov-laptop',
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
