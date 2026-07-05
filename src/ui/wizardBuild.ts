// PURE wizard document builder. No DOM. Deterministic given an id generator.
//
// Consumes the answers the wizard modal collects and produces a laid-out
// SceneDocument: entities with parentId chains, user-group headcounts expanded
// into that many figurines (randomised params seeded off a stable index),
// sensible default assets, then core/layout.autoLayout applied.
//
// Factored out of wizard.ts so the entity-generation logic is unit-testable.

import type { Entity, EntityType, SceneDocument } from '../core/model.ts';
import { createEmptyDocument } from '../core/model.ts';
import { autoLayout } from '../core/layout.ts';
import { randomFigurineParams } from '../assets/figurine.ts';

// --- answer shape (what the modal collects) --------------------------------

/** A single row in a multi-entry step. */
export interface WizardRow {
  name: string;
  /** local id (from the parent step) of the chosen parent, if any. */
  parentRef?: string;
  /** headcount for user-group rows. */
  headcount?: number;
  /** chosen asset symbol (systems / physical infra), overrides step default. */
  asset?: string;
}

/** A step's collected value: single service info, or a list of rows. */
export interface WizardAnswers {
  service: { name: string; description?: string };
  organisations: WizardRow[];
  departments: WizardRow[];
  teams: WizardRow[];
  userGroups: WizardRow[];
  digitalSystems: WizardRow[];
  physicalInfra: WizardRow[];
  annotations: WizardRow[];
}

export function emptyAnswers(): WizardAnswers {
  return {
    service: { name: '' },
    organisations: [],
    departments: [],
    teams: [],
    userGroups: [],
    digitalSystems: [],
    physicalInfra: [],
    annotations: [],
  };
}

// --- id generation (injectable for deterministic tests) --------------------

export type IdGen = () => string;

/** Deterministic sequential id generator: e1, e2, e3… */
export function sequentialIdGen(prefix = 'e'): IdGen {
  let n = 0;
  return () => `${prefix}${++n}`;
}

// --- build options ---------------------------------------------------------

export interface BuildOptions {
  idGen?: IdGen;
  /** ISO timestamp for meta.created/modified (determinism in tests). */
  now?: string;
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

/**
 * Build a fresh, laid-out SceneDocument from wizard answers.
 * `rowRef` on each produced entity maps back to the answer row's index so a
 * later step's parentRef (an index-string into an earlier step) resolves to the
 * generated entity id.
 */
export function wizardBuildDocument(
  answers: WizardAnswers,
  options: BuildOptions = {}
): SceneDocument {
  const idGen = options.idGen ?? sequentialIdGen();
  const doc = createEmptyDocument(
    answers.service.name.trim() || 'Untitled service',
    options.now
  );
  if (answers.service.description) {
    doc.meta.description = answers.service.description;
  }

  const entities: Entity[] = [];
  // For each step, map row-index → produced parent entity id (so children of a
  // multi-entity row like a user group can attach; for user groups we map the
  // group to its FIRST figurine's… no — figurines have no children, so we only
  // need parent-resolution maps for org/dept/team steps).
  const orgIds: Map<number, string> = new Map();
  const deptIds: Map<number, string> = new Map();
  const teamIds: Map<number, string> = new Map();

  // Organisations
  answers.organisations.forEach((row, i) => {
    const id = idGen();
    orgIds.set(i, id);
    entities.push(
      makeEntity(id, 'organisation', row.name || `Organisation ${i + 1}`, {
        symbol: row.asset ?? 'department-zone',
        params: { label: (row.name || `Organisation ${i + 1}`).toUpperCase() },
      })
    );
  });

  // Departments (parent = organisation row index)
  answers.departments.forEach((row, i) => {
    const id = idGen();
    deptIds.set(i, id);
    entities.push(
      makeEntity(id, 'department', row.name || `Department ${i + 1}`, {
        symbol: row.asset ?? 'department-zone',
        params: { label: (row.name || `Department ${i + 1}`).toUpperCase() },
      }, resolveParent(row.parentRef, orgIds))
    );
  });

  // Teams (parent = department row index)
  answers.teams.forEach((row, i) => {
    const id = idGen();
    teamIds.set(i, id);
    entities.push(
      makeEntity(id, 'team', row.name || `Team ${i + 1}`, {
        symbol: row.asset ?? 'department-zone',
        params: { label: (row.name || `Team ${i + 1}`).toUpperCase() },
      }, resolveParent(row.parentRef, deptIds))
    );
  });

  // User groups → headcount figurines each (parent = team row index)
  let figIndex = 0;
  answers.userGroups.forEach((row, i) => {
    const parentId = resolveParent(row.parentRef, teamIds);
    const count = clampHeadcount(row.headcount);
    const groupName = row.name || `User group ${i + 1}`;
    for (let k = 0; k < count; k++) {
      const id = idGen();
      // Seed off a stable running index so output is deterministic.
      const params = randomFigurineParams(0x9e37 + figIndex * 2654435761) as unknown as Record<string, unknown>;
      figIndex++;
      const label = count > 1 ? `${groupName} ${k + 1}` : groupName;
      entities.push(
        makeEntity(id, 'user', label, { symbol: 'figurine', params }, parentId)
      );
    }
  });

  // Digital systems (parent = team row index)
  answers.digitalSystems.forEach((row, i) => {
    const id = idGen();
    entities.push(
      makeEntity(id, 'digital-infra', row.name || `System ${i + 1}`, {
        symbol: row.asset ?? 'server-rack',
      }, resolveParent(row.parentRef, teamIds))
    );
  });

  // Physical infrastructure (parent = department row index)
  answers.physicalInfra.forEach((row, i) => {
    const id = idGen();
    entities.push(
      makeEntity(id, 'physical-infra', row.name || `Item ${i + 1}`, {
        symbol: row.asset ?? 'office-block',
      }, resolveParent(row.parentRef, deptIds))
    );
  });

  // Annotations (free callouts, no parent)
  answers.annotations.forEach((row, i) => {
    const id = idGen();
    const textVal = row.name || `Note ${i + 1}`;
    entities.push(
      makeEntity(id, 'annotation', textVal, {
        symbol: 'callout',
        params: { text: textVal },
      })
    );
  });

  const withEntities: SceneDocument = { ...doc, entities };
  return autoLayout(withEntities);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntity(
  id: string,
  type: EntityType,
  label: string,
  asset: { symbol: string; params?: Record<string, unknown> },
  parentId?: string
): Entity {
  // Placement is a throwaway origin; autoLayout replaces it entirely.
  const e: Entity = {
    id,
    type,
    label,
    placement: { mode: 'grid', x: 0, y: 0, footprint: { w: 1, d: 1 } },
    asset,
  };
  if (parentId) e.parentId = parentId;
  return e;
}

/** parentRef is a stringified row index into an earlier step's id map. */
function resolveParent(
  parentRef: string | undefined,
  map: Map<number, string>
): string | undefined {
  if (parentRef === undefined || parentRef === '') return undefined;
  const idx = Number(parentRef);
  if (!Number.isInteger(idx)) return undefined;
  return map.get(idx);
}

function clampHeadcount(h: number | undefined): number {
  const n = typeof h === 'number' && Number.isFinite(h) ? Math.floor(h) : 1;
  return Math.min(5, Math.max(1, n));
}
