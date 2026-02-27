import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import usePlayersStore from '../store/playersStore';
import useMatchStore from '../store/matchStore';
import { subscribeToMatches } from '../firebase/firestore';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';

function safeDate(val) {
  if (!val) return null;
  if (val?.toDate) return val.toDate();
  if (val instanceof Date) return val;
  return new Date(val);
}

export default function DashboardPage() {
  const { user, role, logout } = useAuthStore();
  const { players, getRanking } = usePlayersStore();
  const { activeMatchId } = useMatchStore();
  const navigate = useNavigate();
  const [recentMatches, setRecentMatches] = useState([]);

  useEffect(() => {
    const unsub = subscribeToMatches((matches) => {
      setRecentMatches(matches.slice(0, 5));
    });
    return unsub;
  }, []);

  const ranking = getRanking().slice(0, 5);
  const totalMatches = recentMatches.length;
  const totalGoals = recentMatches.reduce((s, m) => s + (m.redScore || 0) + (m.blueScore || 0), 0);

  return (
    <div className="page-content">
      {/* Header */}
      <div className="flex items-center justify-between mb-6" style={{ paddingTop: '0.5rem' }}>
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span style={{ fontSize: '1.5rem' }}>⚽</span>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#4FD1C5' }}>
              Calcetto Analytics
            </h1>
          </div>
          <p className="text-sm text-muted">
            Ciao, <strong style={{ color: '#F7FAFC' }}>{user?.displayName?.split(' ')[0]}</strong>
            {role === 'admin' && <span className="badge badge-gold" style={{ marginLeft: '0.5rem' }}>Admin</span>}
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
          { label: 'Giocatori', value: players.length, icon: '👥' },
          { label: 'Partite', value: totalMatches, icon: '🏟️' },
          { label: 'Gol Totali', value: totalGoals, icon: '⚽' },
        ].map(s => (
          <div key={s.label} className="card" style={{ textAlign: 'center', padding: '1rem 0.5rem' }}>
            <div style={{ fontSize: '1.4rem' }}>{s.icon}</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#4FD1C5' }}>{s.value}</div>
            <div style={{ fontSize: '0.7rem', color: '#718096' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Active match banner */}
      {activeMatchId && (
        <div
          className="card mb-4"
          style={{
            background: 'linear-gradient(135deg, rgba(79,209,197,0.15), rgba(79,209,197,0.05))',
            border: '1px solid rgba(79,209,197,0.4)',
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

      {/* Admin Quick Actions */}
      {role === 'admin' && (
        <div className="card mb-4">
          <h3 className="mb-3">⚡ Azioni Rapide</h3>
          <div className="flex gap-3">
            <button
              className="btn btn-teal"
              style={{ flex: 1 }}
              onClick={() => navigate('/match/setup')}
            >
              + Nuova Partita
            </button>
            <button
              className="btn btn-ghost"
              style={{ flex: 1 }}
              onClick={() => navigate('/admin')}
            >
              ⚙️ Admin
            </button>
          </div>
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
        ) : ranking.map((p, i) => (
          <div key={p.id} className="flex items-center gap-3"
            style={{ padding: '0.6rem 0', borderBottom: i < ranking.length - 1 ? '1px solid #4A5568' : 'none' }}>
            <span style={{
              fontSize: '1.1rem',
              minWidth: '28px',
              fontWeight: 700,
              color: i === 0 ? '#F6E05E' : i === 1 ? '#A0AEC0' : i === 2 ? '#C05621' : '#718096',
            }}>
              {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}.`}
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{p.name}</div>
              <div className="text-xs text-muted">{p.primaryRole || 'N/D'}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: 700, color: '#4FD1C5' }}>{p.powerIndex?.toFixed(1) || '50.0'}</div>
              <div className="text-xs text-muted">PI</div>
            </div>
          </div>
        ))}
      </div>

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
              style={{
                padding: '0.75rem 0', cursor: 'pointer',
                borderBottom: '1px solid #4A5568',
              }}
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
