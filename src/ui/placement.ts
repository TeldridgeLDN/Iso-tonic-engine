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
import { getAsset } from '../assets/library.ts';
import { randomFigurineParams } from '../assets/figurine.ts';
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
      placement.mode === 'grid' && this.collidesGrid(placement, entity.id);
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
        : undefined;

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

  private collidesGrid(placement: Placement, ignoreId: string): boolean {
    if (placement.mode !== 'grid') return false;
    return this.host.history.document.entities.some(
      (o) =>
        o.id !== ignoreId &&
        o.placement.mode === 'grid' &&
        footprintsOverlap(placement, o.placement)
    );
  }

  private nextLabel(base: string): string {
    const n = (this.labelCounters.get(base) ?? 0) + 1;
    this.labelCounters.set(base, n);
    return `${base} ${n}`;
  }
}
