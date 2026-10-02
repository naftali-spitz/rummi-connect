import { useEffect, useState } from 'react';
import type { AiLevel, PublicRoomState } from '../../shared/types';

interface Props {
  state: PublicRoomState;
  deviceId: string;
  onAddLocal: (name: string) => void;
  onAddAi: (name: string, level: AiLevel) => void;
  onRemove: (playerId: string) => void;
  onStart: () => void;
}

export function LobbyScreen({ state, deviceId, onAddLocal, onAddAi, onRemove, onStart }: Props) {
  const [localName, setLocalName] = useState('');
  const [aiLevel, setAiLevel] = useState<AiLevel>('normal');
  const [urls, setUrls] = useState<string[]>([]);
  const [qr, setQr] = useState('');
  const device = state.devices.find((d) => d.id === deviceId);
  const isHost = state.hostDeviceId === deviceId;
  const isDisplay = device?.role === 'display';

  useEffect(() => {
    void fetch('/api/server-info').then((r) => r.json()).then(async (data: { urls: string[] }) => {
      const list = data.urls || [];
      setUrls(list);
      const base = list[0] || window.location.origin;
      const joinUrl = `${base}/?room=${state.code}`;
      const q = await fetch(`/api/qr?url=${encodeURIComponent(joinUrl)}`).then((r) => r.json()) as { dataUrl?: string };
      if (q.dataUrl) setQr(q.dataUrl);
    }).catch(() => undefined);
  }, [state.code]);

  return <main className="lobby-screen">
    <section className="lobby-card">
      <header className="lobby-head">
        <div><span className="eyebrow">ROOM</span><strong className="room-code">{state.code}</strong></div>
        <div className="lobby-status">{state.players.length} players · {state.devices.length} devices</div>
      </header>

      <div className="lobby-columns">
        <div>
          <h2>Players</h2>
          <div className="player-list">
            {state.players.map((p, idx) => <div className="player-row" key={p.id}>
              <span className="seat">{idx + 1}</span>
              <div className="player-main"><strong>{p.name}</strong><small>{p.type === 'computer' ? `Computer · ${p.aiLevel}` : p.deviceId === deviceId ? 'This device' : 'Remote device'}</small></div>
              {(isHost || p.deviceId === deviceId) && <button className="icon-btn" onClick={() => onRemove(p.id)} aria-label={`Remove ${p.name}`}>×</button>}
            </div>)}
          </div>

          {!isDisplay && state.players.length < 6 && <div className="lobby-add">
            <input value={localName} onChange={(e) => setLocalName(e.target.value)} placeholder="Another player on this device" />
            <button onClick={() => { if (localName.trim()) { onAddLocal(localName.trim()); setLocalName(''); } }}>Add</button>
          </div>}

          {isHost && state.players.length < 6 && <div className="ai-add">
            <select value={aiLevel} onChange={(e) => setAiLevel(e.target.value as AiLevel)}>
              <option value="easy">Easy AI</option><option value="normal">Normal AI</option><option value="hard">Hard AI</option><option value="expert">Expert AI</option>
            </select>
            <button onClick={() => onAddAi(`Computer ${state.players.filter((p) => p.type === 'computer').length + 1}`, aiLevel)}>+ Computer</button>
          </div>}
        </div>

        <aside className="join-panel">
          <h2>Join from another device</h2>
          {qr && <img src={qr} alt="QR code to join this room" className="qr" />}
          <strong>Room code {state.code}</strong>
          {urls.slice(0, 2).map((url) => <small key={url}>{url}</small>)}
          <p>Open the address on the same network and enter the room code.</p>
        </aside>
      </div>

      {isHost ? <button className="primary big start-game" disabled={state.players.length < 2} onClick={onStart}>Start game</button> : <div className="waiting">Waiting for the host to start…</div>}
    </section>
  </main>;
}
