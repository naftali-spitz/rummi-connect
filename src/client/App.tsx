import { useEffect, useMemo, useState } from 'react';
import type { AiLevel, DeviceRole, DeviceState, PublicRoomState, TurnAction } from '../shared/types';
import { socket, emitAck } from './socket';
import { HomeScreen } from './components/HomeScreen';
import { LobbyScreen } from './components/LobbyScreen';
import { GameScreen } from './components/GameScreen';
import { ResultsScreen } from './components/ResultsScreen';
import { SettingsPanel, type ThemeName } from './components/SettingsPanel';
import type { FeedbackPrefs } from './feedback';
import { randomUUID } from './utils';
import type { Language } from './i18n';

interface AckData { roomCode: string; deviceId: string; playerId?: string }

export default function App() {
  const [room, setRoom] = useState<PublicRoomState | null>(null);
  const [deviceState, setDeviceState] = useState<DeviceState>();
  const [deviceId, setDeviceId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeName>(() => (localStorage.getItem('rummi-theme') as ThemeName) || 'soft');
  const [language, setLanguage] = useState<Language>(() => localStorage.getItem('rummi-language') === 'he' ? 'he' : 'en');
  const [prefs, setPrefs] = useState<FeedbackPrefs>(() => ({
    sound: localStorage.getItem('rummi-sound') !== 'off',
    haptics: localStorage.getItem('rummi-haptics') !== 'off'
  }));

  const token = useMemo(() => {
    const saved = localStorage.getItem('rummi-device-token');
    if (saved) return saved;
    const created = randomUUID();
    localStorage.setItem('rummi-device-token', created);
    return created;
  }, []);

  useEffect(() => {
    const onRoom = (state: PublicRoomState) => setRoom(state);
    const onDevice = (state: DeviceState) => { setDeviceState(state); setDeviceId(state.deviceId); };
    socket.on('room:state', onRoom);
    socket.on('device:state', onDevice);

    const resume = async () => {
      const code = localStorage.getItem('rummi-room');
      if (!code) return;
      const result = await emitAck<AckData>('session:resume', { code, token });
      if (result.ok && result.data) setDeviceId(result.data.deviceId);
      else localStorage.removeItem('rummi-room');
    };
    if (socket.connected) void resume();
    socket.on('connect', resume);
    return () => {
      socket.off('room:state', onRoom);
      socket.off('device:state', onDevice);
      socket.off('connect', resume);
    };
  }, [token]);

  useEffect(() => {
    localStorage.setItem('rummi-theme', theme);
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('rummi-language', language);
    document.documentElement.lang = language === 'he' ? 'he' : 'en';
    document.documentElement.dir = language === 'he' ? 'rtl' : 'ltr';
  }, [language]);

  useEffect(() => {
    localStorage.setItem('rummi-sound', prefs.sound ? 'on' : 'off');
    localStorage.setItem('rummi-haptics', prefs.haptics ? 'on' : 'off');
  }, [prefs]);

  const runJoin = async (fn: () => Promise<{ ok: boolean; data?: AckData; error?: string }>) => {
    setBusy(true); setError('');
    const result = await fn();
    setBusy(false);
    if (!result.ok || !result.data) return setError(result.error || 'Unable to connect');
    setDeviceId(result.data.deviceId);
    localStorage.setItem('rummi-room', result.data.roomCode);
  };

  const create = (name: string) => void runJoin(() => emitAck<AckData>('room:create', { token, playerName: name }));
  const join = (code: string, role: DeviceRole, name?: string) => void runJoin(() => emitAck<AckData>('room:join', { code, token, role, playerName: name }));

  const action = (turnAction: TurnAction) => emitAck<{ invalidMeldIds?: string[]; message?: string }>('turn:action', { action: turnAction });
  const simple = (event: string) => () => emitAck<{ invalidMeldIds?: string[]; message?: string }>(event, {});
  const privatePlayerId = deviceState?.privateTurn?.playerId;
  const colorBlind = Boolean(deviceState?.privateTurn?.colorBlind);
  const colorBlindPlayerName = privatePlayerId ? room?.players.find((p) => p.id === privatePlayerId)?.name : undefined;
  const setPlayerColorBlind = (enabled: boolean) => {
    if (!privatePlayerId) return;
    void emitAck('player:color-blind', { playerId: privatePlayerId, enabled });
  };

  if (!room) return <HomeScreen busy={busy} error={error} language={language} onLanguage={setLanguage} onCreate={create} onJoin={join} />;

  if (room.status === 'lobby') {
    return <LobbyScreen
      state={room}
      deviceId={deviceId}
      language={language}
      onAddLocal={(name) => void emitAck('player:add-local', { name })}
      onAddAi={(name: string, level: AiLevel) => void emitAck('player:add-ai', { name, level })}
      onRemove={(playerId) => void emitAck('player:remove', { playerId })}
      onStart={() => void emitAck('game:start', {})}
    />;
  }

  if (room.status === 'finished') return <ResultsScreen state={room} isHost={room.hostDeviceId === deviceId} language={language} onRematch={() => void emitAck('game:lobby', {})} />;

  return <>
    <GameScreen
      state={room}
      deviceState={deviceState}
      deviceId={deviceId}
      theme={theme}
      prefs={prefs}
      language={language}
      colorBlind={colorBlind}
      onAction={action}
      onUndo={simple('turn:undo')}
      onRedo={simple('turn:redo')}
      onReset={simple('turn:reset')}
      onDraw={simple('turn:draw')}
      onEnd={simple('turn:end')}
      onSort={(mode) => emitAck('rack:sort', { mode })}
      onOrganize={simple('turn:organize')}
      onReady={simple('turn:ready')}
      onOpenSettings={() => setSettingsOpen(true)}
    />
    <SettingsPanel
      open={settingsOpen}
      theme={theme}
      prefs={prefs}
      language={language}
      colorBlind={colorBlind}
      colorBlindAvailable={Boolean(privatePlayerId)}
      colorBlindPlayerName={colorBlindPlayerName}
      isHost={room.hostDeviceId === deviceId}
      onTheme={setTheme}
      onPrefs={setPrefs}
      onLanguage={setLanguage}
      onColorBlind={setPlayerColorBlind}
      onRestartGame={() => emitAck('game:restart', {})}
      onNewGame={() => emitAck('game:lobby', {})}
      onClose={() => setSettingsOpen(false)}
    />
  </>;
}
