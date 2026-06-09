import React, { useState } from 'react';
import { getMatch, rateMatch, recalculateRecentFormForPlayers } from '../../firebase/firestore';
import toast from 'react-hot-toast';

export default function RatingSection({ match, userId, userName, onRated }) {
  const allPlayers = [...(match.redTeam || []), ...(match.blueTeam || [])];
  const hasVoted = !!(match.ratings?.[userId]);
  const [scores, setScores] = useState(() =>
    Object.fromEntries(allPlayers.map(p => [p.id, 6]))
  );
  const [submitting, setSubmitting] = useState(false);

  const bump = (pid, delta) =>
    setScores(s => ({ ...s, [pid]: Math.max(1, Math.min(10, (s[pid] ?? 6) + delta)) }));

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await rateMatch(match.id, userId, scores, userName);
      await recalculateRecentFormForPlayers(allPlayers.map(p => p.id));
      const updated = await getMatch(match.id);
      onRated(updated);
      toast.success('Voti salvati!');
    } catch (e) {
      toast.error('Errore: ' + e.message);
      setSubmitting(false);
    }
  };

  if (hasVoted) {
    const myRating = match.ratings[userId];
    return (
      <div className="card mb-4" style={{ border: '1px solid rgba(246,224,94,0.25)', background: 'rgba(246,224,94,0.03)' }}>
        <h3 className="mb-3" style={{ fontSize: '0.95rem' }}>⭐ Il tuo voto</h3>
        {allPlayers.map(p => {
          const s = myRating.scores?.[p.id];
          if (s == null) return null;
          const c = s >= 7 ? '#68D391' : s >= 5 ? '#F6E05E' : '#FC8181';
          return (
            <div key={p.id} className="flex items-center justify-between"
              style={{ padding: '0.35rem 0', borderBottom: '1px solid #2D3748' }}>
              <span style={{ fontSize: '0.9rem' }}>{p.name}</span>
              <span style={{ fontWeight: 700, color: c }}>{s}/10</span>
            </div>
          );
        })}
        <p className="text-xs text-muted mt-2 text-center">Hai già votato per questa partita</p>
      </div>
    );
  }

  return (
    <div className="card mb-4" style={{ border: '1px solid rgba(79,209,197,0.3)' }}>
      <h3 className="mb-1" style={{ fontSize: '0.95rem' }}>⭐ Valuta i Giocatori</h3>
      <p className="text-xs text-muted mb-3">Dai un voto 1–10 a ogni giocatore</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '1rem' }}>
        {allPlayers.map(p => {
          const s = scores[p.id] ?? 6;
          const c = s >= 7 ? '#68D391' : s >= 5 ? '#F6E05E' : '#FC8181';
          const isRed = (match.redTeam || []).some(r => r.id === p.id);
          return (
            <div key={p.id} className="flex items-center gap-2">
              <span style={{ fontSize: '0.7rem', minWidth: '18px' }}>{isRed ? '🔴' : '🔵'}</span>
              <span style={{ flex: 1, fontSize: '0.88rem' }}>{p.name}</span>
              <div className="flex items-center gap-2">
                <button onClick={() => bump(p.id, -1)}
                  style={{ background: '#2D3748', border: 'none', borderRadius: '6px', width: 30, height: 30, cursor: 'pointer', color: '#A0AEC0', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  −
                </button>
                <span style={{ minWidth: '20px', textAlign: 'center', fontWeight: 700, color: c, fontSize: '1rem' }}>{s}</span>
                <button onClick={() => bump(p.id, +1)}
                  style={{ background: '#2D3748', border: 'none', borderRadius: '6px', width: 30, height: 30, cursor: 'pointer', color: '#A0AEC0', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  +
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <button className="btn btn-teal btn-full" onClick={handleSubmit} disabled={submitting}>
        {submitting ? '⏳ Salvataggio...' : '✅ Salva Voti'}
      </button>
    </div>
  );
}
