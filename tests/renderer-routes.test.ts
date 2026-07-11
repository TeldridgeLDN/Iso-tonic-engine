import { describe, it, expect } from 'vitest';
import { renderSceneToString } from '../src/render/renderer.ts';
import { createEmptyDocument } from '../src/core/model.ts';
import { tileToScreen } from '../src/core/iso.ts';
import type { Entity, SceneDocument } from '../src/core/model.ts';
import type { RouteStop } from '../src/core/model.ts';

function ent(partial: Partial<Entity> & { id: string; type: Entity['type'] }): Entity {
  return {
    label: partial.id,
    placement: { mode: 'grid', x: 0, y: 0, footprint: { w: 1, d: 1 } },
    asset: { symbol: 'x' },
    ...partial,
  };
}

function route(
  id: string,
  stops: RouteStop[],
  over: Partial<Entity> = {}
): Entity {
  return {
    id,
    type: 'route',
    label: id,
    placement: { mode: 'free', x: 0, y: 0 },
    asset: { symbol: 'route-path', params: { stops } },
    ...over,
  };
}

function docWith(entities: Entity[]): SceneDocument {
  const d = createEmptyDocument('t', '2020-01-01T00:00:00.000Z');
  d.entities = entities;
  return d;
}

/** Index of the wrapper <g> carrying data-entity-id="id" in the fragment. */
function gIndex(svg: string, id: string): number {
  return svg.indexOf(`data-entity-id="${id}"`);
}

describe('route rendering — depth band', () => {
  it('draws routes after scene entities but before annotations', () => {
    const doc = docWith([
      // authored out of render order to prove sorting, not input order, wins
      ent({ id: 'note', type: 'annotation', placement: { mode: 'free', x: 0, y: 0 } }),
      route('r', [
        { x: 0, y: 0 },
        { x: 40, y: 20 },
      ]),
      ent({ id: 'scene', type: 'process' }),
    ]);
    const svg = renderSceneToString(doc);
    const scene = gIndex(svg, 'scene');
    const r = gIndex(svg, 'r');
    const note = gIndex(svg, 'note');
    expect(scene).toBeGreaterThanOrEqual(0);
    expect(scene).toBeLessThan(r); // scene before route
    expect(r).toBeLessThan(note); // route before annotation
  });
});

describe('route rendering — path', () => {
  it('draws a dashed accent path over a white casing for >= 2 stops', () => {
    const doc = docWith([
      route('r', [
        { x: 0, y: 0 },
        { x: 40, y: 20 },
        { x: 80, y: 0 },
      ]),
    ]);
    const svg = renderSceneToString(doc);
    // dashed accent polyline
    expect(svg).toContain('stroke-dasharray="6 4"');
    expect(svg).toContain('stroke="#E8541D"'); // ACCENT
    // white casing beneath
    expect(svg).toContain('stroke="#FFFFFF"'); // PAPER casing
    // the polyline threads all three waypoints
    expect(svg).toContain('points="0,0 40,20 80,0"');
  });

  it('draws no path for a 1-stop route but still shows its badge', () => {
    const doc = docWith([route('r', [{ x: 10, y: 10 }])]);
    const svg = renderSceneToString(doc);
    expect(svg).not.toContain('stroke-dasharray');
    expect(svg).toContain('data-entity-id="r"');
    expect(svg).toContain('>1</text>'); // step badge 1
  });

  it('renders nothing but the wrapper <g> for an empty-stops route (no crash)', () => {
    const doc = docWith([
      route('r', [], { asset: { symbol: 'route-path', params: { stops: [] } } }),
    ]);
    const svg = renderSceneToString(doc);
    expect(svg).toContain('data-entity-id="r"');
    expect(svg).not.toContain('stroke-dasharray');
    expect(svg).not.toContain('</text>'); // no badges, no label
  });
});

describe('route rendering — badges', () => {
  it('numbers badges sequentially from 1', () => {
    const doc = docWith([
      route('r', [
        { x: 0, y: 0 },
        { x: 40, y: 20 },
        { x: 80, y: 0 },
      ]),
    ]);
    const svg = renderSceneToString(doc);
    expect(svg).toContain('>1</text>');
    expect(svg).toContain('>2</text>');
    expect(svg).toContain('>3</text>');
    expect(svg).not.toContain('>4</text>');
  });

  it('anchors an entity stop badge at the anchor entity’s projected position', () => {
    const anchor = tileToScreen(2, 3); // (-32, 80)
    const doc = docWith([
      ent({
        id: 'g',
        type: 'process',
        placement: { mode: 'grid', x: 2, y: 3, footprint: { w: 1, d: 1 } },
      }),
      route('r', [{ entityId: 'g' }, { x: 100, y: 100 }]),
    ]);
    const svg = renderSceneToString(doc);
    expect(svg).toContain(`cx="${anchor.x}" cy="${anchor.y}"`);
  });
});

describe('route rendering — label', () => {
  it('renders the route label as text', () => {
    const doc = docWith([
      route('checkout', [{ x: 0, y: 0 }], { label: 'Checkout journey' }),
    ]);
    const svg = renderSceneToString(doc);
    expect(svg).toContain('>Checkout journey</text>');
  });
});

describe('route rendering — spotlight dimming', () => {
  it('dims a route group that is not in the spotlight set', () => {
    const doc = docWith([
      route('r', [
        { x: 0, y: 0 },
        { x: 40, y: 20 },
      ]),
      ent({ id: 'other', type: 'process' }),
    ]);
    const svg = renderSceneToString(doc, { spotlightIds: new Set(['other']) });
    expect(svg).toContain('<g data-entity-id="r" opacity="0.15">');
  });

  it('does not dim a route group that is in the spotlight set', () => {
    const doc = docWith([
      route('r', [
        { x: 0, y: 0 },
        { x: 40, y: 20 },
      ]),
    ]);
    const svg = renderSceneToString(doc, { spotlightIds: new Set(['r']) });
    expect(svg).toContain('<g data-entity-id="r">');
  });
});
