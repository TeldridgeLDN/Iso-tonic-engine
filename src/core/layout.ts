// Deterministic auto-layout heuristic for wizard output.
// Produces a first-draft placement for a document's entities. Pure TS, no DOM.
//
// Goals (in priority order):
//   1. Deterministic: same input document → byte-identical output.
//   2. Non-overlapping footprints for grid entities (outside containment).
//   3. Territories are sized to CONTAIN their children: child territories tile
//      inside the parent (rows of two, one-tile border/gutters); grid
//      infrastructure sits on a row inside the parent beneath them.
//
// It is explicitly NOT trying to be beautiful.

import type {
  SceneDocument,
  Entity,
  GridPlacement,
  FreePlacement,
} from './model.ts';
import { byId } from './model.ts';
import { tileToScreen } from './iso.ts';

// Tunables -----------------------------------------------------------------

const PLATE_PAD = 1; // tiles of gap between top-level territories
const LEAF = { w: 3, d: 3 }; // childless territory footprint
const BORDER = 1; // interior border inside a territory
const GUTTER = 1; // gap between nested siblings
const COLS = 2; // child territories per interior row
const INFRA_PITCH = 2; // x-pitch between 1×1 infra items on their row
const SPARE_ROW_GAP = 2; // gap before the unparented spare row

// Deterministic pseudo-random --------------------------------------------

/** FNV-1a 32-bit hash of a string → unsigned int. Deterministic. */
function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    // 32-bit FNV prime multiply via shifts, keep unsigned.
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Deterministic offset in [-range, +range] derived from a seed string + salt. */
function seededOffset(seed: string, salt: string, range: number): number {
  const h = hashString(`${seed}:${salt}`);
  // Map to [0,1) then to [-range, range].
  const unit = (h % 100000) / 100000;
  return (unit * 2 - 1) * range;
}

// Placement builders -------------------------------------------------------

function grid(x: number, y: number, w: number, d: number): GridPlacement {
  return { mode: 'grid', x, y, footprint: { w, d } };
}

function free(x: number, y: number): FreePlacement {
  return { mode: 'free', x, y };
}

/** Screen-space centre of a grid zone, used to seed free placements inside it. */
function zoneCentreScreen(g: GridPlacement): { x: number; y: number } {
  const cx = g.x + g.footprint.w / 2;
  const cy = g.y + g.footprint.d / 2;
  return tileToScreen(cx, cy);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

interface Working {
  entity: Entity;
  placement?: GridPlacement | FreePlacement;
}

interface Size {
  w: number;
  d: number;
}

/**
 * Compute a fresh, deterministic placement for every entity.
 * Returns a new SceneDocument (input not mutated).
 */
export function autoLayout(doc: SceneDocument): SceneDocument {
  // Placement computation iterates in a fixed id-sorted order so positions
  // don't depend on input array ordering; the output preserves array order.
  const working = new Map<string, Working>();
  for (const e of doc.entities) working.set(e.id, { entity: e });

  const idsSorted = [...working.keys()].sort();
  const entityOf = (id: string): Entity => working.get(id)!.entity;

  const isTerritory = (e: Entity): boolean => e.type === 'territory';
  const isGridInfra = (e: Entity): boolean =>
    e.type === 'physical-infra' || e.type === 'digital-infra';

  // --- territory tree -------------------------------------------------------
  // Children maps in id-sorted order; roots = territories whose parent is not
  // a territory in this document (absent or dangling parents count as roots).
  const childTerrs = new Map<string, string[]>();
  const gridKids = new Map<string, string[]>();
  const roots: string[] = [];
  for (const id of idsSorted) {
    const e = entityOf(id);
    if (isTerritory(e)) {
      const parent = e.parentId ? byId(doc, e.parentId) : undefined;
      if (parent && isTerritory(parent)) {
        childTerrs.set(parent.id, [...(childTerrs.get(parent.id) ?? []), id]);
      } else {
        roots.push(id);
      }
    } else if (isGridInfra(e) && e.parentId) {
      const parent = byId(doc, e.parentId);
      if (parent && isTerritory(parent)) {
        gridKids.set(parent.id, [...(gridKids.get(parent.id) ?? []), id]);
      }
    }
  }

  // --- bottom-up territory sizing (memoised, cycle-safe) --------------------
  const sizes = new Map<string, Size>();
  const sizing = new Set<string>();
  const sizeOf = (id: string): Size => {
    const memo = sizes.get(id);
    if (memo) return memo;
    if (sizing.has(id)) return LEAF; // parentId cycle → degrade to a leaf
    sizing.add(id);

    const kids = childTerrs.get(id) ?? [];
    const infraCount = (gridKids.get(id) ?? []).length;

    let innerW = 0;
    let innerH = 0;
    for (let i = 0; i < kids.length; i += COLS) {
      const row = kids.slice(i, i + COLS).map(sizeOf);
      const rowW = row.reduce((acc, s) => acc + s.w, 0) + (row.length - 1) * GUTTER;
      const rowH = Math.max(...row.map((s) => s.d));
      innerW = Math.max(innerW, rowW);
      innerH += (innerH > 0 ? GUTTER : 0) + rowH;
    }
    if (infraCount > 0) {
      innerW = Math.max(innerW, infraCount * INFRA_PITCH - 1);
      innerH += (innerH > 0 ? GUTTER : 0) + 1; // one row of 1×1 items
    }

    const size: Size = {
      w: Math.max(LEAF.w, innerW + 2 * BORDER),
      d: Math.max(LEAF.d, innerH + 2 * BORDER),
    };
    sizing.delete(id);
    sizes.set(id, size);
    return size;
  };

  // --- recursive placement: territory + its interior ------------------------
  const grids = new Map<string, GridPlacement>(); // id → placed grid (anchors)
  const placeTerritory = (id: string, x: number, y: number): void => {
    const size = sizeOf(id);
    const g = grid(x, y, size.w, size.d);
    working.get(id)!.placement = g;
    grids.set(id, g);

    // Child territories: rows of COLS inside the border.
    const kids = childTerrs.get(id) ?? [];
    let cy = y + BORDER;
    for (let i = 0; i < kids.length; i += COLS) {
      const row = kids.slice(i, i + COLS);
      let cx = x + BORDER;
      let rowH = 0;
      for (const kid of row) {
        const ks = sizeOf(kid);
        placeTerritory(kid, cx, cy);
        cx += ks.w + GUTTER;
        rowH = Math.max(rowH, ks.d);
      }
      cy += rowH + GUTTER;
    }

    // Grid infrastructure: one row of 1×1 items beneath the nested rows.
    const infra = gridKids.get(id) ?? [];
    infra.forEach((kidId, j) => {
      const g2 = grid(x + BORDER + j * INFRA_PITCH, cy, 1, 1);
      working.get(kidId)!.placement = g2;
      grids.set(kidId, g2);
    });
  };

  // --- Pass 1: top-level territories tiled left-to-right --------------------
  let plateCursorX = 0;
  for (const id of roots) {
    placeTerritory(id, plateCursorX, 0);
    plateCursorX += sizeOf(id).w + PLATE_PAD;
  }

  // Bottom edge of everything placed so far (tile space), for the bands below.
  let maxBottom = 0;
  for (const g of grids.values()) {
    maxBottom = Math.max(maxBottom, g.y + g.footprint.d);
  }

  // --- Pass 2: grid infra with no territory parent → spare band -------------
  const looseInfraY = maxBottom + SPARE_ROW_GAP;
  let looseInfraX = 0;
  for (const id of idsSorted) {
    const e = entityOf(id);
    if (!isGridInfra(e) || working.get(id)!.placement) continue;
    working.get(id)!.placement = grid(looseInfraX, looseInfraY, 1, 1);
    looseInfraX += INFRA_PITCH;
  }

  // --- Pass 3: users (figurines) free-placed near parent, seeded scatter ----
  for (const id of idsSorted) {
    const e = entityOf(id);
    if (e.type !== 'user') continue;

    const parentGrid = e.parentId ? grids.get(e.parentId) : undefined;
    let baseX: number;
    let baseY: number;
    if (parentGrid) {
      const c = zoneCentreScreen(parentGrid);
      baseX = c.x;
      baseY = c.y;
    } else {
      // Deterministic spot in a scatter band below everything.
      const c = tileToScreen(0, looseInfraY + 2);
      baseX = c.x;
      baseY = c.y;
    }
    const ox = seededOffset(e.id, 'x', 48);
    const oy = seededOffset(e.id, 'y', 24);
    working.get(id)!.placement = free(
      Math.round(baseX + ox),
      Math.round(baseY + oy)
    );
  }

  // --- Pass 4: annotations placed above the top of the map ------------------
  // Compute the min screen-y over all placed grid/free entities, then stack
  // annotations above it, tiled left-to-right deterministically.
  let minScreenY = 0;
  let hasAny = false;
  for (const id of idsSorted) {
    const p = working.get(id)!.placement;
    if (!p) continue;
    const w = working.get(id)!.entity;
    if (w.type === 'annotation') continue;
    if (p.mode === 'grid') {
      const y = tileToScreen(p.x, p.y).y; // north vertex is the top-most point
      if (!hasAny || y < minScreenY) minScreenY = y;
    } else {
      if (!hasAny || p.y < minScreenY) minScreenY = p.y;
    }
    hasAny = true;
  }
  const annoTop = minScreenY - 80;
  let annoIndex = 0;
  for (const id of idsSorted) {
    const e = entityOf(id);
    if (e.type !== 'annotation') continue;
    working.get(id)!.placement = free(annoIndex * 220, annoTop);
    annoIndex += 1;
  }

  // --- Fallback: any entity still unplaced → spare row at the bottom --------
  const spareY = looseInfraY + 1 + SPARE_ROW_GAP;
  let spareX = 0;
  for (const id of idsSorted) {
    const w = working.get(id)!;
    if (w.placement) continue;
    w.placement = grid(spareX, spareY, 1, 1);
    spareX += 2;
  }

  // --- Emit: preserve original entity array order --------------------------
  const entities = doc.entities.map((e) => {
    const placement = working.get(e.id)!.placement!;
    return { ...e, placement };
  });

  return { ...doc, entities };
}
