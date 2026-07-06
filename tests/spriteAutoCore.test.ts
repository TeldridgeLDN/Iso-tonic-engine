import { describe, it, expect } from 'vitest';
import {
  basename,
  kebabId,
  parsePngName,
  parseJsonName,
  coerceSidecar,
  resolveSprite,
  groupSprites,
  resolveCollisions,
  SPRITE_DEFAULTS,
  type DiscoveredSprite,
} from '../src/assets/spriteAutoCore.ts';

describe('basename', () => {
  it('strips the sprites-dir glob prefix', () => {
    expect(basename('./sprites/demo-crate.png')).toBe('demo-crate.png');
    expect(basename('foo.png')).toBe('foo.png');
  });
});

describe('kebabId', () => {
  it('lower-cases and hyphenates spaces / underscores / camelCase', () => {
    expect(kebabId('demo-crate')).toBe('demo-crate');
    expect(kebabId('My_Desk')).toBe('my-desk');
    expect(kebabId('bookShelf')).toBe('book-shelf');
    expect(kebabId('Test Plant')).toBe('test-plant');
  });

  it('collapses repeats and trims edge hyphens', () => {
    expect(kebabId('__weird--name__')).toBe('weird-name');
    expect(kebabId('a  b')).toBe('a-b');
  });

  it('is deterministic and idempotent', () => {
    expect(kebabId(kebabId('My_Cool Thing'))).toBe('my-cool-thing');
  });
});

describe('parsePngName', () => {
  it('parses a base image (no orientation)', () => {
    expect(parsePngName('crate.png')).toEqual({ base: 'crate', orientation: null });
  });

  it('parses a .oN orientation variant', () => {
    expect(parsePngName('lorry.o2.png')).toEqual({ base: 'lorry', orientation: 2 });
    expect(parsePngName('lorry.o0.png')).toEqual({ base: 'lorry', orientation: 0 });
  });

  it('treats an out-of-range .oN as part of the base name', () => {
    expect(parsePngName('thing.o9.png')).toEqual({ base: 'thing.o9', orientation: null });
  });

  it('returns null for non-png', () => {
    expect(parsePngName('crate.json')).toBeNull();
    expect(parsePngName('crate')).toBeNull();
  });
});

describe('parseJsonName', () => {
  it('returns the base for a json, null otherwise', () => {
    expect(parseJsonName('desk.json')).toBe('desk');
    expect(parseJsonName('desk.png')).toBeNull();
  });
});

describe('coerceSidecar', () => {
  it('keeps well-formed fields', () => {
    expect(
      coerceSidecar({ footprint: { w: 2, d: 3 }, widthPx: 48, category: 'prop', anchor: { dx: 1, dy: -2 } })
    ).toEqual({ footprint: { w: 2, d: 3 }, widthPx: 48, category: 'prop', anchor: { dx: 1, dy: -2 } });
  });

  it('drops malformed / partial fields without throwing', () => {
    expect(coerceSidecar({ footprint: { w: 'x', d: 3 }, widthPx: -1, category: 5 })).toEqual({});
    expect(coerceSidecar(null)).toEqual({});
    expect(coerceSidecar('nonsense')).toEqual({});
    expect(coerceSidecar({ anchor: { dx: 1 } })).toEqual({}); // dy missing
  });
});

describe('resolveSprite', () => {
  it('applies defaults when no sidecar', () => {
    const s = resolveSprite('crate', ['data:img'], undefined);
    expect(s).toEqual({
      id: 'crate',
      category: SPRITE_DEFAULTS.category,
      footprint: SPRITE_DEFAULTS.footprint,
      widthPx: SPRITE_DEFAULTS.widthPx,
      anchor: SPRITE_DEFAULTS.anchor,
      images: ['data:img', undefined, undefined, undefined],
    });
  });

  it('sidecar overrides win over defaults', () => {
    const s = resolveSprite('desk', ['data:img'], { footprint: { w: 2, d: 1 }, widthPx: 128 });
    expect(s.footprint).toEqual({ w: 2, d: 1 });
    expect(s.widthPx).toBe(128);
    expect(s.category).toBe('prop'); // untouched default
  });

  it('throws if the base (o0) image is missing', () => {
    expect(() => resolveSprite('x', [undefined], undefined)).toThrow();
  });
});

describe('groupSprites', () => {
  it('groups a lone base png with defaults', () => {
    const out = groupSprites({ './sprites/crate.png': 'data:crate' }, {});
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('crate');
    expect(out[0].images[0]).toBe('data:crate');
    expect(out[0].footprint).toEqual({ w: 1, d: 1 });
  });

  it('merges a same-basename sidecar', () => {
    const out = groupSprites(
      { './sprites/plant.png': 'data:plant' },
      { './sprites/plant.json': { footprint: { w: 2, d: 3 } } }
    );
    expect(out[0].footprint).toEqual({ w: 2, d: 3 });
  });

  it('collects per-orientation variants under one id', () => {
    const out = groupSprites(
      {
        './sprites/lorry.png': 'data:base',
        './sprites/lorry.o1.png': 'data:o1',
        './sprites/lorry.o3.png': 'data:o3',
      },
      {}
    );
    expect(out).toHaveLength(1);
    expect(out[0].images).toEqual(['data:base', 'data:o1', undefined, 'data:o3']);
  });

  it('falls back o0 to the lowest variant when no base png exists', () => {
    const out = groupSprites({ './sprites/x.o1.png': 'data:o1', './sprites/x.o2.png': 'data:o2' }, {});
    expect(out[0].images[0]).toBe('data:o1'); // lowest present fills slot 0
  });

  it('sorts output by id deterministically', () => {
    const out = groupSprites({ './sprites/zeta.png': 'z', './sprites/alpha.png': 'a' }, {});
    expect(out.map((s) => s.id)).toEqual(['alpha', 'zeta']);
  });
});

describe('resolveCollisions', () => {
  const mk = (id: string): DiscoveredSprite => ({
    id,
    category: 'prop',
    footprint: { w: 1, d: 1 },
    widthPx: 64,
    anchor: { dx: 0, dy: 0 },
    images: ['data:x', undefined, undefined, undefined],
  });

  it('hand-registered ids win; colliding sprites are dropped', () => {
    const { kept, dropped } = resolveCollisions([mk('desk'), mk('plant')], new Set(['desk']));
    expect(kept.map((s) => s.id)).toEqual(['plant']);
    expect(dropped).toEqual(['desk']);
  });

  it('keeps all when no collision', () => {
    const { kept, dropped } = resolveCollisions([mk('a'), mk('b')], new Set(['z']));
    expect(kept).toHaveLength(2);
    expect(dropped).toEqual([]);
  });
});
