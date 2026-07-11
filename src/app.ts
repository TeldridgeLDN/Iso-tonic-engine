// App shell: three-pane layout (palette · canvas · panels), state + single
// subscribe→re-render pipeline. Wires History, camera, renderer, interaction
// controller, the Phase D panels (palette / layers / properties / figurine),
// the toolbar, and the interview wizard. Placement mode (from the palette) is
// owned here: a ghost follows the cursor and a canvas click commits PlaceEntity.

import type { Camera, Entity, GridPlacement, Placement, SceneDocument } from './core/model.ts';
import { byId } from './core/model.ts';
import { History, RotateEntity, DeleteEntity, CompoundCommand } from './core/commands.ts';
import { planRotation } from './render/rotation.ts';
import { presentSpotlight } from './render/spotlight.ts';
import { renderScene, type ViewState } from './render/renderer.ts';
import { isResizable } from './render/resize.ts';
import { backfillSizeParams } from './render/docMigrate.ts';
import { getAsset } from './assets/library.ts';
import { defaultCamera, screenToWorld, viewBoxAttr, viewBoxFor } from './render/camera.ts';
import {
  InteractionController,
  type InteractionHost,
  type Mode,
  type Tool,
} from './render/interactions.ts';
import type { AppContext, PlacementRequest } from './ui/context.ts';
import { PlacementController } from './ui/placement.ts';
import { RouteBuilder, routeStopFor } from './ui/routeBuilder.ts';
import { Palette } from './ui/palette.ts';
import { LayersPanel } from './ui/layersPanel.ts';
import { PropertiesPanel } from './ui/propertiesPanel.ts';
import { buildToolbar, type ToolbarHandles } from './ui/toolbar.ts';
import { buildCanvasToolbar, type CanvasToolbarHandles } from './ui/canvasToolbar.ts';
import { Wizard } from './ui/wizard.ts';
import { el, collapsibleColumn } from './ui/dom.ts';
import { tooltipHtml } from './ui/tooltip.ts';

const SVGNS = 'http://www.w3.org/2000/svg';

interface Ghost {
  id: string;
  placement: Placement;
  rejected: boolean;
}

export class App implements AppContext {
  history: History;
  private mode: Mode = 'edit';
  private tool: Tool = 'select';
  // Multi-selection with a primary (last-clicked) member. All single-entity
  // consumers (properties editing, rotation, resize handle, drag-move) key off
  // `selectionPrimary`; the whole `selection` set drives highlight + batch delete.
  private readonly selection = new Set<string>();
  private selectionPrimary: string | undefined;
  private spotlight: string | undefined;
  private spotlightLayerId: string | undefined;
  private hoverId: string | undefined;
  private camera: Camera;
  private ghost: Ghost | undefined;
  private placement!: PlacementController;
  private readonly routeBuilder = new RouteBuilder();
  private routeSeq = 0;

  private svg!: SVGSVGElement;
  private sceneRoot!: SVGGElement;
  private marqueeEl: SVGRectElement | undefined;
  private canvasTools!: CanvasToolbarHandles;
  private tooltip!: HTMLDivElement;
  private toast!: HTMLDivElement;
  private toolbar!: ToolbarHandles;
  private controller!: InteractionController;
  private cameraSyncTimer: number | undefined;
  private toastTimer: number | undefined;
  private readonly root: HTMLElement;

  private palette!: Palette;
  private wizard!: Wizard;
  private readonly selectionListeners: (() => void)[] = [];

  constructor(root: HTMLElement, doc: SceneDocument) {
    this.root = root;
    // Registry-aware backfill heals pre-seeding docs (saved maps, demo/example):
    // grid zones/buildings missing their size params get them from the footprint.
    const healed = backfillSizeParams(doc);
    this.history = new History(healed);
    this.camera = healed.camera ? { ...healed.camera } : defaultCamera();
    this.placement = this.makePlacementController();
  }

  private makePlacementController(): PlacementController {
    return new PlacementController({
      history: this.history,
      clientToWorld: (cx, cy) => this.clientToWorld(cx, cy),
      notify: (m) => this.showToast(m),
      select: (id) => this.select(id),
    });
  }

  mount(): void {
    this.buildDom();
    this.controller = new InteractionController(this.svg, this.interactionHost());

    this.history.subscribe(() => this.render());
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('resize', this.onResize);

    this.fitToContent();
    this.render();
  }

  // --- AppContext implementation -----------------------------------------

  document(): SceneDocument {
    return this.history.document;
  }

  subscribe(listener: () => void): () => void {
    return this.history.subscribe(() => listener());
  }

  selectedId(): string | undefined {
    return this.selectionPrimary;
  }

  selectedIds(): string[] {
    return [...this.selection];
  }

  getMode(): Mode {
    return this.mode;
  }

  select(id: string | undefined): void {
    this.setSelection(id);
    this.notifySelection();
    this.render();
  }

  // --- selection helpers --------------------------------------------------

  /** Replace the selection with a single entity (or clear when undefined). */
  private setSelection(id: string | undefined): void {
    this.selection.clear();
    if (id) this.selection.add(id);
    this.selectionPrimary = id;
  }

  /** Replace the selection with a set of ids (marquee). Primary = last id. */
  private setSelectionMany(ids: string[]): void {
    this.selection.clear();
    for (const id of ids) this.selection.add(id);
    this.selectionPrimary = ids.length ? ids[ids.length - 1] : undefined;
  }

  /** Shift+click: toggle one member; primary tracks the last-touched member. */
  private toggleSelectionMember(id: string): void {
    if (this.selection.has(id)) {
      this.selection.delete(id);
      if (this.selectionPrimary === id) {
        const remaining = [...this.selection];
        this.selectionPrimary = remaining[remaining.length - 1];
      }
    } else {
      this.selection.add(id);
      this.selectionPrimary = id;
    }
  }

  /** Clear the whole selection (Escape, replaceDocument, toggleMode). */
  private clearSelection(): void {
    this.selection.clear();
    this.selectionPrimary = undefined;
  }

  /** The active canvas tool (edit mode). */
  getTool(): Tool {
    return this.tool;
  }

  /**
   * Switch the canvas tool. Present mode always forces 'select'. Re-renders so
   * the canvas toolbar, cursor class, and discoverability hint update, and
   * notifies panels so the properties-panel resize toggle reflects tool state.
   */
  setTool(tool: Tool): void {
    const next = this.mode === 'present' ? 'select' : tool;
    if (next === this.tool) return;
    // Switching away from the route tool commits any in-progress route.
    if (this.tool === 'route') this.finishRoute();
    this.tool = next;
    this.notifySelection();
    this.render();
  }

  /**
   * Commit the in-progress route (if any stops) as ONE undoable PlaceEntity,
   * then clear the builder. A stop-less builder is a silent no-op. Selects the
   * new route so the properties panel opens on it. Shared by double-click, the
   * Enter key, and tool/mode switches.
   */
  private finishRoute(): void {
    const result = this.routeBuilder.finish(
      this.history.document,
      `e-route-${Date.now().toString(36)}-${this.routeSeq++}`
    );
    this.routeBuilder.reset();
    if (result) {
      this.history.execute(result.command); // subscribe → render
      this.select(result.entity.id);
    } else {
      this.render();
    }
  }

  // Backward-compatible AppContext resize-arming: it now simply mirrors the
  // resize TOOL. `resizeArmed()` reports tool === 'resize'; `setResizeArmed`
  // activates/deactivates the tool. Shift+drag remains a select-tool shortcut.
  resizeArmed(): boolean {
    return this.tool === 'resize';
  }

  setResizeArmed(on: boolean): void {
    this.setTool(on ? 'resize' : 'select');
  }

  onSelectionChange(listener: () => void): () => void {
    this.selectionListeners.push(listener);
    return () => {
      const i = this.selectionListeners.indexOf(listener);
      if (i >= 0) this.selectionListeners.splice(i, 1);
    };
  }

  beginPlacement(req: PlacementRequest): void {
    this.placement.begin(req);
    this.svg.classList.add('is-placing');
  }

  cancelPlacement(): void {
    this.placement.cancel();
    this.svg?.classList.remove('is-placing');
    this.palette?.clearActive();
    this.render();
  }

  replaceDocument(doc: SceneDocument): void {
    // Heal on adoption too, so file-open / wizard / demo all get seeded params.
    const healed = backfillSizeParams(doc);
    this.history = new History(healed);
    this.camera = healed.camera ? { ...healed.camera } : defaultCamera();
    this.clearSelection();
    this.spotlight = undefined;
    this.ghost = undefined;
    this.routeBuilder.reset();
    this.placement = this.makePlacementController();
    // Rewire the document-change subscription for re-render + panels.
    this.history.subscribe(() => this.render());
    // Panels subscribe through subscribe(); rebuild the whole shell so their
    // closures point at the new history.
    this.rebuildShell();
    this.fitToContent();
    this.notifySelection();
    this.render();
  }

  // --- DOM construction ---------------------------------------------------

  private buildDom(): void {
    this.root.innerHTML = '';
    this.root.classList.add('iso-app');
    // The svg is recreated below; any prior marquee overlay is now detached.
    this.marqueeEl = undefined;

    this.toolbar = buildToolbar({
      history: this.history,
      document: () => this.history.document,
      onNewMap: () => this.wizard.open(),
      onOpened: (doc) => this.replaceDocument(doc),
      toggleMode: () => this.toggleMode(),
      notify: (m) => this.showToast(m),
    });

    // Three-pane layout host.
    const main = el('div', { class: 'iso-main' });

    this.palette = new Palette(this);
    const paletteCol = collapsibleColumn('palette-col', this.palette.root, 'left');

    const stage = el('div', { class: 'iso-stage' });
    this.svg = document.createElementNS(SVGNS, 'svg') as SVGSVGElement;
    this.svg.setAttribute('class', 'iso-canvas');
    this.svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    this.sceneRoot = document.createElementNS(SVGNS, 'g') as SVGGElement;
    this.sceneRoot.setAttribute('data-scene-root', 'true');
    this.svg.appendChild(this.sceneRoot);

    this.canvasTools = buildCanvasToolbar({
      getTool: () => this.tool,
      setTool: (t) => this.setTool(t),
    });

    this.tooltip = el('div', { class: 'iso-tooltip' }) as HTMLDivElement;
    this.tooltip.hidden = true;
    this.toast = el('div', { class: 'iso-toast' }) as HTMLDivElement;
    this.toast.hidden = true;
    stage.append(this.svg, this.canvasTools.root, this.tooltip, this.toast);

    const layers = new LayersPanel(this);
    const props = new PropertiesPanel(this);
    const rightCol = collapsibleColumn(
      'panels-col',
      el('div', { class: 'iso-right-stack' }, [props.root, layers.root]),
      'right'
    );

    main.append(paletteCol, stage, rightCol);
    this.root.append(this.toolbar.root, main);

    // Wizard modal (created once, opened on demand).
    this.wizard = new Wizard({
      onComplete: (doc) => this.replaceDocument(doc),
      onBlank: (doc) => this.replaceDocument(doc),
      onLoadDemo: () => this.loadDemo(),
    });
  }

  /** Rebuild the whole shell DOM (used after replaceDocument). */
  private rebuildShell(): void {
    this.controller?.dispose();
    this.buildDom();
    this.controller = new InteractionController(this.svg, this.interactionHost());
  }

  private async loadDemo(): Promise<void> {
    const { buildDemoScene } = await import('./demo.ts');
    this.replaceDocument(buildDemoScene());
  }

  // --- render pipeline ----------------------------------------------------

  /** The document as it should currently render — with any live ghost/preview. */
  private renderDoc(): SceneDocument {
    const doc = this.history.document;
    // Drag ghost of an existing entity.
    if (this.ghost) {
      const g = this.ghost;
      return {
        ...doc,
        entities: doc.entities.map((e) =>
          e.id === g.id ? ({ ...e, placement: g.placement } as Entity) : e
        ),
      };
    }
    // Placement-mode preview: append a transient ghost entity.
    const preview = this.placement.currentPreview();
    if (preview) {
      return {
        ...doc,
        entities: [...doc.entities, { ...preview.entity, placement: preview.placement }],
      };
    }
    // Route-drawing preview: append the in-progress route entity so the real
    // route renderer draws its dashed path + numbered badges live.
    const routePreview = this.routeBuilder.previewEntity();
    if (routePreview) {
      return { ...doc, entities: [...doc.entities, routePreview] };
    }
    return doc;
  }

  private render(): void {
    const rect = this.svg.getBoundingClientRect();
    const w = rect.width || 800;
    const h = rect.height || 600;
    this.svg.setAttribute('viewBox', viewBoxAttr(viewBoxFor(this.camera, w, h)));

    const renderDoc = this.renderDoc();
    const view: ViewState = {
      selectedIds: this.mode === 'edit' ? this.selection : undefined,
      hoverId: this.hoverId,
      showGrid: this.mode === 'edit',
      resizeHandleFor: this.resizeHandlePlacement(renderDoc),
    };

    if (this.mode === 'present') {
      // Layer spotlight (custom-layer group) wins over a single-entity spotlight.
      view.spotlightIds = presentSpotlight(this.history.document, {
        layerId: this.spotlightLayerId,
        entityId: this.spotlight,
      });
    }

    renderScene(this.sceneRoot, renderDoc, view);

    if (this.ghost?.rejected) {
      this.markRejected(this.ghost.id);
    }
    const preview = this.placement.currentPreview();
    if (preview) {
      const el2 = this.sceneRoot.querySelector(
        `[data-entity-id="${preview.entity.id}"]`
      );
      el2?.setAttribute('data-ghost', 'true');
      if (preview.rejected) el2?.setAttribute('data-rejected', 'true');
    }
    const routePreview = this.routeBuilder.previewEntity();
    if (routePreview) {
      this.sceneRoot
        .querySelector(`[data-entity-id="${routePreview.id}"]`)
        ?.setAttribute('data-editor-only', 'true');
    }

    this.toolbar.refresh({
      canUndo: this.history.canUndo(),
      canRedo: this.history.canRedo(),
      zoomPct: Math.round(this.camera.zoom * 100),
      mode: this.mode,
    });

    this.refreshCanvasTools(renderDoc);
  }

  /**
   * Update the floating canvas tool palette: visible only in edit mode, active
   * tool highlighted, crosshair cursor while the resize tool is active, and a
   * subtle hint when a resizable zone is selected in the select tool.
   */
  private refreshCanvasTools(doc: SceneDocument): void {
    const editing = this.mode === 'edit';
    this.canvasTools.root.hidden = !editing;
    this.svg.classList.toggle('is-resizing', editing && this.tool === 'resize');

    let hint: string | undefined;
    if (editing && this.tool === 'select' && this.selectionPrimary) {
      const entity = byId(doc, this.selectionPrimary);
      if (entity && isResizable(entity, getAsset(entity.asset.symbol))) {
        hint = 'Resize: drag the orange corner, hold Shift, or use the ⤡ tool';
      }
    }
    this.canvasTools.refresh({ tool: this.tool, hint });
  }

  /**
   * The grid placement to draw the resize handle for: the selected entity, in
   * edit mode, when it's a resizable zone and no placement is in progress. Read
   * from `doc` (the render doc) so the handle tracks any live resize ghost.
   */
  private resizeHandlePlacement(doc: SceneDocument): GridPlacement | undefined {
    if (this.mode !== 'edit' || !this.selectionPrimary || this.placement.active) {
      return undefined;
    }
    const entity = byId(doc, this.selectionPrimary);
    if (!entity || entity.placement.mode !== 'grid') return undefined;
    if (!isResizable(entity, getAsset(entity.asset.symbol))) return undefined;
    return entity.placement;
  }

  private markRejected(id: string): void {
    const el2 = this.sceneRoot.querySelector(`[data-entity-id="${id}"]`);
    el2?.setAttribute('data-rejected', 'true');
  }

  // --- interaction host ---------------------------------------------------

  private interactionHost(): InteractionHost {
    return {
      history: this.history,
      getMode: () => this.mode,
      getSelectedId: () => this.selectionPrimary,
      getResizeArmed: () => this.tool === 'resize',
      getTool: () => this.tool,
      getCamera: () => this.camera,
      panCamera: (next) => {
        this.camera = next;
        this.render();
        this.scheduleCameraSync();
      },
      onSelect: (id) => {
        // In placement mode, a canvas click commits a placement instead.
        if (this.placement.active) {
          this.placement.commit();
          return;
        }
        this.setSelection(id);
        this.notifySelection();
        this.render();
      },
      onToggleSelect: (id) => {
        if (this.placement.active) {
          this.placement.commit();
          return;
        }
        this.toggleSelectionMember(id);
        this.notifySelection();
        this.render();
      },
      onMarquee: (ids) => {
        this.setSelectionMany(ids);
        this.notifySelection();
        this.render();
      },
      onRoutePoint: (entityId, world) => {
        const stop = routeStopFor(this.history.document, entityId, world);
        this.routeBuilder.addStop(stop);
        this.render();
      },
      onRouteFinish: () => this.finishRoute(),
      setMarquee: (rect) => this.drawMarquee(rect),
      onSpotlight: (id) => {
        this.spotlightLayerId = undefined; // an entity click supersedes a layer spotlight
        this.spotlight = id === this.spotlight ? undefined : id;
        this.render();
      },
      onHover: (id, clientX, clientY) => {
        this.hoverId = id;
        if (this.placement.active) {
          this.placement.updatePreview(clientX, clientY);
        }
        this.updateTooltip(id, clientX, clientY);
        this.render();
      },
      requestRender: () => this.render(),
      setGhost: (id, placement, rejected) => {
        this.ghost = id && placement ? { id, placement, rejected } : undefined;
      },
    };
  }

  // --- coordinate helper --------------------------------------------------

  private clientToWorld(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.svg.getBoundingClientRect();
    return screenToWorld(
      clientX - rect.left,
      clientY - rect.top,
      this.camera,
      rect.width,
      rect.height
    );
  }

  // --- tooltip / toast ----------------------------------------------------

  private updateTooltip(id: string | undefined, clientX: number, clientY: number): void {
    const entity = id ? byId(this.history.document, id) : undefined;
    if (!entity || this.placement.active) {
      this.tooltip.hidden = true;
      return;
    }
    this.tooltip.innerHTML = tooltipHtml(entity);
    const rect = this.svg.getBoundingClientRect();
    this.tooltip.style.left = `${clientX - rect.left + 14}px`;
    this.tooltip.style.top = `${clientY - rect.top + 14}px`;
    this.tooltip.hidden = false;
  }

  private showToast(message: string): void {
    this.toast.textContent = message;
    this.toast.hidden = false;
    if (this.toastTimer !== undefined) window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      this.toast.hidden = true;
    }, 2800);
  }

  // --- mode / camera / keyboard ------------------------------------------

  private toggleMode(): void {
    // Leaving edit mode commits any in-progress route (tool/mode switch = finish).
    if (this.routeBuilder.active) this.finishRoute();
    this.mode = this.mode === 'edit' ? 'present' : 'edit';
    // Present mode has no zone resizing — force the tool back to select.
    if (this.mode === 'present') this.tool = 'select';
    this.clearSelection();
    this.spotlight = undefined;
    this.spotlightLayerId = undefined;
    this.tooltip.hidden = true;
    this.cancelPlacement();
    this.notifySelection();
    this.render();
  }

  private fitToContent(): void {
    const doc = this.history.document;
    if (doc.entities.length === 0) {
      this.camera = { ...this.camera, x: 0, y: 0 };
      return;
    }
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (const e of doc.entities) {
      const p = e.placement;
      if (p.mode === 'grid') {
        sx += (p.x - p.y) * 32;
        sy += (p.x + p.y) * 16;
      } else {
        sx += p.x;
        sy += p.y;
      }
      n++;
    }
    this.camera = { ...this.camera, x: sx / n, y: sy / n - 20 };
  }

  private scheduleCameraSync(): void {
    if (this.cameraSyncTimer !== undefined) window.clearTimeout(this.cameraSyncTimer);
    this.cameraSyncTimer = window.setTimeout(() => {
      (this.history.document as SceneDocument).camera = { ...this.camera };
    }, 250);
  }

  private notifySelection(): void {
    for (const l of this.selectionListeners) l();
  }

  private onResize = (): void => this.render();

  private onKeyDown = (evt: KeyboardEvent): void => {
    const target = evt.target as HTMLElement | null;
    const typing =
      target &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT');

    const meta = evt.metaKey || evt.ctrlKey;
    if (meta && evt.key.toLowerCase() === 'z' && !typing) {
      evt.preventDefault();
      if (evt.shiftKey) this.history.redo();
      else this.history.undo();
      return;
    }
    if (evt.key === 'Escape') {
      if (this.placement.active) {
        this.cancelPlacement();
        return;
      }
      // Escape discards an in-progress route with NO command (before it can
      // fall through to leaving the route tool).
      if (this.routeBuilder.active) {
        this.routeBuilder.reset();
        this.render();
        return;
      }
      // Cancel an in-progress resize/move drag before clearing selection.
      if (this.controller?.cancelDrag()) return;
      // Escape also returns to the select tool (SimCity convention).
      if (this.tool !== 'select') {
        this.setTool('select');
        return;
      }
      if (!typing) {
        this.clearSelection();
        this.spotlight = undefined;
        this.spotlightLayerId = undefined;
        this.tooltip.hidden = true;
        this.notifySelection();
        this.render();
      }
    }
    // R rotates the selected entity (edit mode only, not while typing).
    if (
      !typing &&
      !meta &&
      this.mode === 'edit' &&
      (evt.key === 'r' || evt.key === 'R')
    ) {
      if (this.selectionPrimary && !this.placement.active) {
        evt.preventDefault();
        this.rotateSelected();
      }
    }
    // Delete / Backspace removes every selected entity as one undo step.
    if (
      !typing &&
      !meta &&
      this.mode === 'edit' &&
      (evt.key === 'Delete' || evt.key === 'Backspace')
    ) {
      if (this.selection.size > 0 && !this.placement.active) {
        evt.preventDefault();
        this.deleteSelected();
      }
    }
    // Enter finishes the in-progress route (edit mode, not while typing).
    if (!typing && !meta && this.mode === 'edit' && evt.key === 'Enter') {
      if (this.routeBuilder.active) {
        evt.preventDefault();
        this.finishRoute();
        return;
      }
    }
    // Tool shortcuts (edit mode, not while typing): V = select, Z = resize,
    // C = draw route.
    if (!typing && !meta && this.mode === 'edit' && !this.placement.active) {
      const k = evt.key.toLowerCase();
      if (k === 'v') {
        evt.preventDefault();
        this.setTool('select');
      } else if (k === 'z') {
        evt.preventDefault();
        this.setTool('resize');
      } else if (k === 'c') {
        evt.preventDefault();
        this.setTool('route');
      }
    }
  };

  /**
   * Rotate the selected entity one quarter-turn clockwise (0→1→2→3→0).
   * No-op for fixed assets (orientations === 1 or absent). If the resulting
   * effective footprint would overlap another grid entity, the rotation is
   * rejected with the same toast + shake feedback as a bad drop.
   */
  rotateSelected(): void {
    const id = this.selectionPrimary;
    if (!id) return;
    const entity = byId(this.history.document, id);
    if (!entity) return;

    const plan = planRotation(this.history.document, entity);
    if (!plan) return; // fixed asset — nothing to rotate
    if (plan.collides) {
      // Same feedback as a bad drop: toast + red shake on the entity.
      this.showToast('Cannot rotate here — would overlap another footprint.');
      this.markRejected(entity.id);
      return;
    }
    this.history.execute(
      new RotateEntity({ entityId: entity.id, from: plan.from, to: plan.to })
    );
  }

  /**
   * Delete every selected entity as ONE undo step. A single selection uses a
   * plain DeleteEntity; two or more are wrapped in a CompoundCommand. No
   * confirm — the operation is undoable (the properties-panel batch button
   * carries the guarding confirm for deliberate mouse-driven deletes).
   */
  private deleteSelected(): void {
    const ids = [...this.selection];
    if (ids.length === 0) return;
    const cmd =
      ids.length === 1
        ? new DeleteEntity(ids[0])
        : new CompoundCommand(
            `Delete ${ids.length} entities`,
            ids.map((id) => new DeleteEntity(id))
          );
    this.clearSelection();
    this.history.execute(cmd); // subscribe → render with the cleared selection
    this.notifySelection();
  }

  /**
   * Draw / update the shift+drag marquee rectangle in WORLD coords as a direct
   * child of the canvas <svg> (a sibling of the scene group, so it survives the
   * scene re-render). `undefined` removes it.
   */
  private drawMarquee(
    rect: { x: number; y: number; w: number; h: number } | undefined
  ): void {
    if (!rect) {
      this.marqueeEl?.remove();
      this.marqueeEl = undefined;
      return;
    }
    if (!this.marqueeEl) {
      this.marqueeEl = document.createElementNS(SVGNS, 'rect') as SVGRectElement;
      this.marqueeEl.setAttribute('class', 'iso-marquee');
      this.svg.appendChild(this.marqueeEl);
    }
    this.marqueeEl.setAttribute('x', String(rect.x));
    this.marqueeEl.setAttribute('y', String(rect.y));
    this.marqueeEl.setAttribute('width', String(rect.w));
    this.marqueeEl.setAttribute('height', String(rect.h));
  }

  /**
   * Present-mode: spotlight an entire custom layer's entities (clicking a layer
   * name in the layers panel). Toggles off if the same layer is re-clicked.
   */
  spotlightLayer(layerId: string): void {
    if (this.mode !== 'present') return;
    if (this.spotlightLayerId === layerId) {
      this.spotlightLayerId = undefined;
      this.spotlight = undefined;
    } else {
      this.spotlightLayerId = layerId;
      this.spotlight = undefined;
    }
    this.render();
  }

  /** Open the interview wizard (used at startup for an empty scene). */
  openWizard(): void {
    this.wizard.open();
  }

  dispose(): void {
    this.controller.dispose();
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('resize', this.onResize);
  }
}
