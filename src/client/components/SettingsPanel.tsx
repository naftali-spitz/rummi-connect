import type { FeedbackPrefs } from '../feedback';

export type ThemeName = 'classic' | 'soft' | 'minimal' | 'playful';

interface Props {
  open: boolean;
  theme: ThemeName;
  prefs: FeedbackPrefs;
  isHost: boolean;
  onTheme: (theme: ThemeName) => void;
  onPrefs: (prefs: FeedbackPrefs) => void;
  onRestartGame: () => Promise<{ ok: boolean; error?: string }>;
  onNewGame: () => Promise<{ ok: boolean; error?: string }>;
  onClose: () => void;
}

export function SettingsPanel({ open, theme, prefs, isHost, onTheme, onPrefs, onRestartGame, onNewGame, onClose }: Props) {
  if (!open) return null;

  const restartGame = async () => {
    if (!window.confirm('Restart the game now? All tiles will be reshuffled and redealt to the same players.')) return;
    const result = await onRestartGame();
    if (!result.ok) return window.alert(result.error || 'Unable to restart the game');
    onClose();
  };

  const newGame = async () => {
    if (!window.confirm('End this game and return everyone to the lobby?')) return;
    const result = await onNewGame();
    if (!result.ok) return window.alert(result.error || 'Unable to return to the lobby');
    onClose();
  };
  return <div className="settings-backdrop" onPointerDown={onClose}>
    <section className="settings-panel" onPointerDown={(e) => e.stopPropagation()}>
      <div className="settings-head"><strong>Settings</strong><button className="icon-btn" onClick={onClose}>×</button></div>
      <label>Theme</label>
      <div className="theme-grid">
        {(['classic', 'soft', 'minimal', 'playful'] as ThemeName[]).map((t) => <button key={t} className={`theme-option ${theme === t ? 'active' : ''}`} onClick={() => onTheme(t)}><span className={`theme-swatch ${t}`} />{t === 'classic' ? 'Classic Tabletop' : t === 'soft' ? 'Soft Modern' : t === 'minimal' ? 'Minimal Premium' : 'Contemporary Playful'}</button>)}
      </div>
      <label className="toggle-row"><span>Sound</span><input type="checkbox" checked={prefs.sound} onChange={(e) => onPrefs({ ...prefs, sound: e.target.checked })} /></label>
      <label className="toggle-row"><span>Haptics</span><input type="checkbox" checked={prefs.haptics} onChange={(e) => onPrefs({ ...prefs, haptics: e.target.checked })} /></label>
      <button onClick={() => document.documentElement.requestFullscreen?.()}>Fullscreen</button>

      {isHost && <>
        <label>Game</label>
        <div className="game-management">
          <button className="restart-game-btn" onClick={() => void restartGame()}>Restart game</button>
          <button className="new-game-btn" onClick={() => void newGame()}>Start new game</button>
        </div>
        <p className="game-management-help">Restart keeps the same players and deals fresh tiles. Start new game ends the current round and returns everyone to the lobby so players can be changed.</p>
      </>}
    </section>
  </div>;
}
