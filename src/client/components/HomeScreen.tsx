import { useState } from 'react';
import type { DeviceRole } from '../../shared/types';
import { t, type Language } from '../i18n';

interface Props {
  busy: boolean;
  error?: string;
  language: Language;
  onLanguage: (language: Language) => void;
  onCreate: (name: string) => void;
  onJoin: (code: string, role: DeviceRole, name?: string) => void;
}

export function HomeScreen({ busy, error, language, onLanguage, onCreate, onJoin }: Props) {
  const [name, setName] = useState(localStorage.getItem('rummi-name') || '');
  const [code, setCode] = useState(() => new URLSearchParams(location.search).get('room')?.replace(/\D/g, '').slice(0, 6) || '');

  const remember = () => {
    const clean = name.trim() || 'Player';
    localStorage.setItem('rummi-name', clean);
    return clean;
  };

  return <main className="home-screen">
    <section className="home-card">
      <div className="home-language" aria-label={t(language, 'language')}>
        <button className={language === 'en' ? 'active' : ''} onClick={() => onLanguage('en')}>EN</button>
        <button className={language === 'he' ? 'active' : ''} onClick={() => onLanguage('he')}>עברית</button>
      </div>
      <div className="brand-mark">R</div>
      <h1>Rummi</h1>
      <p className="home-sub">{t(language, 'tagline')}</p>

      <label className="field-label">{t(language, 'yourName')}</label>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t(language, 'playerName')} maxLength={24} />
      <button className="primary big" disabled={busy} onClick={() => onCreate(remember())}>{t(language, 'createGame')}</button>

      <div className="or"><span>{t(language, 'orJoin')}</span></div>
      <label className="field-label">{t(language, 'roomCode')}</label>
      <input className="room-code-input" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="5821" inputMode="numeric" dir="ltr" />
      <div className="join-grid">
        <button disabled={busy || !code} onClick={() => onJoin(code, 'playing', remember())}>{t(language, 'playingDevice')}</button>
        <button disabled={busy || !code} onClick={() => onJoin(code, 'display')}>{t(language, 'tvDisplay')}</button>
      </div>
      {error && <div className="error-banner">{error}</div>}
    </section>
  </main>;
}
