// Written accessibility description of a scene, generated from the semantic
// model (docs/SCHEMA.md). Pure, deterministic, no DOM — a person's plain-text
// account of the map for a screen-reader / visually-impaired reader, NOT a data
// dump. Also feeds the export <desc> metadata and the legend panel.
//
// Structure (document order throughout):
//   1. Title + document description.
//   2. One paragraph per visible zone (organisation / department / process):
//      label, its goals, and what sits within it (children by parentId, grouped
//      by type with counts + labels).
//   3. User groups not parented to any zone, grouped by identical label ("×N").
//   4. "Key questions:" bullets from annotations.
//   5. Custom layers with member counts.

import type { Entity, EntityType, SceneDocument } from '../core/model.ts';
import { childrenOf, isEntityVisible } from '../core/model.ts';

// Zone types are the containers the Defra whole-services map is built around.
const ZONE_TYPES: readonly EntityType[] = ['organisation', 'department', 'process'];

// Human-readable, singular type names for prose. Plurals derived by +'s'.
const TYPE_NOUN: Record<EntityType, string> = {
  user: 'person',
  team: 'team',
  process: 'process zone',
  department: 'department',
  organisation: 'organisation',
  territory: 'territory',
  'physical-infra': 'physical item',
  'digital-infra': 'digital system',
  annotation: 'annotation',
  route: 'route',
};

// Order in which grouped child types are listed within a zone paragraph. Any
// type not listed falls back to document-encounter order after these.
const CHILD_TYPE_ORDER: readonly EntityType[] = [
  'user',
  'team',
  'department',
  'process',
  'physical-infra',
  'digital-infra',
];

export function isZone(entity: Entity): boolean {
  return ZONE_TYPES.includes(entity.type);
}

/** Visible entities only, preserving document order. */
export function visibleEntities(doc: SceneDocument): Entity[] {
  return doc.entities.filter((e) => isEntityVisible(doc, e));
}

function pluralNoun(type: EntityType, count: number): string {
  const noun = TYPE_NOUN[type];
  if (count === 1) return noun;
  // 'process zone' → 'process zones', 'person' → 'people'.
  if (type === 'user') return 'people';
  return `${noun}s`;
}

/**
 * Group a zone's visible children by type, in CHILD_TYPE_ORDER then document
 * order. Returns clauses like "staffed by Barista — Maya and Barista — Tom" /
 * "digital systems: EPOS till + card reader".
 */
function describeZoneChildren(doc: SceneDocument, zoneId: string): string {
  const children = childrenOf(doc, zoneId).filter((e) => isEntityVisible(doc, e));
  if (children.length === 0) return '';

  // Preserve document order within each type bucket.
  const byType = new Map<EntityType, Entity[]>();
  for (const child of children) {
    if (child.type === 'annotation') continue; // annotations handled separately
    const list = byType.get(child.type) ?? [];
    list.push(child);
    byType.set(child.type, list);
  }

  const orderedTypes = [
    ...CHILD_TYPE_ORDER.filter((t) => byType.has(t)),
    ...[...byType.keys()].filter((t) => !CHILD_TYPE_ORDER.includes(t)),
  ];

  const clauses: string[] = [];
  for (const type of orderedTypes) {
    const list = byType.get(type);
    if (!list || list.length === 0) continue;
    const labels = groupByLabel(list);
    const lead = type === 'user' ? 'staffed by ' : `${pluralNoun(type, list.length)}: `;
    clauses.push(lead + joinList(labels));
  }
  return clauses.join('; ');
}

/**
 * Collapse a list of entities into label phrases, merging identical labels into
 * "Label ×N" (document order of first appearance).
 */
function groupByLabel(entities: Entity[]): string[] {
  const counts = new Map<string, number>();
  const order: string[] = [];
  for (const e of entities) {
    const label = e.label || '(unlabelled)';
    if (!counts.has(label)) order.push(label);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return order.map((label) => {
    const n = counts.get(label) ?? 1;
    return n > 1 ? `${label} ×${n}` : label;
  });
}

/** Oxford-free natural list: "a", "a and b", "a, b and c". */
function joinList(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function goalSentence(zone: Entity): string {
  const parts: string[] = [];
  if (zone.userGoal) parts.push(`For the user: ${trimPeriod(zone.userGoal)}.`);
  if (zone.orgGoal) parts.push(`For the organisation: ${trimPeriod(zone.orgGoal)}.`);
  return parts.join(' ');
}

function trimPeriod(s: string): string {
  return s.replace(/[.\s]+$/, '');
}

/** One prose paragraph for a single zone. */
function describeZone(doc: SceneDocument, zone: Entity): string {
  const noun = TYPE_NOUN[zone.type];
  const sentences: string[] = [`${zone.label} is ${indefinite(noun)} ${noun}.`];

  if (zone.description) sentences.push(`${trimPeriod(zone.description)}.`);

  const goals = goalSentence(zone);
  if (goals) sentences.push(goals);

  const children = describeZoneChildren(doc, zone.id);
  if (children) sentences.push(`Within it: ${children}.`);
  else sentences.push('It has no items placed within it.');

  return sentences.join(' ');
}

function indefinite(noun: string): string {
  return /^[aeiou]/i.test(noun) ? 'an' : 'a';
}

/**
 * User-type entities with no parentId (or whose parent is not a visible zone),
 * grouped by identical label into "Label ×N". Document order of first label.
 */
function describeUnparentedUsers(doc: SceneDocument): string {
  const visible = visibleEntities(doc);
  const zoneIds = new Set(visible.filter(isZone).map((z) => z.id));
  const loose = visible.filter(
    (e) => e.type === 'user' && (e.parentId === undefined || !zoneIds.has(e.parentId))
  );
  if (loose.length === 0) return '';
  return joinList(groupByLabel(loose));
}

/** Annotation labels/texts as "Key questions" bullet strings. */
function annotationQuestions(doc: SceneDocument): string[] {
  return visibleEntities(doc)
    .filter((e) => e.type === 'annotation')
    .map((a) => {
      const params = a.asset.params as { text?: unknown } | undefined;
      const text = typeof params?.text === 'string' ? params.text : '';
      return text || a.label || '(annotation)';
    });
}

/** Custom layers (in document order) with count of visible member entities. */
function layerLines(doc: SceneDocument): string[] {
  const visible = visibleEntities(doc);
  return doc.layers.map((layer) => {
    const count = visible.filter((e) => e.customLayers?.includes(layer.id)).length;
    const label = layer.name || layer.id;
    const noun = count === 1 ? 'item' : 'items';
    return `${label} (${count} ${noun})`;
  });
}

/**
 * Build the full written description. Deterministic and byte-identical on
 * repeated calls for the same document.
 */
export function buildWrittenDescription(doc: SceneDocument): string {
  const blocks: string[] = [];

  // 1. Title + document description.
  const title = doc.meta.title || 'Untitled map';
  blocks.push(title);
  if (doc.meta.description) blocks.push(trimPeriod(doc.meta.description) + '.');

  // 2. Zone paragraphs (document order).
  const zones = visibleEntities(doc).filter(isZone);
  for (const zone of zones) blocks.push(describeZone(doc, zone));

  // 3. Unparented user groups.
  const loose = describeUnparentedUsers(doc);
  if (loose) blocks.push(`Also present, not tied to any zone: ${loose}.`);

  // 4. Key questions.
  const questions = annotationQuestions(doc);
  if (questions.length > 0) {
    blocks.push(['Key questions:', ...questions.map((q) => `• ${q}`)].join('\n'));
  }

  // 5. Custom layers.
  const layers = layerLines(doc);
  if (layers.length > 0) {
    blocks.push(['Layers:', ...layers.map((l) => `• ${l}`)].join('\n'));
  }

  return blocks.join('\n\n');
}
