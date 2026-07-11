// Left-sidebar asset palette, grouped by category. Each item shows a small
// inline SVG thumbnail + name. Clicking an item enters placement mode (the App
// carries a ghost; a canvas click places the entity via PlaceEntity). A search
// box filters items by name/id/category.
//
// Categories = the seven entity types + 'prop' (per the AssetDef.category union).

import { listByCategory, listAssets, type AssetDef } from '../assets/library.ts';
import type { EntityType } from '../core/model.ts';
import type { AppContext, PlacementRequest } from './context.ts';
import { assetThumbnail } from './thumbnail.ts';
import { el, clear } from './dom.ts';

/**
 * Terrain & streetscape section: roads, rivers, organic regions, coastlines,
 * plus the small street furniture that reads as landscape. These ids are pulled
 * OUT of their normal category group into a dedicated section (region-organic /
 * island-coastline are department/organisation category but belong here).
 */
const TERRAIN_IDS = new Set<string>([
  'road-straight',
  'road-corner',
  'road-t',
  'river-straight',
  'river-bend',
  'region-organic',
  'island-coastline',
  'tree-round',
  'tree-conifer',
  'planter',
  'street-lamp',
  'signpost',
]);

// Display order + labels for the category-driven palette groups. The terrain
// section is injected separately (see renderList) since it spans categories.
const GROUPS: { category: AssetDef['category']; label: string }[] = [
  { category: 'territory', label: 'Territory' },
  { category: 'organisation', label: 'Organisations' },
  { category: 'department', label: 'Departments' },
  { category: 'process', label: 'Processes' },
  { category: 'user', label: 'People' },
  { category: 'digital-infra', label: 'Digital infrastructure' },
  { category: 'physical-infra', label: 'Physical infrastructure' },
  { category: 'annotation', label: 'Annotations' },
  { category: 'prop', label: 'Props & scenery' },
];

const TERRAIN_LABEL = 'Terrain & streetscape';

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

    // Dedicated terrain & streetscape section (spans categories), shown first.
    const terrain = listAssets().filter(
      (a) => TERRAIN_IDS.has(a.id) && matchesQuery(a, TERRAIN_LABEL, q)
    );
    if (terrain.length > 0) {
      this.appendSection(TERRAIN_LABEL, terrain);
    }

    for (const group of GROUPS) {
      const items = listByCategory(group.category).filter(
        (a) => !TERRAIN_IDS.has(a.id) && matches(a, group, q)
      );
      if (items.length === 0) continue;
      this.appendSection(group.label, items);
    }

    if (this.listHost.childElementCount === 0) {
      this.listHost.append(
        el('p', { class: 'iso-empty', text: 'No assets match your search.' })
      );
    }
    this.reflectActive();
  }

  /** Append one titled section with a grid of asset items. */
  private appendSection(label: string, items: AssetDef[]): void {
    const section = el('div', { class: 'iso-palette-group' });
    section.append(el('h3', { class: 'iso-palette-group-title', text: label }));
    const grid = el('div', { class: 'iso-palette-grid' });
    for (const asset of items) grid.append(this.renderItem(asset));
    section.append(grid);
    this.listHost.append(section);
  }

  private renderItem(asset: AssetDef): HTMLElement {
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
        entityType: entityTypeFor(asset.category),
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
  return matchesQuery(asset, group.label, q);
}

/** True if the asset matches the search query, given its section's label. */
function matchesQuery(asset: AssetDef, sectionLabel: string, q: string): boolean {
  if (!q) return true;
  const hay = `${asset.id} ${assetName(asset.id)} ${sectionLabel} ${asset.category}`.toLowerCase();
  return hay.includes(q);
}
