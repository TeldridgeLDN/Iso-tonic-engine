// Toolbar builder, extracted from app.ts to keep the shell under 500 lines.
// Owns the DOM for: title, New map, Open, Save, Save As, Export ▾, a spacer,
// zoom %, Undo, Redo, Edit/Present toggle. File + export buttons call the io
// bridge, guarded so a missing src/io simply disables them gracefully.

import type { History } from '../core/commands.ts';
import type { SceneDocument } from '../core/model.ts';
import { button, el } from './dom.ts';
import { withIo } from './io-bridge.ts';

export interface ToolbarHooks {
  history: History;
  document(): SceneDocument;
  onNewMap(): void;
  onOpened(doc: SceneDocument): void;
  toggleMode(): void;
  /** Notify the operator (missing io, save result). Console fallback if absent. */
  notify(message: string): void;
  /** View-only toolbar: title + Export + zoom only (public root page). */
  viewer?: boolean;
}

export interface ToolbarHandles {
  root: HTMLElement;
  /** Update reactive state (undo/redo enabled, zoom %, mode label). */
  refresh(state: { canUndo: boolean; canRedo: boolean; zoomPct: number; mode: 'edit' | 'present' }): void;
}

export function buildToolbar(hooks: ToolbarHooks): ToolbarHandles {
  const bar = el('header', { class: 'iso-toolbar' });

  const title = el('span', { class: 'iso-title', text: 'Iso-tonic Engine' });

  const exportWrap = buildExportMenu(hooks);

  const spacer = el('span', { class: 'iso-spacer' });
  const zoomLabel = el('span', { class: 'iso-zoom' });

  if (hooks.viewer) {
    // View-only public page: title + Export + zoom. No file/undo/mode buttons.
    bar.append(title, el('span', { class: 'iso-tb-sep' }), exportWrap, spacer, zoomLabel);
    return {
      root: bar,
      refresh(state) {
        zoomLabel.textContent = `${state.zoomPct}%`;
      },
    };
  }

  const newBtn = button('New map', () => hooks.onNewMap(), 'iso-btn');
  const openBtn = button('Open', () => openDoc(hooks), 'iso-btn');
  const saveBtn = button('Save', () => saveDoc(hooks, false), 'iso-btn');
  const saveAsBtn = button('Save As', () => saveDoc(hooks, true), 'iso-btn');

  const undoBtn = button('Undo', () => hooks.history.undo());
  const redoBtn = button('Redo', () => hooks.history.redo());

  const modeBtn = button('Present mode', () => hooks.toggleMode());
  modeBtn.classList.add('iso-mode-btn');

  bar.append(
    title,
    el('span', { class: 'iso-tb-sep' }),
    newBtn, openBtn, saveBtn, saveAsBtn, exportWrap,
    spacer,
    zoomLabel, undoBtn, redoBtn, modeBtn
  );

  return {
    root: bar,
    refresh(state) {
      undoBtn.disabled = !state.canUndo;
      redoBtn.disabled = !state.canRedo;
      zoomLabel.textContent = `${state.zoomPct}%`;
      modeBtn.textContent = state.mode === 'edit' ? 'Present mode' : 'Edit mode';
      modeBtn.classList.toggle('is-present', state.mode === 'present');
    },
  };
}

// --- Export ▾ menu ----------------------------------------------------------

function buildExportMenu(hooks: ToolbarHooks): HTMLElement {
  const wrap = el('div', { class: 'iso-menu' });
  const trigger = button('Export ▾', () => {
    wrap.classList.toggle('is-open');
  }, 'iso-btn');
  const menu = el('div', { class: 'iso-menu-list' });

  const add = (label: string, run: () => void): void => {
    const item = button(label, () => {
      wrap.classList.remove('is-open');
      run();
    }, 'iso-menu-item');
    menu.append(item);
  };

  add('SVG', () => exportWith(hooks, (io, doc) => io.exportSVG(doc), 'SVG'));
  add('PNG ×1', () => exportWith(hooks, (io, doc) => io.exportPNG(doc, 1), 'PNG'));
  add('PNG ×2', () => exportWith(hooks, (io, doc) => io.exportPNG(doc, 2), 'PNG'));
  add('PNG ×4', () => exportWith(hooks, (io, doc) => io.exportPNG(doc, 4), 'PNG'));
  add('PDF', () => exportWith(hooks, (io, doc) => io.exportPDF(doc), 'PDF'));

  // Close when clicking elsewhere.
  document.addEventListener('pointerdown', (e) => {
    if (!wrap.contains(e.target as Node)) wrap.classList.remove('is-open');
  });

  wrap.append(trigger, menu);
  return wrap;
}

// --- io-guarded actions -----------------------------------------------------

async function openDoc(hooks: ToolbarHooks): Promise<void> {
  const res = await withIo((io) => io.openDocument());
  if (!res.ok) {
    hooks.notify('Open is unavailable — persistence module not loaded.');
    return;
  }
  if (res.value) hooks.onOpened(res.value.doc);
}

async function saveDoc(hooks: ToolbarHooks, saveAs: boolean): Promise<void> {
  const res = await withIo((io) => io.saveDocument(hooks.document(), { saveAs }));
  if (!res.ok) {
    hooks.notify('Save is unavailable — persistence module not loaded.');
    return;
  }
  if (res.value) hooks.notify(`Saved ${res.value.fileName}`);
}

async function exportWith(
  hooks: ToolbarHooks,
  fn: (io: import('./io-bridge.ts').IoModule, doc: SceneDocument) => void | Promise<void>,
  kind: string
): Promise<void> {
  const doc = hooks.document();
  const res = await withIo((io) => fn(io, doc));
  if (!res.ok) {
    hooks.notify(`${kind} export is unavailable — export module not loaded.`);
  }
}
