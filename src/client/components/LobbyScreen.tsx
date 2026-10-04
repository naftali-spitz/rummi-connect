import { useEffect, useState } from 'react';
import type { AiLevel, PublicRoomState } from '../../shared/types';
import { t, type Language } from '../i18n';

interface Props {
  state: PublicRoomState;
  deviceId: string;
  language: Language;
  onAddLocal: (name: string) => void;
  onAddAi: (name: string, level: AiLevel) => void;
  onRemove: (playerId: string) => void;
  onStart: () => void;
}

export function LobbyScreen({ state, deviceId, language, onAddLocal, onAddAi, onRemove, onStart }: Props) {
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

  const aiLabel = (level?: AiLevel) => level === 'easy' ? t(language, 'easyAi') : level === 'hard' ? t(language, 'hardAi') : level === 'expert' ? t(language, 'expertAi') : t(language, 'normalAi');

  return <main className="lobby-screen">
    <section className="lobby-card">
      <header className="lobby-head">
        <div><span className="eyebrow">{t(language, 'room')}</span><strong className="room-code" dir="ltr">{state.code}</strong></div>
        <div className="lobby-status">{state.players.length} {t(language, 'playerCount')} · {state.devices.length} {t(language, 'devices')}</div>
      </header>

      <div className="lobby-columns">
        <div>
          <h2>{t(language, 'players')}</h2>
          <div className="player-list">
            {state.players.map((p, idx) => <div className="player-row" key={p.id}>
              <span className="seat">{idx + 1}</span>
              <div className="player-main"><strong>{p.name}</strong><small>{p.type === 'computer' ? aiLabel(p.aiLevel) : p.deviceId === deviceId ? t(language, 'thisDevice') : t(language, 'remoteDevice')}</small></div>
              {(isHost || p.deviceId === deviceId) && <button className="icon-btn" onClick={() => onRemove(p.id)} aria-label={t(language, 'removePlayer', { name: p.name })}>×</button>}
            </div>)}
          </div>

          {!isDisplay && state.players.length < 6 && <div className="lobby-add">
            <input value={localName} onChange={(e) => setLocalName(e.target.value)} placeholder={t(language, 'anotherPlayer')} />
            <button onClick={() => { if (localName.trim()) { onAddLocal(localName.trim()); setLocalName(''); } }}>{t(language, 'add')}</button>
          </div>}

          {isHost && state.players.length < 6 && <div className="ai-add">
            <select value={aiLevel} onChange={(e) => setAiLevel(e.target.value as AiLevel)}>
              <option value="easy">{t(language, 'easyAi')}</option><option value="normal">{t(language, 'normalAi')}</option><option value="hard">{t(language, 'hardAi')}</option><option value="expert">{t(language, 'expertAi')}</option>
            </select>
            <button onClick={() => onAddAi(`${t(language, 'computer')} ${state.players.filter((p) => p.type === 'computer').length + 1}`, aiLevel)}>{t(language, 'addComputer')}</button>
          </div>}
        </div>

        <aside className="join-panel">
          <h2>{t(language, 'joinAnother')}</h2>
          {qr && <img src={qr} alt="QR code" className="qr" />}
          <strong>{t(language, 'roomCodeLabel', { code: state.code })}</strong>
          {urls.slice(0, 2).map((url) => <small key={url} dir="ltr">{url}</small>)}
          <p>{t(language, 'joinHelp')}</p>
        </aside>
      </div>

      {isHost ? <button className="primary big start-game" disabled={state.players.length < 2} onClick={onStart}>{t(language, 'startGame')}</button> : <div className="waiting">{t(language, 'waitingHost')}</div>}
    </section>
  </main>;
}
