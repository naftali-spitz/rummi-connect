export type TileColor = 'black' | 'blue' | 'red' | 'orange';
export type AiLevel = 'easy' | 'normal' | 'hard' | 'expert';
export type DeviceRole = 'playing' | 'display';
export type GameStatus = 'lobby' | 'playing' | 'finished';

export interface Tile {
  id: string;
  color: TileColor | 'joker';
  number: number | null;
}

export interface Meld {
  id: string;
  tileIds: string[];
}

export type RackSlots = Array<string | null>;

export interface Player {
  id: string;
  name: string;
  type: 'human' | 'computer';
  deviceId?: string;
  aiLevel?: AiLevel;
  rack: RackSlots;
  initialMeldCompleted: boolean;
  score: number;
  colorBlind: boolean;
}

export interface Device {
  id: string;
  token: string;
  role: DeviceRole;
  playerIds: string[];
  host: boolean;
}

export interface TurnSnapshot {
  table: Meld[];
  rack: RackSlots;
}

export interface TurnState {
  playerId: string;
  table: Meld[];
  rack: RackSlots;
  originalRackTileIds: string[];
  history: TurnSnapshot[];
  future: TurnSnapshot[];
}

export interface PersistedRoom {
  code: string;
  status: GameStatus;
  hostDeviceId: string;
  devices: Device[];
  players: Player[];
  tiles: Tile[];
  table: Meld[];
  pool: string[];
  turnIndex: number;
  turn: TurnState | null;
  winnerId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface PublicMeld {
  id: string;
  tiles: Tile[];
}

export interface PublicPlayer {
  id: string;
  name: string;
  type: 'human' | 'computer';
  aiLevel?: AiLevel;
  deviceId?: string;
  rackCount: number;
  initialMeldCompleted: boolean;
  score: number;
}

export interface PublicRoomState {
  code: string;
  status: GameStatus;
  hostDeviceId: string;
  devices: Array<Pick<Device, 'id' | 'role' | 'playerIds' | 'host'>>;
  players: PublicPlayer[];
  table: PublicMeld[];
  poolCount: number;
  currentPlayerId?: string;
  winnerId?: string;
  updatedAt: number;
}

export interface PrivateTurnState {
  playerId: string;
  rack: Array<Tile | null>;
  canAct: boolean;
  canManipulateTable: boolean;
  colorBlind: boolean;
}

export interface DeviceState {
  deviceId: string;
  needsReady: boolean;
  privateTurn?: PrivateTurnState;
}

export type TurnAction =
  | { type: 'RACK_REORDER'; tileId: string; targetIndex: number }
  | { type: 'RACK_TO_TABLE'; tileId: string; targetMeldId?: string; targetIndex: number; newMeldId?: string }
  | { type: 'TABLE_TO_TABLE'; tileId: string; sourceMeldId: string; targetMeldId?: string; targetIndex: number; newMeldId?: string }
  | { type: 'TABLE_TO_RACK'; tileId: string; sourceMeldId: string; targetIndex: number }
  | { type: 'MOVE_TAIL'; sourceMeldId: string; startIndex: number; targetMeldId?: string; targetIndex: number; newMeldId?: string }
  | { type: 'SPLIT_MELD'; meldId: string; splitIndex: number; newMeldId: string };

export interface DragPresence {
  roomCode: string;
  playerId: string;
  dragId: string;
  tileIds: string[];
  nx: number;
  ny: number;
  phase: 'start' | 'move' | 'end';
  sentAt: number;
}

export interface ValidationResult {
  valid: boolean;
  kind?: 'group' | 'run';
  points: number;
  reason?: string;
  resolvedNumbers?: number[];
}
