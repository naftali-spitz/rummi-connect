import { useState } from 'react';
import type { DeviceRole } from '../../shared/types';

interface Props {
  busy: boolean;
  error?: string;
  onCreate: (name: string) => void;
  onJoin: (code: string, role: DeviceRole, name?: string) => void;
}

export function HomeScreen({ busy, error, onCreate, onJoin }: Props) {
  const [name, setName] = useState(localStorage.getItem('rummi-name') || '');
  const [code, setCode] = useState(() => new URLSearchParams(location.search).get('room')?.replace(/\D/g, '').slice(0, 6) || '');

  const remember = () => {
    const clean = name.trim() || 'Player';
    localStorage.setItem('rummi-name', clean);
    return clean;
  };

  return <main className="home-screen">
    <section className="home-card">
      <div className="brand-mark">R</div>
      <h1>Rummi</h1>
      <p className="home-sub">A live tabletop game for the people in the room.</p>

      <label className="field-label">Your name</label>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Player name" maxLength={24} />
      <button className="primary big" disabled={busy} onClick={() => onCreate(remember())}>Create game</button>

      <div className="or"><span>or join a table</span></div>
      <label className="field-label">Room code</label>
      <input className="room-code-input" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="5821" inputMode="numeric" />
      <div className="join-grid">
        <button disabled={busy || !code} onClick={() => onJoin(code, 'playing', remember())}>Playing device</button>
        <button disabled={busy || !code} onClick={() => onJoin(code, 'display')}>TV / display</button>
      </div>
      {error && <div className="error-banner">{error}</div>}
    </section>
  </main>;
}
