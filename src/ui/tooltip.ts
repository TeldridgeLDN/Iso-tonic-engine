// Pure builder for the hover-tooltip inner HTML. Kept out of app.ts so the
// shell stays under the 500-line budget; testable without the DOM.

import type { Entity } from '../core/model.ts';
import { escapeHtml } from './dom.ts';

/**
 * Inner HTML for an entity's hover tooltip: label, type and optional
 * description. (The zone userGoal/orgGoal lines were removed with the
 * territory collapse, 2026-07.) All interpolated values are HTML-escaped.
 */
export function tooltipHtml(entity: Entity): string {
  const parts = [
    `<strong>${escapeHtml(entity.label)}</strong>`,
    `<span class="iso-tooltip-type">${escapeHtml(entity.type)}</span>`,
  ];
  if (entity.description) {
    parts.push(
      `<span class="iso-tooltip-desc">${escapeHtml(entity.description)}</span>`
    );
  }
  return parts.join('');
}
