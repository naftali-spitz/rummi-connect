import type { FeedbackPrefs } from '../feedback';

export type ThemeName = 'classic' | 'soft' | 'minimal' | 'playful';

interface Props {
  open: boolean;
  theme: ThemeName;
  prefs: FeedbackPrefs;
  onTheme: (theme: ThemeName) => void;
  onPrefs: (prefs: FeedbackPrefs) => void;
  onClose: () => void;
}

export function SettingsPanel({ open, theme, prefs, onTheme, onPrefs, onClose }: Props) {
  if (!open) return null;
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
    </section>
  </div>;
}
