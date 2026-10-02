import { randomUUID } from 'node:crypto';
import type { AiLevel, Meld, RackSlots, Tile, TurnAction } from '../shared/types.js';
import { analyzeMeld, rackIds, tileMap } from '../shared/rules.js';
import { applyTurnAction } from '../shared/actions.js';

type Candidate = { ids: string[]; points: number };

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function candidateMelds(ids: string[], tiles: Map<string, Tile>): Candidate[] {
  const jokers = ids.filter((id) => tiles.get(id)?.color === 'joker');
  const non = ids.filter((id) => tiles.get(id)?.color !== 'joker');
  const out: Candidate[] = [];

  // Groups.
  for (let n = 1; n <= 13; n += 1) {
    const same = non.filter((id) => tiles.get(id)?.number === n);
    const byColor = new Map<string, string>();
    for (const id of same) {
      const c = tiles.get(id)!.color;
      if (!byColor.has(c)) byColor.set(c, id);
    }
    const colorIds = [...byColor.values()];
    for (const len of [4, 3]) {
      const needJ = Math.max(0, len - colorIds.length);
      if (needJ > jokers.length || colorIds.length + jokers.length < len) continue;
      const chosen = [...colorIds.slice(0, len - needJ), ...jokers.slice(0, needJ)];
      if (chosen.length === len) {
        const r = analyzeMeld(chosen, tiles);
        if (r.valid) out.push({ ids: chosen, points: r.points });
      }
    }
  }

  // Runs: choose one copy of each number per color, fill gaps with jokers.
  for (const color of ['black', 'blue', 'red', 'orange'] as const) {
    const numberToId = new Map<number, string>();
    for (const id of non) {
      const t = tiles.get(id)!;
      if (t.color === color && t.number && !numberToId.has(t.number)) numberToId.set(t.number, id);
    }
    for (let start = 1; start <= 13; start += 1) {
      for (let len = 3; len <= Math.min(8, 14 - start); len += 1) {
        if (start + len - 1 > 13) break;
        const chosen: string[] = [];
        let jokerIndex = 0;
        let possible = true;
        for (let n = start; n < start + len; n += 1) {
          const id = numberToId.get(n);
          if (id) chosen.push(id);
          else if (jokerIndex < jokers.length) chosen.push(jokers[jokerIndex++]);
          else { possible = false; break; }
        }
        if (!possible) continue;
        const r = analyzeMeld(chosen, tiles);
        if (r.valid) out.push({ ids: chosen, points: r.points });
      }
    }
  }

  const seen = new Set<string>();
  return out.filter((c) => {
    const key = [...c.ids].sort().join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => (b.ids.length - a.ids.length) || (b.points - a.points));
}

function selectDisjoint(candidates: Candidate[], requirePoints: number, maxCandidates: number): Candidate[] {
  let best: Candidate[] = [];
  let bestCount = -1;
  let bestPoints = -1;
  let nodes = 0;

  function walk(index: number, used: Set<string>, picked: Candidate[], points: number): void {
    nodes += 1;
    if (nodes > maxCandidates) return;
    const count = picked.reduce((s, c) => s + c.ids.length, 0);
    if (points >= requirePoints && (count > bestCount || (count === bestCount && points > bestPoints))) {
      best = [...picked];
      bestCount = count;
      bestPoints = points;
    }
    if (index >= candidates.length) return;
    for (let i = index; i < candidates.length; i += 1) {
      const c = candidates[i];
      if (c.ids.some((id) => used.has(id))) continue;
      const nextUsed = new Set(used);
      c.ids.forEach((id) => nextUsed.add(id));
      walk(i + 1, nextUsed, [...picked, c], points + c.points);
    }
  }

  walk(0, new Set(), [], 0);
  return best;
}

function actionsForNewMeld(candidate: Candidate): TurnAction[] {
  const meldId = randomUUID();
  return candidate.ids.map((tileId, index) => ({
    type: 'RACK_TO_TABLE' as const,
    tileId,
    targetMeldId: index === 0 ? undefined : meldId,
    targetIndex: index,
    newMeldId: index === 0 ? meldId : undefined
  }));
}

export interface AiView {
  playerId: string;
  aiLevel: AiLevel;
  initialMeldCompleted: boolean;
  tiles: Tile[];
  table: Meld[];
  rack: RackSlots;
}

function tryExtensions(input: AiView, maxMoves: number): TurnAction[] {
  const byId = tileMap(input.tiles);
  let view = { table: input.table.map((m) => ({ id: m.id, tileIds: [...m.tileIds] })), rack: [...input.rack] };
  const actions: TurnAction[] = [];

  for (let pass = 0; pass < maxMoves; pass += 1) {
    let found = false;
    outer:
    for (const tileId of rackIds(view.rack)) {
      for (const meld of view.table) {
        for (let index = 0; index <= meld.tileIds.length; index += 1) {
          const testIds = [...meld.tileIds];
          testIds.splice(index, 0, tileId);
          if (!analyzeMeld(testIds, byId).valid) continue;
          const action: TurnAction = { type: 'RACK_TO_TABLE', tileId, targetMeldId: meld.id, targetIndex: index };
          const next = applyTurnAction(view, action);
          if (!next) continue;
          actions.push(action);
          view = next;
          found = true;
          break outer;
        }
      }
    }
    if (!found) break;
  }
  return actions;
}

function tryBorrowOneTableTile(input: AiView): TurnAction[] {
  const byId = tileMap(input.tiles);
  const rack = rackIds(input.rack);
  for (const meld of input.table) {
    if (meld.tileIds.length <= 3) continue;
    for (let i = 0; i < meld.tileIds.length; i += 1) {
      const borrowed = meld.tileIds[i];
      const remaining = meld.tileIds.filter((_, idx) => idx !== i);
      if (!analyzeMeld(remaining, byId).valid) continue;
      const candidates = candidateMelds([...rack, borrowed], byId).filter((c) => c.ids.includes(borrowed) && c.ids.some((id) => id !== borrowed));
      const candidate = candidates[0];
      if (!candidate) continue;
      const newId = randomUUID();
      const actions: TurnAction[] = [{
        type: 'TABLE_TO_TABLE', tileId: borrowed, sourceMeldId: meld.id, targetIndex: 0, newMeldId: newId
      }];
      candidate.ids.forEach((id, desiredIndex) => {
        if (id === borrowed) return;
        actions.push({ type: 'RACK_TO_TABLE', tileId: id, targetMeldId: newId, targetIndex: desiredIndex });
      });
      return actions;
    }
  }
  return [];
}

export function planAiTurn(input: AiView): TurnAction[] {
  const byId = tileMap(input.tiles);
  const level = input.aiLevel ?? 'normal';
  const nodeLimit = level === 'easy' ? 200 : level === 'normal' ? 1400 : level === 'hard' ? 7000 : 24000;

  if (!input.initialMeldCompleted) {
    const candidates = candidateMelds(rackIds(input.rack), byId);
    const chosen = selectDisjoint(candidates, 30, nodeLimit);
    return chosen.flatMap(actionsForNewMeld);
  }

  const extensionLimit = level === 'easy' ? 1 : level === 'normal' ? 3 : level === 'hard' ? 8 : 14;
  const extensions = tryExtensions(input, extensionLimit);

  let view = { table: input.table.map((m) => ({ id: m.id, tileIds: [...m.tileIds] })), rack: [...input.rack] };
  for (const action of extensions) {
    const next = applyTurnAction(view, action);
    if (next) view = next;
  }
  const remainingCandidates = candidateMelds(rackIds(view.rack), byId);
  const chosen = selectDisjoint(remainingCandidates, 0, nodeLimit);
  const newMeldActions = chosen.flatMap(actionsForNewMeld);

  if (extensions.length || newMeldActions.length) return [...extensions, ...newMeldActions];
  if (level === 'hard' || level === 'expert') return tryBorrowOneTableTile(input);
  return [];
}
