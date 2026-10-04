import type { PublicRoomState } from '../../shared/types';
import { t, type Language } from '../i18n';

export function ResultsScreen({ state, isHost, language, onRematch }: { state: PublicRoomState; isHost: boolean; language: Language; onRematch: () => void }) {
  const winner = state.players.find((p) => p.id === state.winnerId);
  return <main className="results-screen"><section className="results-card">
    <div className="winner-mark">★</div>
    <h1>{winner?.name || t(language, 'gameOver')}</h1>
    <p>{winner ? t(language, 'winsTable') : t(language, 'finalScores')}</p>
    <div className="score-list">{[...state.players].sort((a, b) => b.score - a.score).map((p, i) => <div key={p.id} className="score-row"><span>{i + 1}</span><strong>{p.name}</strong><b dir="ltr">{p.score > 0 ? '+' : ''}{p.score}</b></div>)}</div>
    {isHost && <button className="primary big" onClick={onRematch}>{t(language, 'playAgain')}</button>}
    <button className="big" onClick={() => { localStorage.removeItem('rummi-room'); window.location.href = '/'; }}>{t(language, 'leaveRoom')}</button>
  </section></main>;
}
