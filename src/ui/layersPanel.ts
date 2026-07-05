// Right-sidebar Layers section: the 7 automatic type layers (visibility eye
// toggles) and custom layers (add / rename inline / delete-with-confirm / eye).
//
// Type layers → SetTypeLayerVisibility. Custom layers → AddLayer / RemoveLayer /
// SetLayerVisibility. An entity's membership of custom layers is edited in the
// properties panel, not here (per spec).

import { ALL_ENTITY_TYPES, type EntityType, type SceneDocument } from '../core/model.ts';
import {
  AddLayer,
  RemoveLayer,
  SetLayerVisibility,
  SetTypeLayerVisibility,
  type Command,
} from '../core/commands.ts';
import type { AppContext } from './context.ts';
import { el, button, eyeToggle, clear } from './dom.ts';

const TYPE_LABELS: Record<EntityType, string> = {
  user: 'People',
  team: 'Teams',
  process: 'Processes',
  department: 'Departments',
  organisation: 'Organisations',
  'physical-infra': 'Physical infra',
  'digital-infra': 'Digital infra',
  annotation: 'Annotations',
};

let layerSeq = 0;
function newLayerId(): string {
  return `layer-${Date.now().toString(36)}-${layerSeq++}`;
}

export class LayersPanel {
  readonly root: HTMLElement;
  private readonly ctx: AppContext;
  private readonly typeList: HTMLElement;
  private readonly customList: HTMLElement;

  constructor(ctx: AppContext) {
    this.ctx = ctx;
    this.typeList = el('div', { class: 'iso-layer-list' });
    this.customList = el('div', { class: 'iso-layer-list' });

    const addBtn = button('+ Add layer', () => this.addLayer(), 'iso-btn iso-btn-sm');

    this.root = el('section', { class: 'iso-panel iso-layers' }, [
      el('h2', { class: 'iso-panel-title', text: 'Layers' }),
      el('h3', { class: 'iso-subhead', text: 'Type layers' }),
      this.typeList,
      el('div', { class: 'iso-subhead-row' }, [
        el('h3', { class: 'iso-subhead', text: 'Custom layers' }),
        addBtn,
      ]),
      this.customList,
    ]);

    ctx.subscribe(() => this.render());
    this.render();
  }

  private render(): void {
    this.renderTypeLayers();
    this.renderCustomLayers();
  }

  private renderTypeLayers(): void {
    clear(this.typeList);
    const doc = this.ctx.document();
    for (const t of ALL_ENTITY_TYPES) {
      const visible = doc.typeLayerVisibility?.[t] ?? true;
      const row = el('div', { class: 'iso-layer-row' });
      const eye = eyeToggle(visible, () => {
        this.ctx.history.execute(new SetTypeLayerVisibility(t, !visible));
      });
      const name = el('span', { class: 'iso-layer-name', text: TYPE_LABELS[t] });
      if (!visible) row.classList.add('is-hidden');
      row.append(eye, name);
      this.typeList.append(row);
    }
  }

  private renderCustomLayers(): void {
    clear(this.customList);
    const doc = this.ctx.document();
    if (doc.layers.length === 0) {
      this.customList.append(
        el('p', { class: 'iso-empty', text: 'No custom layers yet.' })
      );
      return;
    }
    for (const layer of doc.layers) {
      const row = el('div', { class: 'iso-layer-row' });
      if (!layer.visible) row.classList.add('is-hidden');
      const eye = eyeToggle(layer.visible, () => {
        this.ctx.history.execute(
          new SetLayerVisibility(layer.id, !layer.visible)
        );
      });

      const name = el('input', {
        class: 'iso-layer-input',
        attrs: { type: 'text', value: layer.name },
      }) as HTMLInputElement;
      name.value = layer.name;
      name.addEventListener('change', () => this.renameLayer(layer.id, name.value));
      name.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') name.blur();
      });
      // Present mode: clicking a layer name spotlights that layer's entities
      // (whole-service group) instead of editing the name.
      name.addEventListener('pointerdown', (e) => {
        if (this.ctx.getMode() === 'present') {
          e.preventDefault();
          name.blur();
          this.ctx.spotlightLayer(layer.id);
        }
      });

      const del = button('✕', () => this.deleteLayer(layer.id, layer.name), 'iso-icon-btn');
      del.title = 'Delete layer';

      row.append(eye, name, del);
      this.customList.append(row);
    }
  }

  private addLayer(): void {
    const doc = this.ctx.document();
    const n = doc.layers.length + 1;
    this.ctx.history.execute(
      new AddLayer({ id: newLayerId(), name: `Layer ${n}`, visible: true })
    );
  }

  private renameLayer(id: string, name: string): void {
    const doc = this.ctx.document();
    const layer = doc.layers.find((l) => l.id === id);
    if (!layer || layer.name === name) return;
    // The core command layer has no RenameLayer; renaming preserves the layer
    // id and all entity membership, so it is expressible purely over doc.layers
    // via a local invertible command (RenameLayerCmd below) — no src/core edit.
    this.ctx.history.execute(new RenameLayerCmd(id, name));
  }

  private deleteLayer(id: string, name: string): void {
    const ok = window.confirm(
      `Delete layer "${name}"? Entities stay; only the layer is removed.`
    );
    if (!ok) return;
    this.ctx.history.execute(new RemoveLayer(id));
  }

  dispose(): void {
    /* subscriptions live for app lifetime */
  }
}

// ---------------------------------------------------------------------------
// RenameLayerCmd — a local invertible command (does not touch src/core).
// Renaming a custom layer preserves its id and every entity's membership, so it
// is expressible purely over doc.layers without a core change. Implemented here
// to honour "no modifications to src/core".
// ---------------------------------------------------------------------------

class RenameLayerCmd implements Command {
  label = 'Rename layer';
  private prev?: string;
  private readonly id: string;
  private readonly name: string;
  constructor(id: string, name: string) {
    this.id = id;
    this.name = name;
  }

  apply(doc: SceneDocument): SceneDocument {
    const layer = doc.layers.find((l) => l.id === this.id);
    if (!layer) throw new Error(`RenameLayerCmd: "${this.id}" not found`);
    this.prev = layer.name;
    return {
      ...doc,
      layers: doc.layers.map((l) =>
        l.id === this.id ? { ...l, name: this.name } : l
      ),
    };
  }

  invert(doc: SceneDocument): SceneDocument {
    if (this.prev === undefined) throw new Error('RenameLayerCmd: invert before apply');
    const prev = this.prev;
    return {
      ...doc,
      layers: doc.layers.map((l) =>
        l.id === this.id ? { ...l, name: prev } : l
      ),
    };
  }
}
