// App shell: state + single subscribe→re-render pipeline. Wires the History,
// camera, renderer and interaction controller together, and builds a minimal
// toolbar (Phase D extends it) + hover tooltip.

import type { Camera, Entity, Placement, SceneDocument } from './core/model.ts';
import { byId, semanticRelatives } from './core/model.ts';
import { History } from './core/commands.ts';
import { renderScene, type ViewState } from './render/renderer.ts';
import {
  defaultCamera,
  viewBoxAttr,
  viewBoxFor,
} from './render/camera.ts';
import {
  InteractionController,
  type InteractionHost,
  type Mode,
} from './render/interactions.ts';

const SVGNS = 'http://www.w3.org/2000/svg';

interface Ghost {
  id: string;
  placement: Placement;
  rejected: boolean;
}

export class App {
  readonly history: History;
  private mode: Mode = 'edit';
  private selection: string | undefined;
  private spotlight: string | undefined;
  private hoverId: string | undefined;
  private camera: Camera;
  private ghost: Ghost | undefined;

  private svg!: SVGSVGElement;
  private sceneRoot!: SVGGElement;
  private tooltip!: HTMLDivElement;
  private zoomLabel!: HTMLSpanElement;
  private undoBtn!: HTMLButtonElement;
  private redoBtn!: HTMLButtonElement;
  private modeBtn!: HTMLButtonElement;
  private controller!: InteractionController;
  private cameraSyncTimer: number | undefined;
  private readonly root: HTMLElement;

  constructor(root: HTMLElement, doc: SceneDocument) {
    this.root = root;
    this.history = new History(doc);
    this.camera = doc.camera ? { ...doc.camera } : defaultCamera();
  }

  mount(): void {
    this.buildDom();
    this.controller = new InteractionController(this.svg, this.interactionHost());

    this.history.subscribe(() => this.render());
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('resize', () => this.render());

    // Fit the camera to content on first mount for a friendly initial view.
    this.fitToContent();
    this.render();
  }

  // --- DOM construction ---------------------------------------------------

  private buildDom(): void {
    this.root.innerHTML = '';
    this.root.classList.add('iso-app');

    // Toolbar
    const bar = document.createElement('header');
    bar.className = 'iso-toolbar';

    const title = document.createElement('span');
    title.className = 'iso-title';
    title.textContent = 'Iso-tonic Engine';

    this.modeBtn = button('Present mode', () => this.toggleMode());
    this.modeBtn.classList.add('iso-mode-btn');

    this.undoBtn = button('Undo', () => this.history.undo());
    this.redoBtn = button('Redo', () => this.history.redo());

    this.zoomLabel = document.createElement('span');
    this.zoomLabel.className = 'iso-zoom';

    const spacer = document.createElement('span');
    spacer.className = 'iso-spacer';

    bar.append(
      title,
      spacer,
      this.zoomLabel,
      this.undoBtn,
      this.redoBtn,
      this.modeBtn
    );

    // Canvas svg
    const stage = document.createElement('div');
    stage.className = 'iso-stage';

    this.svg = document.createElementNS(SVGNS, 'svg') as SVGSVGElement;
    this.svg.setAttribute('class', 'iso-canvas');
    this.svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    this.sceneRoot = document.createElementNS(SVGNS, 'g') as SVGGElement;
    this.sceneRoot.setAttribute('data-scene-root', 'true');
    this.svg.appendChild(this.sceneRoot);

    this.tooltip = document.createElement('div');
    this.tooltip.className = 'iso-tooltip';
    this.tooltip.hidden = true;

    stage.append(this.svg, this.tooltip);
    this.root.append(bar, stage);
  }

  // --- render pipeline ----------------------------------------------------

  /** The document as it should currently render — with any live ghost applied. */
  private renderDoc(): SceneDocument {
    const doc = this.history.document;
    if (!this.ghost) return doc;
    const g = this.ghost;
    return {
      ...doc,
      entities: doc.entities.map((e) =>
        e.id === g.id ? ({ ...e, placement: g.placement } as Entity) : e
      ),
    };
  }

  private render(): void {
    // Sync viewBox to camera.
    const rect = this.svg.getBoundingClientRect();
    const w = rect.width || 800;
    const h = rect.height || 600;
    this.svg.setAttribute('viewBox', viewBoxAttr(viewBoxFor(this.camera, w, h)));

    const view: ViewState = {
      selectedId: this.mode === 'edit' ? this.selection : undefined,
      hoverId: this.hoverId,
      showGrid: this.mode === 'edit',
    };

    if (this.mode === 'present' && this.spotlight) {
      const rels = semanticRelatives(this.history.document, this.spotlight);
      view.spotlightIds = new Set(rels.map((e) => e.id));
    }

    // A rejected ghost gets a red tint via a data attribute post-render.
    renderScene(this.sceneRoot, this.renderDoc(), view);
    if (this.ghost?.rejected) {
      const el = this.sceneRoot.querySelector(`[data-entity-id="${this.ghost.id}"]`);
      el?.setAttribute('data-rejected', 'true');
    }

    // Toolbar reactive state.
    this.undoBtn.disabled = !this.history.canUndo();
    this.redoBtn.disabled = !this.history.canRedo();
    this.zoomLabel.textContent = `${Math.round(this.camera.zoom * 100)}%`;
    this.modeBtn.textContent = this.mode === 'edit' ? 'Present mode' : 'Edit mode';
    this.modeBtn.classList.toggle('is-present', this.mode === 'present');
  }

  // --- interaction host ---------------------------------------------------

  private interactionHost(): InteractionHost {
    return {
      history: this.history,
      getMode: () => this.mode,
      getCamera: () => this.camera,
      panCamera: (next) => {
        this.camera = next;
        this.render();
        this.scheduleCameraSync();
      },
      onSelect: (id) => {
        this.selection = id;
        this.render();
      },
      onSpotlight: (id) => {
        // Clicking the already-focused entity, or the background, releases.
        this.spotlight = id === this.spotlight ? undefined : id;
        this.render();
      },
      onHover: (id, clientX, clientY) => {
        this.hoverId = id;
        this.updateTooltip(id, clientX, clientY);
        this.render();
      },
      requestRender: () => this.render(),
      setGhost: (id, placement, rejected) => {
        this.ghost =
          id && placement ? { id, placement, rejected } : undefined;
      },
    };
  }

  // --- tooltip ------------------------------------------------------------

  private updateTooltip(id: string | undefined, clientX: number, clientY: number): void {
    const entity = id ? byId(this.history.document, id) : undefined;
    if (!entity) {
      this.tooltip.hidden = true;
      return;
    }
    const parts = [
      `<strong>${escapeHtml(entity.label)}</strong>`,
      `<span class="iso-tooltip-type">${escapeHtml(entity.type)}</span>`,
    ];
    if (entity.description) {
      parts.push(`<span class="iso-tooltip-desc">${escapeHtml(entity.description)}</span>`);
    }
    this.tooltip.innerHTML = parts.join('');

    const rect = this.svg.getBoundingClientRect();
    this.tooltip.style.left = `${clientX - rect.left + 14}px`;
    this.tooltip.style.top = `${clientY - rect.top + 14}px`;
    this.tooltip.hidden = false;
  }

  // --- mode / camera / keyboard ------------------------------------------

  private toggleMode(): void {
    this.mode = this.mode === 'edit' ? 'present' : 'edit';
    // Leaving edit clears selection; leaving present clears spotlight.
    this.selection = undefined;
    this.spotlight = undefined;
    this.tooltip.hidden = true;
    this.render();
  }

  private fitToContent(): void {
    // Centre the camera on the mean of entity origins so the demo appears in
    // view without manual panning.
    const doc = this.history.document;
    if (doc.entities.length === 0) return;
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (const e of doc.entities) {
      const p = e.placement;
      if (p.mode === 'grid') {
        // approximate centre of footprint in world px
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
    if (this.cameraSyncTimer !== undefined) {
      window.clearTimeout(this.cameraSyncTimer);
    }
    this.cameraSyncTimer = window.setTimeout(() => {
      // Sync to doc.camera WITHOUT a command (view state is not undoable).
      // Mutating the live document object in place is acceptable here because
      // camera is explicitly outside the command/undo model (SCHEMA: "not
      // undoable"); it does not trigger a history notification.
      (this.history.document as SceneDocument).camera = { ...this.camera };
    }, 250);
  }

  private onKeyDown = (evt: KeyboardEvent): void => {
    const meta = evt.metaKey || evt.ctrlKey;
    if (meta && evt.key.toLowerCase() === 'z') {
      evt.preventDefault();
      if (evt.shiftKey) this.history.redo();
      else this.history.undo();
      return;
    }
    if (evt.key === 'Escape') {
      this.selection = undefined;
      this.spotlight = undefined;
      this.tooltip.hidden = true;
      this.render();
    }
  };

  dispose(): void {
    this.controller.dispose();
    window.removeEventListener('keydown', this.onKeyDown);
  }
}

// --- small DOM helpers -----------------------------------------------------

function button(label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'iso-btn';
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
