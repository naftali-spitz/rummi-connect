import type { Meld, RackSlots, TurnAction, TurnSnapshot } from './types.js';

function cloneTable(table: Meld[]): Meld[] {
  return table.map((m) => ({ id: m.id, tileIds: [...m.tileIds] }));
}

function cloneRack(rack: RackSlots): RackSlots {
  return [...rack];
}

function removeFromRack(rack: RackSlots, tileId: string): boolean {
  const idx = rack.indexOf(tileId);
  if (idx < 0) return false;
  rack[idx] = null;
  return true;
}

function removeFromMeld(table: Meld[], meldId: string, tileId: string): boolean {
  const meld = table.find((m) => m.id === meldId);
  if (!meld) return false;
  const idx = meld.tileIds.indexOf(tileId);
  if (idx < 0) return false;
  meld.tileIds.splice(idx, 1);
  return true;
}

function insertIntoTable(table: Meld[], tileIds: string[], targetMeldId: string | undefined, targetIndex: number, newMeldId?: string): boolean {
  if (!targetMeldId) {
    if (!newMeldId) return false;
    table.push({ id: newMeldId, tileIds: [...tileIds] });
    return true;
  }
  const target = table.find((m) => m.id === targetMeldId);
  if (!target) return false;
  const at = Math.max(0, Math.min(targetIndex, target.tileIds.length));
  target.tileIds.splice(at, 0, ...tileIds);
  return true;
}

function cleanupTable(table: Meld[]): Meld[] {
  return table.filter((m) => m.tileIds.length > 0);
}

export function applyTurnAction(snapshot: TurnSnapshot, action: TurnAction): TurnSnapshot | null {
  let table = cloneTable(snapshot.table);
  const rack = cloneRack(snapshot.rack);

  switch (action.type) {
    case 'RACK_REORDER': {
      const from = rack.indexOf(action.tileId);
      if (from < 0 || action.targetIndex < 0) return null;
      while (rack.length <= action.targetIndex) rack.push(null);
      const displaced = rack[action.targetIndex];
      rack[action.targetIndex] = action.tileId;
      rack[from] = displaced ?? null;
      break;
    }
    case 'RACK_TO_TABLE': {
      if (!removeFromRack(rack, action.tileId)) return null;
      if (!insertIntoTable(table, [action.tileId], action.targetMeldId, action.targetIndex, action.newMeldId)) return null;
      break;
    }
    case 'TABLE_TO_TABLE': {
      if (!removeFromMeld(table, action.sourceMeldId, action.tileId)) return null;
      table = cleanupTable(table);
      if (!insertIntoTable(table, [action.tileId], action.targetMeldId, action.targetIndex, action.newMeldId)) return null;
      break;
    }
    case 'TABLE_TO_RACK': {
      if (!removeFromMeld(table, action.sourceMeldId, action.tileId)) return null;
      table = cleanupTable(table);
      while (rack.length <= action.targetIndex) rack.push(null);
      const displaced = rack[action.targetIndex];
      if (displaced) return null;
      rack[action.targetIndex] = action.tileId;
      break;
    }
    case 'MOVE_TAIL': {
      const source = table.find((m) => m.id === action.sourceMeldId);
      if (!source || action.startIndex < 0 || action.startIndex >= source.tileIds.length) return null;
      const moving = source.tileIds.splice(action.startIndex);
      table = cleanupTable(table);
      if (!insertIntoTable(table, moving, action.targetMeldId, action.targetIndex, action.newMeldId)) return null;
      break;
    }
    case 'SPLIT_MELD': {
      const source = table.find((m) => m.id === action.meldId);
      if (!source || action.splitIndex <= 0 || action.splitIndex >= source.tileIds.length) return null;
      const tail = source.tileIds.splice(action.splitIndex);
      const at = table.findIndex((m) => m.id === source.id);
      table.splice(at + 1, 0, { id: action.newMeldId, tileIds: tail });
      break;
    }
  }

  return { table, rack };
}
