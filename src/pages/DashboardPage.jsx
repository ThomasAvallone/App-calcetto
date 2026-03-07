import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuthStore, { selectIsAdmin } from '../store/authStore';
import usePlayersStore from '../store/playersStore';
import useMatchStore from '../store/matchStore';
import {
  subscribeToMatches,
  updateMatch,
} from '../firebase/firestore';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import toast from 'react-hot-toast';
import { safeDate } from '../utils/dateUtils';

function getCountdown(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  const diff = d - Date.now();
  if (diff <= 0) return null;
  const days  = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const mins  = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (days > 0) return `tra ${days} giorn${days === 1 ? 'o' : 'i'} e ${hours}h`;
  if (hours > 0) return `tra ${hours}h e ${mins} min`;
  return `tra ${mins} min`;
}

export default function DashboardPage() {
  const { user, role, logout } = useAuthStore();
  const { players, getRanking } = usePlayersStore();
  const { activeMatchId, loadMatch } = useMatchStore();
  const navigate = useNavigate();
  const isAdmin = useAuthStore(selectIsAdmin);

  const [allMatches, setAllMatches] = useState([]);
  const [showStartPicker, setShowStartPicker] = useState(false);

  useEffect(() => {
    const unsub = subscribeToMatches(setAllMatches);
    return unsub;
  }, []);

  const recentMatches = allMatches.filter(m => m.status !== 'scheduled').slice(0, 5);
  const finishedMatches = allMatches.filter(m => m.status === 'finished');
  const scheduledMatches = allMatches
    .filter(m => m.status === 'scheduled')
    .sort((a, b) => {
      const aD = safeDate(a.date)?.getTime() || 0;
      const bD = safeDate(b.date)?.getTime() || 0;
      return aD - bD;
    });
  const nearestScheduled = scheduledMatches.find(m => {
    const d = safeDate(m.date);
    return d && d.getTime() > Date.now();
  });
  const totalGoals = finishedMatches.reduce((s, m) => s + (m.redScore || 0) + (m.blueScore || 0), 0);

  const ranking = getRanking().slice(0, 5);

  // Coppa di Latta mensile
  const coppaDiLatta = useMemo(() => {
    const now = Date.now();
    const cutoff = now - 30 * 24 * 60 * 60 * 1000;
    const getMs = d => d?.toMillis ? d.toMillis() : d ? new Date(d).getTime() : 0;
    const monthly = finishedMatches.filter(m => getMs(m.date) >= cutoff);
    if (monthly.length === 0) return null;

    const ps = {};
    for (const m of monthly) {
      for (const p of [...(m.redTeam || []), ...(m.blueTeam || [])]) {
        if (!ps[p.id]) ps[p.id] = { name: p.name, goals: 0, assists: 0, autogoals: 0, gkMatches: 0, gkGoalsConceded: 0 };
      }
      for (const ev of (m.events || [])) {
        if (ev.type === 'goal') {
          if (ev.scorerId && ps[ev.scorerId]) ps[ev.scorerId].goals++;
          if (ev.assistId && ps[ev.assistId]) ps[ev.assistId].assists++;
        }
        if (ev.type === 'autogoal' && ev.scorerId && ps[ev.scorerId]) ps[ev.scorerId].autogoals++;
        if (ev.gkConcededId && ps[ev.gkConcededId]) ps[ev.gkConcededId].gkGoalsConceded++;
      }
    }
    const list = Object.values(ps);
    const topScorer   = list.filter(p => p.goals > 0).sort((a, b) => b.goals - a.goals)[0] || null;
    const topAssist   = list.filter(p => p.assists > 0).sort((a, b) => b.assists - a.assists)[0] || null;
    const topAutogoal = list.filter(p => p.autogoals > 0).sort((a, b) => b.autogoals - a.autogoals)[0] || null;
    const worstGk     = list
      .filter(p => p.gkGoalsConceded >= 2)
      .sort((a, b) => b.gkGoalsConceded - a.gkGoalsConceded)[0] || null;
    if (!topScorer && !topAssist && !topAutogoal && !worstGk) return null;
    return { topScorer, topAssist, topAutogoal, worstGk, matchCount: monthly.length };
  }, [finishedMatches]);

  const handleStartScheduled = async (matchId) => {
    try {
      await updateMatch(matchId, { status: 'active' });
      await loadMatch(matchId);
      navigate(`/match/${matchId}`);
    } catch (e) {
      toast.error('Errore: ' + e.message);
    }
  };

  const nearestDate = nearestScheduled ? safeDate(nearestScheduled.date) : null;
  const nearestCountdown = nearestDate ? getCountdown(nearestDate.toISOString()) : null;

  return (
    <div className="page-content">
      {/* Header */}
      <div className="flex items-center justify-between mb-6" style={{ paddingTop: '0.5rem' }}>
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span style={{ fontSize: '1.5rem' }}>⚽</span>
            <h1 className="gradient-text" style={{ fontSize: '1.4rem', fontWeight: 800 }}>
              Calcetto Analytics
            </h1>
          </div>
          <p className="text-sm text-muted">
            Ciao, <strong style={{ color: '#F7FAFC' }}>{user?.displayName?.split(' ')[0]}</strong>
            {isAdmin && <span className="badge badge-gold" style={{ marginLeft: '0.5rem' }}>Admin</span>}
          </p>
        </div>
        <button className="btn btn-ghost btn-icon" onClick={logout} title="Logout">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
        </button>
      </div>

      {/* Quick Stats */}
      <div className="grid-3 mb-4">
        {[
          { label: 'Giocatori', value: players.length,       icon: '👥', accent: '#4FD1C5' },
          { label: 'Partite',   value: finishedMatches.length, icon: '🏟️', accent: '#63B3ED' },
          { label: 'Gol Totali', value: totalGoals,           icon: '⚽', accent: '#FC8181' },
        ].map(s => (
          <div key={s.label} className="card" style={{ textAlign: 'center', padding: '1rem 0.5rem', borderTop: `2px solid ${s.accent}` }}>
            <div style={{ fontSize: '1.4rem' }}>{s.icon}</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: s.accent }}>{s.value}</div>
            <div style={{ fontSize: '0.7rem', color: '#718096' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Active match banner */}
      {activeMatchId && (
        <div
          className="card mb-4"
          style={{
            background: 'linear-gradient(135deg, rgba(79,209,197,0.18) 0%, rgba(99,179,237,0.08) 100%)',
            border: '1px solid rgba(79,209,197,0.5)',
            boxShadow: '0 0 20px rgba(79,209,197,0.08)',
            cursor: 'pointer',
          }}
          onClick={() => navigate(`/match/${activeMatchId}`)}
        >
          <div className="flex items-center gap-3">
            <div className="animate-pulse" style={{ fontSize: '1.5rem' }}>🔴</div>
            <div>
              <div style={{ fontWeight: 700, color: '#4FD1C5' }}>Partita in corso!</div>
              <div className="text-sm text-secondary">Tocca per tornare alla partita</div>
            </div>
            <svg style={{ marginLeft: 'auto' }} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4FD1C5" strokeWidth={2}>
              <path d="M9 18l6-6-6-6"/>
            </svg>
          </div>
        </div>
      )}

      {/* Scheduled match countdown */}
      {nearestScheduled && nearestDate && nearestCountdown && (
        <div className="card mb-4" style={{
          background: 'linear-gradient(135deg, rgba(246,224,94,0.1) 0%, rgba(246,173,85,0.05) 100%)',
          border: '1px solid rgba(246,224,94,0.4)',
        }}>
          <div className="flex items-center gap-3">
            <div style={{ fontSize: '1.5rem' }}>📅</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, color: '#F6E05E', fontSize: '0.95rem' }}>
                Prossima partita
              </div>
              <div className="text-sm" style={{ color: '#A0AEC0' }}>
                {format(nearestDate, "EEE d MMM 'alle' HH:mm", { locale: it })}
              </div>
              <div style={{ fontSize: '0.78rem', color: '#F6E05E', marginTop: '0.15rem' }}>
                {nearestCountdown}
              </div>
              <div className="text-xs text-muted" style={{ marginTop: '0.25rem' }}>
                🔴 {(nearestScheduled.redTeam || []).map(p => p.name).join(', ')}
                {' · '}
                🔵 {(nearestScheduled.blueTeam || []).map(p => p.name).join(', ')}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Admin Quick Actions */}
      {isAdmin && (
        <div className="card mb-4">
          <h3 className="mb-3">⚡ Azioni Rapide</h3>
          <div className="flex gap-3 mb-2">
            <button className="btn btn-teal" style={{ flex: 1 }} onClick={() => navigate('/match/setup')}>
              + Nuova Partita
            </button>
            <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => navigate('/admin')}>
              ⚙️ Admin
            </button>
          </div>
          <div className="flex gap-3 mb-2">
            <button
              className="btn btn-teal"
              style={{
                flex: 1, fontSize: '1rem', fontWeight: 700,
                padding: '0.7rem 1rem',
                background: scheduledMatches.length > 0
                  ? 'linear-gradient(135deg, #38B2AC 0%, #4FD1C5 100%)'
                  : undefined,
              }}
              onClick={() => setShowStartPicker(v => !v)}
            >
              ▶️ Inizia Partita
              {scheduledMatches.length > 0 && (
                <span style={{
                  marginLeft: '0.5rem', fontSize: '0.75rem',
                  background: 'rgba(0,0,0,0.25)', padding: '2px 8px',
                  borderRadius: '10px',
                }}>
                  {scheduledMatches.length}
                </span>
              )}
            </button>
            <button
              className="btn btn-ghost"
              style={{ flex: 1, fontSize: '0.85rem' }}
              onClick={() => navigate('/stagioni')}
            >
              📚 Annali Storici
            </button>
          </div>

          {showStartPicker && (
            <div style={{
              marginTop: '0.75rem', padding: '0.75rem', borderRadius: '8px',
              background: 'rgba(79,209,197,0.06)', border: '1px solid rgba(79,209,197,0.2)',
            }}>
              <p style={{ fontSize: '0.8rem', color: '#4FD1C5', marginBottom: '0.6rem', fontWeight: 600 }}>
                Partite programmate
              </p>
              {scheduledMatches.length === 0 ? (
                <p className="text-sm text-muted" style={{ textAlign: 'center', padding: '0.5rem' }}>
                  Nessuna partita programmata.
                  <br/>
                  <span style={{ fontSize: '0.75rem' }}>Crea una partita e salvala per dopo.</span>
                </p>
              ) : scheduledMatches.map(m => {
                const d = safeDate(m.date);
                return (
                  <div
                    key={m.id}
                    onClick={() => handleStartScheduled(m.id)}
                    style={{
                      padding: '0.6rem', borderRadius: '8px', cursor: 'pointer',
                      background: 'rgba(79,209,197,0.08)', marginBottom: '0.5rem',
                      border: '1px solid rgba(79,209,197,0.15)',
                      transition: 'all 0.15s',
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.2rem' }}>
                      📅 {d ? format(d, "EEE d MMM · HH:mm", { locale: it }) : '–'}
                    </div>
                    <div className="text-xs text-muted">
                      🔴 {(m.redTeam || []).map(p => p.name).join(', ')}
                      {' · '}
                      🔵 {(m.blueTeam || []).map(p => p.name).join(', ')}
                    </div>
                    <div style={{ textAlign: 'right', marginTop: '0.3rem' }}>
                      <span style={{
                        fontSize: '0.75rem', fontWeight: 600, color: '#4FD1C5',
                      }}>
                        ▶️ Avvia
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Top 5 Ranking */}
      <div className="card mb-4">
        <div className="flex items-center justify-between mb-3">
          <h3>🏆 Power Ranking</h3>
          <button className="btn btn-ghost text-sm" style={{ padding: '0.3rem 0.75rem', minHeight: 'auto' }}
            onClick={() => navigate('/players')}>
            Tutti →
          </button>
        </div>
        {ranking.length === 0 ? (
          <p className="text-muted text-sm text-center" style={{ padding: '1rem' }}>
            Nessun giocatore registrato
          </p>
        ) : ranking.map((p, i) => {
          const piColor = i === 0 ? '#F6E05E' : '#4FD1C5';
          return (
            <div key={p.id} className="flex items-center gap-3"
              style={{ padding: '0.6rem 0', borderBottom: i < ranking.length - 1 ? '1px solid rgba(74,85,104,0.5)' : 'none' }}>
              <span style={{ fontSize: '1.1rem', minWidth: '28px', fontWeight: 700,
                color: i === 0 ? '#F6E05E' : i === 1 ? '#A0AEC0' : i === 2 ? '#C05621' : '#718096' }}>
                {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: '0.95rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: 4 }}>
                  <div style={{ flex: 1, height: 3, background: '#2D3748', borderRadius: 999, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${p.powerIndex || 50}%`, background: piColor, borderRadius: 999 }} />
                  </div>
                  <span className="text-xs text-muted" style={{ whiteSpace: 'nowrap' }}>{p.primaryRole || 'N/D'}</span>
                </div>
              </div>
              <div style={{ fontWeight: 700, color: piColor, minWidth: '42px', textAlign: 'right' }}>
                {p.powerIndex?.toFixed(1) || '50.0'}
              </div>
            </div>
          );
        })}
      </div>

      {/* Coppa di Latta mensile */}
      {coppaDiLatta && (
        <div className="card mb-4" style={{ background: 'rgba(246,224,94,0.04)', border: '1px solid rgba(246,224,94,0.2)' }}>
          <div className="flex items-center justify-between mb-3">
            <h3 style={{ color: '#F6E05E' }}>🏅 Coppa di Latta del Mese</h3>
            <span className="text-xs text-muted">{coppaDiLatta.matchCount} partite</span>
          </div>
          {[
            coppaDiLatta.topScorer   && { icon: '⚽', label: 'Bomber del Mese',    name: coppaDiLatta.topScorer.name,   val: `${coppaDiLatta.topScorer.goals} gol`, color: '#4FD1C5' },
            coppaDiLatta.topAssist   && { icon: '🎯', label: 'Assistman del Mese', name: coppaDiLatta.topAssist.name,   val: `${coppaDiLatta.topAssist.assists} assist`, color: '#63B3ED' },
            coppaDiLatta.worstGk     && { icon: '🧤', label: 'Peggior Portiere',   name: coppaDiLatta.worstGk.name,     val: `${coppaDiLatta.worstGk.gkGoalsConceded} gol subiti`, color: '#FC8181' },
            coppaDiLatta.topAutogoal && { icon: '🤦', label: 'Re degli Autogol',   name: coppaDiLatta.topAutogoal.name, val: `${coppaDiLatta.topAutogoal.autogoals} autogol`, color: '#B794F4' },
          ].filter(Boolean).map(award => (
            <div key={award.label} className="flex items-center gap-3"
              style={{ padding: '0.45rem 0', borderBottom: '1px solid rgba(74,85,104,0.3)' }}>
              <span style={{ fontSize: '1.1rem', minWidth: '24px' }}>{award.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.72rem', color: '#718096', fontWeight: 600 }}>{award.label}</div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {award.name}
                </div>
              </div>
              <div style={{ fontWeight: 700, color: award.color, fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                {award.val}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Recent Matches */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h3>📋 Ultime Partite</h3>
          <button className="btn btn-ghost text-sm" style={{ padding: '0.3rem 0.75rem', minHeight: 'auto' }}
            onClick={() => navigate('/history')}>
            Storico →
          </button>
        </div>
        {recentMatches.length === 0 ? (
          <p className="text-muted text-sm text-center" style={{ padding: '1rem' }}>
            Nessuna partita disputata
          </p>
        ) : recentMatches.map((m) => {
          const d = safeDate(m.date);
          return (
            <div key={m.id}
              className="flex items-center gap-3"
              style={{ padding: '0.75rem 0', cursor: 'pointer', borderBottom: '1px solid #4A5568' }}
              onClick={() => navigate(`/history/${m.id}`)}
            >
              <div style={{
                width: 8, height: 8, borderRadius: '50%',
                background: m.status === 'finished' ? '#4FD1C5' : '#F6E05E',
                flexShrink: 0,
              }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>
                  🔴 {m.redScore ?? '–'} — {m.blueScore ?? '–'} 🔵
                </div>
                <div className="text-xs text-muted">
                  {d ? format(d, 'dd MMM yyyy', { locale: it }) : '–'}
                </div>
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#718096" strokeWidth={2}>
                <path d="M9 18l6-6-6-6"/>
              </svg>
            </div>
          );
        })}
      </div>
    </div>
  );
}
