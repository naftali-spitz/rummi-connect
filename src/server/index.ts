import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import QRCode from 'qrcode';
import { Server as SocketIOServer } from 'socket.io';
import type { AiLevel, DeviceRole, DragPresence, TurnAction } from '../shared/types.js';
import { RoomStorage } from './storage.js';
import { RoomManager } from './roomManager.js';
import { planAiTurn } from './ai.js';

const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.resolve(process.env.DATA_DIR || './data');
const IS_PROD = process.env.NODE_ENV === 'production';

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: IS_PROD ? undefined : { origin: true, credentials: true }
});

const storage = new RoomStorage(DATA_DIR);
const manager = new RoomManager(storage);
const contexts = new Map<string, { roomCode: string; deviceId: string; token: string }>();
const aiTimers = new Map<string, NodeJS.Timeout>();
const dragLastAt = new Map<string, number>();

function clearAiTimer(code: string): void {
  const timer = aiTimers.get(code);
  if (!timer) return;
  clearTimeout(timer);
  aiTimers.delete(code);
}

app.use(express.json());

function lanUrls(port = PORT): string[] {
  const urls: string[] = [];
  const nets = os.networkInterfaces();
  for (const entries of Object.values(nets)) {
    for (const entry of entries ?? []) {
      if (entry.family === 'IPv4' && !entry.internal) urls.push(`http://${entry.address}:${port}`);
    }
  }
  return urls;
}

app.get('/api/health', (_req, res) => res.json({ ok: true, rooms: manager.rooms.size }));
app.get('/api/server-info', (_req, res) => { const publicPort = IS_PROD ? PORT : 5173; res.json({ urls: lanUrls(publicPort), port: publicPort }); });
app.get('/api/qr', async (req, res) => {
  const url = String(req.query.url || '');
  if (!url) return res.status(400).json({ error: 'url is required' });
  try {
    const dataUrl = await QRCode.toDataURL(url, { margin: 1, width: 260 });
    res.json({ dataUrl });
  } catch {
    res.status(500).json({ error: 'QR generation failed' });
  }
});

function attachSocketToRoom(socketId: string, roomCode: string, deviceId: string, token: string): void {
  const socket = io.sockets.sockets.get(socketId);
  if (!socket) return;
  const old = contexts.get(socketId);
  if (old) socket.leave(old.roomCode);
  contexts.set(socketId, { roomCode, deviceId, token });
  socket.join(roomCode);
}

function broadcastRoom(code: string): void {
  const publicState = manager.publicState(code);
  if (!publicState) return;
  io.to(code).emit('room:state', publicState);
  for (const [socketId, context] of contexts) {
    if (context.roomCode !== code) continue;
    const socket = io.sockets.sockets.get(socketId);
    if (!socket) continue;
    const deviceState = manager.deviceState(code, context.deviceId);
    if (deviceState) socket.emit('device:state', deviceState);
  }
}

function scheduleAi(code: string): void {
  if (aiTimers.has(code)) return;
  const room = manager.getRoom(code);
  const current = room ? manager.currentPlayer(room) : undefined;
  if (!room || room.status !== 'playing' || !current || current.type !== 'computer') return;
  const timer = setTimeout(() => {
    aiTimers.delete(code);
    void runAiTurn(code);
  }, 650);
  aiTimers.set(code, timer);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function runAiTurn(code: string): Promise<void> {
  const room = manager.getRoom(code);
  const current = room ? manager.currentPlayer(room) : undefined;
  if (!room || !current || current.type !== 'computer' || room.status !== 'playing') return;
  const playerId = current.id;
  const plan = planAiTurn({
    playerId: current.id,
    aiLevel: current.aiLevel ?? 'normal',
    initialMeldCompleted: current.initialMeldCompleted,
    tiles: room.tiles,
    table: room.turn?.table ?? room.table,
    rack: room.turn?.rack ?? current.rack
  });
  if (plan.length === 0) {
    manager.drawAi(code, playerId);
    broadcastRoom(code);
    scheduleAi(code);
    return;
  }

  for (const action of plan) {
    const live = manager.getRoom(code);
    if (!live || manager.currentPlayer(live)?.id !== playerId) return;
    const result = manager.applyAiAction(code, playerId, action);
    if (!result.ok) break;
    broadcastRoom(code);
    await sleep(current.aiLevel === 'easy' ? 520 : current.aiLevel === 'expert' ? 180 : 320);
  }

  const commit = manager.endAiTurn(code, playerId);
  if (!commit.ok) manager.drawAi(code, playerId);
  broadcastRoom(code);
  scheduleAi(code);
}

io.on('connection', (socket) => {
  socket.on('room:create', (payload: { token: string; playerName: string }, ack?: (v: unknown) => void) => {
    const result = manager.createRoom(payload.token, payload.playerName);
    if (result.ok && result.data) {
      attachSocketToRoom(socket.id, result.data.roomCode, result.data.deviceId, payload.token);
      broadcastRoom(result.data.roomCode);
    }
    ack?.(result);
  });

  socket.on('room:join', (payload: { code: string; token: string; role: DeviceRole; playerName?: string }, ack?: (v: unknown) => void) => {
    const result = manager.joinRoom(payload.code, payload.token, payload.role, payload.playerName);
    if (result.ok && result.data) {
      attachSocketToRoom(socket.id, result.data.roomCode, result.data.deviceId, payload.token);
      broadcastRoom(result.data.roomCode);
    }
    ack?.(result);
  });

  socket.on('session:resume', (payload: { code: string; token: string }, ack?: (v: unknown) => void) => {
    const result = manager.resumeRoom(payload.code, payload.token);
    if (result.ok && result.data) {
      attachSocketToRoom(socket.id, result.data.roomCode, result.data.deviceId, payload.token);
      broadcastRoom(result.data.roomCode);
    }
    ack?.(result);
  });

  socket.on('player:add-local', (payload: { name: string }, ack?: (v: unknown) => void) => {
    const ctx = contexts.get(socket.id);
    if (!ctx) return ack?.({ ok: false, error: 'Not in a room' });
    const result = manager.addLocalPlayer(ctx.roomCode, ctx.deviceId, payload.name);
    broadcastRoom(ctx.roomCode);
    ack?.(result);
  });

  socket.on('player:add-ai', (payload: { name: string; level: AiLevel }, ack?: (v: unknown) => void) => {
    const ctx = contexts.get(socket.id);
    if (!ctx) return ack?.({ ok: false, error: 'Not in a room' });
    const result = manager.addAi(ctx.roomCode, ctx.deviceId, payload.name, payload.level);
    broadcastRoom(ctx.roomCode);
    ack?.(result);
  });

  socket.on('player:remove', (payload: { playerId: string }, ack?: (v: unknown) => void) => {
    const ctx = contexts.get(socket.id);
    if (!ctx) return ack?.({ ok: false, error: 'Not in a room' });
    const result = manager.removePlayer(ctx.roomCode, ctx.deviceId, payload.playerId);
    broadcastRoom(ctx.roomCode);
    ack?.(result);
  });

  socket.on('game:lobby', (_payload: unknown, ack?: (v: unknown) => void) => {
    const ctx = contexts.get(socket.id);
    if (!ctx) return ack?.({ ok: false, error: 'Not in a room' });
    const result = manager.returnToLobby(ctx.roomCode, ctx.deviceId);
    if (result.ok) {
      clearAiTimer(ctx.roomCode);
      broadcastRoom(ctx.roomCode);
    }
    ack?.(result);
  });

  socket.on('game:restart', (_payload: unknown, ack?: (v: unknown) => void) => {
    const ctx = contexts.get(socket.id);
    if (!ctx) return ack?.({ ok: false, error: 'Not in a room' });
    const result = manager.restartGame(ctx.roomCode, ctx.deviceId);
    if (result.ok) {
      clearAiTimer(ctx.roomCode);
      broadcastRoom(ctx.roomCode);
      scheduleAi(ctx.roomCode);
    }
    ack?.(result);
  });

  socket.on('game:start', (_payload: unknown, ack?: (v: unknown) => void) => {
    const ctx = contexts.get(socket.id);
    if (!ctx) return ack?.({ ok: false, error: 'Not in a room' });
    const result = manager.startGame(ctx.roomCode, ctx.deviceId);
    if (result.ok) {
      clearAiTimer(ctx.roomCode);
      broadcastRoom(ctx.roomCode);
      scheduleAi(ctx.roomCode);
    }
    ack?.(result);
  });

  socket.on('turn:ready', (_payload: unknown, ack?: (v: unknown) => void) => {
    const ctx = contexts.get(socket.id);
    if (!ctx) return ack?.({ ok: false, error: 'Not in a room' });
    const result = manager.markReady(ctx.roomCode, ctx.deviceId);
    broadcastRoom(ctx.roomCode);
    ack?.(result);
  });

  socket.on('turn:organize', (_payload: unknown, ack?: (v: unknown) => void) => {
    const ctx = contexts.get(socket.id);
    if (!ctx) return ack?.({ ok: false, error: 'Not in a room' });
    const result = manager.organizeTable(ctx.roomCode, ctx.deviceId);
    if (result.ok) broadcastRoom(ctx.roomCode);
    ack?.(result);
  });

  socket.on('rack:sort', (payload: { mode: 'number' | 'color' }, ack?: (v: unknown) => void) => {
    const ctx = contexts.get(socket.id);
    if (!ctx) return ack?.({ ok: false, error: 'Not in a room' });
    const result = manager.sortRack(ctx.roomCode, ctx.deviceId, payload.mode);
    if (result.ok) broadcastRoom(ctx.roomCode);
    ack?.(result);
  });

  socket.on('turn:action', (payload: { action: TurnAction }, ack?: (v: unknown) => void) => {
    const ctx = contexts.get(socket.id);
    if (!ctx) return ack?.({ ok: false, error: 'Not in a room' });
    const result = manager.applyAction(ctx.roomCode, ctx.deviceId, payload.action);
    if (result.ok) broadcastRoom(ctx.roomCode);
    ack?.(result);
  });

  socket.on('turn:undo', (_payload: unknown, ack?: (v: unknown) => void) => {
    const ctx = contexts.get(socket.id);
    if (!ctx) return ack?.({ ok: false, error: 'Not in a room' });
    const result = manager.undo(ctx.roomCode, ctx.deviceId);
    if (result.ok) broadcastRoom(ctx.roomCode);
    ack?.(result);
  });

  socket.on('turn:reset', (_payload: unknown, ack?: (v: unknown) => void) => {
    const ctx = contexts.get(socket.id);
    if (!ctx) return ack?.({ ok: false, error: 'Not in a room' });
    const result = manager.resetTurn(ctx.roomCode, ctx.deviceId);
    if (result.ok) broadcastRoom(ctx.roomCode);
    ack?.(result);
  });

  socket.on('turn:draw', (_payload: unknown, ack?: (v: unknown) => void) => {
    const ctx = contexts.get(socket.id);
    if (!ctx) return ack?.({ ok: false, error: 'Not in a room' });
    const result = manager.draw(ctx.roomCode, ctx.deviceId);
    if (result.ok) {
      broadcastRoom(ctx.roomCode);
      scheduleAi(ctx.roomCode);
    }
    ack?.(result);
  });

  socket.on('turn:end', (_payload: unknown, ack?: (v: unknown) => void) => {
    const ctx = contexts.get(socket.id);
    if (!ctx) return ack?.({ ok: false, error: 'Not in a room' });
    const result = manager.endTurn(ctx.roomCode, ctx.deviceId);
    if (result.ok) {
      broadcastRoom(ctx.roomCode);
      scheduleAi(ctx.roomCode);
    }
    ack?.(result);
  });

  socket.on('drag:presence', (payload: Omit<DragPresence, 'roomCode' | 'playerId' | 'sentAt'>) => {
    const ctx = contexts.get(socket.id);
    if (!ctx || !payload || !Array.isArray(payload.tileIds) || payload.tileIds.length < 1 || payload.tileIds.length > 14) return;
    if (!['start','move','end'].includes(payload.phase) || typeof payload.nx !== 'number' || typeof payload.ny !== 'number') return;
    if (payload.phase === 'move') {
      const now = Date.now();
      const last = dragLastAt.get(socket.id) ?? 0;
      if (now - last < 25) return;
      dragLastAt.set(socket.id, now);
    }
    const room = manager.getRoom(ctx.roomCode);
    const current = room ? manager.currentPlayer(room) : undefined;
    if (!room || !room.turn || !current || current.type !== 'human' || current.deviceId !== ctx.deviceId) return;
    const publicIds = new Set(room.turn.table.flatMap((m) => m.tileIds));
    if (!payload.tileIds.every((id) => publicIds.has(id))) return; // Never leak a rack-origin drag.
    const presence: DragPresence = {
      ...payload,
      roomCode: ctx.roomCode,
      playerId: current.id,
      nx: Math.max(0, Math.min(1, payload.nx)),
      ny: Math.max(0, Math.min(1, payload.ny)),
      sentAt: Date.now()
    };
    socket.to(ctx.roomCode).emit('drag:presence', presence);
  });

  socket.on('disconnect', () => {
    contexts.delete(socket.id);
    dragLastAt.delete(socket.id);
  });
});

if (IS_PROD) {
  const dist = path.resolve(process.cwd(), 'dist');
  app.use(express.static(dist, { maxAge: '1h' }));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

server.listen(PORT, HOST, () => {
  console.log(`Rummi server listening on http://${HOST}:${PORT}`);
  const urls = lanUrls();
  if (urls.length) console.log(`LAN: ${urls.join('  ')}`);
  for (const code of manager.rooms.keys()) scheduleAi(code);
});
