import { useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import { randomUUID } from '../utils';
import type { DeviceState, DragPresence, PublicMeld, PublicRoomState, Tile, TurnAction } from '../../shared/types';
import { socket } from '../socket';
import { feedback, type FeedbackPrefs } from '../feedback';
import type { ThemeName } from './SettingsPanel';
import { t, type Language } from '../i18n';

interface ActionResult { ok: boolean; error?: string; data?: { invalidMeldIds?: string[]; message?: string } }
interface Props {
  state: PublicRoomState;
  deviceState?: DeviceState;
  deviceId: string;
  theme: ThemeName;
  prefs: FeedbackPrefs;
  language: Language;
  colorBlind: boolean;
  onAction: (action: TurnAction) => Promise<ActionResult>;
  onUndo: () => Promise<ActionResult>;
  onRedo: () => Promise<ActionResult>;
  onReset: () => Promise<ActionResult>;
  onDraw: () => Promise<ActionResult>;
  onEnd: () => Promise<ActionResult>;
  onSort: (mode: 'number' | 'color') => Promise<ActionResult>;
  onOrganize: () => Promise<ActionResult>;
  onReady: () => Promise<ActionResult>;
  onOpenSettings: () => void;
}

type Source = { zone: 'rack'; rackIndex: number } | { zone: 'table'; meldId: string; index: number };
type Selection = { tile: Tile; source: Source };
type Press = { tile: Tile; source: Source; x: number; y: number; pointerType: string; tailIds: string[]; timer?: number };
type Drag = { tile: Tile; source: Source; ids: string[]; id: string; public: boolean; lastSent: number; pointerType: string };

const symbol: Record<string, string> = { black: '■', blue: '▲', red: '●', orange: '◆' };

function JokerIcon() {
  return <span className="joker-mark" aria-label="Joker">
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <path d="M13 35c4-13 8-20 13-25 2 7 5 12 9 16 4-7 9-12 15-16 1 9 0 18-3 27H17c-2 0-3-1-4-2Z" />
      <circle cx="23" cy="11" r="4" /><circle cx="51" cy="10" r="4" /><circle cx="12" cy="34" r="4" />
      <path d="M18 39h29l-3 13H21l-3-13Z" />
      <circle cx="27" cy="45" r="2" /><circle cx="38" cy="45" r="2" />
      <path d="M27 49c3 3 7 3 10 0" fill="none" />
    </svg>
  </span>;
}

function TileFace({ tile, className = '', onPointerDown, selected = false, armed = false, data }: { tile: Tile; className?: string; onPointerDown?: React.PointerEventHandler<HTMLDivElement>; selected?: boolean; armed?: boolean; data?: Record<string, string | number> }) {
  return <div
    className={`game-tile ${tile.color} ${selected ? 'selected' : ''} ${armed ? 'armed' : ''} ${className}`}
    onPointerDown={onPointerDown}
    data-tile-id={tile.id}
    {...Object.fromEntries(Object.entries(data || {}).map(([k, v]) => [`data-${k}`, v]))}
  >
    {tile.color === 'joker' ? <JokerIcon /> : <><b>{tile.number}</b><i>{symbol[tile.color]}</i></>}
  </div>;
}

function findTableTile(state: PublicRoomState, id: string): Tile | undefined {
  for (const meld of state.table) {
    const tile = meld.tiles.find((t) => t.id === id);
    if (tile) return tile;
  }
  return undefined;
}

export function GameScreen({ state, deviceState, deviceId, theme, prefs, language, colorBlind, onAction, onUndo, onRedo, onReset, onDraw, onEnd, onSort, onOrganize, onReady, onOpenSettings }: Props) {
  const tableRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const newMeldRef = useRef<HTMLDivElement>(null);
  const snapElRef = useRef<HTMLElement | null>(null);
  const pressRef = useRef<Press | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [armedIds, setArmedIds] = useState<string[]>([]);
  const [dragIds, setDragIds] = useState<string[]>([]);
  const [previewTile, setPreviewTile] = useState<Tile | null>(null);
  const [remoteDrags, setRemoteDrags] = useState<Record<string, DragPresence>>({});
  const [invalidMelds, setInvalidMelds] = useState<string[]>([]);
  const [toast, setToast] = useState('');

  const device = state.devices.find((d) => d.id === deviceId);
  const isDisplay = device?.role === 'display';
  const current = state.players.find((p) => p.id === state.currentPlayerId);
  const privateTurn = deviceState?.privateTurn;
  const canAct = Boolean(privateTurn?.canAct);
  const myPrivatePlayer = privateTurn ? state.players.find((p) => p.id === privateTurn.playerId) : undefined;
  const rack = privateTurn?.rack ?? [];

  const tileLookup = useMemo(() => {
    const map = new Map<string, Tile>();
    state.table.forEach((m) => m.tiles.forEach((t) => map.set(t.id, t)));
    rack.forEach((t) => t && map.set(t.id, t));
    return map;
  }, [state.table, rack]);

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast((v) => v === message ? '' : v), 1900);
  };

  useEffect(() => {
    const listener = (presence: DragPresence) => {
      if (presence.phase === 'end') {
        setRemoteDrags((old) => { const n = { ...old }; delete n[presence.dragId]; return n; });
      } else {
        setRemoteDrags((old) => ({ ...old, [presence.dragId]: presence }));
      }
    };
    socket.on('drag:presence', listener);
    return () => { socket.off('drag:presence', listener); };
  }, []);

  useEffect(() => {
    // Clear stale remote drag ghosts after a disconnect or lost end packet.
    const timer = window.setInterval(() => {
      const cutoff = Date.now() - 1200;
      setRemoteDrags((old) => {
        let changed = false;
        const next = { ...old };
        Object.entries(next).forEach(([id, p]) => { if (p.sentAt < cutoff) { delete next[id]; changed = true; } });
        return changed ? next : old;
      });
    }, 600);
    return () => window.clearInterval(timer);
  }, []);

  const normalize = (x: number, y: number) => {
    const rect = tableRef.current?.getBoundingClientRect();
    if (!rect) return { nx: .5, ny: .5 };
    return { nx: (x - rect.left) / rect.width, ny: (y - rect.top) / rect.height };
  };

  const sendPresence = (phase: 'start' | 'move' | 'end', drag: Drag, x: number, y: number) => {
    if (!drag.public) return;
    const { nx, ny } = normalize(x, y);
    socket.emit('drag:presence', { phase, dragId: drag.id, tileIds: drag.ids, nx, ny });
  };

  const positionGhost = (x: number, y: number, pointerType: string) => {
    const ghost = ghostRef.current;
    const bubble = bubbleRef.current;
    if (ghost) {
      ghost.style.transform = `translate3d(${x}px, ${y + (pointerType === 'touch' ? -72 : -12)}px, 0) translate(-50%, -50%)`;
    }
    if (bubble) {
      bubble.style.transform = `translate3d(${x}px, ${y + (pointerType === 'touch' ? -84 : -48)}px, 0) translate(-50%, -50%)`;
    }
  };

  const startDrag = (event: PointerEvent, press: Press) => {
    const sourceIsTable = press.source.zone === 'table';
    const ids = press.tailIds.length ? press.tailIds : [press.tile.id];
    const drag: Drag = { tile: press.tile, source: press.source, ids, id: randomUUID(), public: sourceIsTable, lastSent: 0, pointerType: press.pointerType };
    dragRef.current = drag;
    setDragIds(ids);
    setSelection(null);
    setPreviewTile(null);
    feedback('pickup', prefs);
    positionGhost(event.clientX, event.clientY, press.pointerType);
    sendPresence('start', drag, event.clientX, event.clientY);
  };

  const clearSnapPreview = () => {
    if (snapElRef.current) snapElRef.current.classList.remove('snap-hover','snap-before','snap-after');
    snapElRef.current = null;
    newMeldRef.current?.classList.remove('show');
  };

  const updateSnapPreview = (x: number, y: number) => {
    clearSnapPreview();
    const element = document.elementFromPoint(x, y) as HTMLElement | null;
    if (!element) return;
    const rackSlot = element.closest<HTMLElement>('[data-rack-index]');
    if (rackSlot) { rackSlot.classList.add('snap-hover'); snapElRef.current = rackSlot; return; }
    let tile = element.closest<HTMLElement>('[data-table-tile="true"]');
    const threshold = pressRef.current?.pointerType === 'touch' ? 72 : 42;
    if (!tile && element.closest('[data-table-canvas="true"]')) {
      let best: { el: HTMLElement; d: number; side: 'before' | 'after' } | null = null;
      for (const candidate of document.querySelectorAll<HTMLElement>('[data-table-tile="true"]')) {
        const r = candidate.getBoundingClientRect(); const cy = r.top + r.height/2;
        const dl = Math.hypot(x-r.left,y-cy), dr = Math.hypot(x-r.right,y-cy);
        if (!best || dl < best.d) best = { el:candidate,d:dl,side:'before' };
        if (!best || dr < best.d) best = { el:candidate,d:dr,side:'after' };
      }
      if (best && best.d <= threshold) { tile = best.el; tile.classList.add(best.side === 'before' ? 'snap-before' : 'snap-after'); snapElRef.current = tile; return; }
    }
    if (tile) {
      const r=tile.getBoundingClientRect();
      tile.classList.add(x < r.left+r.width/2 ? 'snap-before' : 'snap-after');
      snapElRef.current=tile; return;
    }
    if (element.closest('[data-table-canvas="true"]')) {
      const hint=newMeldRef.current; if(hint){hint.style.left=`${x}px`;hint.style.top=`${y}px`;hint.classList.add('show');}
    }
  };

  const pointerMove = (event: PointerEvent) => {
    const press = pressRef.current;
    if (!press) return;
    const distance = Math.hypot(event.clientX - press.x, event.clientY - press.y);
    if (!dragRef.current && distance > (press.pointerType === 'touch' ? 6 : 8)) {
      if (press.timer) window.clearTimeout(press.timer);
      startDrag(event, press);
    }
    const drag = dragRef.current;
    if (!drag) return;
    event.preventDefault();
    positionGhost(event.clientX, event.clientY, press.pointerType);
    updateSnapPreview(event.clientX, event.clientY);
    if (drag.public && performance.now() - drag.lastSent >= 75) {
      drag.lastSent = performance.now();
      sendPresence('move', drag, event.clientX, event.clientY);
    }
  };

  const emitAction = async (action: TurnAction) => {
    const result = await onAction(action);
    if (!result.ok) {
      feedback('invalid', prefs);
      showToast(result.error || t(language, 'moveUnavailable'));
    } else {
      feedback('drop', prefs);
      setInvalidMelds([]);
    }
  };

  const nearestTableDestination = (x: number, y: number, threshold: number): { meldId: string; index: number } | null => {
    let best: { meldId: string; index: number; distance: number } | null = null;
    const tiles = Array.from(document.querySelectorAll<HTMLElement>('[data-table-tile="true"]'));
    for (const el of tiles) {
      const rect = el.getBoundingClientRect();
      const cy = rect.top + rect.height / 2;
      const leftD = Math.hypot(x - rect.left, y - cy);
      const rightD = Math.hypot(x - rect.right, y - cy);
      const meldId = el.dataset.meldId!;
      const idx = Number(el.dataset.index);
      if (!best || leftD < best.distance) best = { meldId, index: idx, distance: leftD };
      if (!best || rightD < best.distance) best = { meldId, index: idx + 1, distance: rightD };
    }
    if (best && best.distance <= threshold) return { meldId: best.meldId, index: best.index };
    return null;
  };

  const nearestRackDestination = (x: number, y: number, threshold: number): number | null => {
    let best: { index: number; distance: number } | null = null;
    for (const el of document.querySelectorAll<HTMLElement>('[data-rack-index]')) {
      const rect = el.getBoundingClientRect();
      const distance = Math.hypot(x - (rect.left + rect.width / 2), y - (rect.top + rect.height / 2));
      if (!best || distance < best.distance) best = { index: Number(el.dataset.rackIndex), distance };
    }
    return best && best.distance <= threshold ? best.index : null;
  };

  const buildDropAction = (drag: Drag, x: number, y: number): TurnAction | null => {
    const element = document.elementFromPoint(x, y) as HTMLElement | null;
    if (!element) return null;
    const rackSlot = element.closest<HTMLElement>('[data-rack-index]');
    const rackPanel = element.closest<HTMLElement>('.rack-panel');
    const targetTile = element.closest<HTMLElement>('[data-table-tile="true"]');
    const targetMeld = element.closest<HTMLElement>('[data-meld-id]');
    const canvas = element.closest<HTMLElement>('[data-table-canvas="true"]');

    if (rackSlot || rackPanel) {
      const targetIndex = rackSlot ? Number(rackSlot.dataset.rackIndex) : nearestRackDestination(x, y, drag.pointerType === 'touch' ? 76 : 42);
      if (targetIndex === null || drag.ids.length > 1) return null;
      if (drag.source.zone === 'rack') return { type: 'RACK_REORDER', tileId: drag.tile.id, targetIndex };
      return { type: 'TABLE_TO_RACK', tileId: drag.tile.id, sourceMeldId: drag.source.meldId, targetIndex };
    }

    let targetMeldId: string | undefined;
    let targetIndex = 0;
    if (targetTile) {
      targetMeldId = targetTile.dataset.meldId;
      const index = Number(targetTile.dataset.index);
      const rect = targetTile.getBoundingClientRect();
      targetIndex = index + (x >= rect.left + rect.width / 2 ? 1 : 0);
    } else if (targetMeld) {
      targetMeldId = targetMeld.dataset.meldId;
      const meld = state.table.find((m) => m.id === targetMeldId);
      targetIndex = meld?.tiles.length ?? 0;
    } else if (canvas) {
      const near = nearestTableDestination(x, y, drag.pointerType === 'touch' ? 72 : 42);
      if (near) { targetMeldId = near.meldId; targetIndex = near.index; }
    } else {
      return null;
    }

    if (drag.source.zone === 'table' && targetMeldId === drag.source.meldId && drag.ids.length === 1 && targetIndex > drag.source.index) {
      targetIndex -= 1;
    }

    const newMeldId = targetMeldId ? undefined : randomUUID();
    if (drag.source.zone === 'rack') {
      return { type: 'RACK_TO_TABLE', tileId: drag.tile.id, targetMeldId, targetIndex, newMeldId };
    }
    if (drag.ids.length > 1) {
      return { type: 'MOVE_TAIL', sourceMeldId: drag.source.meldId, startIndex: drag.source.index, targetMeldId, targetIndex, newMeldId };
    }
    return { type: 'TABLE_TO_TABLE', tileId: drag.tile.id, sourceMeldId: drag.source.meldId, targetMeldId, targetIndex, newMeldId };
  };

  const pointerUp = (event: PointerEvent) => {
    const press = pressRef.current;
    if (!press) return cleanupPointer();
    if (press.timer) window.clearTimeout(press.timer);
    const drag = dragRef.current;
    if (drag) {
      sendPresence('end', drag, event.clientX, event.clientY);
      const action = buildDropAction(drag, event.clientX, event.clientY);
      if (action) void emitAction(action);
    } else {
      handleTap(press.tile, press.source, event.clientX);
    }
    cleanupPointer();
  };

  const cleanupPointer = () => {
    window.removeEventListener('pointermove', pointerMove);
    window.removeEventListener('pointerup', pointerUp);
    window.removeEventListener('pointercancel', pointerUp);
    pressRef.current = null;
    dragRef.current = null;
    setDragIds([]);
    setArmedIds([]);
    setPreviewTile(null);
    clearSnapPreview();
  };

  const onTilePointerDown = (event: React.PointerEvent<HTMLDivElement>, tile: Tile, source: Source) => {
    if (!canAct) return;
    event.preventDefault();
    const press: Press = { tile, source, x: event.clientX, y: event.clientY, pointerType: event.pointerType, tailIds: [] };
    if (source.zone === 'table') {
      press.timer = window.setTimeout(() => {
        const meld = state.table.find((m) => m.id === source.meldId);
        if (!pressRef.current || !meld) return;
        const tail = meld.tiles.slice(source.index).map((t) => t.id);
        if (tail.length > 1) {
          press.tailIds = tail;
          setArmedIds(tail);
          if (prefs.haptics && navigator.vibrate) navigator.vibrate(9);
        }
      }, 340);
    }
    pressRef.current = press;
    setPreviewTile(tile);
    requestAnimationFrame(() => positionGhost(event.clientX, event.clientY, event.pointerType));
    window.addEventListener('pointermove', pointerMove, { passive: false });
    window.addEventListener('pointerup', pointerUp);
    window.addEventListener('pointercancel', pointerUp);
  };

  const actionToDestination = (selected: Selection, target: { zone: 'rack'; index: number } | { zone: 'table'; meldId?: string; index: number }) => {
    if (target.zone === 'rack') {
      if (selected.source.zone === 'rack') return { type: 'RACK_REORDER', tileId: selected.tile.id, targetIndex: target.index } as TurnAction;
      return { type: 'TABLE_TO_RACK', tileId: selected.tile.id, sourceMeldId: selected.source.meldId, targetIndex: target.index } as TurnAction;
    }
    const newMeldId = target.meldId ? undefined : randomUUID();
    if (selected.source.zone === 'rack') return { type: 'RACK_TO_TABLE', tileId: selected.tile.id, targetMeldId: target.meldId, targetIndex: target.index, newMeldId } as TurnAction;
    let index = target.index;
    if (target.meldId === selected.source.meldId && index > selected.source.index) index -= 1;
    return { type: 'TABLE_TO_TABLE', tileId: selected.tile.id, sourceMeldId: selected.source.meldId, targetMeldId: target.meldId, targetIndex: index, newMeldId } as TurnAction;
  };

  const handleTap = (tile: Tile, source: Source, clientX: number) => {
    if (!canAct) return;
    if (!selection) {
      setSelection({ tile, source });
      feedback('pickup', prefs);
      return;
    }
    if (selection.tile.id === tile.id) return setSelection(null);
    if (source.zone === 'rack') {
      void emitAction(actionToDestination(selection, { zone: 'rack', index: source.rackIndex }));
    } else {
      const rect = document.querySelector<HTMLElement>(`[data-table-tile="true"][data-tile-id="${tile.id}"]`)?.getBoundingClientRect();
      const after = rect ? clientX >= rect.left + rect.width / 2 : true;
      void emitAction(actionToDestination(selection, { zone: 'table', meldId: source.meldId, index: source.index + (after ? 1 : 0) }));
    }
    setSelection(null);
  };

  const tapRackSlot = (index: number) => {
    if (!canAct || !selection) return;
    void emitAction(actionToDestination(selection, { zone: 'rack', index }));
    setSelection(null);
  };

  const tapEmptyTable = (event: React.PointerEvent) => {
    if (!canAct || !selection) return;
    if ((event.target as HTMLElement).closest('.meld')) return;
    void emitAction(actionToDestination(selection, { zone: 'table', index: 0 }));
    setSelection(null);
  };

  const selectedTableSource = selection?.source.zone === 'table' ? selection.source : null;
  const selectedMeld = selectedTableSource ? state.table.find((m) => m.id === selectedTableSource.meldId) : undefined;
  const canSplit = Boolean(selection && selection.source.zone === 'table' && selectedMeld && selection.source.index < selectedMeld.tiles.length - 1);

  const splitAfter = () => {
    if (!selection || selection.source.zone !== 'table') return;
    void emitAction({ type: 'SPLIT_MELD', meldId: selection.source.meldId, splitIndex: selection.source.index + 1, newMeldId: randomUUID() });
    setSelection(null);
  };

  const doEnd = async () => {
    const r = await onEnd();
    if (!r.ok) {
      feedback('invalid', prefs);
      showToast(r.error || t(language, 'invalidTable'));
      setInvalidMelds(r.data?.invalidMeldIds || []);
    } else feedback('success', prefs);
  };

  const doDraw = async () => {
    const r = await onDraw();
    if (!r.ok) { feedback('invalid', prefs); showToast(r.error || t(language, 'drawFail')); }
    else feedback('draw', prefs);
  };

  const ghostTiles = dragIds.map((id) => tileLookup.get(id)).filter(Boolean) as Tile[];
  const remoteDraggedIds = Object.values(remoteDrags).flatMap((p) => p.tileIds);
  const liftedIds = [...dragIds, ...remoteDraggedIds];
  const publicRackCount = myPrivatePlayer?.rackCount ?? 0;

  return <main className={`game-shell theme-${theme} ${isDisplay ? 'display-mode' : ''} ${colorBlind ? 'colorblind-mode' : ''} ${language === 'he' ? 'ui-he' : ''}`}>
    <header className="game-hud">
      <div className="hud-players">
        {state.players.map((p) => <span key={p.id} className={`player-chip ${p.id === state.currentPlayerId ? 'current' : ''} ${p.id === privateTurn?.playerId ? 'me' : ''}`}>
          {p.name}<b>{p.rackCount}</b>
        </span>)}
      </div>
      <span className="pool-chip">{t(language, 'pool')} {state.poolCount}</span>
      <button className="hud-icon" onClick={onOpenSettings}>⚙</button>
    </header>

    <section ref={tableRef} className="table-surface" data-table-canvas="true" onPointerDown={tapEmptyTable}>
      <div className="meld-wrap" data-table-canvas="true">
        {state.table.map((meld) => <MeldView key={meld.id} meld={meld} invalid={invalidMelds.includes(meld.id)} selection={selection} armedIds={armedIds} dragIds={liftedIds} onPointerDown={onTilePointerDown} />)}
      </div>

      {Object.values(remoteDrags).map((presence) => {
        const tiles = presence.tileIds.map((id) => findTableTile(state, id)).filter(Boolean) as Tile[];
        if (!tiles.length) return null;
        return <div key={presence.dragId} className="remote-drag" style={{ left: `${presence.nx * 100}%`, top: `${presence.ny * 100}%` }}>
          {tiles.map((tile) => <TileFace key={tile.id} tile={tile} className="remote-tile" />)}
        </div>;
      })}

      {state.table.length === 0 && <div className="empty-table-hint">{t(language, 'firstMeld')}</div>}
      <div ref={newMeldRef} className="new-meld-hint">{t(language, 'newMeld')}</div>
      <div className="turn-badge">{current ? t(language, 'turn', { name: current.name }) : t(language, 'table')}</div>
    </section>

    {!isDisplay && <section className={`rack-panel ${canAct ? 'active-turn' : ''}`}>
      <div className="rack-grid" style={{ ['--rack-slots' as string]: rack.length || 28 }}>
        {rack.map((tile, index) => <div key={index} className="rack-slot" data-rack-index={index} onPointerDown={() => !tile && tapRackSlot(index)}>
          {tile && <TileFace tile={tile} selected={selection?.tile.id === tile.id} className={dragIds.includes(tile.id) ? 'drag-source' : ''} data={{ 'rack-index': index }} onPointerDown={(e) => onTilePointerDown(e, tile, { zone: 'rack', rackIndex: index })} />}
        </div>)}
      </div>
      <div className="rack-controls">
        <button className="undo-btn" disabled={!canAct} onClick={async () => { const r = await onUndo(); if (!r.ok) showToast(r.error || t(language, 'nothingUndo')); }}>{t(language, 'undo')}</button>
        <button className="redo-btn" disabled={!canAct} onClick={async () => { const r = await onRedo(); if (!r.ok) showToast(r.error || t(language, 'nothingRedo')); }}>{t(language, 'redo')}</button>
        <button className="reset-btn" disabled={!canAct} onClick={async () => { const r = await onReset(); if (!r.ok) showToast(r.error || t(language, 'resetFail')); }}>{t(language, 'reset')}</button>
        <button className="organize-btn" disabled={!canAct} onClick={async () => { const r = await onOrganize(); if (!r.ok) showToast(r.error || t(language, 'organizeFail')); }}>{t(language, 'organize')}</button>
        <button className="sort-number-btn" onClick={async () => { const r = await onSort('number'); if (!r.ok) showToast(r.error || t(language, 'sortFail')); }}>123</button>
        <button className="sort-color-btn" onClick={async () => { const r = await onSort('color'); if (!r.ok) showToast(r.error || t(language, 'sortFail')); }}>{t(language, 'color')}</button>
        <span className="rack-spacer" />
        {privateTurn && <span className="rack-owner">{myPrivatePlayer?.name || t(language, 'yourRack')} · {publicRackCount}</span>}
        <button className="draw-btn" disabled={!canAct} onClick={() => void doDraw()}>{t(language, 'draw')}</button>
        <button className="done-btn" disabled={!canAct} onClick={() => void doEnd()}>{t(language, 'done')}</button>
      </div>
    </section>}

    {selection && canSplit && <div className="selection-tools"><button onClick={splitAfter}>{t(language, 'splitAfter')}</button><button onClick={() => setSelection(null)}>{t(language, 'cancel')}</button></div>}

    <div ref={ghostRef} className={`drag-ghost ${ghostTiles.length ? 'show' : ''}`}>
      {ghostTiles.map((tile) => <TileFace key={tile.id} tile={tile} />)}
    </div>
    <div ref={bubbleRef} className={`touch-bubble ${previewTile ? 'show' : ''}`}>{previewTile && <TileFace tile={previewTile} />}</div>

    {deviceState?.needsReady && <div className="handoff-overlay">
      <div className="handoff-card"><span>{t(language, 'passDevice')}</span><h1>{current?.name}</h1><p>{t(language, 'rackHidden')}</p><button className="primary big" onClick={() => void onReady()}>{t(language, 'imReady')}</button></div>
    </div>}

    {toast && <div className="toast on">{toast}</div>}
  </main>;
}

function MeldView({ meld, invalid, selection, armedIds, dragIds, onPointerDown }: { meld: PublicMeld; invalid: boolean; selection: Selection | null; armedIds: string[]; dragIds: string[]; onPointerDown: (e: React.PointerEvent<HTMLDivElement>, tile: Tile, source: Source) => void }) {
  return <div className={`meld ${invalid ? 'invalid' : ''}`} data-meld-id={meld.id}>
    {meld.tiles.map((tile, index) => <TileFace
      key={tile.id}
      tile={tile}
      className={dragIds.includes(tile.id) ? 'drag-source' : ''}
      selected={selection?.tile.id === tile.id}
      armed={armedIds.includes(tile.id)}
      data={{ 'table-tile': 'true', 'meld-id': meld.id, index }}
      onPointerDown={(e) => onPointerDown(e, tile, { zone: 'table', meldId: meld.id, index })}
    />)}
  </div>;
}
