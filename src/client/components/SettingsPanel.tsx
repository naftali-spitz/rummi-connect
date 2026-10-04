import type { FeedbackPrefs } from '../feedback';
import { t, type Language } from '../i18n';

export type ThemeName = 'classic' | 'soft' | 'minimal' | 'playful';

interface Props {
  open: boolean;
  theme: ThemeName;
  prefs: FeedbackPrefs;
  language: Language;
  colorBlind: boolean;
  isHost: boolean;
  onTheme: (theme: ThemeName) => void;
  onPrefs: (prefs: FeedbackPrefs) => void;
  onLanguage: (language: Language) => void;
  onColorBlind: (enabled: boolean) => void;
  onRestartGame: () => Promise<{ ok: boolean; error?: string }>;
  onNewGame: () => Promise<{ ok: boolean; error?: string }>;
  onClose: () => void;
}

export function SettingsPanel({ open, theme, prefs, language, colorBlind, isHost, onTheme, onPrefs, onLanguage, onColorBlind, onRestartGame, onNewGame, onClose }: Props) {
  if (!open) return null;

  const restartGame = async () => {
    if (!window.confirm(t(language, 'restartConfirm'))) return;
    const result = await onRestartGame();
    if (!result.ok) return window.alert(result.error || t(language, 'restartFail'));
    onClose();
  };

  const newGame = async () => {
    if (!window.confirm(t(language, 'newGameConfirm'))) return;
    const result = await onNewGame();
    if (!result.ok) return window.alert(result.error || t(language, 'newGameFail'));
    onClose();
  };

  const themeLabel = (value: ThemeName) => value === 'classic' ? t(language, 'classic') : value === 'soft' ? t(language, 'soft') : value === 'minimal' ? t(language, 'minimal') : t(language, 'playful');

  return <div className="settings-backdrop" onPointerDown={onClose}>
    <section className="settings-panel" onPointerDown={(e) => e.stopPropagation()}>
      <div className="settings-head"><strong>{t(language, 'settings')}</strong><button className="icon-btn" onClick={onClose}>×</button></div>

      <label>{t(language, 'language')}</label>
      <div className="language-grid">
        <button className={language === 'en' ? 'active' : ''} onClick={() => onLanguage('en')}>{t(language, 'english')}</button>
        <button className={language === 'he' ? 'active' : ''} onClick={() => onLanguage('he')}>{t(language, 'hebrew')}</button>
      </div>

      <label>{t(language, 'theme')}</label>
      <div className="theme-grid">
        {(['classic', 'soft', 'minimal', 'playful'] as ThemeName[]).map((value) => <button key={value} className={`theme-option ${theme === value ? 'active' : ''}`} onClick={() => onTheme(value)}><span className={`theme-swatch ${value}`} />{themeLabel(value)}</button>)}
      </div>
      <label className="toggle-row"><span>{t(language, 'sound')}</span><input type="checkbox" checked={prefs.sound} onChange={(e) => onPrefs({ ...prefs, sound: e.target.checked })} /></label>
      <label className="toggle-row"><span>{t(language, 'haptics')}</span><input type="checkbox" checked={prefs.haptics} onChange={(e) => onPrefs({ ...prefs, haptics: e.target.checked })} /></label>
      <label className="toggle-row colorblind-toggle"><span><strong>{t(language, 'colorBlind')}</strong><small>{t(language, 'colorBlindHelp')}</small></span><input type="checkbox" checked={colorBlind} onChange={(e) => onColorBlind(e.target.checked)} /></label>
      <button onClick={() => document.documentElement.requestFullscreen?.()}>{t(language, 'fullscreen')}</button>

      {isHost && <>
        <label>{t(language, 'game')}</label>
        <div className="game-management">
          <button className="restart-game-btn" onClick={() => void restartGame()}>{t(language, 'restartGame')}</button>
          <button className="new-game-btn" onClick={() => void newGame()}>{t(language, 'newGame')}</button>
        </div>
        <p className="game-management-help">{t(language, 'gameHelp')}</p>
      </>}
    </section>
  </div>;
}
