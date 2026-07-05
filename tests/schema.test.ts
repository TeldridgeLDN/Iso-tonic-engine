import { describe, it, expect } from 'vitest';
import { validateDocument, migrate } from '../src/core/schema.ts';
import { createEmptyDocument } from '../src/core/model.ts';

function baseDoc(): Record<string, unknown> {
  return {
    version: 1,
    meta: {
      title: 't',
      created: '2020-01-01T00:00:00.000Z',
      modified: '2020-01-01T00:00:00.000Z',
    },
    layers: [],
    entities: [],
  };
}

function entity(over: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 'e',
    type: 'team',
    label: 'e',
    placement: { mode: 'grid', x: 0, y: 0, footprint: { w: 1, d: 1 } },
    asset: { symbol: 's' },
    ...over,
  };
}

describe('validateDocument — accept', () => {
  it('accepts an empty factory doc', () => {
    const res = validateDocument(createEmptyDocument('x', '2020-01-01T00:00:00.000Z'));
    expect(res.ok).toBe(true);
  });

  it('accepts a well-formed doc with entities & layers', () => {
    const doc = baseDoc();
    doc.layers = [{ id: 'L1', name: 'Layer', visible: true }];
    doc.entities = [
      entity({ id: 'a', customLayers: ['L1'] }),
      entity({ id: 'b', type: 'user', placement: { mode: 'free', x: 10, y: 20 }, parentId: 'a' }),
    ];
    const res = validateDocument(doc);
    expect(res.ok).toBe(true);
  });

  it('accepts rotation 0-3 on grid and free placements', () => {
    for (const r of [0, 1, 2, 3]) {
      const doc = baseDoc();
      doc.entities = [
        entity({ id: 'g', placement: { mode: 'grid', x: 0, y: 0, footprint: { w: 1, d: 1 }, rotation: r } }),
        entity({ id: 'f', type: 'user', placement: { mode: 'free', x: 0, y: 0, rotation: r } }),
      ];
      expect(validateDocument(doc).ok).toBe(true);
    }
  });

  it('accepts absent rotation (backward compatible)', () => {
    const doc = baseDoc();
    doc.entities = [entity({ id: 'a' })];
    expect(validateDocument(doc).ok).toBe(true);
  });

  it('accepts userGoal/orgGoal string fields', () => {
    const doc = baseDoc();
    doc.entities = [entity({ id: 'a', userGoal: 'apply for a grant', orgGoal: 'process claims' })];
    expect(validateDocument(doc).ok).toBe(true);
  });
});

describe('validateDocument — reject', () => {
  it('rejects wrong version', () => {
    const doc = baseDoc();
    doc.version = 2;
    const res = validateDocument(doc);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.some((e) => e.includes('version'))).toBe(true);
  });

  it('rejects duplicate entity ids', () => {
    const doc = baseDoc();
    doc.entities = [entity({ id: 'dup' }), entity({ id: 'dup' })];
    const res = validateDocument(doc);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.some((e) => e.includes('duplicate entity id'))).toBe(true);
  });

  it('rejects dangling parentId', () => {
    const doc = baseDoc();
    doc.entities = [entity({ id: 'a', parentId: 'ghost' })];
    const res = validateDocument(doc);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.some((e) => e.includes('missing entity "ghost"'))).toBe(true);
  });

  it('rejects a parentId cycle', () => {
    const doc = baseDoc();
    doc.entities = [
      entity({ id: 'a', parentId: 'b' }),
      entity({ id: 'b', parentId: 'a' }),
    ];
    const res = validateDocument(doc);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.some((e) => e.includes('cycle'))).toBe(true);
  });

  it('rejects a self-parent cycle', () => {
    const doc = baseDoc();
    doc.entities = [entity({ id: 'a', parentId: 'a' })];
    const res = validateDocument(doc);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.some((e) => e.includes('cycle'))).toBe(true);
  });

  it('rejects customLayers referencing a missing layer', () => {
    const doc = baseDoc();
    doc.entities = [entity({ id: 'a', customLayers: ['nope'] })];
    const res = validateDocument(doc);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.some((e) => e.includes('missing layer "nope"'))).toBe(true);
  });

  it('rejects invalid placement mode', () => {
    const doc = baseDoc();
    doc.entities = [entity({ id: 'a', placement: { mode: 'orbit', x: 0, y: 0 } })];
    const res = validateDocument(doc);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.some((e) => e.includes('mode'))).toBe(true);
  });

  it('rejects invalid entity type', () => {
    const doc = baseDoc();
    doc.entities = [entity({ id: 'a', type: 'dragon' })];
    const res = validateDocument(doc);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.some((e) => e.includes('EntityType'))).toBe(true);
  });

  it('rejects duplicate layer ids', () => {
    const doc = baseDoc();
    doc.layers = [
      { id: 'L', name: 'a', visible: true },
      { id: 'L', name: 'b', visible: true },
    ];
    const res = validateDocument(doc);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.some((e) => e.includes('duplicate layer id'))).toBe(true);
  });

  it('rejects rotation out of range (4)', () => {
    const doc = baseDoc();
    doc.entities = [
      entity({ id: 'a', placement: { mode: 'grid', x: 0, y: 0, footprint: { w: 1, d: 1 }, rotation: 4 } }),
    ];
    const res = validateDocument(doc);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.some((e) => e.includes('rotation'))).toBe(true);
  });

  it('rejects non-integer rotation', () => {
    const doc = baseDoc();
    doc.entities = [
      entity({ id: 'a', placement: { mode: 'free', x: 0, y: 0, rotation: 1.5 } }),
    ];
    const res = validateDocument(doc);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.some((e) => e.includes('rotation'))).toBe(true);
  });

  it('rejects non-string userGoal / orgGoal', () => {
    const doc = baseDoc();
    doc.entities = [entity({ id: 'a', userGoal: 42 })];
    const res = validateDocument(doc);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.some((e) => e.includes('userGoal'))).toBe(true);
  });
});

describe('validateDocument — warnings not errors', () => {
  it('warns on overlapping grid footprints but still accepts', () => {
    const doc = baseDoc();
    doc.entities = [
      entity({ id: 'a', placement: { mode: 'grid', x: 0, y: 0, footprint: { w: 2, d: 2 } } }),
      entity({ id: 'b', placement: { mode: 'grid', x: 1, y: 1, footprint: { w: 2, d: 2 } } }),
    ];
    const res = validateDocument(doc);
    expect(res.ok).toBe(true);
    expect(res.warnings.some((w) => w.includes('overlap'))).toBe(true);
  });

  it('overlap warnings use EFFECTIVE (rotated) footprints', () => {
    const doc = baseDoc();
    // a: 1x1 at (0,1). b: 2x1 at (0,0) rotation 1 → effective 1x2 → (0,0),(0,1)
    // overlaps a at (0,1). Unrotated b (0,0),(1,0) would NOT overlap.
    doc.entities = [
      entity({ id: 'a', placement: { mode: 'grid', x: 0, y: 1, footprint: { w: 1, d: 1 } } }),
      entity({ id: 'b', placement: { mode: 'grid', x: 0, y: 0, footprint: { w: 2, d: 1 }, rotation: 1 } }),
    ];
    const res = validateDocument(doc);
    expect(res.ok).toBe(true);
    expect(res.warnings.some((w) => w.includes('overlap'))).toBe(true);
  });

  it('does NOT warn when rotation makes footprints disjoint', () => {
    const doc = baseDoc();
    // a: 1x1 at (1,0). b: 2x1 at (0,0) rotation 1 → effective 1x2 → (0,0),(0,1)
    // disjoint from a. Unrotated b (0,0),(1,0) WOULD overlap a — rotation clears it.
    doc.entities = [
      entity({ id: 'a', placement: { mode: 'grid', x: 1, y: 0, footprint: { w: 1, d: 1 } } }),
      entity({ id: 'b', placement: { mode: 'grid', x: 0, y: 0, footprint: { w: 2, d: 1 }, rotation: 1 } }),
    ];
    const res = validateDocument(doc);
    expect(res.ok).toBe(true);
    expect(res.warnings.some((w) => w.includes('overlap'))).toBe(false);
  });
});

describe('unknown-field preservation through migrate + validate', () => {
  it('preserves unknown top-level and entity fields', () => {
    const doc = baseDoc();
    doc.experimentalFlag = 42;
    doc.entities = [entity({ id: 'a', futureProp: { nested: true } })];
    const migrated = migrate(doc);
    const res = validateDocument(migrated);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect((res.doc as Record<string, unknown>).experimentalFlag).toBe(42);
      const e = res.doc.entities[0] as Record<string, unknown>;
      expect(e.futureProp).toEqual({ nested: true });
    }
  });
});

describe('migrate', () => {
  it('passes v1 through unchanged (identity)', () => {
    const doc = baseDoc();
    expect(migrate(doc)).toBe(doc);
  });

  it('returns non-objects untouched', () => {
    expect(migrate(null)).toBe(null);
    expect(migrate(7)).toBe(7);
  });
});
