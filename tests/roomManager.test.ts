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
