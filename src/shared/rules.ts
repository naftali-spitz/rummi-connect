import type { Meld, RackSlots, Tile, TileColor, ValidationResult } from './types.js';

export function tileMap(tiles: Tile[]): Map<string, Tile> {
  return new Map(tiles.map((t) => [t.id, t]));
}

export function createTileSet(): Tile[] {
  const colors: TileColor[] = ['black', 'blue', 'red', 'orange'];
  const tiles: Tile[] = [];
  for (let copy = 1; copy <= 2; copy += 1) {
    for (const color of colors) {
      for (let number = 1; number <= 13; number += 1) {
        tiles.push({ id: `${color}-${number}-${copy}`, color, number });
      }
    }
  }
  tiles.push({ id: 'joker-1', color: 'joker', number: null });
  tiles.push({ id: 'joker-2', color: 'joker', number: null });
  return tiles;
}

export function analyzeMeld(tileIds: string[], tilesById: Map<string, Tile>): ValidationResult {
  const tiles = tileIds.map((id) => tilesById.get(id)).filter(Boolean) as Tile[];
  if (tiles.length !== tileIds.length) return { valid: false, points: 0, reason: 'Unknown tile' };
  if (tiles.length < 3) return { valid: false, points: 0, reason: 'A meld needs at least 3 tiles' };

  const nonJokers = tiles.filter((t) => t.color !== 'joker');
  if (nonJokers.length === 0) return { valid: false, points: 0, reason: 'A meld needs a numbered tile' };

  // Group: same number, different colors, max 4.
  if (tiles.length <= 4) {
    const n = nonJokers[0].number!;
    const sameNumber = nonJokers.every((t) => t.number === n);
    const colors = nonJokers.map((t) => t.color);
    if (sameNumber && new Set(colors).size === colors.length) {
      return {
        valid: true,
        kind: 'group',
        points: n * tiles.length,
        resolvedNumbers: tiles.map(() => n)
      };
    }
  }

  // Run: same color, ordered consecutive sequence. Jokers can fill missing positions.
  const runColor = nonJokers[0].color;
  if (runColor === 'joker' || !nonJokers.every((t) => t.color === runColor)) {
    return { valid: false, points: 0, reason: 'Run tiles must share a color' };
  }

  for (let start = 1; start <= 13 - tiles.length + 1; start += 1) {
    let ok = true;
    const resolved: number[] = [];
    for (let i = 0; i < tiles.length; i += 1) {
      const expected = start + i;
      const tile = tiles[i];
      resolved.push(expected);
      if (tile.color !== 'joker' && tile.number !== expected) {
        ok = false;
        break;
      }
    }
    if (ok) {
      return {
        valid: true,
        kind: 'run',
        points: resolved.reduce((sum, n) => sum + n, 0),
        resolvedNumbers: resolved
      };
    }
  }

  return { valid: false, points: 0, reason: 'Tiles do not form a valid group or run' };
}

export function validateBoard(table: Meld[], tilesById: Map<string, Tile>): { valid: boolean; invalidMeldIds: string[]; points: number } {
  const invalidMeldIds: string[] = [];
  let points = 0;
  for (const meld of table) {
    const result = analyzeMeld(meld.tileIds, tilesById);
    if (!result.valid) invalidMeldIds.push(meld.id);
    points += result.points;
  }
  return { valid: invalidMeldIds.length === 0, invalidMeldIds, points };
}

export function rackIds(rack: RackSlots): string[] {
  return rack.filter((id): id is string => Boolean(id));
}

export function rackCount(rack: RackSlots): number {
  return rackIds(rack).length;
}

export function scoreRack(rack: RackSlots, tilesById: Map<string, Tile>): number {
  return rackIds(rack).reduce((sum, id) => {
    const tile = tilesById.get(id);
    if (!tile) return sum;
    return sum + (tile.color === 'joker' ? 30 : tile.number ?? 0);
  }, 0);
}

export function initialMeldPoints(
  committedTable: Meld[],
  workingTable: Meld[],
  originalRackTileIds: Set<string>,
  tilesById: Map<string, Tile>
): { valid: boolean; points: number; reason?: string } {
  const committedById = new Map(committedTable.map((m) => [m.id, m]));
  for (const committed of committedTable) {
    const current = workingTable.find((m) => m.id === committed.id);
    if (!current || current.tileIds.join('|') !== committed.tileIds.join('|')) {
      return { valid: false, points: 0, reason: 'Existing table tiles cannot be changed before the initial meld' };
    }
  }

  let points = 0;
  let newMeldCount = 0;
  for (const meld of workingTable) {
    if (committedById.has(meld.id)) continue;
    newMeldCount += 1;
    if (!meld.tileIds.every((id) => originalRackTileIds.has(id))) {
      return { valid: false, points: 0, reason: 'Initial meld must use only your rack tiles' };
    }
    const result = analyzeMeld(meld.tileIds, tilesById);
    if (!result.valid) return { valid: false, points: 0, reason: result.reason };
    points += result.points;
  }
  if (newMeldCount === 0) return { valid: false, points: 0, reason: 'Play at least one meld or draw' };
  if (points < 30) return { valid: false, points, reason: `Initial meld is ${points}; at least 30 points are required` };
  return { valid: true, points };
}

export function tablesEqual(a: Meld[], b: Meld[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((m, i) => m.id === b[i].id && m.tileIds.join('|') === b[i].tileIds.join('|'));
}
