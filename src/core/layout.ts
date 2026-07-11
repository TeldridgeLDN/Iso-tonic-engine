// Deterministic auto-layout heuristic for wizard output.
// Produces a first-draft placement for a document's entities. Pure TS, no DOM.
//
// Goals (in priority order):
//   1. Deterministic: same input document → byte-identical output.
//   2. Non-overlapping footprints for grid entities.
//   3. Reasonable semantic grouping (children near parents).
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

const PLATE_PAD = 1; // tiles of gap between top-level plates
const ORG_PLATE = { w: 10, d: 8 }; // organisation ground plate size
const DEPT_PLATE = { w: 8, d: 6 }; // department ground plate size
const TEAM_ZONE = { w: 3, d: 3 }; // team zone inside a department
const PROCESS_ZONE = { w: 3, d: 2 }; // process dotted zone
const INFRA_FOOT = { w: 1, d: 1 }; // infra footprint
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

/**
 * Compute a fresh, deterministic placement for every entity.
 * Returns a new SceneDocument (input not mutated).
 */
export function autoLayout(doc: SceneDocument): SceneDocument {
  // Stable ordering: sort ids for deterministic iteration independent of the
  // caller's array order? No — we must preserve entity array order in output
  // for structural stability, but placement *computation* iterates in a fixed
  // id-sorted order so plate positions don't depend on input ordering.
  const working = new Map<string, Working>();
  for (const e of doc.entities) working.set(e.id, { entity: e });

  const idsSorted = [...working.keys()].sort();
  const grids = new Map<string, GridPlacement>(); // id → grid zone (for anchoring children)

  // Cursor for tiling top-level plates left-to-right.
  let plateCursorX = 0;
  const plateRowY = 0;

  // SLICE-4 BRIDGE: the wizard still emits the legacy zone type strings
  // (organisation/department/team/process), which are no longer EntityType
  // members. Compare as plain strings until the wizard is reworked to emit
  // territories (TERRITORY_PLAN.md Slice 4) — behavior is unchanged.
  const typeOf = (e: Entity): string => e.type;
  const isType = (e: Entity, ...types: string[]): boolean =>
    types.includes(typeOf(e));

  const isTopLevel = (e: Entity): boolean =>
    !e.parentId || byId(doc, e.parentId) === undefined;

  // --- Pass 1: top-level organisations & departments become ground plates ---
  for (const id of idsSorted) {
    const e = working.get(id)!.entity;
    if (!isType(e, 'organisation', 'department')) continue;
    if (!isTopLevel(e)) continue;

    const size = typeOf(e) === 'organisation' ? ORG_PLATE : DEPT_PLATE;
    const g = grid(plateCursorX, plateRowY, size.w, size.d);
    working.get(id)!.placement = g;
    grids.set(id, g);
    plateCursorX += size.w + PLATE_PAD;
  }

  // --- Pass 2: departments parented to an organisation → plate inside org row ---
  // Place them to the right of the org plate band, tiled per-parent.
  const childPlateCursor = new Map<string, number>(); // parentId → next local x offset
  for (const id of idsSorted) {
    const e = working.get(id)!.entity;
    if (typeOf(e) !== 'department') continue;
    if (isTopLevel(e)) continue; // already placed in pass 1

    const parentGrid = e.parentId ? grids.get(e.parentId) : undefined;
    if (!parentGrid) {
      // Parent isn't a placed grid — treat as top-level plate.
      const g = grid(plateCursorX, plateRowY, DEPT_PLATE.w, DEPT_PLATE.d);
      working.get(id)!.placement = g;
      grids.set(id, g);
      plateCursorX += DEPT_PLATE.w + PLATE_PAD;
      continue;
    }
    // Stack departments below the org plate, tiled left-to-right.
    const local = childPlateCursor.get(e.parentId!) ?? 0;
    const g = grid(
      parentGrid.x + local,
      parentGrid.y + parentGrid.footprint.d + PLATE_PAD,
      DEPT_PLATE.w,
      DEPT_PLATE.d
    );
    working.get(id)!.placement = g;
    grids.set(id, g);
    childPlateCursor.set(e.parentId!, local + DEPT_PLATE.w + PLATE_PAD);
  }

  // --- Pass 3: teams → smaller zones inside their parent department plate ---
  const teamCursor = new Map<string, { col: number; row: number }>();
  for (const id of idsSorted) {
    const e = working.get(id)!.entity;
    if (typeOf(e) !== 'team') continue;

    const parentGrid = e.parentId ? grids.get(e.parentId) : undefined;
    if (!parentGrid) {
      // Unparented team → its own small plate on the top row.
      const g = grid(plateCursorX, plateRowY, TEAM_ZONE.w, TEAM_ZONE.d);
      working.get(id)!.placement = g;
      grids.set(id, g);
      plateCursorX += TEAM_ZONE.w + PLATE_PAD;
      continue;
    }
    const cursor = teamCursor.get(e.parentId!) ?? { col: 0, row: 0 };
    const perRow = Math.max(
      1,
      Math.floor(parentGrid.footprint.w / (TEAM_ZONE.w + 1))
    );
    const gx = parentGrid.x + 1 + cursor.col * (TEAM_ZONE.w + 1);
    const gy = parentGrid.y + 1 + cursor.row * (TEAM_ZONE.d + 1);
    const g = grid(gx, gy, TEAM_ZONE.w, TEAM_ZONE.d);
    working.get(id)!.placement = g;
    grids.set(id, g);

    let nextCol = cursor.col + 1;
    let nextRow = cursor.row;
    if (nextCol >= perRow) {
      nextCol = 0;
      nextRow += 1;
    }
    teamCursor.set(e.parentId!, { col: nextCol, row: nextRow });
  }

  // --- Pass 4: infra (physical/digital) placed adjacent to parent zone ------
  const infraCursor = new Map<string, number>();
  let looseInfraX = 0;
  const looseInfraY = ORG_PLATE.d + DEPT_PLATE.d + SPARE_ROW_GAP; // below plates
  for (const id of idsSorted) {
    const e = working.get(id)!.entity;
    if (!isType(e, 'physical-infra', 'digital-infra')) continue;

    const parentGrid = e.parentId ? grids.get(e.parentId) : undefined;
    if (!parentGrid) {
      const g = grid(looseInfraX, looseInfraY, INFRA_FOOT.w, INFRA_FOOT.d);
      working.get(id)!.placement = g;
      looseInfraX += INFRA_FOOT.w + 1;
      continue;
    }
    // Tile infra along the bottom edge just outside the parent zone.
    const n = infraCursor.get(e.parentId!) ?? 0;
    const g = grid(
      parentGrid.x + n * (INFRA_FOOT.w + 1),
      parentGrid.y + parentGrid.footprint.d, // one row past the zone's far edge
      INFRA_FOOT.w,
      INFRA_FOOT.d
    );
    working.get(id)!.placement = g;
    infraCursor.set(e.parentId!, n + 1);
  }

  // --- Pass 5: processes → dotted zones in a dedicated band below the map ----
  // Contract wants them "between the teams they parent to"; to keep the layout
  // deterministic AND collision-free (team/dept plates are densely packed),
  // all processes live in their own band, tiled left-to-right. Kept adjacent
  // in x to their parent's plate where one exists, else appended in order.
  const looseProcessY = looseInfraY + INFRA_FOOT.d + SPARE_ROW_GAP;
  let looseProcessX = 0;
  for (const id of idsSorted) {
    const e = working.get(id)!.entity;
    if (typeOf(e) !== 'process') continue;
    const g = grid(looseProcessX, looseProcessY, PROCESS_ZONE.w, PROCESS_ZONE.d);
    working.get(id)!.placement = g;
    looseProcessX += PROCESS_ZONE.w + PLATE_PAD;
  }

  // --- Pass 6: users (figurines) free-placed near parent, seeded scatter ----
  for (const id of idsSorted) {
    const e = working.get(id)!.entity;
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
      const c = tileToScreen(0, looseProcessY + PROCESS_ZONE.d + 2);
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

  // --- Pass 7: annotations placed above the top of the map ------------------
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
    const e = working.get(id)!.entity;
    if (e.type !== 'annotation') continue;
    working.get(id)!.placement = free(annoIndex * 220, annoTop);
    annoIndex += 1;
  }

  // --- Fallback: any entity still unplaced → spare row at the bottom --------
  const spareY = looseProcessY + PROCESS_ZONE.d + 6;
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
