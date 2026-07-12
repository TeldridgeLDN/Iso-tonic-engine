// Rich figurine part-swap editor, shown in the properties panel when the
// selected entity's asset is the figurine. Dropdowns/swatch rows for skin, hair
// style + colour, top, bottom, accessory; a RANDOMISE button; preset save/apply
// (UpsertFigurinePreset + doc.figurinePresets); and a large ~3× live preview.
//
// All param edits dispatch UpdateEntityProps (patching asset.params) so the
// canvas re-renders live. Uses the palettes exported by src/assets/style.ts.

import type { Entity, FigurineParams, SceneDocument } from '../core/model.ts';
import { UpdateEntityProps, UpsertFigurinePreset } from '../core/commands.ts';
import {
  SKIN_TONES,
  HAIR_COLORS,
  CLOTHING_COLORS,
} from '../assets/style.ts';
import {
  renderFigurine,
  defaultFigurine,
  randomFigurineParams,
  BASE_HEIGHT_PX,
  DEFAULT_HEIGHT_PX,
  MIN_HEIGHT_PX,
  MAX_HEIGHT_PX,
} from '../assets/figurine.ts';
import type { AppContext } from './context.ts';
import { el, button, field, clear } from './dom.ts';

const SVGNS = 'http://www.w3.org/2000/svg';

const HAIR_STYLES = ['short', 'long', 'bun', 'curly', 'bald'];
const TOPS = ['shirt', 'jacket', 'hoodie', 'hiviz'];
const BOTTOMS = ['trousers', 'skirt', 'shorts'];
const ACCESSORIES = ['none', 'hardhat', 'headset', 'clipboard'];

export class FigurineEditor {
  readonly root: HTMLElement;
  private readonly ctx: AppContext;
  private entity: Entity | null = null;
  private readonly preview: SVGSVGElement;
  private readonly controls: HTMLElement;
  private readonly presetHost: HTMLElement;

  constructor(ctx: AppContext) {
    this.ctx = ctx;
    this.preview = document.createElementNS(SVGNS, 'svg') as SVGSVGElement;
    this.preview.setAttribute('class', 'iso-figurine-preview');
    this.preview.setAttribute('viewBox', '-30 -56 60 64');
    this.preview.setAttribute('width', '120');
    this.preview.setAttribute('height', '128');
    this.preview.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    this.controls = el('div', { class: 'iso-figurine-controls' });
    this.presetHost = el('div', { class: 'iso-figurine-presets' });

    this.root = el('div', { class: 'iso-figurine-editor' }, [
      el('h3', { class: 'iso-subhead', text: 'Figurine' }),
      el('div', { class: 'iso-figurine-preview-wrap' }, [this.preview]),
      this.controls,
      this.presetHost,
    ]);
  }

  /** Point the editor at an entity (must be a figurine). */
  setEntity(entity: Entity): void {
    this.entity = entity;
    this.render();
  }

  private params(): FigurineParams {
    const p = this.entity?.asset.params ?? {};
    const d = defaultFigurine();
    return {
      skin: (p.skin as string) ?? d.skin,
      hairStyle: (p.hairStyle as string) ?? d.hairStyle,
      hairColor: (p.hairColor as string) ?? d.hairColor,
      top: (p.top as string) ?? d.top,
      bottom: (p.bottom as string) ?? d.bottom,
      accessory: (p.accessory as string) ?? d.accessory,
      preset: p.preset as string | undefined,
      heightPx: typeof p.heightPx === 'number' ? p.heightPx : d.heightPx,
    };
  }

  private patch(part: Partial<FigurineParams>): void {
    if (!this.entity) return;
    // Any manual part change detaches from the stamped preset.
    const params: Record<string, unknown> = { ...part };
    if (!('preset' in part)) params.preset = undefined;
    this.ctx.history.execute(new UpdateEntityProps(this.entity.id, { params }));
    // entity object is stale after the command; re-fetch on next render via ctx.
    this.refetch();
    this.render();
  }

  /** Height is a size, not a part — changing it keeps any stamped preset. */
  private patchHeight(heightPx: number): void {
    if (!this.entity) return;
    this.ctx.history.execute(new UpdateEntityProps(this.entity.id, { params: { heightPx } }));
    this.refetch();
    this.render();
  }

  private refetch(): void {
    if (!this.entity) return;
    const fresh = this.ctx.document().entities.find((e) => e.id === this.entity!.id);
    if (fresh) this.entity = fresh;
  }

  private render(): void {
    if (!this.entity) return;
    const p = this.params();

    // Preview (rendered at base scale — the viewBox frames the authored size;
    // heightPx only affects the on-canvas render)
    this.preview.innerHTML = renderFigurine({ ...p, heightPx: BASE_HEIGHT_PX } as unknown as Record<string, unknown>);

    // Controls
    clear(this.controls);
    this.controls.append(
      swatchRow('Skin tone', SKIN_TONES, p.skin, (v) => this.patch({ skin: v })),
      selectRow('Hair', HAIR_STYLES, p.hairStyle, (v) => this.patch({ hairStyle: v })),
      swatchRow('Hair colour', HAIR_COLORS, p.hairColor, (v) => this.patch({ hairColor: v })),
      topRow('Top', TOPS, p.top, (v) => this.patch({ top: v })),
      selectRow('Bottom', BOTTOMS, p.bottom, (v) => this.patch({ bottom: v })),
      selectRow('Accessory', ACCESSORIES, p.accessory ?? 'none', (v) =>
        this.patch({ accessory: v })
      ),
      heightRow(p.heightPx ?? DEFAULT_HEIGHT_PX, (v) => this.patchHeight(v))
    );

    const randomiseBtn = button('🎲 Randomise', () => this.randomise(), 'iso-btn iso-btn-sm');
    this.controls.append(el('div', { class: 'iso-figurine-actions' }, [randomiseBtn]));

    // Presets
    this.renderPresets(p);
  }

  private randomise(): void {
    if (!this.entity) return;
    const seed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
    const params = randomFigurineParams(seed);
    this.ctx.history.execute(
      new UpdateEntityProps(this.entity.id, {
        // randomise swaps parts only — keep the current height
        params: { ...params, heightPx: this.params().heightPx, preset: undefined },
      })
    );
    this.refetch();
    this.render();
  }

  private renderPresets(p: FigurineParams): void {
    clear(this.presetHost);
    const doc = this.ctx.document();
    const presets = doc.figurinePresets ?? {};
    const names = Object.keys(presets);

    this.presetHost.append(el('h4', { class: 'iso-subhead-sm', text: 'Presets' }));

    // Apply dropdown
    const applyWrap = el('div', { class: 'iso-preset-apply' });
    const select = el('select', { class: 'iso-select' }) as HTMLSelectElement;
    const placeholder = el('option', {
      text: names.length ? 'Apply preset…' : 'No presets saved',
      attrs: { value: '' },
    }) as HTMLOptionElement;
    select.append(placeholder);
    for (const name of names) {
      const o = el('option', { text: name, attrs: { value: name } });
      if (p.preset === name) (o as HTMLOptionElement).selected = true;
      select.append(o);
    }
    select.disabled = names.length === 0;
    select.addEventListener('change', () => {
      if (select.value) this.applyPreset(select.value, presets);
    });
    applyWrap.append(select);

    // Which preset this figurine came from
    if (p.preset && names.includes(p.preset)) {
      applyWrap.append(
        el('span', { class: 'iso-preset-from', text: `from “${p.preset}”` })
      );
    }

    const saveBtn = button('Save current as preset…', () => this.saveCurrent(p), 'iso-btn iso-btn-sm');

    this.presetHost.append(applyWrap, saveBtn);
  }

  private applyPreset(name: string, presets: Record<string, FigurineParams>): void {
    if (!this.entity) return;
    const preset = presets[name];
    if (!preset) return;
    this.ctx.history.execute(
      new UpdateEntityProps(this.entity.id, {
        params: { ...preset, preset: name },
      })
    );
    this.refetch();
    this.render();
  }

  private saveCurrent(p: FigurineParams): void {
    const name = window.prompt('Preset name:', p.preset ?? '');
    if (!name) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    const toSave: FigurineParams = { ...p, preset: trimmed };
    this.ctx.history.execute(new UpsertFigurinePreset(trimmed, toSave));
    // Stamp the entity with the preset name it now matches.
    if (this.entity) {
      this.ctx.history.execute(
        new UpdateEntityProps(this.entity.id, { params: { preset: trimmed } })
      );
      this.refetch();
    }
    this.render();
  }
}

// --- control row builders ---------------------------------------------------

function selectRow(
  label: string,
  values: string[],
  current: string,
  onChange: (v: string) => void
): HTMLElement {
  const select = el('select', { class: 'iso-select' }) as HTMLSelectElement;
  for (const v of values) {
    const o = el('option', { text: cap(v), attrs: { value: v } });
    if (v === current) (o as HTMLOptionElement).selected = true;
    select.append(o);
  }
  select.addEventListener('change', () => onChange(select.value));
  return field(label, select);
}

/** Height slider (px) with a live value readout. */
function heightRow(current: number, onChange: (v: number) => void): HTMLElement {
  const slider = el('input', {
    class: 'iso-range',
    attrs: {
      type: 'range',
      min: String(MIN_HEIGHT_PX),
      max: String(MAX_HEIGHT_PX),
      step: '2',
      value: String(current),
    },
  }) as HTMLInputElement;
  const readout = el('span', { class: 'iso-range-value', text: `${current}px` });
  slider.addEventListener('input', () => {
    readout.textContent = `${slider.value}px`;
  });
  slider.addEventListener('change', () => onChange(Number(slider.value)));
  const wrap = el('div', { class: 'iso-height-row' }, [slider, readout]);
  return field('Height', wrap);
}

/** A row of colour swatches for a palette (skin, hair colour). */
function swatchRow(
  label: string,
  palette: Record<string, string>,
  current: string,
  onChange: (v: string) => void
): HTMLElement {
  const row = el('div', { class: 'iso-swatch-row' });
  for (const [key, hex] of Object.entries(palette)) {
    const sw = el('button', {
      class: 'iso-swatch',
      attrs: { type: 'button', 'data-key': key, title: key },
    });
    sw.style.setProperty('--sw', hex);
    if (key === current) sw.classList.add('is-active');
    sw.addEventListener('click', () => onChange(key));
    row.append(sw);
  }
  return field(label, row);
}

/** Top selector: a dropdown, with a hint swatch for the garment colour. */
function topRow(
  label: string,
  values: string[],
  current: string,
  onChange: (v: string) => void
): HTMLElement {
  const select = el('select', { class: 'iso-select' }) as HTMLSelectElement;
  for (const v of values) {
    const o = el('option', { text: cap(v), attrs: { value: v } });
    if (v === current) (o as HTMLOptionElement).selected = true;
    select.append(o);
  }
  select.addEventListener('change', () => onChange(select.value));
  const wrap = el('div', { class: 'iso-top-row' }, [select]);
  // colour hint for filled tops (hiviz/jacket/hoodie)
  const hint = topColorHint(current);
  if (hint) {
    const sw = el('span', { class: 'iso-swatch iso-swatch-static' });
    sw.style.setProperty('--sw', hint);
    wrap.append(sw);
  }
  return field(label, wrap);
}

function topColorHint(top: string): string | undefined {
  if (top === 'hiviz') return CLOTHING_COLORS['hiviz'];
  if (top === 'jacket') return CLOTHING_COLORS['slate'];
  if (top === 'hoodie') return CLOTHING_COLORS['teal'];
  return undefined;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** True if this entity should use the figurine editor. */
export function isFigurine(entity: Entity | undefined | null): boolean {
  return !!entity && entity.asset.symbol === 'figurine';
}

// Re-export for callers needing the doc type without a separate import.
export type { SceneDocument };
