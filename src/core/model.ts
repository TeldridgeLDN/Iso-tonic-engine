// Scene document types (per docs/SCHEMA.md v1) + factory & query helpers.
// Pure TS, no DOM.

import { footprintTiles, effectiveFootprint } from './iso.ts';

// Re-exported so callers get the rotation helper from the model surface
// (per docs/SCHEMA.md: "always derive via core effectiveFootprint()").
export { effectiveFootprint };

// ---------------------------------------------------------------------------
// Types (mirror docs/SCHEMA.md exactly)
// ---------------------------------------------------------------------------

export type EntityType =
  | 'user'
  | 'team'
  | 'process'
  | 'department'
  | 'organisation'
  | 'physical-infra'
  | 'digital-infra'
  | 'annotation';

export interface CustomLayer {
  id: string;
  name: string;
  visible: boolean;
}

export interface GridPlacement {
  mode: 'grid';
  x: number;
  y: number;
  footprint: { w: number; d: number }; // AS AUTHORED (rotation 0)
  rotation?: 0 | 1 | 2 | 3; // quarter-turns clockwise; default 0
}

export interface FreePlacement {
  mode: 'free';
  x: number;
  y: number;
  rotation?: 0 | 1 | 2 | 3; // facing; default 0
}

export type Placement = GridPlacement | FreePlacement;

export interface AssetRef {
  symbol: string;
  params?: Record<string, unknown>;
}

export interface FigurineParams {
  skin: string;
  hairStyle: string;
  hairColor: string;
  top: string;
  bottom: string;
  accessory?: string;
  preset?: string;
}

export interface BuildingParams {
  widthTiles: number;
  depthTiles: number;
  storeys: number;
  windowStyle: 'grid' | 'ribbon' | 'sparse';
  roof: 'flat' | 'pitched' | 'plant';
  signage?: string;
}

export interface CalloutParams {
  text: string;
  angle?: number;
  leader?: boolean;
}

export interface Entity {
  id: string;
  type: EntityType;
  label: string;
  description?: string;
  parentId?: string;
  customLayers?: string[];
  placement: Placement;
  asset: AssetRef;
  anchorEntityId?: string;
  userGoal?: string; // zones/whole-services: what the user is trying to do
  orgGoal?: string; // zones/whole-services: what the organisation wants
  // Unknown fields must be preserved (forward compatibility).
  [key: string]: unknown;
}

export interface SceneMeta {
  title: string;
  description?: string;
  created: string;
  modified: string;
  [key: string]: unknown;
}

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export interface SceneDocument {
  version: 1;
  meta: SceneMeta;
  camera?: Camera;
  layers: CustomLayer[];
  typeLayerVisibility?: Partial<Record<EntityType, boolean>>;
  figurinePresets?: Record<string, FigurineParams>;
  entities: Entity[];
  // Unknown top-level fields preserved.
  [key: string]: unknown;
}

export const ALL_ENTITY_TYPES: readonly EntityType[] = [
  'user',
  'team',
  'process',
  'department',
  'organisation',
  'physical-infra',
  'digital-infra',
  'annotation',
];

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/** Create an empty, valid v1 document. `now` injectable for determinism. */
export function createEmptyDocument(title: string, now?: string): SceneDocument {
  const ts = now ?? new Date().toISOString();
  return {
    version: 1,
    meta: {
      title,
      created: ts,
      modified: ts,
    },
    layers: [],
    entities: [],
  };
}

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

/** Find an entity by id, or undefined. */
export function byId(doc: SceneDocument, id: string): Entity | undefined {
  return doc.entities.find((e) => e.id === id);
}

/** Direct children of an entity (entities whose parentId === id). */
export function childrenOf(doc: SceneDocument, id: string): Entity[] {
  return doc.entities.filter((e) => e.parentId === id);
}

/**
 * Transitive parent chain of an entity (excluding the entity itself),
 * ordered nearest-first. Guards against cycles.
 */
function transitiveParents(doc: SceneDocument, id: string): Entity[] {
  const out: Entity[] = [];
  const seen = new Set<string>([id]);
  let cur = byId(doc, id);
  while (cur?.parentId && !seen.has(cur.parentId)) {
    const parent = byId(doc, cur.parentId);
    if (!parent) break;
    out.push(parent);
    seen.add(parent.id);
    cur = parent;
  }
  return out;
}

/**
 * Transitive children of an entity (excluding the entity itself).
 * Guards against cycles.
 */
function transitiveChildren(doc: SceneDocument, id: string): Entity[] {
  const out: Entity[] = [];
  const seen = new Set<string>([id]);
  const stack = [id];
  while (stack.length > 0) {
    const cur = stack.pop() as string;
    for (const child of childrenOf(doc, cur)) {
      if (seen.has(child.id)) continue;
      seen.add(child.id);
      out.push(child);
      stack.push(child.id);
    }
  }
  return out;
}

/**
 * Semantic relatives of an entity, used by the Present-mode spotlight:
 * the entity itself + transitive parents + transitive children + direct
 * siblings (entities sharing the same parentId). De-duplicated; the focal
 * entity is included first.
 */
export function semanticRelatives(doc: SceneDocument, id: string): Entity[] {
  const focal = byId(doc, id);
  if (!focal) return [];

  const result: Entity[] = [focal];
  const seen = new Set<string>([focal.id]);

  const add = (list: Entity[]): void => {
    for (const e of list) {
      if (!seen.has(e.id)) {
        seen.add(e.id);
        result.push(e);
      }
    }
  };

  add(transitiveParents(doc, id));
  add(transitiveChildren(doc, id));

  // Direct siblings: same parentId (only meaningful when focal has a parent).
  if (focal.parentId !== undefined) {
    add(
      doc.entities.filter(
        (e) => e.id !== focal.id && e.parentId === focal.parentId
      )
    );
  }

  return result;
}

/**
 * Spotlight set for the focal entity, as a Set of entity ids: everything in
 * semanticRelatives (self + parent/child/sibling chains) PLUS every entity
 * that shares at least one custom layer with the focal entity. Custom layers
 * act as cross-cutting semantic groups (Defra whole-services review), so
 * spotlighting a member lights the whole group.
 *
 * Cycle-safe (via semanticRelatives) and dangling-layer-safe (a layer id the
 * focal entity carries but that no CustomLayer defines still groups entities
 * that literally share that id string — grouping is purely by shared id).
 * Returns an empty set for a missing focal id.
 */
export function spotlightSet(doc: SceneDocument, entityId: string): Set<string> {
  const focal = byId(doc, entityId);
  if (!focal) return new Set<string>();

  const ids = new Set<string>(semanticRelatives(doc, entityId).map((e) => e.id));

  const focalLayers = focal.customLayers;
  if (focalLayers && focalLayers.length > 0) {
    const focalLayerSet = new Set(focalLayers);
    for (const e of doc.entities) {
      if (ids.has(e.id)) continue;
      if (e.customLayers?.some((lid) => focalLayerSet.has(lid))) {
        ids.add(e.id);
      }
    }
  }

  return ids;
}

// ---------------------------------------------------------------------------
// Visibility
// ---------------------------------------------------------------------------

/**
 * Layer visibility rule: an entity is visible iff its type layer is visible
 * AND every custom layer it belongs to is visible.
 * Type layers default to visible when unspecified; custom layers referenced
 * by an entity but missing from doc.layers are treated as visible (validator
 * separately flags dangling custom-layer refs).
 */
export function isEntityVisible(doc: SceneDocument, entity: Entity): boolean {
  const typeVisible = doc.typeLayerVisibility?.[entity.type] ?? true;
  if (!typeVisible) return false;

  if (entity.customLayers && entity.customLayers.length > 0) {
    for (const layerId of entity.customLayers) {
      const layer = doc.layers.find((l) => l.id === layerId);
      if (layer && !layer.visible) return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// Collision
// ---------------------------------------------------------------------------

/**
 * Do two grid placements occupy any of the same tiles?
 * Non-grid placements never overlap (free placement has no footprint).
 */
export function footprintsOverlap(a: Placement, b: Placement): boolean {
  if (a.mode !== 'grid' || b.mode !== 'grid') return false;

  const bKeys = new Set(footprintTiles(b).map((t) => `${t.tx},${t.ty}`));
  return footprintTiles(a).some((t) => bKeys.has(`${t.tx},${t.ty}`));
}
