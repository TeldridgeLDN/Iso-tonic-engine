// Pointer interaction state machine on the scene <svg>.
//
// Responsibilities (docs/PLAN.md #9):
//   - hover highlight + tooltip (both modes)
//   - drag entities (edit): grid ghosts + snaps to tile, free moves freely;
//     drop dispatches a MoveEntity command (one undo step per drag); reject
//     drops that overlap another grid footprint (snap back).
//   - background drag = pan.
//   - click (edit) = select; click (present) = spotlight; bg click clears.
//   - Escape clears selection/spotlight.
//
// The pure drop decision (screen delta → snapped placement → accept/reject) is
// factored into resolveGridDrop() so it can be unit-tested headlessly.

import type { Entity, GridPlacement, Placement, SceneDocument } from '../core/model.ts';
import { byId, footprintsOverlap } from '../core/model.ts';
import { screenToTile, snapToTile, tileToScreen } from '../core/iso.ts';
import { MoveEntity, ResizeEntity, type History } from '../core/commands.ts';
import type { Camera } from '../core/model.ts';
import { panBy, screenToWorld, wheelZoom } from './camera.ts';
import { getAsset } from '../assets/library.ts';
import {
  isResizable,
  resizeBounds,
  resolveResizeDrag,
  resolveResizeTarget,
  sizeParamKeys,
} from './resize.ts';

// ---------------------------------------------------------------------------
// Pure drop resolution (unit-tested)
// ---------------------------------------------------------------------------

export interface DropResult {
  /** The snapped grid placement the entity would land on. */
  placement: GridPlacement;
  /** false if it overlaps another grid entity's footprint (caller snaps back). */
  accepted: boolean;
  /** true if the placement is unchanged from the original (no-op drag). */
  unchanged: boolean;
}

/**
 * Resolve where a dragged GRID entity should land.
 *
 * @param entity      the entity being dragged (its current grid placement)
 * @param worldStart  world coords of the pointer at drag start
 * @param worldNow    world coords of the pointer now
 * @param doc         current document (to test footprint collisions)
 *
 * The pointer delta in world space is converted to a tile delta, applied to the
 * entity's origin, then snapped. Collision is checked against every OTHER grid
 * entity.
 */
export function resolveGridDrop(
  entity: Entity,
  worldStart: { x: number; y: number },
  worldNow: { x: number; y: number },
  doc: SceneDocument
): DropResult {
  const orig = entity.placement as GridPlacement;

  // Tile-space delta between now and start (fractional), added to origin.
  const tStart = screenToTile(worldStart.x, worldStart.y);
  const tNow = screenToTile(worldNow.x, worldNow.y);
  const snapped = snapToTile(
    orig.x + (tNow.tx - tStart.tx),
    orig.y + (tNow.ty - tStart.ty)
  );

  const placement: GridPlacement = {
    mode: 'grid',
    x: snapped.tx,
    y: snapped.ty,
    footprint: orig.footprint,
    // Preserve rotation so the moved entity keeps its facing AND so collision
    // is tested against the EFFECTIVE (rotated) footprint (footprintsOverlap →
    // footprintTiles → effectiveFootprint). Dropping it here would silently
    // un-rotate a dragged entity and mis-test overlaps.
    ...(orig.rotation !== undefined ? { rotation: orig.rotation } : {}),
  };

  const unchanged = placement.x === orig.x && placement.y === orig.y;

  const collides = doc.entities.some(
    (other) =>
      other.id !== entity.id &&
      other.placement.mode === 'grid' &&
      footprintsOverlap(placement, other.placement)
  );

  return { placement, accepted: !collides, unchanged };
}

/**
 * Resolve a resize drag for a grid zone entity into a candidate GridPlacement
 * carrying the new AUTHORED footprint (origin + rotation unchanged). The pointer
 * world position is converted to fractional effective tiles and clamped via the
 * asset's w/d bounds. Returns undefined if the entity isn't resizable.
 *
 * No collision test: zones legitimately contain nested entities, so a resize is
 * never rejected against its contents (per the user story).
 */
export function resolveResize(
  entity: Entity,
  worldNow: { x: number; y: number }
): GridPlacement | undefined {
  const def = getAsset(entity.asset.symbol);
  if (!isResizable(entity, def)) return undefined;
  const p = entity.placement as GridPlacement;
  const bounds = resizeBounds(def);
  const pointerTile = screenToTile(worldNow.x, worldNow.y);
  const authored = resolveResizeDrag(
    { tx: p.x, ty: p.y },
    pointerTile,
    bounds,
    (p.rotation ?? 0) as 0 | 1 | 2 | 3
  );
  return {
    mode: 'grid',
    x: p.x,
    y: p.y,
    footprint: authored,
    ...(p.rotation !== undefined ? { rotation: p.rotation } : {}),
  };
}

/** World-px position a FREE entity should move to for a given pointer delta. */
export function resolveFreeDrop(
  entity: Entity,
  worldStart: { x: number; y: number },
  worldNow: { x: number; y: number }
): Placement {
  const orig = entity.placement;
  return {
    mode: 'free',
    x: orig.x + (worldNow.x - worldStart.x),
    y: orig.y + (worldNow.y - worldStart.y),
  };
}

// ---------------------------------------------------------------------------
// DOM interaction controller
// ---------------------------------------------------------------------------

export type Mode = 'edit' | 'present';

/** Canvas interaction tool (edit mode): move/select entities, or resize zones. */
export type Tool = 'select' | 'resize';

export interface InteractionHost {
  history: History;
  getMode(): Mode;
  getCamera(): Camera;
  panCamera(next: Camera): void;
  /** Called when selection changes (edit mode). id or undefined to clear. */
  onSelect(id: string | undefined): void;
  /** Current selection id (edit mode) — used to resolve the resize handle's owner. */
  getSelectedId?(): string | undefined;
  /** When true, dragging a resizable zone resizes it without needing Shift. */
  getResizeArmed?(): boolean;
  /** The active canvas tool (edit mode). Defaults to 'select' when absent. */
  getTool?(): Tool;
  /** Called when the spotlight focus changes (present mode). */
  onSpotlight(id: string | undefined): void;
  /** Called on hover change so the app can re-render + position the tooltip. */
  onHover(id: string | undefined, clientX: number, clientY: number): void;
  /** Request a re-render (e.g. ghost during drag). */
  requestRender(): void;
  /** Optional live ghost placement while dragging (drives ghost re-render). */
  setGhost?(id: string | undefined, placement: Placement | undefined, rejected: boolean): void;
}

type DragState =
  | { kind: 'none' }
  | { kind: 'pan'; lastX: number; lastY: number }
  | {
      kind: 'entity';
      entityId: string;
      worldStart: { x: number; y: number };
      moved: boolean;
    }
  | { kind: 'resize'; entityId: string; candidate?: GridPlacement }
  | {
      kind: 'pending';
      startX: number;
      startY: number;
      entityId?: string;
      /**
       * Resize-tool only: the zone this press would resize once it becomes a
       * drag. A plain click still selects `entityId`; a drag resizes this.
       */
      resizeTargetId?: string;
    };

const DRAG_THRESHOLD = 3; // px before a press becomes a drag

export class InteractionController {
  private drag: DragState = { kind: 'none' };
  private hoverId: string | undefined;
  private readonly svg: SVGSVGElement;
  private readonly host: InteractionHost;

  constructor(svg: SVGSVGElement, host: InteractionHost) {
    this.svg = svg;
    this.host = host;
    svg.addEventListener('pointerdown', this.onPointerDown);
    svg.addEventListener('pointermove', this.onPointerMove);
    svg.addEventListener('pointerup', this.onPointerUp);
    svg.addEventListener('pointerleave', this.onPointerLeave);
    svg.addEventListener('wheel', this.onWheel, { passive: false });
  }

  /**
   * Cancel an in-progress drag (resize / entity move) without committing.
   * Used by Escape. Clears any live ghost and re-renders. Returns true if a
   * drag was actually cancelled.
   */
  cancelDrag(): boolean {
    if (this.drag.kind === 'resize' || this.drag.kind === 'entity') {
      this.drag = { kind: 'none' };
      this.host.setGhost?.(undefined, undefined, false);
      this.host.requestRender();
      return true;
    }
    return false;
  }

  dispose(): void {
    this.svg.removeEventListener('pointerdown', this.onPointerDown);
    this.svg.removeEventListener('pointermove', this.onPointerMove);
    this.svg.removeEventListener('pointerup', this.onPointerUp);
    this.svg.removeEventListener('pointerleave', this.onPointerLeave);
    this.svg.removeEventListener('wheel', this.onWheel);
  }

  // --- helpers ------------------------------------------------------------

  private viewportSize(): { w: number; h: number } {
    const r = this.svg.getBoundingClientRect();
    return { w: r.width, h: r.height };
  }

  /** Pointer position in viewport px (relative to svg top-left). */
  private localPoint(evt: PointerEvent | WheelEvent): { x: number; y: number } {
    const r = this.svg.getBoundingClientRect();
    return { x: evt.clientX - r.left, y: evt.clientY - r.top };
  }

  private worldPoint(evt: PointerEvent | WheelEvent): { x: number; y: number } {
    const lp = this.localPoint(evt);
    const { w, h } = this.viewportSize();
    return screenToWorld(lp.x, lp.y, this.host.getCamera(), w, h);
  }

  /** entity id under an event target, walking up to the nearest [data-entity-id]. */
  private entityIdAt(evt: PointerEvent): string | undefined {
    let el = evt.target as Element | null;
    while (el && el !== this.svg) {
      const id = el.getAttribute?.('data-entity-id');
      if (id) return id;
      el = el.parentElement;
    }
    return undefined;
  }

  // --- pointer handlers ---------------------------------------------------

  private onPointerDown = (evt: PointerEvent): void => {
    if (evt.button !== 0) return;
    try {
      this.svg.setPointerCapture(evt.pointerId);
    } catch {
      // Synthetic events / already-released pointers have no capturable id.
    }

    // Resize handle wins over entity-drag and pan. Only in edit mode, and only
    // when the pressed element is (inside) the handle for the selected entity.
    if (this.host.getMode() === 'edit' && this.isResizeHandleAt(evt)) {
      const id = this.host.getSelectedId?.();
      const entity = id ? byId(this.host.history.document, id) : undefined;
      if (entity && entity.placement.mode === 'grid') {
        this.drag = { kind: 'resize', entityId: entity.id };
        return;
      }
    }

    // Resize TOOL (explicit, SimCity-style): a press resolves the target zone as
    // (a) the resizable zone under the pointer, else (b) the currently-selected
    // resizable zone. A drag resizes that zone; a plain click still selects the
    // pressed entity so the panel follows; a miss (no target, no pressed entity)
    // is a pure no-op — we never fall through to pan or entity move here.
    if (this.host.getMode() === 'edit' && this.host.getTool?.() === 'resize') {
      const doc = this.host.history.document;
      const pressedId = this.entityIdAt(evt);
      const pressed = pressedId ? byId(doc, pressedId) : undefined;
      const selectedId = this.host.getSelectedId?.();
      const selected = selectedId ? byId(doc, selectedId) : undefined;
      const target = resolveResizeTarget(pressed, selected, (e) =>
        getAsset(e.asset.symbol)
      );
      const lp = this.localPoint(evt);
      this.drag = {
        kind: 'pending',
        startX: lp.x,
        startY: lp.y,
        entityId: pressedId,
        resizeTargetId: target?.id,
      };
      return;
    }

    // Shift+drag (or the panel's armed "Adjust size" toggle) resizes instead
    // of moving: the zone under the pointer if it's resizable, else the
    // current selection. Selecting it first keeps the handle/ghost
    // affordances consistent with a handle-initiated resize.
    if (
      this.host.getMode() === 'edit' &&
      (evt.shiftKey || this.host.getResizeArmed?.() === true)
    ) {
      const doc = this.host.history.document;
      const pressedId = this.entityIdAt(evt);
      const pressed = pressedId ? byId(doc, pressedId) : undefined;
      const selectedId = this.host.getSelectedId?.();
      const selected = selectedId ? byId(doc, selectedId) : undefined;
      const target = [pressed, selected].find(
        (e) => e && isResizable(e, getAsset(e.asset.symbol))
      );
      if (target) {
        this.host.onSelect(target.id);
        this.drag = { kind: 'resize', entityId: target.id };
        return;
      }
    }

    const entityId = this.entityIdAt(evt);
    const lp = this.localPoint(evt);
    this.drag = { kind: 'pending', startX: lp.x, startY: lp.y, entityId };
  };

  /** True if the pressed target is (within) a resize-handle group. */
  private isResizeHandleAt(evt: PointerEvent): boolean {
    let el = evt.target as Element | null;
    while (el && el !== this.svg) {
      if (el.getAttribute?.('data-resize-handle') === 'true') return true;
      el = el.parentElement;
    }
    return false;
  }

  private onPointerMove = (evt: PointerEvent): void => {
    // Promote a pending press into a drag once past threshold.
    if (this.drag.kind === 'pending') {
      const lp = this.localPoint(evt);
      const dist = Math.hypot(lp.x - this.drag.startX, lp.y - this.drag.startY);
      if (dist >= DRAG_THRESHOLD) {
        // Resize tool: a drag resizes the resolved zone. If nothing resolved
        // (empty press), the drag is a deliberate no-op — never pan/move.
        if (this.host.getMode() === 'edit' && this.host.getTool?.() === 'resize') {
          const targetId = this.drag.resizeTargetId;
          if (targetId) {
            this.host.onSelect(targetId);
            this.drag = { kind: 'resize', entityId: targetId };
            this.updateResizeGhost(evt);
          } else {
            this.drag = { kind: 'none' };
          }
          return;
        }
        const editable =
          this.host.getMode() === 'edit' && this.drag.entityId !== undefined;
        if (editable) {
          this.drag = {
            kind: 'entity',
            entityId: this.drag.entityId as string,
            worldStart: this.worldPoint(evt),
            moved: true,
          };
        } else {
          this.drag = { kind: 'pan', lastX: lp.x, lastY: lp.y };
        }
      }
    }

    if (this.drag.kind === 'pan') {
      const lp = this.localPoint(evt);
      const dx = lp.x - this.drag.lastX;
      const dy = lp.y - this.drag.lastY;
      this.drag.lastX = lp.x;
      this.drag.lastY = lp.y;
      this.host.panCamera(panBy(this.host.getCamera(), dx, dy));
      return;
    }

    if (this.drag.kind === 'entity') {
      this.updateGhost(evt);
      return;
    }

    if (this.drag.kind === 'resize') {
      this.updateResizeGhost(evt);
      return;
    }

    // Not dragging: hover tracking.
    this.updateHover(evt);
  }

  private updateResizeGhost(evt: PointerEvent): void {
    if (this.drag.kind !== 'resize') return;
    const entity = byId(this.host.history.document, this.drag.entityId);
    if (!entity) return;
    const candidate = resolveResize(entity, this.worldPoint(evt));
    if (!candidate) return;
    this.drag.candidate = candidate;
    // Never rejected: zones legitimately contain their nested entities.
    this.host.setGhost?.(entity.id, candidate, false);
    this.host.requestRender();
  };

  private updateGhost(evt: PointerEvent): void {
    const doc = this.host.history.document;
    const entity = byId(doc, this.drag.kind === 'entity' ? this.drag.entityId : '');
    if (!entity) return;
    const worldStart = (this.drag as { worldStart: { x: number; y: number } }).worldStart;
    const worldNow = this.worldPoint(evt);

    if (entity.placement.mode === 'grid') {
      const res = resolveGridDrop(entity, worldStart, worldNow, doc);
      this.host.setGhost?.(entity.id, res.placement, !res.accepted);
    } else {
      const next = resolveFreeDrop(entity, worldStart, worldNow);
      this.host.setGhost?.(entity.id, next, false);
    }
    this.host.requestRender();
  }

  private onPointerUp = (evt: PointerEvent): void => {
    try {
      this.svg.releasePointerCapture(evt.pointerId);
    } catch {
      /* capture may already be gone */
    }

    if (this.drag.kind === 'entity') {
      this.commitDrag(evt);
    } else if (this.drag.kind === 'resize') {
      this.commitResize(evt);
    } else if (this.drag.kind === 'pending') {
      // A click (no drag past threshold).
      this.handleClick(this.drag.entityId);
    }
    // pan drag: nothing to commit.

    this.host.setGhost?.(undefined, undefined, false);
    this.drag = { kind: 'none' };
    this.host.requestRender();
  };

  private commitDrag(evt: PointerEvent): void {
    if (this.drag.kind !== 'entity') return;
    const doc = this.host.history.document;
    const entity = byId(doc, this.drag.entityId);
    if (!entity) return;
    const worldNow = this.worldPoint(evt);

    if (entity.placement.mode === 'grid') {
      const res = resolveGridDrop(entity, this.drag.worldStart, worldNow, doc);
      if (res.accepted && !res.unchanged) {
        this.host.history.execute(new MoveEntity(entity.id, res.placement));
      } else if (!res.accepted) {
        // rejected: snap back (no command). Surface it for the operator.
        console.warn(
          `[iso] drop rejected: ${entity.id} would overlap another footprint at ` +
            `(${res.placement.x},${res.placement.y})`
        );
      }
    } else {
      const next = resolveFreeDrop(entity, this.drag.worldStart, worldNow);
      const same = next.x === entity.placement.x && next.y === entity.placement.y;
      if (!same) this.host.history.execute(new MoveEntity(entity.id, next));
    }
  }

  private commitResize(evt: PointerEvent): void {
    if (this.drag.kind !== 'resize') return;
    const entity = byId(this.host.history.document, this.drag.entityId);
    if (!entity || entity.placement.mode !== 'grid') return;
    const candidate = resolveResize(entity, this.worldPoint(evt));
    if (!candidate) return;

    const from = entity.placement.footprint;
    const to = candidate.footprint;
    if (to.w === from.w && to.d === from.d) return; // no-op
    const paramKeys = sizeParamKeys(getAsset(entity.asset.symbol));
    this.host.history.execute(
      new ResizeEntity({ entityId: entity.id, from, to, paramKeys })
    );
  }

  private handleClick(entityId: string | undefined): void {
    if (this.host.getMode() === 'edit') {
      this.host.onSelect(entityId);
    } else {
      // Present mode: click entity ⇒ spotlight; click bg ⇒ release.
      this.host.onSpotlight(entityId);
    }
  }

  private updateHover(evt: PointerEvent): void {
    const id = this.entityIdAt(evt);
    if (id !== this.hoverId) {
      this.hoverId = id;
    }
    // Always forward client coords so the tooltip can follow the pointer.
    this.host.onHover(id, evt.clientX, evt.clientY);
  }

  private onPointerLeave = (): void => {
    this.hoverId = undefined;
    this.host.onHover(undefined, 0, 0);
  };

  private onWheel = (evt: WheelEvent): void => {
    evt.preventDefault();
    const lp = this.localPoint(evt);
    const { w, h } = this.viewportSize();
    const next = wheelZoom(this.host.getCamera(), evt.deltaY, lp.x, lp.y, w, h);
    this.host.panCamera(next);
  };
}

/** Screen-px position of a grid entity's origin — used by ghost overlays. */
export function gridOriginScreen(p: GridPlacement): { x: number; y: number } {
  return tileToScreen(p.x, p.y);
}
