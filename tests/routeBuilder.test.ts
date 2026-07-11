import { describe, it, expect } from 'vitest';
import {
  routeStopFor,
  appendRouteStop,
  removeLastStop,
  buildRouteEntity,
  RouteBuilder,
  ROUTE_PREVIEW_ID,
} from '../src/ui/routeBuilder.ts';
import { PlaceEntity, UpdateEntityProps } from '../src/core/commands.ts';
import { tileToScreen } from '../src/core/iso.ts';
import { createEmptyDocument } from '../src/core/model.ts';
import type { Entity, RouteStop, SceneDocument } from '../src/core/model.ts';

function gridEntity(id: string, x: number, y: number): Entity {
  return {
    id,
    type: 'physical-infra',
    label: id,
    placement: { mode: 'grid', x, y, footprint: { w: 1, d: 1 } },
    asset: { symbol: 'server-rack' },
  };
}

function routeEntity(id: string, stops: RouteStop[]): Entity {
  return {
    id,
    type: 'route',
    label: id,
    placement: { mode: 'free', x: 0, y: 0 },
    asset: { symbol: 'route-path', params: { stops } },
  };
}

function docWith(...entities: Entity[]): SceneDocument {
  const doc = createEmptyDocument('t', '2026-01-01T00:00:00.000Z');
  return { ...doc, entities };
}

describe('routeStopFor — entity hit vs empty canvas', () => {
  it('anchors to a real non-route entity that was hit', () => {
    const doc = docWith(gridEntity('a', 2, 1));
    expect(routeStopFor(doc, 'a', { x: 999, y: 999 })).toEqual({ entityId: 'a' });
  });

  it('makes a free (rounded) stop on empty canvas (no hit id)', () => {
    const doc = docWith(gridEntity('a', 0, 0));
    expect(routeStopFor(doc, undefined, { x: 12.6, y: -4.2 })).toEqual({ x: 13, y: -4 });
  });

  it('never anchors to another route (falls through to a free stop)', () => {
    const doc = docWith(routeEntity('r1', [{ x: 1, y: 1 }]));
    expect(routeStopFor(doc, 'r1', { x: 5, y: 6 })).toEqual({ x: 5, y: 6 });
  });

  it('never anchors to the in-progress preview entity', () => {
    const doc = docWith(gridEntity('a', 0, 0));
    expect(routeStopFor(doc, ROUTE_PREVIEW_ID, { x: 7, y: 8 })).toEqual({ x: 7, y: 8 });
  });

  it('makes a free stop when the hit id is dangling (no such entity)', () => {
    const doc = docWith(gridEntity('a', 0, 0));
    expect(routeStopFor(doc, 'ghost', { x: 3, y: 4 })).toEqual({ x: 3, y: 4 });
  });
});

describe('appendRouteStop — consecutive dedupe (double-click safety)', () => {
  it('appends distinct stops in order', () => {
    let s: RouteStop[] = [];
    s = appendRouteStop(s, { entityId: 'a' });
    s = appendRouteStop(s, { x: 1, y: 2 });
    expect(s).toEqual([{ entityId: 'a' }, { x: 1, y: 2 }]);
  });

  it('collapses an immediate duplicate entity stop', () => {
    const s = appendRouteStop([{ entityId: 'a' }], { entityId: 'a' });
    expect(s).toEqual([{ entityId: 'a' }]);
  });

  it('collapses an immediate duplicate free stop', () => {
    const s = appendRouteStop([{ x: 5, y: 6 }], { x: 5, y: 6 });
    expect(s).toEqual([{ x: 5, y: 6 }]);
  });

  it('keeps a non-consecutive repeat', () => {
    const s = appendRouteStop([{ entityId: 'a' }, { x: 1, y: 1 }], { entityId: 'a' });
    expect(s).toEqual([{ entityId: 'a' }, { x: 1, y: 1 }, { entityId: 'a' }]);
  });
});

describe('buildRouteEntity — shape, label numbering, placement', () => {
  it('builds a schema-shaped route entity anchored at the first free stop', () => {
    const doc = docWith();
    const stops: RouteStop[] = [
      { x: 100, y: 50 },
      { x: 200, y: 80 },
    ];
    const e = buildRouteEntity(doc, stops, 'e1');
    expect(e.type).toBe('route');
    expect(e.label).toBe('Journey 1');
    expect(e.asset.symbol).toBe('route-path');
    expect(e.asset.params).toEqual({ stops });
    expect(e.placement).toEqual({ mode: 'free', x: 100, y: 50 });
  });

  it('numbers the label after existing routes', () => {
    const doc = docWith(routeEntity('r1', [{ x: 0, y: 0 }]));
    const e = buildRouteEntity(doc, [{ x: 1, y: 1 }], 'e2');
    expect(e.label).toBe('Journey 2');
  });

  it('resolves an entity-anchored first stop to that entity origin', () => {
    const doc = docWith(gridEntity('a', 2, 1));
    const e = buildRouteEntity(doc, [{ entityId: 'a' }, { x: 9, y: 9 }], 'e3');
    const origin = tileToScreen(2, 1);
    expect(e.placement).toEqual({ mode: 'free', x: origin.x, y: origin.y });
  });
});

describe('RouteBuilder controller', () => {
  it('accumulates stops and reports active', () => {
    const b = new RouteBuilder();
    expect(b.active).toBe(false);
    b.addStop({ entityId: 'a' });
    expect(b.active).toBe(true);
    expect(b.previewEntity()?.asset.params).toEqual({ stops: [{ entityId: 'a' }] });
  });

  it('finish emits exactly one PlaceEntity with the built route', () => {
    const doc = docWith();
    const b = new RouteBuilder();
    b.addStop({ x: 10, y: 20 });
    b.addStop({ x: 30, y: 40 });
    const result = b.finish(doc, 'e-route-1');
    expect(result).toBeDefined();
    expect(result!.command).toBeInstanceOf(PlaceEntity);
    // Applying the command inserts one route entity.
    const next = result!.command.apply(doc);
    expect(next.entities).toHaveLength(1);
    expect(next.entities[0]).toEqual(result!.entity);
    expect(next.entities[0].type).toBe('route');
  });

  it('finish with no stops yields no command', () => {
    const b = new RouteBuilder();
    expect(b.finish(docWith(), 'e-x')).toBeUndefined();
  });

  it('reset discards the in-progress route (Escape)', () => {
    const b = new RouteBuilder();
    b.addStop({ x: 1, y: 2 });
    b.reset();
    expect(b.active).toBe(false);
    expect(b.previewEntity()).toBeUndefined();
    expect(b.finish(docWith(), 'e-y')).toBeUndefined();
  });
});

describe('remove-last-stop (properties panel command)', () => {
  it('removeLastStop drops the trailing stop', () => {
    expect(removeLastStop([{ x: 1, y: 1 }, { entityId: 'a' }])).toEqual([{ x: 1, y: 1 }]);
  });

  it('UpdateEntityProps replaces the stops array as one undoable step', () => {
    const route = routeEntity('r1', [{ x: 1, y: 1 }, { entityId: 'a' }]);
    const doc = docWith(route);
    const cmd = new UpdateEntityProps('r1', { params: { stops: removeLastStop(route.asset.params!.stops as RouteStop[]) } });
    const next = cmd.apply(doc);
    expect((next.entities[0].asset.params as { stops: RouteStop[] }).stops).toEqual([{ x: 1, y: 1 }]);
    // Invert restores the original two-stop route.
    const back = cmd.invert(next);
    expect((back.entities[0].asset.params as { stops: RouteStop[] }).stops).toEqual([
      { x: 1, y: 1 },
      { entityId: 'a' },
    ]);
  });
});
