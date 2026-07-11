import { describe, it, expect } from 'vitest';
import { presentSpotlight } from '../src/render/spotlight.ts';
import { createEmptyDocument, spotlightSet } from '../src/core/model.ts';
import type { Entity, SceneDocument } from '../src/core/model.ts';

function ent(partial: Partial<Entity> & { id: string; type: Entity['type'] }): Entity {
  return {
    label: partial.id,
    placement: { mode: 'grid', x: 0, y: 0, footprint: { w: 1, d: 1 } },
    asset: { symbol: 'x' },
    ...partial,
  };
}

function docWith(entities: Entity[]): SceneDocument {
  const d = createEmptyDocument('t', '2020-01-01T00:00:00.000Z');
  d.entities = entities;
  return d;
}

// presentSpotlight is a thin resolver over spotlightSet + a custom-layer filter.
// spotlightSet's semantics are covered in model.test.ts; here we verify the
// three branches of presentSpotlight itself: layer wins, entity delegates,
// nothing → undefined (no dimming).
describe('presentSpotlight', () => {
  it('returns undefined when nothing is spotlit (no dimming)', () => {
    const d = docWith([ent({ id: 'a', type: 'territory' })]);
    expect(presentSpotlight(d, {})).toBeUndefined();
  });

  it('layer spotlight lights exactly the entities in that custom layer', () => {
    const d = docWith([
      ent({ id: 'a', type: 'territory', customLayers: ['L1'] }),
      ent({ id: 'b', type: 'territory', customLayers: ['L1', 'L2'] }),
      ent({ id: 'c', type: 'user', customLayers: ['L2'] }),
      ent({ id: 'd', type: 'user' }),
    ]);
    const s = presentSpotlight(d, { layerId: 'L1' });
    expect(s).toEqual(new Set(['a', 'b']));
  });

  it('layer spotlight yields an empty set when no entity is in that layer', () => {
    const d = docWith([ent({ id: 'a', type: 'territory', customLayers: ['L1'] })]);
    const s = presentSpotlight(d, { layerId: 'nope' });
    expect(s).toEqual(new Set<string>());
  });

  it('layerId wins over entityId when both are set', () => {
    const d = docWith([
      ent({ id: 'a', type: 'territory', customLayers: ['L1'] }),
      ent({ id: 'b', type: 'territory' }),
    ]);
    // entityId 'b' would otherwise light only 'b'; layerId must take precedence.
    const s = presentSpotlight(d, { layerId: 'L1', entityId: 'b' });
    expect(s).toEqual(new Set(['a']));
  });

  it('entity spotlight delegates to spotlightSet', () => {
    const d = docWith([
      ent({ id: 'org', type: 'territory' }),
      ent({ id: 'dept', type: 'territory', parentId: 'org' }),
      ent({ id: 'team', type: 'territory', parentId: 'dept' }),
      ent({ id: 'team2', type: 'territory', parentId: 'dept' }),
      ent({ id: 'loner', type: 'user' }),
    ]);
    const s = presentSpotlight(d, { entityId: 'team' });
    expect(s).toEqual(spotlightSet(d, 'team'));
    // sanity: self + parents + sibling, but not the unrelated 'loner'.
    expect(s).toContain('team');
    expect(s).toContain('team2');
    expect(s).toContain('dept');
    expect(s).not.toContain('loner');
  });

  it('entity spotlight for a missing focal id yields an empty set', () => {
    const d = docWith([ent({ id: 'a', type: 'territory' })]);
    expect(presentSpotlight(d, { entityId: 'ghost' })).toEqual(new Set<string>());
  });
});
