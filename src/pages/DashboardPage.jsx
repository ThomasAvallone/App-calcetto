import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuthStore, { selectIsAdmin } from '../store/authStore';
import usePlayersStore from '../store/playersStore';
import useMatchStore from '../store/matchStore';
import { updateMatch } from '../firebase/firestore';
import { useMatchesSubscription } from '../hooks/useMatchesSubscription';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import toast from 'react-hot-toast';
import WhatIfModal from '../components/WhatIfModal';
import { safeDate } from '../utils/dateUtils';
import { CLR_WIN, CLR_LOSS, CLR_MUTED } from '../constants/colors';
import { fetchWeatherForDate } from '../services/weatherService';

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
  const { user, logout } = useAuthStore();
  const { players, getRanking } = usePlayersStore();
  const { activeMatchId, loadMatch } = useMatchStore();
  const navigate = useNavigate();
  const isAdmin = useAuthStore(selectIsAdmin);

  const allMatches = useMatchesSubscription();
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [nextMatchWeather, setNextMatchWeather] = useState(null);
  const [showWhatIf, setShowWhatIf] = useState(false);

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

  useEffect(() => {
    if (!nearestScheduled) { setNextMatchWeather(null); return; }
    const d = safeDate(nearestScheduled.date);
    if (!d) return;
    if (nearestScheduled.weather?.condition) {
      setNextMatchWeather(nearestScheduled.weather);
    }
    fetchWeatherForDate(d).then(w => { if (w) setNextMatchWeather(w); });
  }, [nearestScheduled?.id]);

  const seasonStartMs = (() => {
    const now = new Date();
    const year = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
    return new Date(year, 8, 1).getTime();
  })();
  const getMs = d => d?.toMillis ? d.toMillis() : d ? new Date(d).getTime() : 0;
  const seasonMatchesPerPlayer = new Set();
  finishedMatches.forEach(m => {
    if (getMs(m.date) >= seasonStartMs) {
      [...(m.redTeam || []), ...(m.blueTeam || [])].forEach(p => seasonMatchesPerPlayer.add(p.id));
    }
  });

  const ranking = getRanking().slice(0, 5);

  const coppaDiLatta = useMemo(() => {
    const now = Date.now();
    const cutoff = now - 30 * 24 * 60 * 60 * 1000;
    const getMs = d => d?.toMillis ? d.toMillis() : d ? new Date(d).getTime() : 0;
    const monthly = finishedMatches.filter(m => getMs(m.date) >= cutoff);
    if (monthly.length === 0) return null;

    const ps = {};
    for (const m of monthly) {
      for (const p of [...(m.redTeam || []), ...(m.blueTeam || [])]) {
        if (!ps[p.id]) ps[p.id] = { name: p.name, goals: 0, assists: 0, autogoals: 0, gkGoalsConceded: 0 };
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

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-6 stagger-1" style={{ paddingTop: '0.5rem' }}>
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span style={{ fontSize: '1.5rem' }}>⚽</span>
            <h1 className="gradient-text" style={{ fontSize: '1.4rem', fontWeight: 800 }}>
              Calcetto Analytics
            </h1>
          </div>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Ciao, <strong style={{ color: 'var(--text-primary)' }}>{user?.displayName?.split(' ')[0]}</strong>
            {isAdmin && <span className="badge badge-gold" style={{ marginLeft: '0.5rem' }}>Admin</span>}
          </p>
        </div>
        <button
          className="btn btn-ghost btn-icon"
          onClick={logout}
          aria-label="Logout"
          title="Logout"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
        </button>
      </div>

      {/* ── Quick Stats ─────────────────────────────────────────────────────── */}
      <div className="grid-3 mb-4 stagger-2">
        {[
          { label: 'GIOCATORI', value: players.length,          icon: '👥', accent: 'var(--teal)',      glow: '79,209,197'  },
          { label: 'PARTITE',   value: finishedMatches.length,  icon: '🏟️', accent: 'var(--blue-team)', glow: '99,179,237'  },
          { label: 'GOL',       value: totalGoals,              icon: '⚽', accent: 'var(--red)',       glow: '252,129,129' },
        ].map(s => (
          <div
            key={s.label}
            className="card hud-corners"
            style={{
              textAlign: 'center',
              padding: '0.95rem 0.4rem',
              borderTop: `2px solid ${s.accent}`,
            }}
          >
            <div style={{ fontSize: '1.3rem', marginBottom: '0.15rem' }}>{s.icon}</div>
            <div style={{
              fontSize: '1.7rem',
              fontWeight: 800,
              color: s.accent,
              letterSpacing: '-1px',
              textShadow: `0 0 14px rgba(${s.glow},0.45)`,
            }}>
              {s.value}
            </div>
            <div className="section-label" style={{ marginTop: '0.2rem' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Live match banner ───────────────────────────────────────────────── */}
      {(() => {
        const liveMatch = allMatches.find(m => m.status === 'active');
        if (!liveMatch) return null;
        const isMyMatch  = activeMatchId === liveMatch.id;
        const accentVar  = isMyMatch ? 'var(--teal)' : 'var(--red)';
        const accentRgb  = isMyMatch ? '79,209,197' : '252,129,129';
        return (
          <div
            className="card mb-4 stagger-3"
            style={{
              background: `linear-gradient(135deg, rgba(${accentRgb},0.13) 0%, rgba(${accentRgb},0.04) 100%)`,
              border: `1px solid rgba(${accentRgb},0.45)`,
              boxShadow: `0 0 20px rgba(${accentRgb},0.1)`,
              cursor: 'pointer',
            }}
            onClick={() => navigate(`/match/${liveMatch.id}`)}
          >
            <div className="flex items-center gap-3">
              {/* CSS radar dot instead of emoji pulse */}
              <div className="live-dot">
                <div className="live-dot-ring" />
                <div className="live-dot-inner" />
              </div>

              <div style={{ flex: 1 }}>
                <div style={{
                  fontWeight: 700,
                  color: accentVar,
                  fontSize: '0.92rem',
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                }}>
                  {isMyMatch ? 'Partita in corso' : 'Live — Partita in corso'}
                </div>
                <div className="text-sm" style={{ color: 'var(--text-secondary)', marginTop: '0.1rem' }}>
                  {isMyMatch ? 'Tocca per tornare alla partita' : 'Guarda in diretta'}
                </div>
                {!isMyMatch && (liveMatch.redTeam?.length > 0 || liveMatch.blueTeam?.length > 0) && (
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                    🔴 {(liveMatch.redTeam || []).map(p => p.name).join(', ')} · 🔵 {(liveMatch.blueTeam || []).map(p => p.name).join(', ')}
                  </div>
                )}
              </div>

              {/* Live score badge */}
              <div style={{
                textAlign: 'center',
                background: `rgba(${accentRgb},0.12)`,
                border: `1px solid rgba(${accentRgb},0.3)`,
                borderRadius: '8px',
                padding: '0.3rem 0.65rem',
                minWidth: '54px',
                flexShrink: 0,
              }}>
                <div style={{
                  fontWeight: 800,
                  fontSize: '1.15rem',
                  color: accentVar,
                  letterSpacing: '-0.5px',
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {liveMatch.redScore ?? 0}–{liveMatch.blueScore ?? 0}
                </div>
              </div>

              <svg style={{ flexShrink: 0 }} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={accentVar} strokeWidth={2}>
                <path d="M9 18l6-6-6-6"/>
              </svg>
            </div>
          </div>
        );
      })()}

      {/* ── Scheduled match countdown + weather ─────────────────────────────── */}
      {nearestScheduled && nearestDate && nearestCountdown && (
        <div
          className="card mb-4 stagger-3"
          style={{
            background: 'linear-gradient(135deg, rgba(246,224,94,0.08) 0%, rgba(246,173,85,0.03) 100%)',
            border: '1px solid rgba(246,224,94,0.28)',
            cursor: 'pointer',
          }}
          onClick={() => navigate(`/history/scheduled/${nearestScheduled.id}`)}
        >
          <div className="flex items-center gap-3">
            <div style={{ fontSize: '1.5rem' }}>📅</div>
            <div style={{ flex: 1 }}>
              <div style={{
                fontWeight: 700,
                color: 'var(--gold)',
                fontSize: '0.88rem',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
              }}>
                Prossima partita
              </div>
              <div className="text-sm" style={{ color: 'var(--text-secondary)', marginTop: '0.1rem' }}>
                {format(nearestDate, "EEE d MMM 'alle' HH:mm", { locale: it })}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--gold)', marginTop: '0.15rem', fontWeight: 600 }}>
                {nearestCountdown}
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                🔴 {(nearestScheduled.redTeam || []).map(p => p.name).join(', ')}
                {' · '}
                🔵 {(nearestScheduled.blueTeam || []).map(p => p.name).join(', ')}
              </div>
            </div>

            {nextMatchWeather && (
              <div style={{
                textAlign: 'center',
                padding: '0.5rem 0.65rem',
                borderRadius: '10px',
                background: 'rgba(246,224,94,0.08)',
                border: '1px solid rgba(246,224,94,0.18)',
                minWidth: '58px',
                flexShrink: 0,
              }}>
                <div style={{ fontSize: '1.4rem', lineHeight: 1 }}>
                  {{ sunny: '☀️', cloudy: '☁️', rainy: '🌧️', cold: '🥶', hot: '🔥', wind: '💨' }[nextMatchWeather.condition] || '🌤️'}
                </div>
                {nextMatchWeather.temp && (
                  <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--gold)', marginTop: '0.2rem' }}>
                    {nextMatchWeather.temp}°
                  </div>
                )}
                {nextMatchWeather.description && (
                  /* min 0.65rem to stay readable on mobile */
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '0.1rem', lineHeight: 1.25 }}>
                    {nextMatchWeather.description}
                  </div>
                )}
              </div>
            )}

            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth={2} style={{ flexShrink: 0 }}>
              <path d="M9 18l6-6-6-6"/>
            </svg>
          </div>
        </div>
      )}

      {/* ── Admin Quick Actions ─────────────────────────────────────────────── */}
      {isAdmin && (
        <div className="card mb-4 stagger-4">
          <h3 className="mb-3" style={{ color: 'var(--teal)', letterSpacing: '0.03em' }}>⚡ Azioni Rapide</h3>
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
                flex: 1,
                fontSize: '1rem',
                fontWeight: 700,
                padding: '0.7rem 1rem',
                background: scheduledMatches.length > 0
                  ? 'linear-gradient(135deg, var(--teal-dark) 0%, var(--teal) 100%)'
                  : undefined,
              }}
              onClick={() => setShowStartPicker(v => !v)}
            >
              ▶️ Inizia Partita
              {scheduledMatches.length > 0 && (
                <span style={{
                  marginLeft: '0.5rem',
                  fontSize: '0.75rem',
                  background: 'rgba(0,0,0,0.25)',
                  padding: '2px 8px',
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
          <button
            className="btn btn-ghost btn-full"
            style={{ fontSize: '0.85rem', marginBottom: '0.25rem', border: '1px dashed rgba(246,173,85,0.35)', color: '#F6AD55' }}
            onClick={() => setShowWhatIf(true)}
          >
            🎲 Simulatore What-if
          </button>

          {showStartPicker && (
            <div style={{
              marginTop: '0.75rem',
              padding: '0.75rem',
              borderRadius: '8px',
              background: 'rgba(79,209,197,0.05)',
              border: '1px solid rgba(79,209,197,0.18)',
            }}>
              <p className="section-label" style={{ color: 'var(--teal)', marginBottom: '0.6rem' }}>
                Partite programmate
              </p>
              {scheduledMatches.length === 0 ? (
                <p className="text-sm text-muted" style={{ textAlign: 'center', padding: '0.5rem' }}>
                  Nessuna partita programmata.
                  <br/>
                  <span style={{ fontSize: '0.78rem' }}>Crea una partita e salvala per dopo.</span>
                </p>
              ) : scheduledMatches.map(m => {
                const d = safeDate(m.date);
                return (
                  <div
                    key={m.id}
                    className="interactive-row"
                    onClick={() => handleStartScheduled(m.id)}
                    style={{
                      padding: '0.6rem 0.7rem',
                      cursor: 'pointer',
                      background: 'rgba(79,209,197,0.06)',
                      marginBottom: '0.5rem',
                      border: '1px solid rgba(79,209,197,0.12)',
                      borderRadius: '8px',
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.2rem' }}>
                      📅 {d ? format(d, "EEE d MMM · HH:mm", { locale: it }) : '–'}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      🔴 {(m.redTeam || []).map(p => p.name).join(', ')}
                      {' · '}
                      🔵 {(m.blueTeam || []).map(p => p.name).join(', ')}
                    </div>
                    <div style={{ textAlign: 'right', marginTop: '0.3rem' }}>
                      <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--teal)' }}>
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

      {/* ── Streak attive ───────────────────────────────────────────────────── */}
      {(() => {
        const hotStreaks = players
          .filter(p => p.streak?.count >= 3 && seasonMatchesPerPlayer.has(p.id))
          .sort((a, b) => b.streak.count - a.streak.count)
          .slice(0, 5);
        if (!hotStreaks.length) return null;
        return (
          <div className="card mb-4 stagger-5" style={{
            background: 'rgba(252,129,129,0.02)',
            border: '1px solid rgba(252,129,129,0.12)',
          }}>
            {/* section-label used directly on h3 — consistent with other panels */}
            <h3 className="section-label mb-3">⚡ Streak in corso</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
              {hotStreaks.map(p => {
                const isWin  = p.streak.type === 'win';
                const isDraw = p.streak.type === 'draw';
                // Using hex alpha notation (8-char hex) for rgba without CSS var concatenation
                const color    = isWin ? '#68D391' : isDraw ? '#F6E05E' : '#FC8181';
                const colorBg  = isWin ? '#68D39114' : isDraw ? '#F6E05E14' : '#FC818114';
                const colorBdr = isWin ? '#68D39130' : isDraw ? '#F6E05E30' : '#FC818130';
                const colorBdg = isWin ? '#68D39120' : isDraw ? '#F6E05E20' : '#FC818120';
                const emoji    = isWin ? '🔥' : isDraw ? '🤝' : '📉';
                const label    = isWin ? 'vittorie di fila' : isDraw ? 'pareggi di fila' : 'sconfitte di fila';
                const initial  = p.name.charAt(0).toUpperCase();
                return (
                  <div
                    key={p.id}
                    className="flex items-center gap-3"
                    style={{
                      padding: '0.45rem 0.65rem',
                      borderRadius: '8px',
                      background: colorBg,
                      border: `1px solid ${colorBdr}`,
                    }}
                  >
                    {/* Player initial badge for visual identity */}
                    <div style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '50%',
                      background: colorBdg,
                      border: `1px solid ${colorBdr}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      color,
                      flexShrink: 0,
                    }}>
                      {initial}
                    </div>
                    <span style={{ fontWeight: 600, fontSize: '0.9rem', flex: 1 }}>{p.name}</span>
                    <span style={{ color, fontWeight: 700, fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                      {emoji} {p.streak.count} {label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ── Power Ranking ───────────────────────────────────────────────────── */}
      <div className="card mb-4 stagger-6">
        <div className="flex items-center justify-between mb-3">
          <h3>🏆 Power Ranking</h3>
          <button
            className="btn btn-ghost text-sm"
            style={{ padding: '0.3rem 0.75rem', minHeight: 'auto' }}
            onClick={() => navigate('/players')}
          >
            Tutti →
          </button>
        </div>
        {ranking.length === 0 ? (
          <p className="text-muted text-sm text-center" style={{ padding: '1rem' }}>
            Nessun giocatore registrato
          </p>
        ) : ranking.map((p, i) => {
          const isFirst  = i === 0;
          const piColor  = isFirst ? 'var(--gold)' : 'var(--teal)';
          const barFrom  = isFirst ? 'var(--gold-dark)' : 'var(--teal-dark)';
          const barGlow  = isFirst ? 'rgba(246,224,94,0.7)' : 'rgba(79,209,197,0.7)';
          const medalColor = i === 0 ? 'var(--gold)' : i === 1 ? 'var(--text-secondary)' : i === 2 ? '#C05621' : 'var(--text-muted)';
          const hist = p.powerHistory || [];
          const trend = hist.length >= 2
            ? hist[hist.length - 1].pi > hist[hist.length - 2].pi ? '↑'
              : hist[hist.length - 1].pi < hist[hist.length - 2].pi ? '↓'
              : '→'
            : null;
          const trendColor = trend === '↑' ? CLR_WIN : trend === '↓' ? CLR_LOSS : CLR_MUTED;
          return (
            <div
              key={p.id}
              className="flex items-center gap-3"
              style={{
                padding: '0.65rem 0',
                borderBottom: i < ranking.length - 1 ? '1px solid rgba(74,85,104,0.4)' : 'none',
              }}
            >
              <span style={{
                fontSize: '1.1rem',
                minWidth: '28px',
                fontWeight: 700,
                color: medalColor,
                /* Glow on podium spots */
                textShadow: i < 3 ? `0 0 10px ${barGlow}` : 'none',
              }}>
                {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontWeight: 600,
                  fontSize: '0.95rem',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>
                  {p.name}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: 5 }}>
                  {/* 5px neon progress bar */}
                  <div className="progress-bar" style={{ flex: 1 }}>
                    <div
                      className="progress-bar-fill"
                      style={{
                        width: `${p.powerIndex || 50}%`,
                        background: `linear-gradient(90deg, ${barFrom}, ${piColor})`,
                        boxShadow: `0 0 7px ${barGlow}, 0 0 14px ${barGlow.replace('0.7', '0.25')}`,
                      }}
                    />
                  </div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {p.primaryRole || 'N/D'}
                  </span>
                </div>
              </div>
              <div style={{ fontWeight: 700, color: piColor, minWidth: '42px', textAlign: 'right', fontSize: '0.95rem' }}>
                {p.powerIndex?.toFixed(1) || '50.0'}
                {trend && <span style={{ fontSize: '0.7rem', color: trendColor, marginLeft: '3px' }}>{trend}</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Coppa di Latta mensile ──────────────────────────────────────────── */}
      {coppaDiLatta && (
        <div className="card mb-4 stagger-7" style={{
          background: 'rgba(246,224,94,0.03)',
          border: '1px solid rgba(246,224,94,0.18)',
        }}>
          <div className="flex items-center justify-between mb-3">
            <h3 style={{ color: 'var(--gold)' }}>🏅 Coppa di Latta del Mese</h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {coppaDiLatta.matchCount} partite
            </span>
          </div>
          {[
            coppaDiLatta.topScorer   && { icon: '⚽', label: 'Bomber del Mese',    name: coppaDiLatta.topScorer.name,   val: `${coppaDiLatta.topScorer.goals} gol`,               color: 'var(--teal)',      positive: true  },
            coppaDiLatta.topAssist   && { icon: '🎯', label: 'Assistman del Mese', name: coppaDiLatta.topAssist.name,   val: `${coppaDiLatta.topAssist.assists} assist`,          color: 'var(--blue-team)', positive: true  },
            coppaDiLatta.worstGk     && { icon: '🧤', label: 'Peggior Portiere',   name: coppaDiLatta.worstGk.name,     val: `${coppaDiLatta.worstGk.gkGoalsConceded} gol subiti`, color: 'var(--red)',       positive: false },
            coppaDiLatta.topAutogoal && { icon: '🤦', label: 'Re degli Autogol',   name: coppaDiLatta.topAutogoal.name, val: `${coppaDiLatta.topAutogoal.autogoals} autogol`,     color: '#B794F4',          positive: false },
          ].filter(Boolean).map((award, idx, arr) => (
            <div
              key={award.label}
              /* Left border differentiates positive (achievement) vs negative (ironic) awards */
              className={award.positive ? 'award-positive' : 'award-negative'}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.5rem 0',
                borderBottom: idx < arr.length - 1 ? '1px solid rgba(74,85,104,0.3)' : 'none',
              }}
            >
              <span style={{ fontSize: '1.1rem', minWidth: '24px' }}>{award.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="section-label" style={{ marginBottom: '0.1rem' }}>{award.label}</div>
                <div style={{
                  fontWeight: 700,
                  fontSize: '0.92rem',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>
                  {award.name}
                </div>
              </div>
              <div style={{ fontWeight: 700, color: award.color, fontSize: '0.88rem', whiteSpace: 'nowrap' }}>
                {award.val}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Recent Matches ──────────────────────────────────────────────────── */}
      <div className="card stagger-8">
        <div className="flex items-center justify-between mb-3">
          <h3>📋 Ultime Partite</h3>
          <button
            className="btn btn-ghost text-sm"
            style={{ padding: '0.3rem 0.75rem', minHeight: 'auto' }}
            onClick={() => navigate('/history')}
          >
            Storico →
          </button>
        </div>
        {recentMatches.length === 0 ? (
          <p className="text-muted text-sm text-center" style={{ padding: '1rem' }}>
            Nessuna partita disputata
          </p>
        ) : recentMatches.map((m, i) => {
          const d = safeDate(m.date);
          const redWon  = (m.redScore ?? 0) > (m.blueScore ?? 0);
          const blueWon = (m.blueScore ?? 0) > (m.redScore ?? 0);
          /* Border-left accent communicates winner at a glance */
          const winnerAccent = redWon
            ? 'rgba(252,129,129,0.65)'
            : blueWon
              ? 'rgba(99,179,237,0.65)'
              : 'rgba(246,224,94,0.45)';
          return (
            <div
              key={m.id}
              className="interactive-row flex items-center gap-3"
              style={{
                padding: '0.75rem 0.5rem 0.75rem 0.75rem',
                cursor: 'pointer',
                borderBottom: i < recentMatches.length - 1 ? '1px solid rgba(74,85,104,0.35)' : 'none',
                borderLeft: `3px solid ${winnerAccent}`,
              }}
              onClick={() => navigate(`/history/${m.id}`)}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>
                  <span style={{ color: 'var(--red-team)' }}>🔴 {m.redScore ?? '–'}</span>
                  <span style={{ color: 'var(--text-muted)', margin: '0 0.3rem' }}>—</span>
                  <span style={{ color: 'var(--blue-team)' }}>{m.blueScore ?? '–'} 🔵</span>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                  {d ? format(d, 'dd MMM yyyy', { locale: it }) : '–'}
                </div>
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth={2}>
                <path d="M9 18l6-6-6-6"/>
              </svg>
            </div>
          );
        })}
      </div>

      {showWhatIf && <WhatIfModal onClose={() => setShowWhatIf(false)} scheduledMatch={nearestScheduled} />}
    </div>
  );
}
