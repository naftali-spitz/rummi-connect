import { describe, expect, it } from 'vitest';
import { analyzeMeld, createTileSet, initialMeldPoints, scoreRack, tileMap, validateBoard } from '../src/shared/rules';

const tiles = createTileSet();
const byId = tileMap(tiles);
const id = (color: string, number: number, copy = 1) => `${color}-${number}-${copy}`;

describe('meld validation', () => {
  it('accepts a run', () => {
    const result = analyzeMeld([id('red', 4), id('red', 5), id('red', 6), id('red', 7)], byId);
    expect(result.valid).toBe(true);
    expect(result.kind).toBe('run');
    expect(result.points).toBe(22);
  });

  it('accepts a group and rejects duplicate colors', () => {
    expect(analyzeMeld([id('red', 9), id('blue', 9), id('black', 9)], byId).valid).toBe(true);
    expect(analyzeMeld([id('red', 9, 1), id('red', 9, 2), id('blue', 9)], byId).valid).toBe(false);
  });

  it('lets a joker fill a run gap', () => {
    const result = analyzeMeld([id('blue', 10), 'joker-1', id('blue', 12)], byId);
    expect(result.valid).toBe(true);
    expect(result.points).toBe(33);
  });

  it('rejects a two-tile meld', () => {
    expect(analyzeMeld([id('orange', 2), id('orange', 3)], byId).valid).toBe(false);
  });
});

describe('initial meld and scoring', () => {
  it('requires at least 30 points using rack tiles only', () => {
    const table = [{ id: 'new', tileIds: [id('red', 10), id('red', 11), id('red', 12)] }];
    const result = initialMeldPoints([], table, new Set(table[0].tileIds), byId);
    expect(result.valid).toBe(true);
    expect(result.points).toBe(33);
  });

  it('validates every board meld', () => {
    const board = validateBoard([
      { id: 'a', tileIds: [id('black', 1), id('black', 2), id('black', 3)] },
      { id: 'b', tileIds: [id('red', 7), id('blue', 7), id('orange', 7)] }
    ], byId);
    expect(board.valid).toBe(true);
  });

  it('scores a joker left in the rack as 30', () => {
    expect(scoreRack(['joker-1', id('red', 8), null], byId)).toBe(38);
  });
});
