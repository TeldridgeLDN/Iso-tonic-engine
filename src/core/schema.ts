// Validation + versioned migration of .iso.json documents.
// Pure TS, no DOM. Unknown fields are preserved (never stripped).

import type {
  SceneDocument,
  Entity,
  EntityType,
  Placement,
} from './model.ts';
import { ALL_ENTITY_TYPES, footprintsOverlap } from './model.ts';

export interface ValidateOk {
  ok: true;
  doc: SceneDocument;
  warnings: string[];
}

export interface ValidateErr {
  ok: false;
  errors: string[];
  warnings: string[];
}

export type ValidateResult = ValidateOk | ValidateErr;

const ENTITY_TYPE_SET = new Set<string>(ALL_ENTITY_TYPES);

// ---------------------------------------------------------------------------
// Migration
// ---------------------------------------------------------------------------

/**
 * Migrate a raw parsed object up to the current schema version.
 * v1 passes through unchanged. Structure is here so future versions add
 * cases keyed off `version`. Never mutates the input; returns raw as-is for v1.
 */
export function migrate(raw: unknown): unknown {
  if (!isObject(raw)) return raw;
  // Future: while (raw.version < CURRENT) { ...bump... }
  return raw;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate an unknown value as a v1 SceneDocument.
 * Migrates first, then checks structure. On success returns the (unmodified,
 * unknown-fields-preserved) document typed as SceneDocument.
 */
export function validateDocument(input: unknown): ValidateResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const raw = migrate(input);

  if (!isObject(raw)) {
    return { ok: false, errors: ['document is not an object'], warnings };
  }

  // version
  if (raw.version !== 1) {
    errors.push(`version must be 1 (got ${JSON.stringify(raw.version)})`);
  }

  // meta
  if (!isObject(raw.meta)) {
    errors.push('meta is required and must be an object');
  } else {
    if (typeof raw.meta.title !== 'string') {
      errors.push('meta.title must be a string');
    }
    if (typeof raw.meta.created !== 'string') {
      errors.push('meta.created must be a string');
    }
    if (typeof raw.meta.modified !== 'string') {
      errors.push('meta.modified must be a string');
    }
  }

  // layers
  const layerIds = new Set<string>();
  if (!Array.isArray(raw.layers)) {
    errors.push('layers must be an array');
  } else {
    raw.layers.forEach((layer, i) => {
      if (!isObject(layer)) {
        errors.push(`layers[${i}] must be an object`);
        return;
      }
      if (typeof layer.id !== 'string') {
        errors.push(`layers[${i}].id must be a string`);
      } else {
        if (layerIds.has(layer.id)) {
          errors.push(`duplicate layer id "${layer.id}"`);
        }
        layerIds.add(layer.id);
      }
      if (typeof layer.name !== 'string') {
        errors.push(`layers[${i}].name must be a string`);
      }
      if (typeof layer.visible !== 'boolean') {
        errors.push(`layers[${i}].visible must be a boolean`);
      }
    });
  }

  // typeLayerVisibility
  if (raw.typeLayerVisibility !== undefined) {
    if (!isObject(raw.typeLayerVisibility)) {
      errors.push('typeLayerVisibility must be an object');
    } else {
      for (const [k, v] of Object.entries(raw.typeLayerVisibility)) {
        if (!ENTITY_TYPE_SET.has(k)) {
          errors.push(`typeLayerVisibility has unknown entity type "${k}"`);
        }
        if (typeof v !== 'boolean') {
          errors.push(`typeLayerVisibility["${k}"] must be a boolean`);
        }
      }
    }
  }

  // entities
  const entityIds = new Set<string>();
  const entities: unknown[] = Array.isArray(raw.entities) ? raw.entities : [];
  if (!Array.isArray(raw.entities)) {
    errors.push('entities must be an array');
  } else {
    entities.forEach((ent, i) => {
      validateEntity(ent, i, entityIds, layerIds, errors);
    });
  }

  // parentId references + cycles (only meaningful once ids collected)
  if (Array.isArray(raw.entities)) {
    validateParentRefsAndCycles(raw.entities, entityIds, errors);
  }

  // anchorEntityId references
  if (Array.isArray(raw.entities)) {
    raw.entities.forEach((ent, i) => {
      if (
        isObject(ent) &&
        ent.anchorEntityId !== undefined &&
        typeof ent.anchorEntityId === 'string' &&
        !entityIds.has(ent.anchorEntityId)
      ) {
        errors.push(
          `entities[${i}].anchorEntityId references missing entity "${ent.anchorEntityId}"`
        );
      }
    });
  }

  // Overlap warnings (grid entities only) — never errors. Legitimate nesting
  // (an entity inside its ancestor's larger footprint) is NOT warned.
  if (Array.isArray(raw.entities)) {
    collectOverlapWarnings(raw.entities, warnings);
  }

  if (errors.length > 0) {
    return { ok: false, errors, warnings };
  }
  return { ok: true, doc: raw as unknown as SceneDocument, warnings };
}

// ---------------------------------------------------------------------------
// Entity-level validation
// ---------------------------------------------------------------------------

function validateEntity(
  ent: unknown,
  i: number,
  entityIds: Set<string>,
  layerIds: Set<string>,
  errors: string[]
): void {
  if (!isObject(ent)) {
    errors.push(`entities[${i}] must be an object`);
    return;
  }

  // id
  if (typeof ent.id !== 'string') {
    errors.push(`entities[${i}].id must be a string`);
  } else {
    if (entityIds.has(ent.id)) {
      errors.push(`duplicate entity id "${ent.id}"`);
    }
    entityIds.add(ent.id);
  }

  // type
  if (typeof ent.type !== 'string' || !ENTITY_TYPE_SET.has(ent.type)) {
    errors.push(`entities[${i}].type is not a valid EntityType`);
  }

  // label
  if (typeof ent.label !== 'string') {
    errors.push(`entities[${i}].label must be a string`);
  }

  // customLayers
  if (ent.customLayers !== undefined) {
    if (!Array.isArray(ent.customLayers)) {
      errors.push(`entities[${i}].customLayers must be an array`);
    } else {
      ent.customLayers.forEach((lid, j) => {
        if (typeof lid !== 'string') {
          errors.push(`entities[${i}].customLayers[${j}] must be a string`);
        } else if (!layerIds.has(lid)) {
          errors.push(
            `entities[${i}].customLayers references missing layer "${lid}"`
          );
        }
      });
    }
  }

  // asset
  if (!isObject(ent.asset)) {
    errors.push(`entities[${i}].asset must be an object`);
  } else if (typeof ent.asset.symbol !== 'string') {
    errors.push(`entities[${i}].asset.symbol must be a string`);
  }

  // userGoal / orgGoal (optional strings)
  if (ent.userGoal !== undefined && typeof ent.userGoal !== 'string') {
    errors.push(`entities[${i}].userGoal must be a string`);
  }
  if (ent.orgGoal !== undefined && typeof ent.orgGoal !== 'string') {
    errors.push(`entities[${i}].orgGoal must be a string`);
  }

  // placement
  validatePlacement(ent.placement, i, errors);
}

function validatePlacement(
  placement: unknown,
  i: number,
  errors: string[]
): void {
  if (!isObject(placement)) {
    errors.push(`entities[${i}].placement must be an object`);
    return;
  }
  const mode = placement.mode;
  if (mode === 'grid') {
    if (!isFiniteNumber(placement.x) || !isFiniteNumber(placement.y)) {
      errors.push(`entities[${i}].placement grid x/y must be finite numbers`);
    }
    if (!isObject(placement.footprint)) {
      errors.push(`entities[${i}].placement.footprint must be an object`);
    } else {
      const { w, d } = placement.footprint;
      if (!isFiniteNumber(w) || !isFiniteNumber(d) || w < 1 || d < 1) {
        errors.push(
          `entities[${i}].placement.footprint w/d must be numbers >= 1`
        );
      }
    }
    validateRotation(placement.rotation, i, errors);
  } else if (mode === 'free') {
    if (!isFiniteNumber(placement.x) || !isFiniteNumber(placement.y)) {
      errors.push(`entities[${i}].placement free x/y must be finite numbers`);
    }
    validateRotation(placement.rotation, i, errors);
  } else {
    errors.push(
      `entities[${i}].placement.mode must be "grid" or "free" (got ${JSON.stringify(mode)})`
    );
  }
}

/** rotation, when present, must be an integer in {0,1,2,3}. */
function validateRotation(
  rotation: unknown,
  i: number,
  errors: string[]
): void {
  if (rotation === undefined) return;
  if (
    typeof rotation !== 'number' ||
    !Number.isInteger(rotation) ||
    rotation < 0 ||
    rotation > 3
  ) {
    errors.push(
      `entities[${i}].placement.rotation must be an integer 0-3 (got ${JSON.stringify(rotation)})`
    );
  }
}

// ---------------------------------------------------------------------------
// Parent refs + cycle detection
// ---------------------------------------------------------------------------

function validateParentRefsAndCycles(
  rawEntities: unknown[],
  entityIds: Set<string>,
  errors: string[]
): void {
  // Build parent map from well-formed entities.
  const parentOf = new Map<string, string | undefined>();
  for (const ent of rawEntities) {
    if (!isObject(ent) || typeof ent.id !== 'string') continue;
    const pid =
      typeof ent.parentId === 'string' ? ent.parentId : undefined;
    parentOf.set(ent.id, pid);
  }

  // Dangling parentId references.
  for (const [id, pid] of parentOf) {
    if (pid !== undefined && !entityIds.has(pid)) {
      errors.push(
        `entity "${id}".parentId references missing entity "${pid}"`
      );
    }
  }

  // Cycle detection via walk-to-root with visited set per node.
  for (const startId of parentOf.keys()) {
    const seen = new Set<string>();
    let cur: string | undefined = startId;
    while (cur !== undefined) {
      if (seen.has(cur)) {
        errors.push(`parentId cycle detected involving entity "${startId}"`);
        break;
      }
      seen.add(cur);
      const next: string | undefined = parentOf.get(cur);
      // stop if next is dangling (already reported) or missing from map
      if (next !== undefined && !parentOf.has(next)) break;
      cur = next;
    }
  }
}

// ---------------------------------------------------------------------------
// Overlap warnings
// ---------------------------------------------------------------------------

function collectOverlapWarnings(
  rawEntities: unknown[],
  warnings: string[]
): void {
  // parentId chain, so ancestor⊃descendant nesting can be excluded from the
  // overlap check — a child sitting inside its parent's (or grandparent's)
  // larger footprint is legitimate, not a collision.
  const parentOf = new Map<string, string | undefined>();
  for (const ent of rawEntities) {
    if (!isObject(ent) || typeof ent.id !== 'string') continue;
    parentOf.set(
      ent.id,
      typeof ent.parentId === 'string' ? ent.parentId : undefined
    );
  }

  const grid: { id: string; placement: Placement }[] = [];
  for (const ent of rawEntities) {
    if (!isObject(ent)) continue;
    const p = ent.placement;
    if (
      isObject(p) &&
      p.mode === 'grid' &&
      typeof ent.id === 'string' &&
      isFiniteNumber(p.x) &&
      isFiniteNumber(p.y) &&
      isObject(p.footprint) &&
      isFiniteNumber(p.footprint.w) &&
      isFiniteNumber(p.footprint.d)
    ) {
      grid.push({ id: ent.id, placement: p as unknown as Placement });
    }
  }
  for (let a = 0; a < grid.length; a++) {
    for (let b = a + 1; b < grid.length; b++) {
      if (isAncestorPair(grid[a].id, grid[b].id, parentOf)) continue;
      if (footprintsOverlap(grid[a].placement, grid[b].placement)) {
        warnings.push(
          `grid footprints overlap: "${grid[a].id}" and "${grid[b].id}"`
        );
      }
    }
  }
}

/**
 * True if one of the two ids is a (transitive) parent of the other — i.e. their
 * overlap is legitimate nesting. Cycle-safe via a per-walk visited set.
 */
function isAncestorPair(
  x: string,
  y: string,
  parentOf: Map<string, string | undefined>
): boolean {
  return isAncestorOf(x, y, parentOf) || isAncestorOf(y, x, parentOf);
}

/** True if `ancestor` appears in `descendant`'s parentId chain. */
function isAncestorOf(
  ancestor: string,
  descendant: string,
  parentOf: Map<string, string | undefined>
): boolean {
  const seen = new Set<string>();
  let cur = parentOf.get(descendant);
  while (cur !== undefined && !seen.has(cur)) {
    if (cur === ancestor) return true;
    seen.add(cur);
    cur = parentOf.get(cur);
  }
  return false;
}

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

// Re-export for callers that want the type surface.
export type { EntityType, Entity };
