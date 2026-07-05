// Data-driven interview step definitions. The wizard UI (wizard.ts) renders
// these; the pure builder (wizardBuild.ts) consumes the collected answers.
//
// Each step produces zero or more entities of a fixed EntityType. Multi-entry
// steps collect a list; the parentStep (if any) supplies a dropdown of choices
// drawn from entities created by an earlier step.
//
// DOMAIN AWARENESS (Wave 2): the FIRST step picks a service DOMAIN (high-street
// business / public service / office-based org / community service). The domain
// re-skins later steps — prompts, vocabulary, default assets, and whether the
// org/department steps speak in "zone" or "premises" language — via the
// per-domain overrides in DOMAIN_PROFILES. The base WIZARD_STEPS below are the
// public-service defaults; resolveSteps(domain) applies the overrides.

import type { EntityType } from '../core/model.ts';

export type StepId =
  | 'domain'
  | 'service'
  | 'organisations'
  | 'departments'
  | 'teams'
  | 'userGroups'
  | 'digitalSystems'
  | 'physicalInfra'
  | 'annotations';

export type ServiceDomain =
  | 'high-street'
  | 'public-service'
  | 'office'
  | 'community';

export interface DomainOption {
  value: ServiceDomain;
  label: string;
  blurb: string;
}

export const DOMAIN_OPTIONS: DomainOption[] = [
  {
    value: 'high-street',
    label: 'High-street business',
    blurb: 'A shop, café or premises serving walk-in customers.',
  },
  {
    value: 'public-service',
    label: 'Public service',
    blurb: 'A government or council service with departments and teams.',
  },
  {
    value: 'office',
    label: 'Office-based organisation',
    blurb: 'A company organised around teams and internal systems.',
  },
  {
    value: 'community',
    label: 'Community service',
    blurb: 'A charity, group or neighbourhood service.',
  },
];

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
  /** Multi-entry (list) vs single (service title/description, or the domain). */
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
  /**
   * When true, each row gains optional "user goal" / "org goal" inputs that feed
   * the produced entity's userGoal / orgGoal (zones / whole-services).
   */
  askGoals?: boolean;
}

// Base steps = public-service defaults. resolveSteps() overlays domain skins.
export const WIZARD_STEPS: WizardStep[] = [
  {
    id: 'domain',
    title: 'Service type',
    prompt: 'What kind of service is this? Your choice tailors the questions.',
    entityType: 'organisation', // domain is stored on meta, not an entity
    multi: false,
    nameLabel: 'Service type',
  },
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
    askGoals: true,
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
    askGoals: true,
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
    askGoals: true,
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

// ---------------------------------------------------------------------------
// Domain profiles — per-domain overrides overlaid onto the base steps.
// ---------------------------------------------------------------------------

/** A partial override applied to a base step for a given domain. */
type StepOverride = Partial<
  Pick<WizardStep, 'title' | 'prompt' | 'nameLabel' | 'defaultAsset' | 'assetOptions'>
>;

export interface DomainProfile {
  steps: Partial<Record<StepId, StepOverride>>;
}

/** Physical-infra asset menus reused across domains. */
const HIGH_STREET_INFRA: { value: string; label: string }[] = [
  { value: 'shop-front', label: 'Shop front' },
  { value: 'corner-shop', label: 'Corner shop' },
  { value: 'cafe-seating', label: 'Café seating' },
  { value: 'van', label: 'Van' },
];
const PUBLIC_INFRA: { value: string; label: string }[] = [
  { value: 'office-block', label: 'Office block' },
  { value: 'civic', label: 'Civic building' },
  { value: 'van', label: 'Van' },
];
const COMMUNITY_INFRA: { value: string; label: string }[] = [
  { value: 'house', label: 'House' },
  { value: 'market-stall', label: 'Market stall' },
  { value: 'cafe-seating', label: 'Café seating' },
];

export const DOMAIN_PROFILES: Record<ServiceDomain, DomainProfile> = {
  'high-street': {
    steps: {
      organisations: {
        title: 'The business',
        prompt: 'What business is this? Add the premises or brand.',
        nameLabel: 'Business',
      },
      departments: {
        title: 'Areas',
        prompt: 'What areas make up the premises (front of house, kitchen…)?',
        nameLabel: 'Area',
      },
      teams: {
        title: 'Staff',
        prompt: 'Who works here and what do they do?',
        nameLabel: 'Role / crew',
      },
      userGroups: {
        title: 'Customers',
        prompt: 'Add customer groups. Each headcount becomes that many people.',
        nameLabel: 'Customer group',
      },
      physicalInfra: {
        title: 'Premises & streetscape',
        prompt: 'Add the shopfront, seating, vehicles and street furniture.',
        defaultAsset: 'shop-front',
        assetOptions: HIGH_STREET_INFRA,
      },
    },
  },
  'public-service': {
    // The base steps already speak public-service (zone) language.
    steps: {
      physicalInfra: {
        defaultAsset: 'office-block',
        assetOptions: PUBLIC_INFRA,
      },
    },
  },
  office: {
    steps: {
      organisations: {
        title: 'The company',
        prompt: 'Which company or business unit is this?',
        nameLabel: 'Company / unit',
      },
      departments: {
        title: 'Departments',
        prompt: 'Which departments touch this service?',
        nameLabel: 'Department',
      },
      teams: {
        title: 'Teams',
        prompt: 'Which teams sit within each department?',
        nameLabel: 'Team',
      },
      userGroups: {
        title: 'People',
        prompt: 'Add the people. Each headcount becomes that many desks/figurines.',
        nameLabel: 'Group',
      },
      physicalInfra: {
        title: 'Workplace',
        prompt: 'Add office buildings, desks and other workplace infrastructure.',
        defaultAsset: 'office-block',
        assetOptions: [
          { value: 'office-block', label: 'Office block' },
          { value: 'desk-cluster', label: 'Desk cluster' },
          { value: 'meeting-table', label: 'Meeting table' },
        ],
      },
    },
  },
  community: {
    steps: {
      organisations: {
        title: 'The group',
        prompt: 'Which group, charity or community body runs this?',
        nameLabel: 'Group',
      },
      departments: {
        title: 'Strands',
        prompt: 'What strands or activities make up the service?',
        nameLabel: 'Strand',
      },
      teams: {
        title: 'Volunteers & staff',
        prompt: 'Who runs each strand — volunteers, staff, partners?',
        nameLabel: 'Team',
      },
      userGroups: {
        title: 'People served',
        prompt: 'Who does the service reach? Each headcount becomes that many people.',
        nameLabel: 'Community group',
      },
      physicalInfra: {
        title: 'Places & things',
        prompt: 'Add the venues, stalls and vehicles the service uses.',
        defaultAsset: 'house',
        assetOptions: COMMUNITY_INFRA,
      },
    },
  },
};

/**
 * The steps for a given domain: base WIZARD_STEPS with the domain's per-step
 * overrides applied. Undefined domain ⇒ base steps (public-service defaults).
 * Pure — returns a fresh array, never mutates WIZARD_STEPS.
 */
export function resolveSteps(domain: ServiceDomain | undefined): WizardStep[] {
  if (!domain) return WIZARD_STEPS.map((s) => ({ ...s }));
  const profile = DOMAIN_PROFILES[domain];
  return WIZARD_STEPS.map((s) => {
    const ov = profile?.steps[s.id];
    return ov ? { ...s, ...ov } : { ...s };
  });
}

export function stepById(id: StepId): WizardStep | undefined {
  return WIZARD_STEPS.find((s) => s.id === id);
}
