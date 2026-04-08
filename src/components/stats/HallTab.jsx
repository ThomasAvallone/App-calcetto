import React, { useState, useEffect, useMemo } from 'react';
import { generateHallOfFame } from '../../services/geminiService';
import { getAICache, setAICache } from '../../firebase/firestore';
import toast from 'react-hot-toast';

export default function HallTab({ finishedMatches, players, hallText, setHallText, hallLoading, setHallLoading, lastMatchId }) {
  const [hallStale, setHallStale] = useState(false);

  useEffect(() => {
    getAICache('hall').then(data => {
      if (data?.text) {
        setHallText(data.text);
        setHallStale(!!lastMatchId && data.lastMatchId !== lastMatchId);
      }
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const buildHallStats = () => {
    const ps = {};
    for (const p of players) ps[p.id] = { name: p.name, goals: 0, assists: 0, autogoals: 0, gkGoals: 0, matches: 0, wins: 0, losses: 0 };
    for (const m of finishedMatches) {
      for (const side of ['redTeam', 'blueTeam']) {
        for (const pl of (m[side] || [])) {
          if (!ps[pl.id]) continue;
          ps[pl.id].matches++;
          const my = side === 'redTeam' ? (m.redScore ?? 0) : (m.blueScore ?? 0);
          const their = side === 'redTeam' ? (m.blueScore ?? 0) : (m.redScore ?? 0);
          if (my > their) ps[pl.id].wins++;
          else if (my < their) ps[pl.id].losses++;
        }
      }
      for (const ev of (m.events || [])) {
        if (ev.type === 'goal') {
          if (ev.scorerId && ps[ev.scorerId]) ps[ev.scorerId].goals++;
          if (ev.assistId && ps[ev.assistId]) ps[ev.assistId].assists++;
        }
        if (ev.type === 'autogoal' && ev.scorerId && ps[ev.scorerId]) ps[ev.scorerId].autogoals++;
        if (ev.gkConcededId && ps[ev.gkConcededId]) ps[ev.gkConcededId].gkGoals++;
      }
    }
    const list = Object.values(ps).filter(p => p.matches >= 5);
    if (list.length === 0) return null;

    const sortBy = (fn) => [...list].sort(fn)[0];
    const topScorer    = sortBy((a, b) => b.goals - a.goals);
    const topAssist    = sortBy((a, b) => b.assists - a.assists);
    const topWinRate   = [...list].sort((a, b) => (b.wins / b.matches) - (a.wins / a.matches))[0];
    const mostPresent  = sortBy((a, b) => b.matches - a.matches);
    const topAutogoal  = list.filter(p => p.autogoals > 0).sort((a, b) => b.autogoals - a.autogoals)[0];
    const worstWinRate = [...list].sort((a, b) => (a.wins / a.matches) - (b.wins / b.matches))[0];
    const worstGk      = list.filter(p => p.gkGoals > 0).sort((a, b) => b.gkGoals - a.gkGoals)[0];

    const fame = [
      topScorer  && { name: topScorer.name,   reason: `${topScorer.goals} gol segnati` },
      topAssist  && { name: topAssist.name,    reason: `${topAssist.assists} assist` },
      topWinRate && { name: topWinRate.name,   reason: `${Math.round(topWinRate.wins / topWinRate.matches * 100)}% win rate` },
      mostPresent && { name: mostPresent.name, reason: `${mostPresent.matches} presenze` },
    ].filter(Boolean);

    const shame = [
      topAutogoal  && { name: topAutogoal.name,  reason: `${topAutogoal.autogoals} autogol` },
      worstWinRate && { name: worstWinRate.name,  reason: `${Math.round(worstWinRate.wins / worstWinRate.matches * 100)}% win rate` },
      worstGk      && { name: worstGk.name,       reason: `${worstGk.gkGoals} gol subiti in porta` },
    ].filter(Boolean);

    return { fame, shame };
  };

  const handleGenerate = async () => {
    setHallLoading(true);
    try {
      const stats = buildHallStats();
      if (!stats) { toast('Servono almeno 5 partite per giocatore'); setHallLoading(false); return; }
      const text = await generateHallOfFame(stats);
      setHallText(text);
      setHallStale(false);
      setAICache('hall', { text, lastMatchId, generatedAt: new Date().toISOString() });
    } catch (e) {
      toast.error('Hall of Fame AI: ' + e.message);
    } finally {
      setHallLoading(false);
    }
  };

  const stats = useMemo(() => {
    try { return buildHallStats(); } catch { return null; }
  }, [finishedMatches, players]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      {stats && (
        <div className="grid-2 mb-4" style={{ gap: '0.75rem' }}>
          <div className="card" style={{ border: '1px solid rgba(104,211,145,0.3)' }}>
            <h3 className="mb-2" style={{ fontSize: '0.85rem', color: '#68D391' }}>🏆 Hall of Fame</h3>
            {stats.fame.map(p => (
              <div key={p.name} style={{ padding: '0.3rem 0', borderBottom: '1px solid #2D3748', fontSize: '0.8rem' }}>
                <span style={{ fontWeight: 600 }}>{p.name}</span>
                <span style={{ color: '#718096', display: 'block', fontSize: '0.7rem' }}>{p.reason}</span>
              </div>
            ))}
          </div>
          <div className="card" style={{ border: '1px solid rgba(252,129,129,0.3)' }}>
            <h3 className="mb-2" style={{ fontSize: '0.85rem', color: '#FC8181' }}>💀 Hall of Shame</h3>
            {stats.shame.map(p => (
              <div key={p.name} style={{ padding: '0.3rem 0', borderBottom: '1px solid #2D3748', fontSize: '0.8rem' }}>
                <span style={{ fontWeight: 600 }}>{p.name}</span>
                <span style={{ color: '#718096', display: 'block', fontSize: '0.7rem' }}>{p.reason}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!hallText && (
        <div className="card mb-4" style={{ textAlign: 'center', border: '1px dashed rgba(251,211,141,0.35)', background: 'rgba(251,211,141,0.03)' }}>
          <button
            onClick={handleGenerate}
            disabled={hallLoading}
            style={{ background: 'none', border: 'none', cursor: hallLoading ? 'default' : 'pointer', color: '#FBD38D', fontSize: '0.9rem', padding: '0.75rem 0', width: '100%', fontWeight: 600 }}
          >
            {hallLoading ? '⏳ Preparando la cerimonia...' : '🎖️ Genera Cerimonia AI'}
          </button>
        </div>
      )}

      {hallText && (
        <div className="card" style={{ border: `1px solid ${hallStale ? 'rgba(246,173,85,0.5)' : 'rgba(251,211,141,0.35)'}`, background: 'rgba(251,211,141,0.04)' }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#FBD38D' }}>🎖️ La Cerimonia</span>
              {hallStale && (
                <span style={{ fontSize: '0.68rem', color: '#F6AD55', background: 'rgba(246,173,85,0.15)', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
                  ⚠️ Nuova partita
                </span>
              )}
            </div>
            <button
              onClick={handleGenerate}
              disabled={hallLoading}
              style={{ fontSize: '0.7rem', color: '#718096', background: 'none', border: 'none', cursor: hallLoading ? 'default' : 'pointer' }}>
              {hallLoading ? '⏳' : '↺ Rigenera'}
            </button>
          </div>
          <div style={{ maxHeight: '16rem', overflowY: 'auto', paddingRight: '0.25rem' }}>
            <p style={{ fontSize: '0.84rem', color: '#CBD5E0', lineHeight: 1.8, margin: 0, whiteSpace: 'pre-wrap' }}>{hallText}</p>
          </div>
        </div>
      )}

      {!stats && (
        <div style={{ textAlign: 'center', padding: '2rem 1rem', color: '#718096' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🏛️</div>
          <p className="text-sm">Servono almeno 5 partite per giocatore per la Hall</p>
        </div>
      )}
    </div>
  );
}
