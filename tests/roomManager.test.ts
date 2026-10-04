import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { RoomManager } from '../src/server/roomManager';
import { RoomStorage } from '../src/server/storage';

function manager() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rummi-test-'));
  return { dir, manager: new RoomManager(new RoomStorage(dir)) };
}

describe('room manager', () => {
  it('deals 14 tiles and keeps the correct pool size', () => {
    const { manager: m } = manager();
    const created = m.createRoom('host', 'Host').data!;
    m.joinRoom(created.roomCode, 'remote', 'playing', 'Remote');
    expect(m.startGame(created.roomCode, created.deviceId).ok).toBe(true);
    const room = m.getRoom(created.roomCode)!;
    expect(room.players.map((p) => p.rack.filter(Boolean).length)).toEqual([14, 14]);
    expect(room.pool.length).toBe(78);
  });

  it('does not reveal a shared-device rack before handoff readiness', () => {
    const { manager: m } = manager();
    const created = m.createRoom('shared', 'Alice').data!;
    m.addLocalPlayer(created.roomCode, created.deviceId, 'Bob');
    m.startGame(created.roomCode, created.deviceId);
    expect(m.deviceState(created.roomCode, created.deviceId)?.needsReady).toBe(true);
    expect(m.deviceState(created.roomCode, created.deviceId)?.privateTurn).toBeUndefined();
    m.markReady(created.roomCode, created.deviceId);
    expect(m.deviceState(created.roomCode, created.deviceId)?.privateTurn?.rack.filter(Boolean)).toHaveLength(14);
  });

  it('keeps color-blind mode per player on a shared device', () => {
    const { manager: m } = manager();
    const created = m.createRoom('shared', 'Alice').data!;
    const bob = m.addLocalPlayer(created.roomCode, created.deviceId, 'Bob').data!;

    expect(m.setPlayerColorBlind(created.roomCode, created.deviceId, created.playerId, true).ok).toBe(true);
    expect(m.setPlayerColorBlind(created.roomCode, created.deviceId, bob.playerId, false).ok).toBe(true);
    expect(m.startGame(created.roomCode, created.deviceId).ok).toBe(true);

    expect(m.deviceState(created.roomCode, created.deviceId)?.needsReady).toBe(true);
    expect(m.markReady(created.roomCode, created.deviceId).ok).toBe(true);
    expect(m.deviceState(created.roomCode, created.deviceId)?.privateTurn).toMatchObject({
      playerId: created.playerId,
      colorBlind: true
    });

    expect(m.draw(created.roomCode, created.deviceId).ok).toBe(true);
    expect(m.deviceState(created.roomCode, created.deviceId)?.needsReady).toBe(true);
    expect(m.markReady(created.roomCode, created.deviceId).ok).toBe(true);
    expect(m.deviceState(created.roomCode, created.deviceId)?.privateTurn).toMatchObject({
      playerId: bob.playerId,
      colorBlind: false
    });
  });

  it('restarts an active game with the same players and fresh tiles', () => {
    const { manager: m } = manager();
    const created = m.createRoom('host', 'Host').data!;
    m.joinRoom(created.roomCode, 'remote', 'playing', 'Remote');
    expect(m.startGame(created.roomCode, created.deviceId).ok).toBe(true);
    const before = m.getRoom(created.roomCode)!;
    const playerIds = before.players.map((p) => p.id);
    expect(m.restartGame(created.roomCode, created.deviceId).ok).toBe(true);
    const after = m.getRoom(created.roomCode)!;
    expect(after.status).toBe('playing');
    expect(after.players.map((p) => p.id)).toEqual(playerIds);
    expect(after.players.map((p) => p.rack.filter(Boolean).length)).toEqual([14, 14]);
    expect(after.pool.length).toBe(78);
    expect(after.table).toEqual([]);
    expect(after.players.every((p) => !p.initialMeldCompleted && p.score === 0)).toBe(true);
  });

  it('lets the host abandon an active game and return everyone to the lobby', () => {
    const { manager: m } = manager();
    const created = m.createRoom('host', 'Host').data!;
    m.joinRoom(created.roomCode, 'remote', 'playing', 'Remote');
    expect(m.startGame(created.roomCode, created.deviceId).ok).toBe(true);

    expect(m.returnToLobby(created.roomCode, created.deviceId).ok).toBe(true);
    const room = m.getRoom(created.roomCode)!;
    expect(room.status).toBe('lobby');
    expect(room.turn).toBeNull();
    expect(room.table).toEqual([]);
    expect(room.pool).toEqual([]);
    expect(room.players.map((p) => p.rack.filter(Boolean).length)).toEqual([0, 0]);
  });

  it('undoes and redoes a turn action and clears redo after a new move', () => {
    const { manager: m } = manager();
    const created = m.createRoom('host', 'Host').data!;
    m.joinRoom(created.roomCode, 'remote', 'playing', 'Remote');
    expect(m.startGame(created.roomCode, created.deviceId).ok).toBe(true);
    const room = m.getRoom(created.roomCode)!;
    const original = [...room.turn!.rack];
    const tileId = room.turn!.rack.find((id): id is string => Boolean(id))!;

    expect(m.applyAction(created.roomCode, created.deviceId, { type: 'RACK_REORDER', tileId, targetIndex: 20 }).ok).toBe(true);
    const moved = [...room.turn!.rack];
    expect(moved).not.toEqual(original);

    expect(m.undo(created.roomCode, created.deviceId).ok).toBe(true);
    expect(room.turn!.rack).toEqual(original);
    expect(m.redo(created.roomCode, created.deviceId).ok).toBe(true);
    expect(room.turn!.rack).toEqual(moved);

    expect(m.undo(created.roomCode, created.deviceId).ok).toBe(true);
    expect(m.applyAction(created.roomCode, created.deviceId, { type: 'RACK_REORDER', tileId, targetIndex: 21 }).ok).toBe(true);
    expect(m.redo(created.roomCode, created.deviceId).ok).toBe(false);
  });

  it('accepts a deterministic 33-point opening run', () => {
    const { manager: m } = manager();
    const created = m.createRoom('a', 'A').data!;
    m.joinRoom(created.roomCode, 'b', 'playing', 'B');
    m.startGame(created.roomCode, created.deviceId);
    const room = m.getRoom(created.roomCode)!;
    const player = room.players[0];
    player.rack = Array(28).fill(null);
    ['red-10-1', 'red-11-1', 'red-12-1'].forEach((id, i) => { player.rack[i] = id; });
    room.turn!.rack = [...player.rack];
    room.turn!.originalRackTileIds = ['red-10-1', 'red-11-1', 'red-12-1'];
    room.turn!.table = [];
    room.table = [];
    const meldId = 'opening';
    for (const [i, id] of ['red-10-1', 'red-11-1', 'red-12-1'].entries()) {
      expect(m.applyAction(created.roomCode, created.deviceId, {
        type: 'RACK_TO_TABLE', tileId: id,
        targetMeldId: i ? meldId : undefined,
        targetIndex: i,
        newMeldId: i ? undefined : meldId
      }).ok).toBe(true);
    }
    expect(m.endTurn(created.roomCode, created.deviceId).ok).toBe(true);
    expect(player.initialMeldCompleted).toBe(true);
  });
});
