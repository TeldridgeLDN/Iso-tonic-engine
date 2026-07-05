import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildWrittenDescription } from '../src/io/description.ts';
import {
  wrapText,
  panelWidth,
  extendBBoxForLegend,
  buildLegendModel,
  renderLegendPanel,
  PANEL_MIN_W,
  PANEL_MAX_W,
  PANEL_GAP,
} from '../src/io/legend.ts';
import {
  metadataBlock,
  assembleSvgWithMeta,
  computeBBox,
  type BBox,
} from '../src/io/svg-prep.ts';
import { createEmptyDocument } from '../src/core/model.ts';
import type { Entity, SceneDocument } from '../src/core/model.ts';

// ---------------------------------------------------------------------------
// Fixture: the-corner-grind.iso.json (goals, presets, layers, annotations)
// ---------------------------------------------------------------------------

function loadCornerGrind(): SceneDocument {
  const url = new URL('../examples/the-corner-grind.iso.json', import.meta.url);
  return JSON.parse(readFileSync(fileURLToPath(url), 'utf8')) as SceneDocument;
}

// Minimal typed entity builder for synthetic docs.
function ent(e: Partial<Entity> & { id: string; type: Entity['type']; label: string }): Entity {
  return {
    placement: { mode: 'free', x: 0, y: 0 },
    asset: { symbol: 'x' },
    ...e,
  } as Entity;
}

function docWith(entities: Entity[], extra: Partial<SceneDocument> = {}): SceneDocument {
  const base = createEmptyDocument('Test Map', '2026-07-05T00:00:00.000Z');
  return { ...base, entities, ...extra };
}

// ---------------------------------------------------------------------------
// buildWrittenDescription
// ---------------------------------------------------------------------------

describe('buildWrittenDescription', () => {
  it('opens with the title and document description', () => {
    const doc = docWith([], {
      meta: {
        title: 'My Service',
        description: 'A short description',
        created: 'x',
        modified: 'x',
      },
    });
    const out = buildWrittenDescription(doc);
    expect(out.startsWith('My Service\n\nA short description.')).toBe(true);
  });

  it('describes a zone with both goals and its grouped children', () => {
    const doc = docWith([
      ent({
        id: 'org',
        type: 'organisation',
        label: 'Acme',
        userGoal: 'Get served fast',
        orgGoal: 'Stay profitable',
      }),
      ent({ id: 'u1', type: 'user', label: 'Barista — Maya', parentId: 'org' }),
      ent({ id: 'u2', type: 'user', label: 'Barista — Tom', parentId: 'org' }),
      ent({ id: 'd1', type: 'digital-infra', label: 'EPOS till', parentId: 'org' }),
    ]);
    const out = buildWrittenDescription(doc);
    expect(out).toContain('Acme is an organisation.');
    expect(out).toContain('For the user: Get served fast.');
    expect(out).toContain('For the organisation: Stay profitable.');
    // Children grouped by type: users under "staffed by", digital listed.
    expect(out).toContain('staffed by Barista — Maya and Barista — Tom');
    expect(out).toContain('digital system: EPOS till');
  });

  it('reports an empty zone honestly', () => {
    const doc = docWith([ent({ id: 'z', type: 'process', label: 'Lonely zone' })]);
    const out = buildWrittenDescription(doc);
    expect(out).toContain('It has no items placed within it.');
  });

  it('groups unparented users by identical label with ×N', () => {
    const doc = docWith([
      ent({ id: 'r1', type: 'user', label: 'Takeaway rush' }),
      ent({ id: 'r2', type: 'user', label: 'Takeaway rush' }),
      ent({ id: 'r3', type: 'user', label: 'Takeaway rush' }),
      ent({ id: 's1', type: 'user', label: 'Regular' }),
    ]);
    const out = buildWrittenDescription(doc);
    expect(out).toContain('Takeaway rush ×3');
    expect(out).toContain('Regular'); // count 1 → no ×N
    expect(out).not.toContain('Regular ×1');
  });

  it('renders annotations as Key questions bullets', () => {
    const doc = docWith([
      ent({
        id: 'a1',
        type: 'annotation',
        label: 'Q',
        asset: { symbol: 'callout', params: { text: 'Will it scale?' } },
      }),
    ]);
    const out = buildWrittenDescription(doc);
    expect(out).toContain('Key questions:');
    expect(out).toContain('• Will it scale?');
  });

  it('lists custom layers with member counts', () => {
    const doc = docWith(
      [
        ent({ id: 'e1', type: 'user', label: 'A', customLayers: ['foh'] }),
        ent({ id: 'e2', type: 'user', label: 'B', customLayers: ['foh'] }),
      ],
      { layers: [{ id: 'foh', name: 'Front of house', visible: true }] }
    );
    const out = buildWrittenDescription(doc);
    expect(out).toContain('Layers:');
    expect(out).toContain('• Front of house (2 items)');
  });

  it('excludes entities on a hidden custom layer', () => {
    const doc = docWith(
      [
        ent({ id: 'org', type: 'organisation', label: 'Acme' }),
        ent({ id: 'v', type: 'user', label: 'Visible worker', parentId: 'org' }),
        ent({
          id: 'h',
          type: 'user',
          label: 'Hidden worker',
          parentId: 'org',
          customLayers: ['secret'],
        }),
      ],
      { layers: [{ id: 'secret', name: 'Secret', visible: false }] }
    );
    const out = buildWrittenDescription(doc);
    expect(out).toContain('Visible worker');
    expect(out).not.toContain('Hidden worker');
  });

  it('excludes entities on a hidden type layer', () => {
    const doc = docWith(
      [
        ent({ id: 'org', type: 'organisation', label: 'Acme' }),
        ent({ id: 'u', type: 'user', label: 'Person', parentId: 'org' }),
      ],
      { typeLayerVisibility: { user: false } }
    );
    const out = buildWrittenDescription(doc);
    expect(out).not.toContain('Person');
    expect(out).toContain('It has no items placed within it.');
  });

  it('is deterministic (byte-identical on repeated calls)', () => {
    const doc = loadCornerGrind();
    expect(buildWrittenDescription(doc)).toBe(buildWrittenDescription(doc));
  });

  it('does not crash on an empty document', () => {
    const doc = createEmptyDocument('Empty', 'x');
    const out = buildWrittenDescription(doc);
    expect(out).toContain('Empty');
    expect(typeof out).toBe('string');
  });

  it('produces the expected shape for the Corner Grind fixture', () => {
    const out = buildWrittenDescription(loadCornerGrind());
    expect(out).toContain('The Corner Grind is an organisation.');
    expect(out).toContain('staffed by Barista — Maya, Barista — Tom, Kitchen — Sam and Owner-manager — Priya');
    expect(out).toContain('Order → cup is a process zone.');
    expect(out).toContain('Also present, not tied to any zone: Takeaway rush ×3, Regular ×3, Remote worker ×2 and Delivery driver.');
    expect(out).toContain('• How do regulars and remote workers share the tables at peak?');
    expect(out).toContain('• Front of house (12 items)');
  });
});

// ---------------------------------------------------------------------------
// Legend: text wrapping
// ---------------------------------------------------------------------------

describe('wrapText', () => {
  it('greedy-wraps to the column budget without dropping words', () => {
    const lines = wrapText('the quick brown fox jumps over the lazy dog', 15);
    for (const l of lines) expect(l.length).toBeLessThanOrEqual(15);
    expect(lines.join(' ')).toBe('the quick brown fox jumps over the lazy dog');
  });

  it('preserves explicit newlines as paragraph breaks', () => {
    expect(wrapText('a\nb', 40)).toEqual(['a', 'b']);
  });

  it('places an over-long word on its own line', () => {
    const lines = wrapText('short supercalifragilistic end', 10);
    expect(lines).toContain('supercalifragilistic');
  });

  it('returns a single empty line for empty input', () => {
    expect(wrapText('', 40)).toEqual(['']);
  });
});

// ---------------------------------------------------------------------------
// Legend: panel width + extended bbox maths
// ---------------------------------------------------------------------------

describe('panelWidth', () => {
  it('is one third of map width, clamped to [MIN, MAX]', () => {
    // width 900 → third 300, in range
    expect(panelWidth({ minX: 0, minY: 0, maxX: 900, maxY: 100 })).toBe(300);
    // narrow map → clamps up to MIN
    expect(panelWidth({ minX: 0, minY: 0, maxX: 100, maxY: 100 })).toBe(PANEL_MIN_W);
    // huge map → clamps down to MAX
    expect(panelWidth({ minX: 0, minY: 0, maxX: 6000, maxY: 100 })).toBe(PANEL_MAX_W);
  });

  it('falls back to MIN for a null bbox', () => {
    expect(panelWidth(null)).toBe(PANEL_MIN_W);
  });
});

describe('extendBBoxForLegend', () => {
  it('extends the bbox to the right by GAP + width, height unchanged', () => {
    const bbox: BBox = { minX: 0, minY: 0, maxX: 200, maxY: 150 };
    const layout = extendBBoxForLegend(bbox, 300);
    expect(layout.ruleX).toBe(200 + PANEL_GAP);
    expect(layout.panelX).toBe(200 + PANEL_GAP);
    expect(layout.extendedBBox.maxX).toBe(200 + PANEL_GAP + 300);
    expect(layout.extendedBBox.minY).toBe(0);
    expect(layout.extendedBBox.maxY).toBe(150);
    expect(layout.extendedBBox.minX).toBe(0);
  });

  it('handles a null bbox without crashing', () => {
    const layout = extendBBoxForLegend(null, PANEL_MIN_W);
    expect(layout.extendedBBox.maxX).toBeGreaterThan(layout.panelX);
  });
});

// ---------------------------------------------------------------------------
// Legend: model + panel fragment
// ---------------------------------------------------------------------------

describe('buildLegendModel + renderLegendPanel', () => {
  it('models title, description, zones and layers from the fixture', () => {
    const model = buildLegendModel(loadCornerGrind());
    expect(model.title).toBe('The Corner Grind');
    expect(model.description).toContain('coffeeshop');
    const zoneLabels = model.zones.map((z) => z.label);
    expect(zoneLabels).toContain('The Corner Grind');
    expect(zoneLabels).toContain('Order → cup');
    expect(model.layers.some((l) => l.startsWith('Front of house'))).toBe(true);
  });

  it('renders a panel fragment inside the extended bbox, INK text + ACCENT rule', () => {
    const doc = loadCornerGrind();
    const fragment = computeBBox('<polygon points="0,0 200,150"/>'); // dummy, unused
    void fragment;
    const bbox: BBox = { minX: -200, minY: -50, maxX: 300, maxY: 250 };
    const width = panelWidth(bbox);
    const layout = extendBBoxForLegend(bbox, width);
    const svg = renderLegendPanel(buildLegendModel(doc), layout, bbox);

    // The only accent use is the separating rule.
    expect(svg).toContain('stroke="#E8541D"');
    expect(svg).toContain('fill="#1A1A1A"'); // INK text
    expect(svg).toContain('The Corner Grind');

    // All emitted text x-coords sit within the panel field, never in the map.
    const xs = [...svg.matchAll(/<text x="([-\d.]+)"/g)].map((m) => Number(m[1]));
    expect(xs.length).toBeGreaterThan(0);
    for (const x of xs) {
      expect(x).toBeGreaterThanOrEqual(layout.panelX);
      expect(x).toBeLessThanOrEqual(layout.panelX + width);
    }
  });
});

// ---------------------------------------------------------------------------
// SVG metadata injection + legend-aware assembly
// ---------------------------------------------------------------------------

describe('metadataBlock + assembleSvgWithMeta', () => {
  it('emits escaped <title>/<desc> as the first children', () => {
    const block = metadataBlock('A & B', 'x < y');
    expect(block).toBe('<title>A &amp; B</title><desc>x &lt; y</desc>');
  });

  it('injects <title>/<desc> right after the opening <svg>', () => {
    const svg = assembleSvgWithMeta('<polygon points="0,0"/>', {
      minX: 0,
      minY: 0,
      maxX: 10,
      maxY: 10,
    }, { title: 'T', desc: 'D' });
    const idx = svg.indexOf('<title>T</title><desc>D</desc>');
    expect(idx).toBeGreaterThan(0);
    // Before the white bg rect and the fragment.
    expect(idx).toBeLessThan(svg.indexOf('<rect'));
    expect(idx).toBeLessThan(svg.indexOf('<polygon'));
  });

  it('uses the extended bbox for the viewBox and appends the legend fragment', () => {
    const bbox: BBox = { minX: 0, minY: 0, maxX: 100, maxY: 100 };
    const layout = extendBBoxForLegend(bbox, 300);
    const svg = assembleSvgWithMeta('<polygon points="0,0"/>', bbox, {
      title: 'T',
      desc: 'D',
      extendedBBox: layout.extendedBBox,
      legendFragment: '<g data-legend="1"></g>',
    });
    expect(svg).toContain('data-legend="1"');
    // viewBox width must span the extended bbox (+ 2× margin), so > 300.
    const m = /viewBox="[-\d.]+ [-\d.]+ ([-\d.]+) /.exec(svg);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeGreaterThan(300 + PANEL_GAP);
  });
});
