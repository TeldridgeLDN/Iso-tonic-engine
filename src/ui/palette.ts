// Left-sidebar asset palette, grouped by category. Each item shows a small
// inline SVG thumbnail + name. Clicking an item enters placement mode (the App
// carries a ghost; a canvas click places the entity via PlaceEntity). A search
// box filters items by name/id/category.
//
// Categories = the seven entity types + 'prop' (per the AssetDef.category union).

import { listByCategory, type AssetDef } from '../assets/library.ts';
import type { EntityType } from '../core/model.ts';
import type { AppContext, PlacementRequest } from './context.ts';
import { assetThumbnail } from './thumbnail.ts';
import { el, clear } from './dom.ts';

// Display order + labels for palette groups.
const GROUPS: { category: AssetDef['category']; label: string }[] = [
  { category: 'organisation', label: 'Organisations' },
  { category: 'department', label: 'Departments' },
  { category: 'process', label: 'Processes' },
  { category: 'user', label: 'People' },
  { category: 'digital-infra', label: 'Digital infrastructure' },
  { category: 'physical-infra', label: 'Physical infrastructure' },
  { category: 'annotation', label: 'Annotations' },
  { category: 'prop', label: 'Props & scenery' },
];

// Human-friendly names for asset ids (fallback: title-cased id).
function assetName(id: string): string {
  return id
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** The entity type an item of this category should create. 'prop' → physical. */
function entityTypeFor(category: AssetDef['category']): EntityType {
  return category === 'prop' ? 'physical-infra' : category;
}

export class Palette {
  readonly root: HTMLElement;
  private readonly ctx: AppContext;
  private readonly listHost: HTMLElement;
  private readonly search: HTMLInputElement;
  private filter = '';
  private activeId: string | undefined;

  constructor(ctx: AppContext) {
    this.ctx = ctx;

    this.search = el('input', {
      class: 'iso-search',
      attrs: { type: 'search', placeholder: 'Search assets…' },
    }) as HTMLInputElement;
    this.search.addEventListener('input', () => {
      this.filter = this.search.value.trim().toLowerCase();
      this.renderList();
    });

    this.listHost = el('div', { class: 'iso-palette-list' });

    this.root = el('aside', { class: 'iso-panel iso-palette' }, [
      el('h2', { class: 'iso-panel-title', text: 'Assets' }),
      this.search,
      el('p', {
        class: 'iso-palette-hint',
        text: 'Click an asset, then click the map to place it. Esc cancels.',
      }),
      this.listHost,
    ]);

    this.renderList();
  }

  /** Called by the App when placement mode ends (place or cancel). */
  clearActive(): void {
    this.activeId = undefined;
    this.reflectActive();
  }

  private renderList(): void {
    clear(this.listHost);
    const q = this.filter;

    for (const group of GROUPS) {
      const items = listByCategory(group.category).filter((a) =>
        matches(a, group, q)
      );
      if (items.length === 0) continue;

      const section = el('div', { class: 'iso-palette-group' });
      section.append(
        el('h3', { class: 'iso-palette-group-title', text: group.label })
      );

      const grid = el('div', { class: 'iso-palette-grid' });
      for (const asset of items) {
        grid.append(this.renderItem(asset, group.category));
      }
      section.append(grid);
      this.listHost.append(section);
    }

    if (this.listHost.childElementCount === 0) {
      this.listHost.append(
        el('p', { class: 'iso-empty', text: 'No assets match your search.' })
      );
    }
    this.reflectActive();
  }

  private renderItem(asset: AssetDef, category: AssetDef['category']): HTMLElement {
    const name = assetName(asset.id);
    const item = el('button', {
      class: 'iso-palette-item',
      attrs: { type: 'button', 'data-asset-id': asset.id },
      title: `Place ${name}`,
    });

    const thumbWrap = el('div', { class: 'iso-thumb-wrap' });
    // Thumbnails need layout to measure; assetThumbnail attaches an offscreen
    // host itself, so this is safe even before `item` is in the document.
    thumbWrap.append(assetThumbnail(asset.id, { size: 64 }));

    const caption = el('span', { class: 'iso-palette-caption', text: name });
    item.append(thumbWrap, caption);

    item.addEventListener('click', () => {
      const req: PlacementRequest = {
        assetId: asset.id,
        entityType: entityTypeFor(category),
        assetLabel: name,
      };
      // Toggle: clicking the active item again cancels placement.
      if (this.activeId === asset.id) {
        this.activeId = undefined;
        this.ctx.cancelPlacement();
      } else {
        this.activeId = asset.id;
        this.ctx.beginPlacement(req);
      }
      this.reflectActive();
    });

    return item;
  }

  private reflectActive(): void {
    const items = this.listHost.querySelectorAll<HTMLElement>('.iso-palette-item');
    items.forEach((it) => {
      const on = it.getAttribute('data-asset-id') === this.activeId;
      it.classList.toggle('is-active', on);
    });
  }
}

function matches(
  asset: AssetDef,
  group: { category: AssetDef['category']; label: string },
  q: string
): boolean {
  if (!q) return true;
  const hay = `${asset.id} ${assetName(asset.id)} ${group.label} ${asset.category}`.toLowerCase();
  return hay.includes(q);
}
