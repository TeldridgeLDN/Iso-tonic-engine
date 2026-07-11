import { describe, it, expect } from 'vitest';
import { tooltipHtml } from '../src/ui/tooltip.ts';
import type { Entity } from '../src/core/model.ts';

function ent(over: Partial<Entity>): Entity {
  return {
    id: 'e',
    type: 'territory',
    label: 'Order → cup',
    placement: { mode: 'grid', x: 0, y: 0, footprint: { w: 1, d: 1 } },
    asset: { symbol: 'territory' },
    ...over,
  } as Entity;
}

describe('tooltipHtml', () => {
  it('renders label + type, escaping HTML', () => {
    const html = tooltipHtml(ent({ label: '<b>x</b>' }));
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(html).toContain('iso-tooltip-type');
  });

  // Goal lines were removed with the territory contract: even a legacy entity
  // still carrying stray goal fields must render no goal lines.
  it('renders no goal lines, even for legacy goal fields', () => {
    const html = tooltipHtml(
      ent({ userGoal: 'Coffee in under 3 minutes', orgGoal: 'Keep the line moving' })
    );
    expect(html).not.toContain('User goal:');
    expect(html).not.toContain('Org goal:');
  });

  it('escapes description text', () => {
    const html = tooltipHtml(ent({ description: '<script>' }));
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
  });
});
