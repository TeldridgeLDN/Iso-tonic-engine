// Floating canvas tool palette (overlaid top-left on the stage) — the explicit,
// always-visible SimCity/Minecraft-style TOOL selector that replaced the fragile
// modifier-key resize model. A vertical pill of icon buttons:
//   ▲  Select / Move   (shortcut V)
//   ⤡  Resize zones     (shortcut Z)
// The active tool shows in ACCENT. A subtle discoverability hint sits under the
// pill when a resizable zone is selected in the select tool.

import type { Tool } from '../render/interactions.ts';
import { el } from './dom.ts';

export interface CanvasToolbarHooks {
  getTool(): Tool;
  setTool(tool: Tool): void;
}

export interface CanvasToolbarHandles {
  root: HTMLElement;
  /** Reflect the active tool + optional discoverability hint. */
  refresh(state: { tool: Tool; hint?: string }): void;
}

function toolButton(
  icon: string,
  label: string,
  shortcut: string,
  onClick: () => void
): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'iso-canvas-tool';
  b.textContent = icon;
  b.title = `${label} (${shortcut})`;
  b.setAttribute('aria-label', label);
  b.addEventListener('click', onClick);
  return b;
}

export function buildCanvasToolbar(hooks: CanvasToolbarHooks): CanvasToolbarHandles {
  const selectBtn = toolButton('▲', 'Select / Move', 'V', () =>
    hooks.setTool('select')
  );
  selectBtn.setAttribute('data-tool', 'select');

  const resizeBtn = toolButton('⤡', 'Resize zones', 'Z', () =>
    hooks.setTool('resize')
  );
  resizeBtn.setAttribute('data-tool', 'resize');

  const pill = el('div', { class: 'iso-canvas-toolpill' }, [selectBtn, resizeBtn]);
  const hint = el('div', { class: 'iso-canvas-hint' }) as HTMLDivElement;
  hint.hidden = true;

  const root = el('div', { class: 'iso-canvas-tools' }, [pill, hint]);

  return {
    root,
    refresh({ tool, hint: hintText }) {
      selectBtn.classList.toggle('is-active', tool === 'select');
      selectBtn.setAttribute('aria-pressed', String(tool === 'select'));
      resizeBtn.classList.toggle('is-active', tool === 'resize');
      resizeBtn.setAttribute('aria-pressed', String(tool === 'resize'));
      if (hintText) {
        hint.textContent = hintText;
        hint.hidden = false;
      } else {
        hint.hidden = true;
      }
    },
  };
}
