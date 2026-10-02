import type { PublicRoomState } from '../../shared/types';

export function ResultsScreen({ state, isHost, onRematch }: { state: PublicRoomState; isHost: boolean; onRematch: () => void }) {
  const winner = state.players.find((p) => p.id === state.winnerId);
  return <main className="results-screen"><section className="results-card">
    <div className="winner-mark">★</div>
    <h1>{winner?.name || 'Game over'}</h1>
    <p>{winner ? 'wins the table' : 'Final scores'}</p>
    <div className="score-list">{[...state.players].sort((a, b) => b.score - a.score).map((p, i) => <div key={p.id} className="score-row"><span>{i + 1}</span><strong>{p.name}</strong><b>{p.score > 0 ? '+' : ''}{p.score}</b></div>)}</div>
    {isHost && <button className="primary big" onClick={onRematch}>Play again</button>}
    <button className="big" onClick={() => { localStorage.removeItem('rummi-room'); window.location.href = '/'; }}>Leave room</button>
  </section></main>;
}
