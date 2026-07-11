// Right-sidebar Properties section: shown when an entity is selected.
//
// - label + description inputs (commit on blur/Enter → UpdateEntityProps)
// - type badge (read-only)
// - parent dropdown (valid entities only: excludes self + descendants → no cycles)
// - custom-layer checkboxes (AssignLayers)
// - delete button (DeleteEntity)
// - param editor driven by the asset's paramSchema (select/text/number/color);
//   for the figurine asset, hands off to the richer FigurineEditor.

import type { Entity, SceneDocument } from '../core/model.ts';
import { byId } from '../core/model.ts';
import {
  UpdateEntityProps,
  AssignLayers,
  DeleteEntity,
  ResizeEntity,
  CompoundCommand,
} from '../core/commands.ts';
import { getAsset, type ParamField } from '../assets/library.ts';
import { isResizable, resizeBounds, sizeParamKeys } from '../render/resize.ts';
import type { AppContext } from './context.ts';
import { el, button, field, clear } from './dom.ts';
import { FigurineEditor, isFigurine } from './figurineEditor.ts';

/** Compass letters for the four quarter-turn facings (0=N … clockwise). */
const FACING_LABELS = ['N', 'E', 'S', 'W'] as const;

const TYPE_LABELS: Record<string, string> = {
  user: 'Person',
  team: 'Team',
  process: 'Process',
  department: 'Department',
  organisation: 'Organisation',
  'physical-infra': 'Physical infra',
  'digital-infra': 'Digital infra',
  annotation: 'Annotation',
};

export class PropertiesPanel {
  readonly root: HTMLElement;
  private readonly ctx: AppContext;
  private readonly body: HTMLElement;
  private readonly figurineEditor: FigurineEditor;

  constructor(ctx: AppContext) {
    this.ctx = ctx;
    this.figurineEditor = new FigurineEditor(ctx);
    this.body = el('div', { class: 'iso-props-body' });
    this.root = el('section', { class: 'iso-panel iso-props' }, [
      el('h2', { class: 'iso-panel-title', text: 'Properties' }),
      this.body,
    ]);

    ctx.onSelectionChange(() => this.render());
    ctx.subscribe(() => this.render());
    this.render();
  }

  private selected(): Entity | undefined {
    const id = this.ctx.selectedId();
    return id ? byId(this.ctx.document(), id) : undefined;
  }

  private render(): void {
    clear(this.body);

    // Multi-selection: show a count + a single batch-delete button (one confirm).
    const ids = this.ctx.selectedIds();
    if (ids.length > 1) {
      this.body.append(this.batchDelete(ids));
      return;
    }

    const entity = this.selected();
    if (!entity) {
      this.body.append(
        el('p', { class: 'iso-empty', text: 'Select an entity to edit it.' })
      );
      return;
    }

    this.body.append(this.typeBadge(entity));
    this.body.append(this.labelField(entity));
    this.body.append(this.descriptionField(entity));
    this.body.append(this.userGoalField(entity));
    this.body.append(this.orgGoalField(entity));
    this.body.append(this.parentField(entity));
    this.body.append(this.layersField(entity));

    // Rotation control — only for assets with more than one facing.
    const rotate = this.rotateControl(entity);
    if (rotate) this.body.append(rotate);

    // Resize toggle — only for resizable zones.
    const resize = this.resizeControl(entity);
    if (resize) this.body.append(resize);

    // Param editor / figurine editor
    if (isFigurine(entity)) {
      this.figurineEditor.setEntity(entity);
      this.body.append(this.figurineEditor.root);
    } else {
      const params = this.paramEditor(entity);
      if (params) this.body.append(params);
    }

    this.body.append(this.deleteButton(entity));
  }

  // --- fields ---------------------------------------------------------------

  private typeBadge(entity: Entity): HTMLElement {
    return el('div', { class: 'iso-type-badge', text: TYPE_LABELS[entity.type] ?? entity.type });
  }

  private labelField(entity: Entity): HTMLElement {
    const input = el('input', {
      class: 'iso-input',
      attrs: { type: 'text' },
    }) as HTMLInputElement;
    input.value = entity.label;
    commitOn(input, () => {
      if (input.value !== entity.label) {
        this.ctx.history.execute(new UpdateEntityProps(entity.id, { label: input.value }));
      }
    });
    return field('Label', input);
  }

  private descriptionField(entity: Entity): HTMLElement {
    const ta = el('textarea', { class: 'iso-input iso-textarea' }) as HTMLTextAreaElement;
    ta.value = entity.description ?? '';
    ta.rows = 2;
    commitOn(ta, () => {
      const next = ta.value;
      if (next !== (entity.description ?? '')) {
        this.ctx.history.execute(
          new UpdateEntityProps(entity.id, { description: next })
        );
      }
    });
    return field('Description', ta);
  }

  private userGoalField(entity: Entity): HTMLElement {
    return this.goalField(
      entity,
      'User goal',
      'userGoal',
      'What the user is trying to do',
      entity.userGoal
    );
  }

  private orgGoalField(entity: Entity): HTMLElement {
    return this.goalField(
      entity,
      'Organisation goal',
      'orgGoal',
      'What the organisation wants',
      entity.orgGoal
    );
  }

  /** Shared builder for the two goal inputs (UpdateEntityProps, null clears). */
  private goalField(
    entity: Entity,
    label: string,
    key: 'userGoal' | 'orgGoal',
    placeholder: string,
    current: string | undefined
  ): HTMLElement {
    const input = el('input', {
      class: 'iso-input',
      attrs: { type: 'text', placeholder },
    }) as HTMLInputElement;
    input.value = current ?? '';
    commitOn(input, () => {
      const next = input.value.trim();
      const prev = current ?? '';
      if (next === prev) return;
      // Empty string clears the goal (null), otherwise sets it.
      this.ctx.history.execute(
        new UpdateEntityProps(entity.id, { [key]: next === '' ? null : next })
      );
    });
    return field(label, input);
  }

  /** ↻ rotate button + current-facing indicator. Absent for fixed assets. */
  private rotateControl(entity: Entity): HTMLElement | null {
    const def = getAsset(entity.asset.symbol);
    if (!def || (def.orientations ?? 1) === 1) return null;

    const facing = ((entity.placement.rotation ?? 0) % 4 + 4) % 4;
    const btn = button(
      `↻ Rotate · facing ${FACING_LABELS[facing]}`,
      () => this.ctx.rotateSelected(),
      'iso-btn iso-btn-sm iso-rotate-btn'
    );
    btn.title = 'Rotate 90° clockwise (or press R)';
    return field('Orientation', btn);
  }

  /**
   * ⤡ Resize-tool toggle for resizable zones. Activates/deactivates the canvas
   * resize TOOL (the same one on the floating canvas palette). While ON, drag
   * anywhere on a zone to resize it; Shift+drag and the corner handle work any
   * time in the select tool too.
   */
  private resizeControl(entity: Entity): HTMLElement | null {
    const def = getAsset(entity.asset.symbol);
    if (!isResizable(entity, def)) return null;

    const on = this.ctx.resizeArmed();
    const btn = button(
      on ? '⤡ Resize tool: ON — drag the zone' : '⤡ Resize tool: OFF',
      () => this.ctx.setResizeArmed(!this.ctx.resizeArmed()),
      `iso-btn iso-btn-sm iso-resize-btn${on ? ' iso-btn-armed' : ''}`
    );
    btn.title =
      'Toggle the resize tool. While on, dragging this zone changes its size. ' +
      'Shift+drag or the corner handle work any time.';
    return field('Size', btn);
  }

  private parentField(entity: Entity): HTMLElement {
    const select = el('select', { class: 'iso-select' }) as HTMLSelectElement;
    const none = el('option', { text: '— none —', attrs: { value: '' } });
    select.append(none);

    const doc = this.ctx.document();
    const invalid = descendantsAndSelf(doc, entity.id);
    for (const cand of doc.entities) {
      if (invalid.has(cand.id)) continue; // no self / descendants → no cycles
      if (cand.type === 'annotation') continue; // annotations aren't containers
      const o = el('option', {
        text: `${cand.label} (${TYPE_LABELS[cand.type] ?? cand.type})`,
        attrs: { value: cand.id },
      });
      if (entity.parentId === cand.id) (o as HTMLOptionElement).selected = true;
      select.append(o);
    }
    if (!entity.parentId) (none as HTMLOptionElement).selected = true;

    select.addEventListener('change', () => {
      const next = select.value === '' ? null : select.value;
      if ((next ?? undefined) !== entity.parentId) {
        this.ctx.history.execute(new UpdateEntityProps(entity.id, { parentId: next }));
      }
    });
    return field('Parent', select);
  }

  private layersField(entity: Entity): HTMLElement {
    const doc = this.ctx.document();
    const wrap = el('div', { class: 'iso-layer-checks' });
    if (doc.layers.length === 0) {
      wrap.append(el('span', { class: 'iso-empty-sm', text: 'No custom layers.' }));
      return field('Layers', wrap);
    }
    const current = new Set(entity.customLayers ?? []);
    for (const layer of doc.layers) {
      const row = el('label', { class: 'iso-check-row' });
      const cb = el('input', { attrs: { type: 'checkbox' } }) as HTMLInputElement;
      cb.checked = current.has(layer.id);
      cb.addEventListener('change', () => {
        const next = new Set(current);
        if (cb.checked) next.add(layer.id);
        else next.delete(layer.id);
        this.ctx.history.execute(new AssignLayers(entity.id, [...next]));
      });
      row.append(cb, el('span', { text: layer.name }));
      wrap.append(row);
    }
    return field('Layers', wrap);
  }

  private paramEditor(entity: Entity): HTMLElement | null {
    const def = getAsset(entity.asset.symbol);
    if (!def?.paramSchema || def.paramSchema.length === 0) return null;

    const section = el('div', { class: 'iso-param-editor' });
    section.append(el('h3', { class: 'iso-subhead', text: 'Asset options' }));
    const params = entity.asset.params ?? {};
    for (const f of def.paramSchema) {
      section.append(this.paramField(entity, f, params));
    }
    return section;
  }

  private paramField(
    entity: Entity,
    f: ParamField,
    params: Record<string, unknown>
  ): HTMLElement {
    const commit = (value: unknown): void => {
      // A size-param edit (zone w/d, building widthTiles/depthTiles) must move
      // BOTH placement.footprint AND params in lockstep (identical to a handle
      // drag) — route it through ResizeEntity. Any other param is a plain patch.
      if (typeof value === 'number' && this.routeResize(entity, f.key, value)) {
        return;
      }
      this.ctx.history.execute(
        new UpdateEntityProps(entity.id, { params: { [f.key]: value } })
      );
    };
    const raw = params[f.key];

    if (f.kind === 'select') {
      const select = el('select', { class: 'iso-select' }) as HTMLSelectElement;
      for (const opt of f.options ?? []) {
        const o = el('option', { text: opt.label, attrs: { value: opt.value } });
        if (String(raw) === opt.value) (o as HTMLOptionElement).selected = true;
        select.append(o);
      }
      select.addEventListener('change', () => commit(select.value));
      return field(f.label, select);
    }

    if (f.kind === 'number') {
      const input = el('input', {
        class: 'iso-input',
        attrs: { type: 'number', min: f.min, max: f.max },
      }) as HTMLInputElement;
      input.value = raw !== undefined ? String(raw) : '';
      commitOn(input, () => {
        const num = Number(input.value);
        if (Number.isFinite(num)) commit(num);
      });
      return field(f.label, input);
    }

    if (f.kind === 'color') {
      const input = el('input', {
        class: 'iso-input iso-color',
        attrs: { type: 'text' },
      }) as HTMLInputElement;
      input.value = raw !== undefined ? String(raw) : '';
      commitOn(input, () => commit(input.value));
      return field(f.label, input);
    }

    // text (default)
    const input = el('input', {
      class: 'iso-input',
      attrs: { type: 'text' },
    }) as HTMLInputElement;
    input.value = raw !== undefined ? String(raw) : '';
    commitOn(input, () => commit(input.value));
    return field(f.label, input);
  }

  /**
   * Route a size-param edit through ResizeEntity so the footprint and params
   * stay in sync (matching the canvas handle). Handles both the zone `w`/`d`
   * pair and the building `widthTiles`/`depthTiles` pair, resolved via
   * `sizeParamKeys`. Returns false when `key` is not this asset's size axis, or
   * the entity isn't a resizable grid entity (caller then does a plain
   * UpdateEntityProps). The synced params are AUTHORED extents mirroring
   * placement.footprint.
   */
  private routeResize(entity: Entity, key: string, value: number): boolean {
    const def = getAsset(entity.asset.symbol);
    if (!isResizable(entity, def)) return false;
    if (entity.placement.mode !== 'grid') return false;
    const paramKeys = sizeParamKeys(def);
    if (!paramKeys) return false;
    // Only the two size axes route through resize; other numeric params don't.
    const axis = key === paramKeys.w ? 'w' : key === paramKeys.d ? 'd' : undefined;
    if (!axis) return false;

    const bounds = resizeBounds(def);
    const b = axis === 'w' ? bounds.w : bounds.d;
    const clamped = Math.min(b.max, Math.max(b.min, Math.round(value)));

    const from = entity.placement.footprint;
    const to = axis === 'w' ? { w: clamped, d: from.d } : { w: from.w, d: clamped };
    if (to.w === from.w && to.d === from.d) return true; // no-op, but handled
    this.ctx.history.execute(
      new ResizeEntity({ entityId: entity.id, from, to, paramKeys })
    );
    return true;
  }

  /**
   * Multi-selection view: "N entities selected" + a single batch-delete button
   * that removes them all as ONE undo step (CompoundCommand) behind ONE confirm.
   */
  private batchDelete(ids: string[]): HTMLElement {
    const wrap = el('div', { class: 'iso-props-multi' });
    wrap.append(
      el('p', { class: 'iso-empty', text: `${ids.length} entities selected` })
    );
    const btn = button(
      `Delete ${ids.length} entities`,
      () => {
        const ok = window.confirm(`Delete ${ids.length} entities?`);
        if (!ok) return;
        this.ctx.history.execute(
          new CompoundCommand(
            `Delete ${ids.length} entities`,
            ids.map((id) => new DeleteEntity(id))
          )
        );
        this.ctx.select(undefined);
      },
      'iso-btn iso-btn-danger'
    );
    wrap.append(el('div', { class: 'iso-props-delete' }, [btn]));
    return wrap;
  }

  private deleteButton(entity: Entity): HTMLElement {
    const btn = button('Delete entity', () => {
      const ok = window.confirm(`Delete "${entity.label}"?`);
      if (!ok) return;
      this.ctx.history.execute(new DeleteEntity(entity.id));
      this.ctx.select(undefined);
    }, 'iso-btn iso-btn-danger');
    return el('div', { class: 'iso-props-delete' }, [btn]);
  }

  dispose(): void {
    /* subscriptions live for app lifetime */
  }
}

// --- helpers ----------------------------------------------------------------

/** Commit a text input's value on blur or Enter (Enter also blurs textarea). */
function commitOn(input: HTMLInputElement | HTMLTextAreaElement, fn: () => void): void {
  input.addEventListener('blur', fn);
  const onKey = (e: Event): void => {
    const ke = e as KeyboardEvent;
    if (ke.key === 'Enter' && !(input instanceof HTMLTextAreaElement && ke.shiftKey)) {
      if (input instanceof HTMLTextAreaElement) ke.preventDefault();
      input.blur();
    }
  };
  input.addEventListener('keydown', onKey);
}

/** The set of ids that would create a cycle if chosen as parent: self + all
 *  transitive descendants of the entity. */
function descendantsAndSelf(doc: SceneDocument, id: string): Set<string> {
  const out = new Set<string>([id]);
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const e of doc.entities) {
      if (e.parentId === cur && !out.has(e.id)) {
        out.add(e.id);
        stack.push(e.id);
      }
    }
  }
  return out;
}
