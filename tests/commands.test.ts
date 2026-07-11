import { describe, it, expect } from 'vitest';
import {
  PlaceEntity,
  DeleteEntity,
  MoveEntity,
  RotateEntity,
  UpdateEntityProps,
  AssignLayers,
  AddLayer,
  RemoveLayer,
  SetLayerVisibility,
  SetTypeLayerVisibility,
  UpsertFigurinePreset,
  CompoundCommand,
  History,
} from '../src/core/commands.ts';
import type { Command } from '../src/core/commands.ts';
import { createEmptyDocument } from '../src/core/model.ts';
import type {
  SceneDocument,
  Entity,
  FigurineParams,
} from '../src/core/model.ts';

function ent(id: string, over: Partial<Entity> = {}): Entity {
  return {
    id,
    type: 'territory',
    label: id,
    placement: { mode: 'grid', x: 0, y: 0, footprint: { w: 1, d: 1 } },
    asset: { symbol: 's' },
    ...over,
  };
}

function fixture(): SceneDocument {
  const d = createEmptyDocument('t', '2020-01-01T00:00:00.000Z');
  d.layers = [
    { id: 'L1', name: 'one', visible: true },
    { id: 'L2', name: 'two', visible: true },
  ];
  d.entities = [
    ent('a', { customLayers: ['L1', 'L2'] }),
    ent('b', { type: 'user', placement: { mode: 'free', x: 5, y: 6 }, parentId: 'a' }),
  ];
  d.typeLayerVisibility = { team: true };
  d.figurinePresets = { p0: figParams('tone-1') };
  return d;
}

function figParams(skin: string): FigurineParams {
  return { skin, hairStyle: 'short', hairColor: 'c', top: 'shirt', bottom: 'trousers' };
}

/** apply then invert must return a deep-equal document. */
function assertInverts(cmd: Command, doc: SceneDocument): void {
  const applied = cmd.apply(doc);
  const reverted = cmd.invert(applied);
  expect(reverted).toEqual(doc);
}

describe('immutability', () => {
  it('apply returns a new document object', () => {
    const d = fixture();
    const cmd = new MoveEntity('a', { mode: 'grid', x: 9, y: 9, footprint: { w: 1, d: 1 } });
    const d2 = cmd.apply(d);
    expect(d2).not.toBe(d);
    expect(d.entities.find((e) => e.id === 'a')!.placement).toEqual({
      mode: 'grid',
      x: 0,
      y: 0,
      footprint: { w: 1, d: 1 },
    });
  });
});

describe('every command inverts', () => {
  it('PlaceEntity', () => {
    assertInverts(new PlaceEntity(ent('c')), fixture());
  });

  it('DeleteEntity restores at original index', () => {
    const d = fixture();
    const cmd = new DeleteEntity('a');
    assertInverts(cmd, d);
  });

  it('DeleteEntity of last element', () => {
    assertInverts(new DeleteEntity('b'), fixture());
  });

  it('MoveEntity (grid)', () => {
    assertInverts(
      new MoveEntity('a', { mode: 'grid', x: 4, y: 5, footprint: { w: 2, d: 2 } }),
      fixture()
    );
  });

  it('MoveEntity (free)', () => {
    assertInverts(new MoveEntity('b', { mode: 'free', x: 99, y: 12 }), fixture());
  });

  it('RotateEntity (grid, from absent/0 → 1)', () => {
    assertInverts(new RotateEntity({ entityId: 'a', from: 0, to: 1 }), fixture());
  });

  it('RotateEntity (free placement)', () => {
    assertInverts(new RotateEntity({ entityId: 'b', from: 0, to: 3 }), fixture());
  });

  it('RotateEntity sets placement.rotation and round-trips', () => {
    const d = fixture();
    const cmd = new RotateEntity({ entityId: 'a', from: 0, to: 2 });
    const applied = cmd.apply(d);
    const pa = applied.entities.find((e) => e.id === 'a')!.placement;
    expect(pa.rotation).toBe(2);
    const reverted = cmd.invert(applied);
    const pr = reverted.entities.find((e) => e.id === 'a')!.placement;
    // original 'a' had no rotation key → invert restores it absent, not 0.
    expect(pr.rotation).toBeUndefined();
    // preserves footprint and coords (grid)
    expect(pr).toMatchObject({ mode: 'grid', x: 0, y: 0, footprint: { w: 1, d: 1 } });
  });

  it('RotateEntity when a prior rotation exists (2 → 3) restores 2 on invert', () => {
    const d = fixture();
    d.entities = d.entities.map((e) =>
      e.id === 'a'
        ? { ...e, placement: { mode: 'grid', x: 0, y: 0, footprint: { w: 1, d: 1 }, rotation: 2 } }
        : e
    );
    assertInverts(new RotateEntity({ entityId: 'a', from: 2, to: 3 }), d);
  });

  // (The two UpdateEntityProps userGoal/orgGoal tests were deleted with the
  // territory contract: the goal patch fields were removed from the command.)

  it('UpdateEntityProps (label/description/params)', () => {
    assertInverts(
      new UpdateEntityProps('a', {
        label: 'renamed',
        description: 'desc',
        params: { color: 'red' },
      }),
      fixture()
    );
  });

  it('UpdateEntityProps clearing parentId', () => {
    assertInverts(new UpdateEntityProps('b', { parentId: null }), fixture());
  });

  it('UpdateEntityProps setting parentId', () => {
    assertInverts(new UpdateEntityProps('a', { parentId: 'b' }), fixture());
  });

  it('AssignLayers (replacing existing)', () => {
    assertInverts(new AssignLayers('a', ['L1']), fixture());
  });

  it('AssignLayers (adding to entity with none)', () => {
    assertInverts(new AssignLayers('b', ['L1']), fixture());
  });

  it('AddLayer', () => {
    assertInverts(new AddLayer({ id: 'L3', name: 'three', visible: true }), fixture());
  });

  it('RemoveLayer strips id from entities and restores on invert', () => {
    const d = fixture();
    const cmd = new RemoveLayer('L1');
    const applied = cmd.apply(d);
    // L1 gone from layers and from entity a
    expect(applied.layers.find((l) => l.id === 'L1')).toBeUndefined();
    expect(applied.entities.find((e) => e.id === 'a')!.customLayers).toEqual(['L2']);
    // invert restores
    const reverted = cmd.invert(applied);
    expect(reverted).toEqual(d);
  });

  it('SetLayerVisibility', () => {
    assertInverts(new SetLayerVisibility('L1', false), fixture());
  });

  it('SetTypeLayerVisibility (existing key)', () => {
    assertInverts(new SetTypeLayerVisibility('territory', false), fixture());
  });

  it('SetTypeLayerVisibility (new key)', () => {
    assertInverts(new SetTypeLayerVisibility('user', false), fixture());
  });

  it('UpsertFigurinePreset (new)', () => {
    assertInverts(new UpsertFigurinePreset('p1', figParams('tone-3')), fixture());
  });

  it('UpsertFigurinePreset (overwrite existing)', () => {
    assertInverts(new UpsertFigurinePreset('p0', figParams('tone-9')), fixture());
  });
});

describe('CompoundCommand (batch delete)', () => {
  it('applies children in order and inverts to restore all (round-trip)', () => {
    const d = fixture(); // entities: a, b
    const cmd = new CompoundCommand('Delete 2 entities', [
      new DeleteEntity('a'),
      new DeleteEntity('b'),
    ]);
    const applied = cmd.apply(d);
    expect(applied.entities).toEqual([]);
    expect(cmd.invert(applied)).toEqual(d);
  });

  it('inverts children in REVERSE of apply order', () => {
    const order: string[] = [];
    const track = (name: string): Command => ({
      label: name,
      apply: (doc) => {
        order.push(`apply:${name}`);
        return doc;
      },
      invert: (doc) => {
        order.push(`invert:${name}`);
        return doc;
      },
    });
    const cmd = new CompoundCommand('batch', [track('x'), track('y'), track('z')]);
    const applied = cmd.apply(fixture());
    cmd.invert(applied);
    expect(order).toEqual([
      'apply:x',
      'apply:y',
      'apply:z',
      'invert:z',
      'invert:y',
      'invert:x',
    ]);
  });

  it('is a single history step (one undo restores every entity)', () => {
    const start = fixture();
    const h = new History(start);
    h.execute(
      new CompoundCommand('Delete 2 entities', [
        new DeleteEntity('a'),
        new DeleteEntity('b'),
      ])
    );
    expect(h.document.entities).toEqual([]);
    expect(h.canUndo()).toBe(true);
    h.undo();
    expect(h.canUndo()).toBe(false); // exactly one undoable step
    expect(h.document).toEqual(start);
  });
});

describe('History', () => {
  it('execute applies and enables undo', () => {
    const h = new History(fixture());
    expect(h.canUndo()).toBe(false);
    h.execute(new AddLayer({ id: 'L3', name: 'x', visible: true }));
    expect(h.canUndo()).toBe(true);
    expect(h.document.layers.some((l) => l.id === 'L3')).toBe(true);
  });

  it('undo then redo round-trips the document', () => {
    const start = fixture();
    const h = new History(start);
    h.execute(new MoveEntity('a', { mode: 'grid', x: 7, y: 7, footprint: { w: 1, d: 1 } }));
    const moved = h.document;
    h.undo();
    expect(h.document).toEqual(start);
    h.redo();
    expect(h.document).toEqual(moved);
  });

  it('new execute clears the redo stack', () => {
    const h = new History(fixture());
    h.execute(new AddLayer({ id: 'L3', name: 'x', visible: true }));
    h.undo();
    expect(h.canRedo()).toBe(true);
    h.execute(new AddLayer({ id: 'L4', name: 'y', visible: true }));
    expect(h.canRedo()).toBe(false);
  });

  it('caps the undo stack at 100 entries', () => {
    const h = new History(fixture());
    for (let i = 0; i < 130; i++) {
      h.execute(new UpsertFigurinePreset(`p${i}`, figParams(`tone-${i}`)));
    }
    let undos = 0;
    while (h.canUndo()) {
      h.undo();
      undos++;
      if (undos > 200) break; // safety
    }
    expect(undos).toBe(100);
  });

  it('notifies subscribers after every change', () => {
    const h = new History(fixture());
    const seen: number[] = [];
    const unsub = h.subscribe((doc) => seen.push(doc.entities.length));
    h.execute(new PlaceEntity(ent('c')));
    h.undo();
    h.redo();
    expect(seen).toEqual([3, 2, 3]);
    unsub();
    h.execute(new PlaceEntity(ent('d')));
    expect(seen).toEqual([3, 2, 3]); // no further notifications after unsubscribe
  });

  it('undo/redo are no-ops on empty stacks', () => {
    const start = fixture();
    const h = new History(start);
    expect(h.undo()).toEqual(start);
    expect(h.redo()).toEqual(start);
  });
});
