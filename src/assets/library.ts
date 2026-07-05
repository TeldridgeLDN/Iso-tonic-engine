// Asset registry: id → renderer + metadata. The single lookup surface used by
// the renderer and the properties panel.

import { renderFigurine } from './figurine.ts';
import { renderBuilding } from './building.ts';
import { renderZone, renderProcessZone } from './zones.ts';
import { renderCallout } from './callout.ts';
import { serverRack, desktopWorkstation, laptopDesk, wallScreen, phoneKiosk, networkMast } from './symbols/digital.ts';
import { van, car, tram } from './symbols/vehicles.ts';
import { deskCluster, meetingTable, shelving, barrier } from './symbols/furniture.ts';
import { treeRound, treeConifer, planter, streetLamp, signpost } from './symbols/street.ts';
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
  { key: 'label', label: 'Label', kind: 'text' },
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

const ASSETS: AssetDef[] = [
  // Figurine (free-placed)
  { id: 'figurine', category: 'user', render: renderFigurine, paramSchema: figurineSchema },

  // Parametric building + presets
  { id: 'building', category: 'physical-infra', footprint: { w: 2, d: 2 }, render: renderBuilding, paramSchema: buildingSchema },
  {
    id: 'office-block',
    category: 'physical-infra',
    footprint: { w: 2, d: 2 },
    render: buildingPreset({ widthTiles: 2, depthTiles: 2, storeys: 5, windowStyle: 'grid', roof: 'flat' }),
    paramSchema: buildingSchema,
  },
  {
    id: 'terraced',
    category: 'physical-infra',
    footprint: { w: 3, d: 1 },
    render: buildingPreset({ widthTiles: 3, depthTiles: 1, storeys: 2, windowStyle: 'sparse', roof: 'pitched' }),
    paramSchema: buildingSchema,
  },
  {
    id: 'warehouse',
    category: 'physical-infra',
    footprint: { w: 3, d: 3 },
    render: buildingPreset({ widthTiles: 3, depthTiles: 3, storeys: 1, windowStyle: 'sparse', roof: 'flat' }),
    paramSchema: buildingSchema,
  },
  {
    id: 'civic',
    category: 'organisation',
    footprint: { w: 3, d: 2 },
    render: buildingPreset({ widthTiles: 3, depthTiles: 2, storeys: 3, windowStyle: 'ribbon', roof: 'flat', signage: 'CIVIC' }),
    paramSchema: buildingSchema,
  },
  {
    id: 'house',
    category: 'physical-infra',
    footprint: { w: 1, d: 1 },
    render: buildingPreset({ widthTiles: 1, depthTiles: 1, storeys: 1, windowStyle: 'sparse', roof: 'pitched' }),
    paramSchema: buildingSchema,
  },

  // Digital infra
  { id: 'server-rack', category: 'digital-infra', footprint: { w: 1, d: 1 }, render: serverRack },
  { id: 'desktop-workstation', category: 'digital-infra', footprint: { w: 1, d: 1 }, render: desktopWorkstation },
  { id: 'laptop-desk', category: 'digital-infra', footprint: { w: 1, d: 1 }, render: laptopDesk },
  { id: 'wall-screen', category: 'digital-infra', footprint: { w: 2, d: 1 }, render: wallScreen },
  { id: 'phone-kiosk', category: 'digital-infra', footprint: { w: 1, d: 1 }, render: phoneKiosk },
  { id: 'network-mast', category: 'digital-infra', footprint: { w: 1, d: 1 }, render: networkMast },

  // Vehicles (physical infra)
  { id: 'van', category: 'physical-infra', footprint: { w: 2, d: 1 }, render: van },
  { id: 'car', category: 'physical-infra', footprint: { w: 2, d: 1 }, render: car },
  { id: 'tram', category: 'physical-infra', footprint: { w: 3, d: 1 }, render: tram },

  // Furniture (props)
  { id: 'desk-cluster', category: 'prop', footprint: { w: 2, d: 2 }, render: deskCluster },
  { id: 'meeting-table', category: 'prop', footprint: { w: 2, d: 1 }, render: meetingTable },
  { id: 'shelving', category: 'prop', footprint: { w: 1, d: 1 }, render: shelving },
  { id: 'barrier', category: 'prop', footprint: { w: 1, d: 1 }, render: barrier },

  // Street / greenery (props)
  { id: 'tree-round', category: 'prop', footprint: { w: 1, d: 1 }, render: treeRound },
  { id: 'tree-conifer', category: 'prop', footprint: { w: 1, d: 1 }, render: treeConifer },
  { id: 'planter', category: 'prop', footprint: { w: 1, d: 1 }, render: planter },
  { id: 'street-lamp', category: 'prop', footprint: { w: 1, d: 1 }, render: streetLamp },
  { id: 'signpost', category: 'prop', footprint: { w: 1, d: 1 }, render: signpost },

  // Zones
  { id: 'department-zone', category: 'department', ground: true, render: renderZone, paramSchema: zoneSchema },
  { id: 'process-zone', category: 'process', ground: true, render: renderProcessZone, paramSchema: zoneSchema },

  // Annotation
  { id: 'callout', category: 'annotation', render: renderCallout, paramSchema: calloutSchema },
];

const BY_ID = new Map<string, AssetDef>(ASSETS.map((a) => [a.id, a]));

export function getAsset(id: string): AssetDef | undefined {
  return BY_ID.get(id);
}

export function listAssets(): AssetDef[] {
  return ASSETS.slice();
}

export function listByCategory(category: AssetDef['category']): AssetDef[] {
  return ASSETS.filter((a) => a.category === category);
}
