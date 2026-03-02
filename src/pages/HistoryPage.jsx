import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { subscribeToMatches } from '../firebase/firestore';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { generateMatchReport } from '../services/reportService';
import toast from 'react-hot-toast';

function safeDate(val) {
  if (!val) return null;
  if (val?.toDate) return val.toDate();
  if (val instanceof Date) return val;
  return new Date(val);
}

export default function HistoryPage() {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const unsub = subscribeToMatches(ms => { setMatches(ms); setLoading(false); });
    return unsub;
  }, []);

  const scheduled = matches.filter(m => m.status === 'scheduled');
  const active = matches.filter(m => m.status !== 'finished' && m.status !== 'scheduled');
  const finished = matches.filter(m => m.status === 'finished');

  return (
    <div className="page-content">
      <h2 style={{ paddingTop: '0.5rem', marginBottom: '1.5rem' }}>📋 Storico Partite</h2>

      {loading && (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#718096' }}>
          Caricamento...
        </div>
      )}

      {scheduled.length > 0 && (
        <>
          <h3 className="text-sm text-muted mb-2">DA GIOCARE ({scheduled.length})</h3>
          {scheduled.map(m => <ScheduledCard key={m.id} match={m} />)}
          <div style={{ height: '0.5rem' }} />
        </>
      )}

      {active.length > 0 && (
        <>
          <h3 className="text-sm text-muted mb-2">IN CORSO</h3>
          {active.map(m => <MatchCard key={m.id} match={m} onClick={() => navigate(`/match/${m.id}`)} />)}
          <div style={{ height: '0.5rem' }} />
        </>
      )}

      {finished.length > 0 ? (
        <>
          <h3 className="text-sm text-muted mb-2">CONCLUSE ({finished.length})</h3>
          {finished.map(m => <MatchCard key={m.id} match={m} onClick={() => navigate(`/history/${m.id}`)} />)}
        </>
      ) : !loading && (
        <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#718096' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📭</div>
          <p>Nessuna partita nell'archivio</p>
        </div>
      )}
    </div>
  );
}

function MatchCard({ match: m, onClick }) {
  const d = safeDate(m.date);
  const goals = (m.events || []).filter(e => e.type === 'goal');
  const autogoals = (m.events || []).filter(e => e.type === 'autogoal');

  // Lookup nome giocatore per le partite storiche (che hanno solo scorerId, non scorerName)
  const playerById = Object.fromEntries(
    [...(m.redTeam || []), ...(m.blueTeam || [])].filter(p => p.id).map(p => [p.id, p.name])
  );

  // Gol divisi per squadra
  const redMap = {};
  const blueMap = {};
  for (const ev of goals) {
    const name = ev.scorerName || playerById[ev.scorerId];
    if (!name) continue;
    if (ev.team === 'red') redMap[name] = (redMap[name] || 0) + 1;
    else blueMap[name] = (blueMap[name] || 0) + 1;
  }
  const fmt = map => Object.entries(map).sort((a, b) => b[1] - a[1])
    .map(([n, c]) => c > 1 ? `${n} x${c}` : n).join(', ');

  const handleShare = (e) => {
    e.stopPropagation();
    const players = [...(m.redTeam || []), ...(m.blueTeam || [])];
    const report = generateMatchReport(m, players);
    if (navigator.share) {
      navigator.share({ text: report }).catch(() => {
        navigator.clipboard.writeText(report).then(() => toast.success('Tabellino copiato!'));
      });
    } else {
      navigator.clipboard.writeText(report).then(() => toast.success('Tabellino copiato!'));
    }
  };

  return (
    <div className="card mb-3" style={{ cursor: 'pointer' }} onClick={onClick}>
      <div className="flex items-center gap-3 mb-2">
        <div style={{
          width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
          background: m.status === 'finished' ? '#4FD1C5' : '#F6E05E',
        }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>
            🔴 {m.redScore ?? 0} — {m.blueScore ?? 0} 🔵
          </div>
          <div className="text-xs text-muted">
            {d ? format(d, 'dd MMMM yyyy · HH:mm', { locale: it }) : '–'}
          </div>
        </div>
        {m.status === 'finished' && (
          <button
            onClick={handleShare}
            title="Condividi tabellino"
            style={{
              background: 'none',
              border: '1px solid #4A5568',
              borderRadius: '6px',
              padding: '4px 10px',
              cursor: 'pointer',
              color: '#A0AEC0',
              fontSize: '0.85rem',
              lineHeight: 1,
            }}
          >
            📋
          </button>
        )}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#718096" strokeWidth={2}>
          <path d="M9 18l6-6-6-6"/>
        </svg>
      </div>
      {(Object.keys(redMap).length > 0 || Object.keys(blueMap).length > 0) && (
        <div className="text-xs text-secondary">
          {Object.keys(redMap).length > 0 && <span>🔴 {fmt(redMap)}</span>}
          {Object.keys(redMap).length > 0 && Object.keys(blueMap).length > 0 && <span style={{ color: '#4A5568' }}> · </span>}
          {Object.keys(blueMap).length > 0 && <span>🔵 {fmt(blueMap)}</span>}
        </div>
      )}
    </div>
  );
}

function ScheduledCard({ match: m }) {
  const navigate = useNavigate();
  const d = safeDate(m.date);
  return (
    <div
      className="card mb-3"
      style={{
        border: '1px solid rgba(246,224,94,0.4)',
        background: 'rgba(246,224,94,0.06)',
        cursor: 'pointer',
      }}
      onClick={() => navigate(`/history/scheduled/${m.id}`)}
    >
      <div className="flex items-center gap-3 mb-2">
        <div style={{ fontSize: '1.2rem' }}>📅</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, color: '#F6E05E', fontSize: '1rem' }}>
            {d ? format(d, "EEEE d MMMM · HH:mm", { locale: it }) : '–'}
          </div>
          <span className="badge" style={{
            fontSize: '0.65rem', padding: '2px 8px',
            background: 'rgba(246,224,94,0.15)', color: '#F6E05E',
            border: '1px solid rgba(246,224,94,0.3)', borderRadius: '4px',
            marginTop: '4px', display: 'inline-block',
          }}>
            DA GIOCARE
          </span>
        </div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F6E05E" strokeWidth={2}>
          <path d="M9 18l6-6-6-6"/>
        </svg>
      </div>
      <div className="text-xs text-muted">
        🔴 {(m.redTeam || []).map(p => p.name).join(', ') || '–'}
        {' · '}
        🔵 {(m.blueTeam || []).map(p => p.name).join(', ') || '–'}
      </div>
    </div>
  );
}
