// Written accessibility description of a scene, generated from the semantic
// model (docs/SCHEMA.md). Pure, deterministic, no DOM — a person's plain-text
// account of the map for a screen-reader / visually-impaired reader, NOT a data
// dump. Also feeds the export <desc> metadata and the legend panel.
//
// Structure (document order throughout):
//   1. Title + document description.
//   2. People present, grouped by identical label ("×N").
//   3. "Key questions:" bullets from annotations.
//   4. Custom layers with member counts.
//
// The former per-zone paragraphs (organisation / department / process) were
// dropped when zone kinds collapsed into unlabeled territories (2026-07):
// a territory has no label or goals, so there is nothing to head a section.

import type { Entity, SceneDocument } from '../core/model.ts';
import { isEntityVisible } from '../core/model.ts';

/** Visible entities only, preserving document order. */
export function visibleEntities(doc: SceneDocument): Entity[] {
  return doc.entities.filter((e) => isEntityVisible(doc, e));
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

function trimPeriod(s: string): string {
  return s.replace(/[.\s]+$/, '');
}

/** All visible user-type entities, grouped by identical label into "Label ×N". */
function describePeople(doc: SceneDocument): string {
  const people = visibleEntities(doc).filter((e) => e.type === 'user');
  if (people.length === 0) return '';
  return joinList(groupByLabel(people));
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

  // 2. People present.
  const people = describePeople(doc);
  if (people) blocks.push(`People present: ${people}.`);

  // 3. Key questions.
  const questions = annotationQuestions(doc);
  if (questions.length > 0) {
    blocks.push(['Key questions:', ...questions.map((q) => `• ${q}`)].join('\n'));
  }

  // 4. Custom layers.
  const layers = layerLines(doc);
  if (layers.length > 0) {
    blocks.push(['Layers:', ...layers.map((l) => `• ${l}`)].join('\n'));
  }

  return blocks.join('\n\n');
}
