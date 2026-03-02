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

  const finished = matches.filter(m => m.status === 'finished');
  const active = matches.filter(m => m.status !== 'finished');

  return (
    <div className="page-content">
      <h2 style={{ paddingTop: '0.5rem', marginBottom: '1.5rem' }}>📋 Storico Partite</h2>

      {loading && (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#718096' }}>
          Caricamento...
        </div>
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

  // Conteggio gol per marcatore e assist
  const scorerMap = {};
  const assistMap = {};
  for (const ev of goals) {
    const name = ev.scorerName || playerById[ev.scorerId];
    if (!name) continue;
    scorerMap[name] = (scorerMap[name] || 0) + 1;
    if (ev.assistName && ev.assistName !== 'Nessuno') {
      assistMap[ev.assistName] = (assistMap[ev.assistName] || 0) + 1;
    }
  }
  const scorerEntries = Object.entries(scorerMap).sort((a, b) => b[1] - a[1]);
  const assistEntries = Object.entries(assistMap).sort((a, b) => b[1] - a[1]);

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
      {scorerEntries.length > 0 && (
        <div className="text-xs text-secondary" style={{ marginBottom: '2px' }}>
          ⚽ {scorerEntries.map(([name, count]) => count > 1 ? `${name} x${count}` : name).join(', ')}
          {autogoals.length > 0 && ` · 🤦 ${[...new Set(autogoals.map(e => e.scorerName))].join(', ')}`}
        </div>
      )}
      {assistEntries.length > 0 && (
        <div className="text-xs" style={{ color: '#718096', marginBottom: '2px' }}>
          🎯 {assistEntries.map(([name, count]) => count > 1 ? `${name} x${count}` : name).join(', ')}
        </div>
      )}
      <div className="text-xs text-muted mt-1">
        🔴 {(m.redTeam || []).map(p => p.name).slice(0, 3).join(', ') || '–'}
        {' · '}
        🔵 {(m.blueTeam || []).map(p => p.name).slice(0, 3).join(', ') || '–'}
      </div>
    </div>
  );
}
