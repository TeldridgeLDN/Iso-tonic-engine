// Data-driven interview step definitions. The wizard UI (wizard.ts) renders
// these; the pure builder (wizardBuild.ts) consumes the collected answers.
//
// Each step produces zero or more entities of a fixed EntityType. Multi-entry
// steps collect a list; the parentStep (if any) supplies a dropdown of choices
// drawn from entities created by an earlier step.

import type { EntityType } from '../core/model.ts';

export type StepId =
  | 'service'
  | 'organisations'
  | 'departments'
  | 'teams'
  | 'userGroups'
  | 'digitalSystems'
  | 'physicalInfra'
  | 'annotations';

/** One field in a multi-entry row (beyond the always-present name). */
export interface ExtraField {
  key: string;
  label: string;
  kind: 'number' | 'select';
  min?: number;
  max?: number;
  default?: string | number;
  options?: { value: string; label: string }[];
}

export interface WizardStep {
  id: StepId;
  title: string;
  prompt: string;
  /** EntityType each produced entity gets. */
  entityType: EntityType;
  /** Multi-entry (list) vs single (service title/description only). */
  multi: boolean;
  /** id of an earlier step whose entities populate a parent dropdown. */
  parentStep?: StepId;
  /** Label for the name input on each row. */
  nameLabel: string;
  /** Extra per-row fields beyond name + parent. */
  extraFields?: ExtraField[];
  /** Default asset symbol for produced entities (overridable later in editor). */
  defaultAsset?: string;
  /** For steps offering an asset choice, the selectable asset options. */
  assetOptions?: { value: string; label: string }[];
}

export const WIZARD_STEPS: WizardStep[] = [
  {
    id: 'service',
    title: 'Service',
    prompt: 'What service are you mapping? Give it a name and a short description.',
    entityType: 'organisation', // service title is stored on meta, not an entity
    multi: false,
    nameLabel: 'Service name',
  },
  {
    id: 'organisations',
    title: 'Organisations',
    prompt: 'Which organisations are involved? Add one per line.',
    entityType: 'organisation',
    multi: true,
    nameLabel: 'Organisation',
    defaultAsset: 'department-zone',
  },
  {
    id: 'departments',
    title: 'Departments',
    prompt: 'Add the departments, choosing which organisation each belongs to.',
    entityType: 'department',
    multi: true,
    parentStep: 'organisations',
    nameLabel: 'Department',
    defaultAsset: 'department-zone',
  },
  {
    id: 'teams',
    title: 'Teams',
    prompt: 'Add the teams and pick the department each sits within.',
    entityType: 'team',
    multi: true,
    parentStep: 'departments',
    nameLabel: 'Team',
    defaultAsset: 'department-zone',
  },
  {
    id: 'userGroups',
    title: 'User groups',
    prompt:
      'Add user groups. Each headcount becomes that many people (figurines) in the team.',
    entityType: 'user',
    multi: true,
    parentStep: 'teams',
    nameLabel: 'User group',
    defaultAsset: 'figurine',
    extraFields: [
      { key: 'headcount', label: 'People', kind: 'number', min: 1, max: 5, default: 2 },
    ],
  },
  {
    id: 'digitalSystems',
    title: 'Digital systems',
    prompt: 'Add digital systems and pick the team or department they belong to.',
    entityType: 'digital-infra',
    multi: true,
    parentStep: 'teams',
    nameLabel: 'System',
    defaultAsset: 'server-rack',
    assetOptions: [
      { value: 'server-rack', label: 'Server rack' },
      { value: 'desktop-workstation', label: 'Workstation' },
      { value: 'wall-screen', label: 'Wall screen' },
      { value: 'phone-kiosk', label: 'Phone kiosk' },
      { value: 'network-mast', label: 'Network mast' },
    ],
  },
  {
    id: 'physicalInfra',
    title: 'Physical infrastructure',
    prompt: 'Add buildings, vehicles and other physical infrastructure.',
    entityType: 'physical-infra',
    multi: true,
    parentStep: 'departments',
    nameLabel: 'Item',
    defaultAsset: 'office-block',
    assetOptions: [
      { value: 'office-block', label: 'Building' },
      { value: 'van', label: 'Van' },
      { value: 'desk-cluster', label: 'Desk cluster' },
    ],
  },
  {
    id: 'annotations',
    title: 'Key questions',
    prompt: 'Add any key questions or notes as annotations on the map.',
    entityType: 'annotation',
    multi: true,
    nameLabel: 'Note',
    defaultAsset: 'callout',
  },
];

export function stepById(id: StepId): WizardStep | undefined {
  return WIZARD_STEPS.find((s) => s.id === id);
}
