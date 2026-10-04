import { randomInt, randomUUID } from 'node:crypto';
import type {
  AiLevel,
  Device,
  DeviceRole,
  DeviceState,
  Meld,
  PersistedRoom,
  Player,
  PrivateTurnState,
  PublicRoomState,
  RackSlots,
  Tile,
  TurnAction,
  TurnSnapshot
} from '../shared/types.js';
import { applyTurnAction } from '../shared/actions.js';
import {
  createTileSet,
  initialMeldPoints,
  rackCount,
  rackIds,
  scoreRack,
  tablesEqual,
  tileMap,
  validateBoard
} from '../shared/rules.js';
import { RoomStorage } from './storage.js';

// TS-friendly local clone helpers.
const cloneMelds = (table: Meld[]): Meld[] => table.map((m) => ({ id: m.id, tileIds: [...m.tileIds] }));
const cloneRack = (rack: RackSlots): RackSlots => [...rack];

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function blankRack(size = 28): RackSlots {
  return Array.from({ length: size }, () => null);
}

function putTileInRack(rack: RackSlots, tileId: string): void {
  let idx = rack.findIndex((v) => v === null);
  if (idx < 0) {
    const old = rack.length;
    rack.push(...Array.from({ length: 8 }, () => null));
    idx = old;
  }
  rack[idx] = tileId;
}

export interface ManagerResult<T = undefined> {
  ok: boolean;
  data?: T;
  error?: string;
}

export class RoomManager {
  readonly rooms = new Map<string, PersistedRoom>();
  private readyDevices = new Map<string, Set<string>>();

  constructor(private storage: RoomStorage) {
    for (const room of storage.loadAll()) {
      if (room.turn && !Array.isArray(room.turn.future)) room.turn.future = [];
      this.rooms.set(room.code, room);
      this.readyDevices.set(room.code, new Set());
    }
  }

  getRoom(code: string): PersistedRoom | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  private generateCode(): string {
    for (let i = 0; i < 100; i += 1) {
      const code = String(randomInt(1000, 10000));
      if (!this.rooms.has(code)) return code;
    }
    return randomUUID().slice(0, 6).toUpperCase();
  }

  private save(room: PersistedRoom): void {
    this.rooms.set(room.code, room);
    this.storage.save(room);
  }

  private newDevice(token: string, role: DeviceRole, host = false): Device {
    return { id: randomUUID(), token, role, playerIds: [], host };
  }

  private newHuman(name: string, deviceId: string): Player {
    return {
      id: randomUUID(),
      name: name.trim() || 'Player',
      type: 'human',
      deviceId,
      rack: blankRack(),
      initialMeldCompleted: false,
      score: 0
    };
  }

  createRoom(token: string, playerName: string): ManagerResult<{ roomCode: string; deviceId: string; playerId: string }> {
    const code = this.generateCode();
    const device = this.newDevice(token, 'playing', true);
    const player = this.newHuman(playerName, device.id);
    device.playerIds.push(player.id);
    const now = Date.now();
    const room: PersistedRoom = {
      code,
      status: 'lobby',
      hostDeviceId: device.id,
      devices: [device],
      players: [player],
      tiles: createTileSet(),
      table: [],
      pool: [],
      turnIndex: 0,
      turn: null,
      createdAt: now,
      updatedAt: now
    };
    this.readyDevices.set(code, new Set());
    this.save(room);
    return { ok: true, data: { roomCode: code, deviceId: device.id, playerId: player.id } };
  }

  joinRoom(codeInput: string, token: string, role: DeviceRole, playerName?: string): ManagerResult<{ roomCode: string; deviceId: string; playerId?: string }> {
    const code = codeInput.toUpperCase();
    const room = this.rooms.get(code);
    if (!room) return { ok: false, error: 'Room not found' };

    const existing = room.devices.find((d) => d.token === token);
    if (existing) {
      existing.role = role;
      this.save(room);
      return { ok: true, data: { roomCode: code, deviceId: existing.id, playerId: existing.playerIds[0] } };
    }

    if (room.status !== 'lobby' && role === 'playing') {
      return { ok: false, error: 'The game has already started. Reconnect with the original device session.' };
    }

    const device = this.newDevice(token, role, false);
    room.devices.push(device);
    let playerId: string | undefined;
    if (role === 'playing') {
      const player = this.newHuman(playerName || 'Player', device.id);
      room.players.push(player);
      device.playerIds.push(player.id);
      playerId = player.id;
    }
    this.save(room);
    return { ok: true, data: { roomCode: code, deviceId: device.id, playerId } };
  }

  resumeRoom(codeInput: string, token: string): ManagerResult<{ roomCode: string; deviceId: string }> {
    const code = codeInput.toUpperCase();
    const room = this.rooms.get(code);
    if (!room) return { ok: false, error: 'Room no longer exists' };
    const device = room.devices.find((d) => d.token === token);
    if (!device) return { ok: false, error: 'This device session is not registered in that room' };
    return { ok: true, data: { roomCode: code, deviceId: device.id } };
  }

  addLocalPlayer(code: string, requesterDeviceId: string, name: string): ManagerResult<{ playerId: string }> {
    const room = this.rooms.get(code);
    if (!room || room.status !== 'lobby') return { ok: false, error: 'Players can only be added in the lobby' };
    const device = room.devices.find((d) => d.id === requesterDeviceId && d.role === 'playing');
    if (!device) return { ok: false, error: 'Playing device not found' };
    if (room.players.length >= 6) return { ok: false, error: 'This build supports up to 6 players' };
    const player = this.newHuman(name, device.id);
    room.players.push(player);
    device.playerIds.push(player.id);
    this.save(room);
    return { ok: true, data: { playerId: player.id } };
  }

  addAi(code: string, requesterDeviceId: string, name: string, aiLevel: AiLevel): ManagerResult<{ playerId: string }> {
    const room = this.rooms.get(code);
    if (!room || room.status !== 'lobby') return { ok: false, error: 'AI can only be added in the lobby' };
    if (room.hostDeviceId !== requesterDeviceId) return { ok: false, error: 'Only the host can add AI players' };
    if (room.players.length >= 6) return { ok: false, error: 'This build supports up to 6 players' };
    const player: Player = {
      id: randomUUID(),
      name: name.trim() || `Computer ${room.players.filter((p) => p.type === 'computer').length + 1}`,
      type: 'computer',
      aiLevel,
      rack: blankRack(),
      initialMeldCompleted: false,
      score: 0
    };
    room.players.push(player);
    this.save(room);
    return { ok: true, data: { playerId: player.id } };
  }

  removePlayer(code: string, requesterDeviceId: string, playerId: string): ManagerResult {
    const room = this.rooms.get(code);
    if (!room || room.status !== 'lobby') return { ok: false, error: 'Players can only be removed in the lobby' };
    const player = room.players.find((p) => p.id === playerId);
    if (!player) return { ok: false, error: 'Player not found' };
    if (player.type === 'computer' && room.hostDeviceId !== requesterDeviceId) return { ok: false, error: 'Only the host can remove AI players' };
    if (player.type === 'human' && player.deviceId !== requesterDeviceId && room.hostDeviceId !== requesterDeviceId) {
      return { ok: false, error: 'You cannot remove that player' };
    }
    room.players = room.players.filter((p) => p.id !== playerId);
    for (const device of room.devices) device.playerIds = device.playerIds.filter((id) => id !== playerId);
    this.save(room);
    return { ok: true };
  }

  startGame(code: string, requesterDeviceId: string): ManagerResult {
    const room = this.rooms.get(code);
    if (!room) return { ok: false, error: 'Room not found' };
    if (room.hostDeviceId !== requesterDeviceId) return { ok: false, error: 'Only the host can start the game' };
    if (room.status !== 'lobby') return { ok: false, error: 'Game already started' };
    if (room.players.length < 2) return { ok: false, error: 'At least 2 players are required' };
    return this.startFreshGame(room);
  }

  restartGame(code: string, requesterDeviceId: string): ManagerResult {
    const room = this.rooms.get(code);
    if (!room) return { ok: false, error: 'Room not found' };
    if (room.hostDeviceId !== requesterDeviceId) return { ok: false, error: 'Only the host can restart the game' };
    if (room.players.length < 2) return { ok: false, error: 'At least 2 players are required' };
    return this.startFreshGame(room);
  }

  private startFreshGame(room: PersistedRoom): ManagerResult {
    room.tiles = createTileSet();
    room.pool = shuffle(room.tiles.map((t) => t.id));
    room.table = [];
    room.winnerId = undefined;
    room.turnIndex = 0;
    for (const player of room.players) {
      player.rack = blankRack();
      player.initialMeldCompleted = false;
      player.score = 0;
      for (let i = 0; i < 14; i += 1) {
        const tileId = room.pool.pop();
        if (tileId) putTileInRack(player.rack, tileId);
      }
    }
    room.status = 'playing';
    this.startTurn(room);
    this.save(room);
    return { ok: true };
  }

  private startTurn(room: PersistedRoom): void {
    const player = room.players[room.turnIndex];
    if (!player) {
      room.turn = null;
      return;
    }
    room.turn = {
      playerId: player.id,
      table: cloneMelds(room.table),
      rack: cloneRack(player.rack),
      originalRackTileIds: rackIds(player.rack),
      history: [],
      future: []
    };
    this.readyDevices.set(room.code, new Set());
  }

  currentPlayer(room: PersistedRoom): Player | undefined {
    return room.players[room.turnIndex];
  }

  currentPlayerFor(code: string): Player | undefined {
    const room = this.rooms.get(code);
    return room ? this.currentPlayer(room) : undefined;
  }

  markReady(code: string, deviceId: string): ManagerResult {
    const room = this.rooms.get(code);
    if (!room) return { ok: false, error: 'Room not found' };
    const current = this.currentPlayer(room);
    if (!current || current.type !== 'human' || current.deviceId !== deviceId) return { ok: false, error: 'It is not a player on this device\'s turn' };
    const set = this.readyDevices.get(code) ?? new Set<string>();
    set.add(deviceId);
    this.readyDevices.set(code, set);
    return { ok: true };
  }

  private actorCanAct(room: PersistedRoom, deviceId: string): boolean {
    const current = this.currentPlayer(room);
    if (!current || current.type !== 'human' || current.deviceId !== deviceId) return false;
    const device = room.devices.find((d) => d.id === deviceId);
    if (!device) return false;
    const needsReady = device.playerIds.length > 1;
    return !needsReady || (this.readyDevices.get(room.code)?.has(deviceId) ?? false);
  }

  private validateAction(room: PersistedRoom, action: TurnAction): ManagerResult {
    const current = this.currentPlayer(room);
    const turn = room.turn;
    if (!current || !turn) return { ok: false, error: 'No active turn' };
    const original = new Set(turn.originalRackTileIds);

    if (action.type === 'TABLE_TO_RACK' && !original.has(action.tileId)) {
      return { ok: false, error: 'Only a tile that came from your rack this turn can return to your rack' };
    }

    if (!current.initialMeldCompleted) {
      const committedIds = new Set(room.table.map((m) => m.id));
      if (action.type === 'RACK_TO_TABLE' && action.targetMeldId && committedIds.has(action.targetMeldId)) {
        return { ok: false, error: 'Complete your initial 30-point meld before using table tiles' };
      }
      if (action.type === 'TABLE_TO_TABLE') {
        if (!original.has(action.tileId) || committedIds.has(action.sourceMeldId) || (action.targetMeldId && committedIds.has(action.targetMeldId))) {
          return { ok: false, error: 'Complete your initial 30-point meld before rearranging the table' };
        }
      }
      if (action.type === 'TABLE_TO_RACK' && !original.has(action.tileId)) {
        return { ok: false, error: 'Complete your initial meld first' };
      }
      if (action.type === 'MOVE_TAIL') {
        if (committedIds.has(action.sourceMeldId) || (action.targetMeldId && committedIds.has(action.targetMeldId))) {
          return { ok: false, error: 'Complete your initial 30-point meld before rearranging the table' };
        }
      }
      if (action.type === 'SPLIT_MELD' && committedIds.has(action.meldId)) {
        return { ok: false, error: 'Complete your initial 30-point meld before splitting table melds' };
      }
    }
    return { ok: true };
  }

  applyAction(code: string, deviceId: string, action: TurnAction): ManagerResult {
    const room = this.rooms.get(code);
    if (!room || room.status !== 'playing' || !room.turn) return { ok: false, error: 'Game is not active' };
    if (!this.actorCanAct(room, deviceId)) return { ok: false, error: 'You cannot act right now' };
    return this.applyActionAsCurrentPlayer(room, action);
  }

  applyAiAction(code: string, playerId: string, action: TurnAction): ManagerResult {
    const room = this.rooms.get(code);
    if (!room || room.status !== 'playing' || !room.turn) return { ok: false, error: 'Game is not active' };
    const current = this.currentPlayer(room);
    if (!current || current.type !== 'computer' || current.id !== playerId) return { ok: false, error: 'Not this AI player\'s turn' };
    return this.applyActionAsCurrentPlayer(room, action);
  }

  private applyActionAsCurrentPlayer(room: PersistedRoom, action: TurnAction): ManagerResult {
    const check = this.validateAction(room, action);
    if (!check.ok) return check;
    const turn = room.turn!;
    const before: TurnSnapshot = { table: cloneMelds(turn.table), rack: cloneRack(turn.rack) };
    const next = applyTurnAction(before, action);
    if (!next) return { ok: false, error: 'That move cannot be applied' };
    turn.history.push(before);
    if (turn.history.length > 80) turn.history.shift();
    turn.future = [];
    turn.table = next.table;
    turn.rack = next.rack;
    this.save(room);
    return { ok: true };
  }

  undo(code: string, deviceId: string): ManagerResult {
    const room = this.rooms.get(code);
    if (!room || !room.turn) return { ok: false, error: 'No active turn' };
    if (!this.actorCanAct(room, deviceId)) return { ok: false, error: 'You cannot act right now' };
    return this.undoCurrent(room);
  }

  undoAi(code: string, playerId: string): ManagerResult {
    const room = this.rooms.get(code);
    if (!room || !room.turn || room.turn.playerId !== playerId) return { ok: false, error: 'No active AI turn' };
    return this.undoCurrent(room);
  }

  private undoCurrent(room: PersistedRoom): ManagerResult {
    const turn = room.turn!;
    const previous = turn.history.pop();
    if (!previous) return { ok: false, error: 'Nothing to undo' };
    turn.future.push({ table: cloneMelds(turn.table), rack: cloneRack(turn.rack) });
    if (turn.future.length > 80) turn.future.shift();
    turn.table = cloneMelds(previous.table);
    turn.rack = cloneRack(previous.rack);
    this.save(room);
    return { ok: true };
  }

  redo(code: string, deviceId: string): ManagerResult {
    const room = this.rooms.get(code);
    if (!room || !room.turn) return { ok: false, error: 'No active turn' };
    if (!this.actorCanAct(room, deviceId)) return { ok: false, error: 'You cannot act right now' };
    const turn = room.turn;
    const next = turn.future.pop();
    if (!next) return { ok: false, error: 'Nothing to redo' };
    turn.history.push({ table: cloneMelds(turn.table), rack: cloneRack(turn.rack) });
    if (turn.history.length > 80) turn.history.shift();
    turn.table = cloneMelds(next.table);
    turn.rack = cloneRack(next.rack);
    this.save(room);
    return { ok: true };
  }

  resetTurn(code: string, deviceId: string): ManagerResult {
    const room = this.rooms.get(code);
    if (!room || !room.turn) return { ok: false, error: 'No active turn' };
    if (!this.actorCanAct(room, deviceId)) return { ok: false, error: 'You cannot act right now' };
    const current = this.currentPlayer(room)!;
    room.turn.table = cloneMelds(room.table);
    room.turn.rack = cloneRack(current.rack);
    room.turn.history = [];
    room.turn.future = [];
    this.save(room);
    return { ok: true };
  }

  draw(code: string, deviceId: string): ManagerResult {
    const room = this.rooms.get(code);
    if (!room || !room.turn) return { ok: false, error: 'No active turn' };
    if (!this.actorCanAct(room, deviceId)) return { ok: false, error: 'You cannot act right now' };
    return this.drawCurrent(room);
  }

  drawAi(code: string, playerId: string): ManagerResult {
    const room = this.rooms.get(code);
    const current = room ? this.currentPlayer(room) : undefined;
    if (!room || !room.turn || !current || current.id !== playerId || current.type !== 'computer') return { ok: false, error: 'No active AI turn' };
    return this.drawCurrent(room);
  }

  private drawCurrent(room: PersistedRoom): ManagerResult {
    const current = this.currentPlayer(room)!;
    // Preserve private rack organization, but discard public table experimentation.
    current.rack = cloneRack(room.turn!.rack);
    const tileId = room.pool.pop();
    if (tileId) putTileInRack(current.rack, tileId);
    this.advanceTurn(room);
    this.save(room);
    return { ok: true };
  }

  endTurn(code: string, deviceId: string): ManagerResult<{ invalidMeldIds?: string[]; message?: string }> {
    const room = this.rooms.get(code);
    if (!room || !room.turn) return { ok: false, error: 'No active turn' };
    if (!this.actorCanAct(room, deviceId)) return { ok: false, error: 'You cannot act right now' };
    return this.commitCurrent(room);
  }

  endAiTurn(code: string, playerId: string): ManagerResult<{ invalidMeldIds?: string[]; message?: string }> {
    const room = this.rooms.get(code);
    const current = room ? this.currentPlayer(room) : undefined;
    if (!room || !room.turn || !current || current.id !== playerId || current.type !== 'computer') return { ok: false, error: 'No active AI turn' };
    return this.commitCurrent(room);
  }

  private commitCurrent(room: PersistedRoom): ManagerResult<{ invalidMeldIds?: string[]; message?: string }> {
    const current = this.currentPlayer(room)!;
    const turn = room.turn!;
    const byId = tileMap(room.tiles);
    if (tablesEqual(room.table, turn.table)) {
      return { ok: false, error: 'Play a tile or draw' };
    }

    if (!current.initialMeldCompleted) {
      const initial = initialMeldPoints(room.table, turn.table, new Set(turn.originalRackTileIds), byId);
      if (!initial.valid) return { ok: false, error: initial.reason || 'Initial meld is invalid' };
      current.initialMeldCompleted = true;
    } else {
      const board = validateBoard(turn.table, byId);
      if (!board.valid) {
        return { ok: false, error: 'The table is not valid yet', data: { invalidMeldIds: board.invalidMeldIds } };
      }
    }

    // Initial meld validation already checks every new meld, but validate the full board as a final guard.
    const board = validateBoard(turn.table, byId);
    if (!board.valid) {
      return { ok: false, error: 'The table is not valid yet', data: { invalidMeldIds: board.invalidMeldIds } };
    }

    room.table = cloneMelds(turn.table);
    current.rack = cloneRack(turn.rack);

    if (rackCount(current.rack) === 0) {
      this.finishGame(room, current.id);
      this.save(room);
      return { ok: true, data: { message: `${current.name} went out!` } };
    }

    this.advanceTurn(room);
    this.save(room);
    return { ok: true };
  }

  private finishGame(room: PersistedRoom, winnerId: string): void {
    const byId = tileMap(room.tiles);
    let pot = 0;
    for (const player of room.players) {
      if (player.id === winnerId) continue;
      const remaining = scoreRack(player.rack, byId);
      player.score = -remaining;
      pot += remaining;
    }
    const winner = room.players.find((p) => p.id === winnerId);
    if (winner) winner.score = pot;
    room.winnerId = winnerId;
    room.status = 'finished';
    room.turn = null;
  }

  private advanceTurn(room: PersistedRoom): void {
    room.turnIndex = (room.turnIndex + 1) % room.players.length;
    this.startTurn(room);
  }

  returnToLobby(code: string, requesterDeviceId: string): ManagerResult {
    const room = this.rooms.get(code);
    if (!room) return { ok: false, error: 'Room not found' };
    if (room.hostDeviceId !== requesterDeviceId) return { ok: false, error: 'Only the host can return to the lobby' };
    room.status = 'lobby';
    room.table = [];
    room.pool = [];
    room.turn = null;
    room.turnIndex = 0;
    room.winnerId = undefined;
    for (const player of room.players) {
      player.rack = blankRack();
      player.initialMeldCompleted = false;
      player.score = 0;
    }
    this.readyDevices.set(code, new Set());
    this.save(room);
    return { ok: true };
  }

  organizeTable(code: string, deviceId: string): ManagerResult {
    const room = this.rooms.get(code);
    if (!room || !room.turn) return { ok: false, error: 'No active turn' };
    if (!this.actorCanAct(room, deviceId)) return { ok: false, error: 'You cannot act right now' };
    const turn = room.turn;
    turn.history.push({ table: cloneMelds(turn.table), rack: cloneRack(turn.rack) });
    turn.future = [];
    const byId = tileMap(room.tiles);
    const colorOrder = { black: 0, blue: 1, red: 2, orange: 3, joker: 4 } as const;
    turn.table.sort((a, b) => {
      const aa = analyzeForSort(a); const bb = analyzeForSort(b);
      return aa.kind - bb.kind || aa.color - bb.color || aa.number - bb.number;
    });
    function analyzeForSort(meld: Meld) {
      const result = validateBoard([meld], byId);
      const tiles = meld.tileIds.map((id) => byId.get(id)).filter(Boolean) as Tile[];
      const nonJoker = tiles.find((t) => t.color !== 'joker');
      const colors = new Set(tiles.filter((t) => t.color !== 'joker').map((t) => t.color));
      const numbers = tiles.filter((t) => t.number !== null).map((t) => t.number as number);
      const likelyRun = result.valid && colors.size <= 1;
      return {
        kind: result.valid ? (likelyRun ? 0 : 1) : 2,
        color: nonJoker ? colorOrder[nonJoker.color] : 4,
        number: numbers.length ? Math.min(...numbers) : 99
      };
    }
    this.save(room);
    return { ok: true };
  }

  sortRack(code: string, deviceId: string, mode: 'number' | 'color'): ManagerResult {
    const room = this.rooms.get(code);
    if (!room) return { ok: false, error: 'Room not found' };
    const device = room.devices.find((d) => d.id === deviceId && d.role === 'playing');
    if (!device) return { ok: false, error: 'Playing device not found' };
    const current = this.currentPlayer(room);
    let player: Player | undefined;
    let rack: RackSlots | undefined;
    if (room.status === 'playing' && room.turn && current?.type === 'human' && current.deviceId === deviceId && (!device.playerIds.length || device.playerIds.length === 1 || this.readyDevices.get(code)?.has(deviceId))) {
      player = current;
      rack = room.turn.rack;
    } else if (device.playerIds.length === 1) {
      player = room.players.find((p) => p.id === device.playerIds[0]);
      rack = player?.rack;
    }
    if (!player || !rack) return { ok: false, error: 'No private rack is available on this device right now' };
    const byId = tileMap(room.tiles);
    const ids = rackIds(rack).sort((a, b) => {
      const ta = byId.get(a)!; const tb = byId.get(b)!;
      const colorOrder = { black: 0, blue: 1, red: 2, orange: 3, joker: 4 } as const;
      if (mode === 'color') return colorOrder[ta.color] - colorOrder[tb.color] || (ta.number ?? 99) - (tb.number ?? 99);
      return (ta.number ?? 99) - (tb.number ?? 99) || colorOrder[ta.color] - colorOrder[tb.color];
    });
    const target = Array.from({ length: Math.max(rack.length, 28) }, () => null) as RackSlots;
    ids.forEach((id, i) => { target[i] = id; });
    if (room.status === 'playing' && room.turn?.playerId === player.id) {
      room.turn.rack = target;
      room.turn.future = [];
    } else player.rack = target;
    this.save(room);
    return { ok: true };
  }

  publicState(code: string): PublicRoomState | undefined {
    const room = this.rooms.get(code);
    if (!room) return undefined;
    const byId = tileMap(room.tiles);
    const liveTable = room.status === 'playing' && room.turn ? room.turn.table : room.table;
    const current = this.currentPlayer(room);
    return {
      code: room.code,
      status: room.status,
      hostDeviceId: room.hostDeviceId,
      devices: room.devices.map((d) => ({ id: d.id, role: d.role, playerIds: [...d.playerIds], host: d.host })),
      players: room.players.map((p) => ({
        id: p.id,
        name: p.name,
        type: p.type,
        aiLevel: p.aiLevel,
        deviceId: p.deviceId,
        rackCount: room.turn?.playerId === p.id ? rackCount(room.turn.rack) : rackCount(p.rack),
        initialMeldCompleted: p.initialMeldCompleted,
        score: p.score
      })),
      table: liveTable.map((m) => ({ id: m.id, tiles: m.tileIds.map((id) => byId.get(id)).filter(Boolean) as Tile[] })),
      poolCount: room.pool.length,
      currentPlayerId: room.status === 'playing' ? current?.id : undefined,
      winnerId: room.winnerId,
      updatedAt: room.updatedAt
    };
  }

  deviceState(code: string, deviceId: string): DeviceState | undefined {
    const room = this.rooms.get(code);
    if (!room) return undefined;
    const device = room.devices.find((d) => d.id === deviceId);
    if (!device) return undefined;
    const state: DeviceState = { deviceId, needsReady: false };
    if (device.role === 'display') return state;

    const localHumans = room.players.filter((p) => p.type === 'human' && p.deviceId === deviceId);
    const current = this.currentPlayer(room);
    const byId = tileMap(room.tiles);

    // A device with one human may keep showing that player's private rack while waiting.
    if (localHumans.length === 1) {
      const player = localHumans[0];
      const isCurrent = room.status === 'playing' && room.turn?.playerId === player.id;
      const rack = isCurrent && room.turn ? room.turn.rack : player.rack;
      state.privateTurn = {
        playerId: player.id,
        rack: rack.map((id) => (id ? byId.get(id) ?? null : null)),
        canAct: Boolean(isCurrent),
        canManipulateTable: Boolean(isCurrent && player.initialMeldCompleted)
      };
      return state;
    }

    // Shared devices reveal only the active local player's rack, and only after handoff confirmation.
    if (room.status !== 'playing' || !room.turn || !current || current.type !== 'human' || current.deviceId !== deviceId) return state;
    const needsReady = !(this.readyDevices.get(code)?.has(deviceId) ?? false);
    state.needsReady = needsReady;
    if (needsReady) return state;
    state.privateTurn = {
      playerId: current.id,
      rack: room.turn.rack.map((id) => (id ? byId.get(id) ?? null : null)),
      canAct: true,
      canManipulateTable: current.initialMeldCompleted
    };
    return state;
  }
}
