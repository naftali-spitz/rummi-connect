import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { PersistedRoom } from '../shared/types.js';

export class RoomStorage {
  private db: DatabaseSync;

  constructor(dataDir: string) {
    fs.mkdirSync(dataDir, { recursive: true });
    this.db = new DatabaseSync(path.join(dataDir, 'rummi.sqlite'));
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS rooms (
        code TEXT PRIMARY KEY,
        state TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
  }

  loadAll(): PersistedRoom[] {
    const rows = this.db.prepare('SELECT state FROM rooms ORDER BY updated_at DESC').all() as Array<{ state: string }>;
    const result: PersistedRoom[] = [];
    for (const row of rows) {
      try {
        result.push(JSON.parse(row.state) as PersistedRoom);
      } catch {
        // Ignore malformed rows rather than preventing the server from starting.
      }
    }
    return result;
  }

  save(room: PersistedRoom): void {
    room.updatedAt = Date.now();
    this.db.prepare(`
      INSERT INTO rooms(code, state, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(code) DO UPDATE SET state=excluded.state, updated_at=excluded.updated_at
    `).run(room.code, JSON.stringify(room), room.updatedAt);
  }

  delete(code: string): void {
    this.db.prepare('DELETE FROM rooms WHERE code = ?').run(code);
  }
}
