import { io } from 'socket.io-client';

export const socket = io({
  autoConnect: true,
  transports: ['websocket', 'polling']
});

export function emitAck<T = unknown>(event: string, payload: unknown = {}): Promise<{ ok: boolean; data?: T; error?: string }> {
  return new Promise((resolve) => {
    socket.emit(event, payload, (result: { ok: boolean; data?: T; error?: string }) => resolve(result));
  });
}
