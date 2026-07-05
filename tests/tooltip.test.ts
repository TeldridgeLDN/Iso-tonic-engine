import { describe, it, expect } from 'vitest';
import { tooltipHtml } from '../src/ui/tooltip.ts';
import type { Entity } from '../src/core/model.ts';

function ent(over: Partial<Entity>): Entity {
  return {
    id: 'e',
    type: 'process',
    label: 'Order → cup',
    placement: { mode: 'grid', x: 0, y: 0, footprint: { w: 1, d: 1 } },
    asset: { symbol: 'process-zone' },
    ...over,
  } as Entity;
}

describe('tooltipHtml', () => {
  it('renders label + type, escaping HTML', () => {
    const html = tooltipHtml(ent({ label: '<b>x</b>' }));
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(html).toContain('iso-tooltip-type');
  });

  it('includes goal lines only when present', () => {
    const none = tooltipHtml(ent({}));
    expect(none).not.toContain('User goal:');
    expect(none).not.toContain('Org goal:');

    const both = tooltipHtml(
      ent({ userGoal: 'Coffee in under 3 minutes', orgGoal: 'Keep the line moving' })
    );
    expect(both).toContain('User goal: Coffee in under 3 minutes');
    expect(both).toContain('Org goal: Keep the line moving');
  });

  it('escapes goal text', () => {
    const html = tooltipHtml(ent({ userGoal: '<script>' }));
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
  });
});
