import { describe, expect, it } from 'vitest';
import { applyTurnAction } from '../src/shared/actions';

const initial = {
  table: [{ id: 'm1', tileIds: ['a', 'b', 'c', 'd'] }],
  rack: ['x', 'y', null, null]
};

describe('working-turn actions', () => {
  it('moves a rack tile into an existing meld', () => {
    const next = applyTurnAction(initial, { type: 'RACK_TO_TABLE', tileId: 'x', targetMeldId: 'm1', targetIndex: 4 });
    expect(next?.table[0].tileIds).toEqual(['a', 'b', 'c', 'd', 'x']);
    expect(next?.rack[0]).toBeNull();
  });

  it('splits a meld', () => {
    const next = applyTurnAction(initial, { type: 'SPLIT_MELD', meldId: 'm1', splitIndex: 2, newMeldId: 'm2' });
    expect(next?.table).toEqual([
      { id: 'm1', tileIds: ['a', 'b'] },
      { id: 'm2', tileIds: ['c', 'd'] }
    ]);
  });

  it('keeps rack slots free-form when reordering', () => {
    const next = applyTurnAction(initial, { type: 'RACK_REORDER', tileId: 'x', targetIndex: 2 });
    expect(next?.rack).toEqual([null, 'y', 'x', null]);
  });
});
