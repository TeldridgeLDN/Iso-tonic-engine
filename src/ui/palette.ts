// Left-sidebar asset palette, grouped by category and ordered for map-building
// (Territory → Terrain & streetscape → People → Physical infrastructure →
// Digital infrastructure → Props & scenery → Annotations; the old zone sections
// were removed with the territory collapse, 2026-07).
// Items within a section follow SECTION_ORDER. Each item shows a
// small inline SVG thumbnail + name. Clicking an item enters placement mode (the
// App carries a ghost; a canvas click places the entity via PlaceEntity). A
// search box filters items by name/id/category.
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
 * island-coastline are territory category but belong here).
 */
const TERRAIN_IDS = new Set<string>([
  'road-straight',
  'road-corner',
  'road-t',
  'road-cross',
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

// Display order + labels for the category-driven palette groups, in map-building
// order. Territory renders first, then the terrain section (injected separately
// in renderList since it spans categories), then the remaining groups below.
const GROUPS: { category: AssetDef['category']; label: string }[] = [
  { category: 'territory', label: 'Territory' },
  { category: 'user', label: 'People' },
  { category: 'physical-infra', label: 'Physical infrastructure' },
  { category: 'digital-infra', label: 'Digital infrastructure' },
  { category: 'prop', label: 'Props & scenery' },
  { category: 'annotation', label: 'Annotations' },
];

const TERRAIN_LABEL = 'Terrain & streetscape';

// Deterministic within-section item order, keyed by section label. Ids listed
// here sort by their index; ids NOT listed sort after all listed ones,
// alphabetically by id (so future auto-discovered sprites appear at the end).
// Single-item sections need no entry.
const SECTION_ORDER: Record<string, string[]> = {
  [TERRAIN_LABEL]: [
    'road-straight',
    'road-corner',
    'road-t',
    'road-cross',
    'river-straight',
    'river-bend',
    'region-organic',
    'island-coastline',
    'tree-round',
    'tree-conifer',
    'planter',
    'street-lamp',
    'signpost',
  ],
  'Physical infrastructure': [
    'building',
    'office-block',
    'terraced',
    'warehouse',
    'house-small',
    'shop-front',
    'corner-shop',
    'civic',
    'car',
    'van',
    'tram',
  ],
  'Digital infrastructure': [
    'gov-laptop',
    'telephone',
    'gov-app',
    'digital-form',
    'appointment-booking',
    'verify-details',
    'payments',
    'digital-wallet',
    'next-actions',
    'status-dashboard',
    'service-signpost',
    'data-feed',
    'ai-agent',
    'human-support',
  ],
  'Props & scenery': [
    'desk-single',
    'desk-laptop-v2',
    'desk-workstation-v2',
    'desk-cluster',
    'desk-reception',
    'desk-meeting',
    'meeting-table',
    'bookshelf',
    'shelving',
    'cafe-seating',
    'market-stall',
    'barrier',
    'demo-crate',
  ],
};

// Sort a section's items by SECTION_ORDER: listed ids by index, unlisted ids
// after all listed ones, alphabetically by id. Returns a new array.
function orderSection(label: string, items: AssetDef[]): AssetDef[] {
  const order = SECTION_ORDER[label];
  if (!order) return items;
  const rank = (id: string): number => {
    const i = order.indexOf(id);
    return i === -1 ? order.length : i;
  };
  return [...items].sort((a, b) => {
    const ra = rank(a.id);
    const rb = rank(b.id);
    if (ra !== rb) return ra - rb;
    return a.id.localeCompare(b.id);
  });
}

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

    // Map-building order: Territory first, then the dedicated terrain &
    // streetscape section (spans categories), then the remaining groups.
    const territory = GROUPS.find((g) => g.category === 'territory');
    if (territory) this.appendGroup(territory, q);

    const terrain = listAssets().filter(
      (a) => TERRAIN_IDS.has(a.id) && matchesQuery(a, TERRAIN_LABEL, q)
    );
    if (terrain.length > 0) {
      this.appendSection(TERRAIN_LABEL, terrain);
    }

    for (const group of GROUPS) {
      if (group.category === 'territory') continue; // already rendered above
      this.appendGroup(group, q);
    }

    if (this.listHost.childElementCount === 0) {
      this.listHost.append(
        el('p', { class: 'iso-empty', text: 'No assets match your search.' })
      );
    }
    this.reflectActive();
  }

  /** Filter one category group by the query and append it (if non-empty). */
  private appendGroup(
    group: { category: AssetDef['category']; label: string },
    q: string
  ): void {
    const items = listByCategory(group.category).filter(
      (a) => !TERRAIN_IDS.has(a.id) && matches(a, group, q)
    );
    if (items.length === 0) return;
    this.appendSection(group.label, items);
  }

  /** Append one titled section with a grid of asset items, in section order. */
  private appendSection(label: string, items: AssetDef[]): void {
    const section = el('div', { class: 'iso-palette-group' });
    section.append(el('h3', { class: 'iso-palette-group-title', text: label }));
    const grid = el('div', { class: 'iso-palette-grid' });
    for (const asset of orderSection(label, items)) {
      grid.append(this.renderItem(asset));
    }
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
