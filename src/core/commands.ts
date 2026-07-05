// Invertible command layer + undo stack.
// Immutable style: every apply/invert returns a NEW SceneDocument (structural
// sharing is fine). Pure TS, no DOM.

import type {
  SceneDocument,
  Entity,
  CustomLayer,
  Placement,
  FigurineParams,
  EntityType,
} from './model.ts';

// ---------------------------------------------------------------------------
// Command interface
// ---------------------------------------------------------------------------

export interface Command {
  label: string;
  apply(doc: SceneDocument): SceneDocument;
  invert(doc: SceneDocument): SceneDocument;
}

// ---------------------------------------------------------------------------
// Immutable helpers
// ---------------------------------------------------------------------------

function replaceEntities(
  doc: SceneDocument,
  entities: Entity[]
): SceneDocument {
  return { ...doc, entities };
}

function requireEntity(doc: SceneDocument, id: string): Entity {
  const e = doc.entities.find((x) => x.id === id);
  if (!e) throw new Error(`command: entity "${id}" not found`);
  return e;
}

function mapEntity(
  doc: SceneDocument,
  id: string,
  fn: (e: Entity) => Entity
): SceneDocument {
  return replaceEntities(
    doc,
    doc.entities.map((e) => (e.id === id ? fn(e) : e))
  );
}

// ---------------------------------------------------------------------------
// PlaceEntity / DeleteEntity
// ---------------------------------------------------------------------------

/** Insert a fully-formed entity. Invert removes it. */
export class PlaceEntity implements Command {
  label = 'Place entity';
  private readonly entity: Entity;
  constructor(entity: Entity) {
    this.entity = entity;
  }

  apply(doc: SceneDocument): SceneDocument {
    if (doc.entities.some((e) => e.id === this.entity.id)) {
      throw new Error(`PlaceEntity: id "${this.entity.id}" already exists`);
    }
    return replaceEntities(doc, [...doc.entities, this.entity]);
  }

  invert(doc: SceneDocument): SceneDocument {
    return replaceEntities(
      doc,
      doc.entities.filter((e) => e.id !== this.entity.id)
    );
  }
}

/**
 * Delete an entity by id. Captures the removed entity and its original array
 * index at construction time so invert restores it in place.
 */
export class DeleteEntity implements Command {
  label = 'Delete entity';
  private removed?: Entity;
  private index = -1;
  private readonly id: string;

  constructor(id: string) {
    this.id = id;
  }

  apply(doc: SceneDocument): SceneDocument {
    const idx = doc.entities.findIndex((e) => e.id === this.id);
    if (idx === -1) throw new Error(`DeleteEntity: "${this.id}" not found`);
    this.removed = doc.entities[idx];
    this.index = idx;
    const entities = doc.entities.slice();
    entities.splice(idx, 1);
    return replaceEntities(doc, entities);
  }

  invert(doc: SceneDocument): SceneDocument {
    if (!this.removed) throw new Error('DeleteEntity: invert before apply');
    const entities = doc.entities.slice();
    const at = Math.min(this.index, entities.length);
    entities.splice(at, 0, this.removed);
    return replaceEntities(doc, entities);
  }
}

// ---------------------------------------------------------------------------
// MoveEntity (both placement modes)
// ---------------------------------------------------------------------------

/** Replace an entity's placement. Captures the previous placement for invert. */
export class MoveEntity implements Command {
  label = 'Move entity';
  private prev?: Placement;
  private readonly id: string;
  private readonly next: Placement;

  constructor(id: string, next: Placement) {
    this.id = id;
    this.next = next;
  }

  apply(doc: SceneDocument): SceneDocument {
    const e = requireEntity(doc, this.id);
    this.prev = e.placement;
    return mapEntity(doc, this.id, (ent) => ({
      ...ent,
      placement: this.next,
    }));
  }

  invert(doc: SceneDocument): SceneDocument {
    if (!this.prev) throw new Error('MoveEntity: invert before apply');
    const prev = this.prev;
    return mapEntity(doc, this.id, (ent) => ({ ...ent, placement: prev }));
  }
}

// ---------------------------------------------------------------------------
// UpdateEntityProps
// ---------------------------------------------------------------------------

export interface EntityPropsPatch {
  label?: string;
  description?: string;
  // Use null to explicitly clear parentId; omit to leave unchanged.
  parentId?: string | null;
  // Shallow patch merged into asset.params.
  params?: Record<string, unknown>;
}

/**
 * Patch label / description / parentId / asset.params of an entity.
 * Captures the full prior entity for a clean invert.
 */
export class UpdateEntityProps implements Command {
  label = 'Update properties';
  private prev?: Entity;
  private readonly id: string;
  private readonly patch: EntityPropsPatch;

  constructor(id: string, patch: EntityPropsPatch) {
    this.id = id;
    this.patch = patch;
  }

  apply(doc: SceneDocument): SceneDocument {
    const e = requireEntity(doc, this.id);
    this.prev = e;
    return mapEntity(doc, this.id, (ent) => {
      const next: Entity = { ...ent };
      if (this.patch.label !== undefined) next.label = this.patch.label;
      if (this.patch.description !== undefined) {
        next.description = this.patch.description;
      }
      if (this.patch.parentId !== undefined) {
        if (this.patch.parentId === null) {
          delete next.parentId;
        } else {
          next.parentId = this.patch.parentId;
        }
      }
      if (this.patch.params !== undefined) {
        next.asset = {
          ...ent.asset,
          params: { ...(ent.asset.params ?? {}), ...this.patch.params },
        };
      }
      return next;
    });
  }

  invert(doc: SceneDocument): SceneDocument {
    if (!this.prev) throw new Error('UpdateEntityProps: invert before apply');
    const prev = this.prev;
    return mapEntity(doc, this.id, () => prev);
  }
}

// ---------------------------------------------------------------------------
// AssignLayers
// ---------------------------------------------------------------------------

/** Set the full customLayers array of an entity. Captures prior for invert. */
export class AssignLayers implements Command {
  label = 'Assign layers';
  private prev?: string[] | undefined;
  private had = false;
  private readonly id: string;
  private readonly layerIds: string[];

  constructor(id: string, layerIds: string[]) {
    this.id = id;
    this.layerIds = layerIds;
  }

  apply(doc: SceneDocument): SceneDocument {
    const e = requireEntity(doc, this.id);
    this.had = 'customLayers' in e && e.customLayers !== undefined;
    this.prev = e.customLayers;
    return mapEntity(doc, this.id, (ent) => ({
      ...ent,
      customLayers: [...this.layerIds],
    }));
  }

  invert(doc: SceneDocument): SceneDocument {
    return mapEntity(doc, this.id, (ent) => {
      const next: Entity = { ...ent };
      if (this.had && this.prev !== undefined) {
        next.customLayers = this.prev;
      } else {
        delete next.customLayers;
      }
      return next;
    });
  }
}

// ---------------------------------------------------------------------------
// AddLayer / RemoveLayer
// ---------------------------------------------------------------------------

/** Add a custom layer. Invert removes it (by id). */
export class AddLayer implements Command {
  label = 'Add layer';
  private readonly layer: CustomLayer;
  constructor(layer: CustomLayer) {
    this.layer = layer;
  }

  apply(doc: SceneDocument): SceneDocument {
    if (doc.layers.some((l) => l.id === this.layer.id)) {
      throw new Error(`AddLayer: id "${this.layer.id}" already exists`);
    }
    return { ...doc, layers: [...doc.layers, this.layer] };
  }

  invert(doc: SceneDocument): SceneDocument {
    return { ...doc, layers: doc.layers.filter((l) => l.id !== this.layer.id) };
  }
}

/**
 * Remove a custom layer AND strip its id from every entity's customLayers.
 * Invert restores the layer (at its original index) and re-adds its id to the
 * exact entities that referenced it.
 */
export class RemoveLayer implements Command {
  label = 'Remove layer';
  private removedLayer?: CustomLayer;
  private layerIndex = -1;
  // Exact prior customLayers arrays for each affected entity, so invert
  // restores original ordering (not merely re-appends the id).
  private priorLayers = new Map<string, string[]>();
  private readonly layerId: string;

  constructor(layerId: string) {
    this.layerId = layerId;
  }

  apply(doc: SceneDocument): SceneDocument {
    const idx = doc.layers.findIndex((l) => l.id === this.layerId);
    if (idx === -1) throw new Error(`RemoveLayer: "${this.layerId}" not found`);
    this.removedLayer = doc.layers[idx];
    this.layerIndex = idx;
    this.priorLayers = new Map();

    const layers = doc.layers.slice();
    layers.splice(idx, 1);

    const entities = doc.entities.map((e) => {
      if (e.customLayers && e.customLayers.includes(this.layerId)) {
        this.priorLayers.set(e.id, e.customLayers);
        const filtered = e.customLayers.filter((id) => id !== this.layerId);
        const next: Entity = { ...e, customLayers: filtered };
        return next;
      }
      return e;
    });

    return { ...doc, layers, entities };
  }

  invert(doc: SceneDocument): SceneDocument {
    if (!this.removedLayer) throw new Error('RemoveLayer: invert before apply');
    const layer = this.removedLayer;

    const layers = doc.layers.slice();
    const at = Math.min(this.layerIndex, layers.length);
    layers.splice(at, 0, layer);

    const entities = doc.entities.map((e) => {
      const prior = this.priorLayers.get(e.id);
      if (!prior) return e;
      const next: Entity = { ...e, customLayers: prior };
      return next;
    });

    return { ...doc, layers, entities };
  }
}

// ---------------------------------------------------------------------------
// SetLayerVisibility / SetTypeLayerVisibility
// ---------------------------------------------------------------------------

/** Toggle a custom layer's visibility. */
export class SetLayerVisibility implements Command {
  label = 'Set layer visibility';
  private prev?: boolean;
  private readonly layerId: string;
  private readonly visible: boolean;

  constructor(layerId: string, visible: boolean) {
    this.layerId = layerId;
    this.visible = visible;
  }

  apply(doc: SceneDocument): SceneDocument {
    const layer = doc.layers.find((l) => l.id === this.layerId);
    if (!layer) throw new Error(`SetLayerVisibility: "${this.layerId}" missing`);
    this.prev = layer.visible;
    return {
      ...doc,
      layers: doc.layers.map((l) =>
        l.id === this.layerId ? { ...l, visible: this.visible } : l
      ),
    };
  }

  invert(doc: SceneDocument): SceneDocument {
    if (this.prev === undefined) {
      throw new Error('SetLayerVisibility: invert before apply');
    }
    const prev = this.prev;
    return {
      ...doc,
      layers: doc.layers.map((l) =>
        l.id === this.layerId ? { ...l, visible: prev } : l
      ),
    };
  }
}

/** Toggle a type layer's visibility (typeLayerVisibility map). */
export class SetTypeLayerVisibility implements Command {
  label = 'Set type layer visibility';
  private prevValue?: boolean;
  private prevPresent = false;
  private readonly entityType: EntityType;
  private readonly visible: boolean;

  constructor(entityType: EntityType, visible: boolean) {
    this.entityType = entityType;
    this.visible = visible;
  }

  apply(doc: SceneDocument): SceneDocument {
    const map = doc.typeLayerVisibility ?? {};
    this.prevPresent = this.entityType in map;
    this.prevValue = map[this.entityType];
    return {
      ...doc,
      typeLayerVisibility: { ...map, [this.entityType]: this.visible },
    };
  }

  invert(doc: SceneDocument): SceneDocument {
    const map = { ...(doc.typeLayerVisibility ?? {}) };
    if (this.prevPresent && this.prevValue !== undefined) {
      map[this.entityType] = this.prevValue;
    } else {
      delete map[this.entityType];
    }
    return { ...doc, typeLayerVisibility: map };
  }
}

// ---------------------------------------------------------------------------
// UpsertFigurinePreset
// ---------------------------------------------------------------------------

/** Add or replace a named figurine preset. Invert restores prior state. */
export class UpsertFigurinePreset implements Command {
  label = 'Save figurine preset';
  private prevValue?: FigurineParams;
  private prevPresent = false;
  private readonly name: string;
  private readonly params: FigurineParams;

  constructor(name: string, params: FigurineParams) {
    this.name = name;
    this.params = params;
  }

  apply(doc: SceneDocument): SceneDocument {
    const map = doc.figurinePresets ?? {};
    this.prevPresent = this.name in map;
    this.prevValue = map[this.name];
    return {
      ...doc,
      figurinePresets: { ...map, [this.name]: this.params },
    };
  }

  invert(doc: SceneDocument): SceneDocument {
    const map = { ...(doc.figurinePresets ?? {}) };
    if (this.prevPresent && this.prevValue !== undefined) {
      map[this.name] = this.prevValue;
    } else {
      delete map[this.name];
    }
    return { ...doc, figurinePresets: map };
  }
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

export type HistoryListener = (doc: SceneDocument) => void;

const MAX_HISTORY = 100;

/**
 * Undo/redo stack over a live document. Capped at 100 undoable entries;
 * executing a new command clears the redo stack. Subscribers are notified
 * after every document change (execute / undo / redo).
 */
export class History {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];
  private listeners: HistoryListener[] = [];
  private doc: SceneDocument;

  constructor(doc: SceneDocument) {
    this.doc = doc;
  }

  get document(): SceneDocument {
    return this.doc;
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  execute(cmd: Command): SceneDocument {
    this.doc = cmd.apply(this.doc);
    this.undoStack.push(cmd);
    if (this.undoStack.length > MAX_HISTORY) {
      this.undoStack.shift(); // drop oldest
    }
    this.redoStack = [];
    this.notify();
    return this.doc;
  }

  undo(): SceneDocument {
    const cmd = this.undoStack.pop();
    if (!cmd) return this.doc;
    this.doc = cmd.invert(this.doc);
    this.redoStack.push(cmd);
    this.notify();
    return this.doc;
  }

  redo(): SceneDocument {
    const cmd = this.redoStack.pop();
    if (!cmd) return this.doc;
    this.doc = cmd.apply(this.doc);
    this.undoStack.push(cmd);
    this.notify();
    return this.doc;
  }

  subscribe(listener: HistoryListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify(): void {
    for (const l of this.listeners) l(this.doc);
  }
}
