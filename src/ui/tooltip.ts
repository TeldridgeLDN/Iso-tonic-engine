// Pure builder for the hover-tooltip inner HTML. Kept out of app.ts so the
// shell stays under the 500-line budget; testable without the DOM.

import type { Entity } from '../core/model.ts';
import { escapeHtml } from './dom.ts';

/**
 * Inner HTML for an entity's hover tooltip: label, type, optional description,
 * and — when present — the user/organisation goals as two short lines (zones /
 * whole-services). Plain-text 'User goal:' / 'Org goal:' prefixes (no emoji
 * dependency). All interpolated values are HTML-escaped.
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
  if (entity.userGoal) {
    parts.push(
      `<span class="iso-tooltip-goal">User goal: ${escapeHtml(entity.userGoal)}</span>`
    );
  }
  if (entity.orgGoal) {
    parts.push(
      `<span class="iso-tooltip-goal">Org goal: ${escapeHtml(entity.orgGoal)}</span>`
    );
  }
  return parts.join('');
}
