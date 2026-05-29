import React, { useState, useEffect, useRef, useMemo } from 'react';
import { scoreFromEvents } from '../utils/matchScore';

const STEP_MS = 1200;

export default function MatchReplay({ match, onClose }) {
  const events = useMemo(() => (
    [...(match.events || [])]
      .filter(e => e.type === 'goal' || e.type === 'autogoal')
      .sort((a, b) => (a.minute ?? 999) - (b.minute ?? 999))
  ), [match]);

  const [visibleCount, setVisibleCount] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [done, setDone] = useState(false);
  const timerRef = useRef(null);

  const start = () => {
    clearTimeout(timerRef.current);
    setVisibleCount(0);
    setDone(false);
    setPlaying(true);
  };

  useEffect(() => {
    if (!playing) return;
    if (events.length === 0) { setDone(true); setPlaying(false); return; }

    let idx = 0;
    const tick = () => {
      idx++;
      setVisibleCount(idx);
      if (idx < events.length) {
        timerRef.current = setTimeout(tick, STEP_MS);
      } else {
        setPlaying(false);
        setDone(true);
      }
    };
    timerRef.current = setTimeout(tick, 300);
    return () => clearTimeout(timerRef.current);
  }, [playing, events]);

  const visibleEvents = events.slice(0, visibleCount);

  // Punteggio progressivo derivato dagli eventi visibili — stessa source of truth
  // del resto dell'app (scoreFromEvents), niente loop duplicato.
  const { redScore: liveRed, blueScore: liveBlue } = scoreFromEvents(visibleEvents);

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal animate-slide-up" style={{ maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="modal-title" style={{ margin: 0 }}>▶️ Replay Partita</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#718096', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
        </div>

        {/* Live score */}
        <div style={{ textAlign: 'center', marginBottom: '1rem', padding: '0.65rem', background: 'rgba(74,85,104,0.2)', borderRadius: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
            <div>
              <div style={{ fontSize: '0.65rem', color: '#FC8181', fontWeight: 700, letterSpacing: '0.08em', marginBottom: '0.15rem' }}>🔴 ROSSI</div>
              <div style={{ fontSize: '2.8rem', fontWeight: 900, color: '#FC8181', lineHeight: 1 }}>{liveRed}</div>
            </div>
            <div style={{ fontSize: '1.3rem', color: '#4A5568', fontWeight: 300 }}>–</div>
            <div>
              <div style={{ fontSize: '0.65rem', color: '#63B3ED', fontWeight: 700, letterSpacing: '0.08em', marginBottom: '0.15rem' }}>🔵 BLU</div>
              <div style={{ fontSize: '2.8rem', fontWeight: 900, color: '#63B3ED', lineHeight: 1 }}>{liveBlue}</div>
            </div>
          </div>
        </div>

        {/* Events feed */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.45rem', marginBottom: '0.75rem', minHeight: '80px' }}>
          {!playing && !done && events.length === 0 && (
            <p style={{ textAlign: 'center', color: '#718096', fontSize: '0.85rem', padding: '1rem' }}>
              Nessun gol da mostrare (0–0)
            </p>
          )}
          {!playing && !done && events.length > 0 && (
            <p style={{ textAlign: 'center', color: '#718096', fontSize: '0.82rem', padding: '0.5rem' }}>
              {events.length} {events.length === 1 ? 'evento' : 'eventi'} da riprodurre
            </p>
          )}
          {visibleEvents.map((ev, i) => {
            const isAutogoal = ev.type === 'autogoal';
            const teamColor = ev.team === 'red' ? '#FC8181' : '#63B3ED';
            const teamIcon  = ev.team === 'red' ? '🔴' : '🔵';
            const isLatest  = i === visibleEvents.length - 1 && playing;
            return (
              <div
                key={i}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.65rem',
                  padding: '0.6rem 0.75rem',
                  borderRadius: '8px',
                  background: isAutogoal
                    ? 'rgba(252,129,129,0.08)'
                    : `rgba(${ev.team === 'red' ? '252,129,129' : '99,179,237'},0.08)`,
                  border: `1px solid ${isAutogoal ? 'rgba(252,129,129,0.3)' : `rgba(${ev.team === 'red' ? '252,129,129' : '99,179,237'},0.25)`}`,
                  animation: isLatest ? 'fadeSlideIn 0.35s ease' : 'none',
                  opacity: 1,
                }}
              >
                <span style={{ fontSize: '1.2rem', flexShrink: 0 }}>{isAutogoal ? '😬' : '⚽'}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#F7FAFC' }}>
                    {isAutogoal ? `✗ Autogol di ${ev.scorerName || '?'}` : `${ev.scorerName || '?'}`}
                  </div>
                  {!isAutogoal && ev.assistName && ev.assistName !== 'Nessuno' && (
                    <div style={{ fontSize: '0.72rem', color: '#718096' }}>assist: {ev.assistName}</div>
                  )}
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: '0.72rem', color: teamColor, fontWeight: 700 }}>{teamIcon}</div>
                  {ev.minute != null && (
                    <div style={{ fontSize: '0.7rem', color: '#718096' }}>{ev.minute}'</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Controls */}
        {!playing && !done && (
          <button
            onClick={start}
            style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: '1px solid rgba(79,209,197,0.4)', background: 'rgba(79,209,197,0.08)', color: '#4FD1C5', fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem' }}
          >
            ▶ Avvia Replay
          </button>
        )}
        {playing && (
          <div style={{ textAlign: 'center', fontSize: '0.82rem', color: '#718096' }}>⏳ Riproduzione in corso... ({visibleCount}/{events.length})</div>
        )}
        {done && (
          <button
            onClick={start}
            style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid #4A5568', background: 'transparent', color: '#A0AEC0', cursor: 'pointer', fontSize: '0.85rem' }}
          >
            ↺ Riproduci
          </button>
        )}
      </div>

      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateX(-14px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}
