// Palette placement-mode controller. Owns the transient "ghost" entity that
// follows the cursor while placing a new asset, its footprint-collision test,
// and the commit (PlaceEntity via History). Kept out of app.ts so the shell
// stays under the 500-line budget.
//
// Grid assets snap to the tile under the cursor and reject on footprint overlap;
// free assets (figurines, callouts) place freely.

import type { Entity, Placement } from '../core/model.ts';
import { footprintsOverlap } from '../core/model.ts';
import { PlaceEntity, type History } from '../core/commands.ts';
import { getAsset, isGroundAsset, type AssetDef } from '../assets/library.ts';
import { randomFigurineParams } from '../assets/figurine.ts';
import { sizeParamKeys } from '../render/resize.ts';
import { snapToTile, screenToTile } from '../core/iso.ts';
import type { PlacementRequest } from './context.ts';

export interface PlacementPreview {
  entity: Entity;
  placement: Placement;
  rejected: boolean;
}

export interface PlacementHost {
  history: History;
  /** Convert client (screen) coords to world px. */
  clientToWorld(clientX: number, clientY: number): { x: number; y: number };
  /** Surface a transient message (e.g. rejected placement). */
  notify(message: string): void;
  /** Select an entity after it is placed. */
  select(id: string): void;
}

let entitySeq = 0;
function newEntityId(): string {
  return `e-${Date.now().toString(36)}-${entitySeq++}`;
}

/**
 * Seed the params for a freshly-placed asset so its size params start IN SYNC
 * with the footprint the entity is authored at. Without this, zone/building
 * renderers fall back to their own defaults (e.g. 4×4) while placement.footprint
 * (and the resize handle) use the registry footprint — the drawn blob and the
 * handle drift apart and the panel W/D inputs read blank (the reported bug).
 *
 * - If the schema carries a size-param pair (zones `w`/`d`; buildings
 *   `widthTiles`/`depthTiles`), seed those keys from the registry footprint,
 *   falling back to each field's schema min (or 1) when no footprint is defined.
 * - If the schema has a text `label` field and the renderer shows it (zones do),
 *   seed it to the entity label so a new zone is titled on the plate.
 *
 * Returns undefined when there's nothing to seed (keeps params off assets that
 * don't need them). Pure — no DOM, unit-tested.
 */
export function seedSizeParams(
  def: AssetDef | undefined,
  label: string
): Record<string, unknown> | undefined {
  if (!def) return undefined;
  const params: Record<string, unknown> = {};

  const keys = sizeParamKeys(def);
  if (keys) {
    const fp = def.footprint;
    params[keys.w] = fp ? fp.w : schemaMin(def, keys.w);
    params[keys.d] = fp ? fp.d : schemaMin(def, keys.d);
  }

  // Seed a title only for the trivially-correct zone case: a text field keyed
  // exactly `label`, which the zone renderers draw on the plate.
  const labelField = (def.paramSchema ?? []).find(
    (f) => f.key === 'label' && f.kind === 'text'
  );
  if (labelField) params.label = label;

  return Object.keys(params).length > 0 ? params : undefined;
}

/** A number field's schema min, defaulting to 1. */
function schemaMin(def: AssetDef, key: string): number {
  const f = (def.paramSchema ?? []).find(
    (x) => x.key === key && x.kind === 'number'
  );
  return typeof f?.min === 'number' ? f.min : 1;
}

export class PlacementController {
  private req: PlacementRequest | undefined;
  private preview: PlacementPreview | undefined;
  private readonly labelCounters = new Map<string, number>();
  private readonly host: PlacementHost;

  constructor(host: PlacementHost) {
    this.host = host;
  }

  get active(): boolean {
    return this.req !== undefined;
  }

  /** The current ghost preview, if the cursor is on-canvas. */
  currentPreview(): PlacementPreview | undefined {
    return this.preview;
  }

  begin(req: PlacementRequest): void {
    this.req = req;
    this.preview = undefined;
  }

  cancel(): void {
    this.req = undefined;
    this.preview = undefined;
  }

  /** Recompute the ghost placement from a cursor position. */
  updatePreview(clientX: number, clientY: number): void {
    if (!this.req) return;
    const world = this.host.clientToWorld(clientX, clientY);
    const def = getAsset(this.req.assetId);
    const entity = this.preview?.entity ?? this.buildEntity();
    const placement = this.placementFor(def, world.x, world.y);
    const rejected =
      placement.mode === 'grid' && this.collidesGrid(placement, entity);
    this.preview = { entity, placement, rejected };
  }

  /** Commit the current preview (canvas click). Keeps placement mode active. */
  commit(): void {
    if (!this.preview) return;
    const { entity, placement, rejected } = this.preview;
    if (rejected) {
      this.host.notify('Cannot place here — overlaps another footprint.');
      return;
    }
    const placed: Entity = { ...entity, placement };
    this.host.history.execute(new PlaceEntity(placed));
    this.preview = undefined; // fresh ghost on next move for rapid multi-place
    this.host.select(placed.id);
  }

  // --- internals ------------------------------------------------------------

  private buildEntity(): Entity {
    const req = this.req!;
    const def = getAsset(req.assetId);
    const label = this.nextLabel(req.assetLabel);
    const params: Record<string, unknown> | undefined =
      req.assetId === 'figurine'
        ? (randomFigurineParams(
            (Date.now() ^ (entitySeq * 2654435761)) >>> 0
          ) as unknown as Record<string, unknown>)
        : seedSizeParams(def, label);

    return {
      id: newEntityId(),
      type: req.entityType,
      label,
      placement: this.placementFor(def, 0, 0),
      asset: { symbol: req.assetId, ...(params ? { params } : {}) },
    };
  }

  private placementFor(
    def: ReturnType<typeof getAsset>,
    worldX: number,
    worldY: number
  ): Placement {
    if (def?.footprint) {
      const t = screenToTile(worldX, worldY);
      const { tx, ty } = snapToTile(t.tx, t.ty);
      return { mode: 'grid', x: tx, y: ty, footprint: { ...def.footprint } };
    }
    return { mode: 'free', x: Math.round(worldX), y: Math.round(worldY) };
  }

  private collidesGrid(placement: Placement, entity: Entity): boolean {
    if (placement.mode !== 'grid') return false;
    // Ground plates (territories) underlie other entities — placing onto or
    // under them is legitimate, so they are exempt from collision.
    if (isGroundAsset(entity)) return false;
    return this.host.history.document.entities.some(
      (o) =>
        o.id !== entity.id &&
        o.placement.mode === 'grid' &&
        !isGroundAsset(o) &&
        footprintsOverlap(placement, o.placement)
    );
  }

  private nextLabel(base: string): string {
    const n = (this.labelCounters.get(base) ?? 0) + 1;
    this.labelCounters.set(base, n);
    return `${base} ${n}`;
  }
}
