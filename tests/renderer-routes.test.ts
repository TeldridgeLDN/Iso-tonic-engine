import { describe, it, expect } from 'vitest';
import { renderSceneToString } from '../src/render/renderer.ts';
import { createEmptyDocument, byId } from '../src/core/model.ts';
import { tileToScreen, footprintBaseBBox } from '../src/core/iso.ts';
import type { Entity, GridPlacement, SceneDocument } from '../src/core/model.ts';
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
      ent({ id: 'scene', type: 'territory' }),
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

  it('anchors an entity stop badge horizontally at the anchor’s projected x', () => {
    const anchor = tileToScreen(2, 3); // (-32, 80)
    const doc = docWith([
      ent({
        id: 'g',
        type: 'territory',
        placement: { mode: 'grid', x: 2, y: 3, footprint: { w: 1, d: 1 } },
      }),
      route('r', [{ entityId: 'g' }, { x: 100, y: 100 }]),
    ]);
    const svg = renderSceneToString(doc);
    // The badge disc keeps the anchor's x (only its y drops below the sprite).
    expect(svg).toMatch(new RegExp(`cx="${anchor.x}" cy="[\\d.]+"`));
  });
});

describe('route rendering — entity-stop badge below the sprite (FEATURE 1)', () => {
  // Grid entity at (2,3), 1×1 footprint. Its anchor (badge/path convergence)
  // is the north vertex; the badge must drop below the footprint SOUTH corner.
  function dropDoc(footprint = { w: 1, d: 1 }): SceneDocument {
    return docWith([
      ent({
        id: 'g',
        type: 'territory',
        placement: { mode: 'grid', x: 2, y: 3, footprint },
      }),
      route('r', [{ entityId: 'g' }, { x: 100, y: 100 }]),
    ]);
  }

  /** cy of the badge disc whose cx equals `cx`. */
  function discCy(svg: string, cx: number): number {
    const m = new RegExp(`cx="${cx}" cy="(-?[\\d.]+)"`).exec(svg);
    if (!m) throw new Error(`no disc at cx=${cx}`);
    return Number(m[1]);
  }

  it('drops the entity-stop badge world-y below the footprint south corner', () => {
    const doc = dropDoc();
    const svg = renderSceneToString(doc);
    const anchor = tileToScreen(2, 3); // north vertex (== badge/path anchor)
    const southY = footprintBaseBBox(byId(doc, 'g')!.placement as GridPlacement).y +
      footprintBaseBBox(byId(doc, 'g')!.placement as GridPlacement).h; // south corner
    const cy = discCy(svg, anchor.x);
    expect(cy).toBeGreaterThan(southY); // sits below the front corner, clear of art
  });

  it('leaves the polyline vertex at the anchor (only the badge moves down)', () => {
    const svg = renderSceneToString(dropDoc());
    const anchor = tileToScreen(2, 3); // (-32, 80)
    // The path still converges on the un-dropped anchor point.
    expect(svg).toContain(`points="${anchor.x},${anchor.y} 100,100"`);
  });

  it('drops further for a deeper footprint (offset derived from the footprint)', () => {
    const shallow = discCy(renderSceneToString(dropDoc({ w: 1, d: 1 })), tileToScreen(2, 3).x);
    const deep = discCy(renderSceneToString(dropDoc({ w: 2, d: 3 })), tileToScreen(2, 3).x);
    expect(deep).toBeGreaterThan(shallow); // bigger footprint → badge drops further
  });

  it('never drops a free (xy) waypoint badge — it stays on its vertex', () => {
    const svg = renderSceneToString(dropDoc());
    // The second stop is the free point (100,100); its badge disc stays there.
    expect(svg).toContain('cx="100" cy="100"');
  });
});

describe('route rendering — hide a journey (FEATURE 2)', () => {
  function twoRouteDoc(): SceneDocument {
    return docWith([
      ent({ id: 'e', type: 'digital-infra', placement: { mode: 'grid', x: 0, y: 0, footprint: { w: 1, d: 1 } } }),
      route('rA', [{ entityId: 'e' }, { x: 100, y: 0 }], { label: 'Journey A' }),
      route('rB', [{ entityId: 'e' }, { x: 100, y: 50 }], { label: 'Journey B' }),
    ]);
  }

  it('omits a hidden route’s whole group (line + badges + label)', () => {
    const svg = renderSceneToString(twoRouteDoc(), { hiddenRouteIds: new Set(['rA']) });
    expect(svg).not.toContain('data-entity-id="rA"');
    expect(svg).not.toContain('>Journey A</text>');
  });

  it('leaves other routes rendered when one is hidden', () => {
    const svg = renderSceneToString(twoRouteDoc(), { hiddenRouteIds: new Set(['rA']) });
    expect(svg).toContain('data-entity-id="rB"');
    expect(svg).toContain('>Journey B</text>');
  });

  it('keeps fan-out lanes reserved: rB badge x is unchanged when rA is hidden', () => {
    const all = renderSceneToString(twoRouteDoc());
    const withHidden = renderSceneToString(twoRouteDoc(), { hiddenRouteIds: new Set(['rA']) });
    // rB is route #2; its shared-stop badge keeps the same offset x (lanes stay
    // reserved for the hidden rA — visible routes do not re-centre).
    expect(textX(withHidden, `2${DOT}1`)).toBe(textX(all, `2${DOT}1`));
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

const DOT = '·';

/** x attribute of the <text> whose content is exactly `label`. */
function textX(svg: string, label: string): number {
  const re = new RegExp(`<text x="(-?[\\d.]+)"[^>]*>${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</text>`);
  const m = re.exec(svg);
  if (!m) throw new Error(`no <text> found for label ${JSON.stringify(label)}`);
  return Number(m[1]);
}

/** Substring of the fragment for the <g> carrying data-entity-id="id". */
function groupSlice(svg: string, id: string): string {
  const start = svg.indexOf(`data-entity-id="${id}"`);
  if (start < 0) throw new Error(`no group for ${id}`);
  const next = svg.indexOf('data-entity-id="', start + 1);
  return svg.slice(start, next < 0 ? undefined : next);
}

describe('route rendering — compound badges', () => {
  it('uses plain "s" badges when the document has a single route', () => {
    const doc = docWith([
      route('r', [
        { x: 0, y: 0 },
        { x: 40, y: 20 },
      ]),
    ]);
    const svg = renderSceneToString(doc);
    expect(svg).toContain('>1</text>');
    expect(svg).toContain('>2</text>');
    expect(svg).not.toContain(DOT); // no compound "r·s" with one route
  });

  it('uses compound "r·s" badges when the document has more than one route', () => {
    const doc = docWith([
      route('r1', [
        { x: 0, y: 0 },
        { x: 40, y: 20 },
      ]),
      route('r2', [{ x: 80, y: 0 }]),
    ]);
    const svg = renderSceneToString(doc);
    expect(svg).toContain(`>1${DOT}1</text>`); // route 1, stop 1
    expect(svg).toContain(`>1${DOT}2</text>`); // route 1, stop 2
    expect(svg).toContain(`>2${DOT}1</text>`); // route 2, stop 1
    expect(svg).not.toContain('>1</text>'); // no plain badges in multi-route mode
  });

  it('numbers the route by its 1-based position among route entities in document order', () => {
    const doc = docWith([
      ent({ id: 'scene', type: 'territory' }), // non-route entities are ignored
      route('first', [{ x: 0, y: 0 }]),
      route('second', [{ x: 50, y: 0 }]),
    ]);
    const svg = renderSceneToString(doc);
    expect(svg).toContain(`>1${DOT}1</text>`); // 'first' → route index 1
    expect(svg).toContain(`>2${DOT}1</text>`); // 'second' → route index 2
  });
});

describe('route rendering — shared-stop fan-out', () => {
  // Anchor entity at grid (0,0) → tileToScreen(0,0) = (0,0). Two routes stop
  // there; a third stops elsewhere.
  function sharedDoc(): SceneDocument {
    return docWith([
      ent({ id: 'e', type: 'digital-infra', placement: { mode: 'grid', x: 0, y: 0, footprint: { w: 1, d: 1 } } }),
      route('rA', [{ entityId: 'e' }, { x: 100, y: 0 }]),
      route('rB', [{ entityId: 'e' }, { x: 100, y: 50 }]),
      route('rC', [
        { x: 200, y: 0 },
        { x: 200, y: 50 },
      ]),
    ]);
  }

  it('offsets each route’s badge at a shared entity stop to distinct, symmetric, ordered coordinates', () => {
    const svg = renderSceneToString(sharedDoc());
    const ax = textX(svg, `1${DOT}1`); // rA at 'e'
    const bx = textX(svg, `2${DOT}1`); // rB at 'e'
    expect(ax).not.toBe(bx); // no longer stacked
    expect(ax).toBeLessThan(bx); // deterministic: earlier route to the left
    expect(ax).toBeCloseTo(-bx, 6); // centred about the anchor (x=0)
  });

  it('leaves a route that does not share the stop unaffected (badge stays at its anchor)', () => {
    const svg = renderSceneToString(sharedDoc());
    // rC's first waypoint is the free point (200,0); it is in no shared group.
    expect(textX(svg, `3${DOT}1`)).toBe(200);
  });

  it('moves the path vertex together with its badge at a shared stop', () => {
    const svg = renderSceneToString(sharedDoc());
    const ax = textX(svg, `1${DOT}1`);
    // rA's polyline first vertex must carry the same offset as its badge.
    expect(groupSlice(svg, 'rA')).toContain(`points="${ax},0 100,0"`);
  });

  it('never offsets a free (non-entity-anchored) waypoint even under multi-route', () => {
    const svg = renderSceneToString(sharedDoc());
    // rA's second stop is a free point (100,0) shared with nobody → unmoved.
    expect(textX(svg, `1${DOT}2`)).toBe(100);
  });
});

describe('route rendering — spotlight dimming', () => {
  it('dims a route group that is not in the spotlight set', () => {
    const doc = docWith([
      route('r', [
        { x: 0, y: 0 },
        { x: 40, y: 20 },
      ]),
      ent({ id: 'other', type: 'territory' }),
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
