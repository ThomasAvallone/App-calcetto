import React, { useEffect, useState, useMemo } from 'react';
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

function getMatchSeason(d) {
  if (!d) return null;
  const year = d.getMonth() >= 8 ? d.getFullYear() : d.getFullYear() - 1;
  return `${year}/${String(year + 1).slice(2)}`;
}

function getMatchScorers(m) {
  const playerById = Object.fromEntries(
    [...(m.redTeam || []), ...(m.blueTeam || [])].filter(p => p.id).map(p => [p.id, p.name])
  );
  return (m.events || [])
    .filter(e => e.type === 'goal')
    .map(e => (e.scorerName || playerById[e.scorerId] || '').toUpperCase())
    .filter(Boolean);
}

function getMatchAssistants(m) {
  const playerById = Object.fromEntries(
    [...(m.redTeam || []), ...(m.blueTeam || [])].filter(p => p.id).map(p => [p.id, p.name])
  );
  return (m.events || [])
    .filter(e => e.type === 'goal' && (e.assistName || e.assistId))
    .map(e => (e.assistName || playerById[e.assistId] || '').toUpperCase())
    .filter(Boolean);
}

export default function HistoryPage() {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  // Filter state
  const [showFilters, setShowFilters] = useState(false);
  const [seasonFilter, setSeasonFilter] = useState('all');
  const [winnerFilter, setWinnerFilter] = useState('all');
  const [playerFilter, setPlayerFilter] = useState('');
  const [minGoals, setMinGoals] = useState('');

  useEffect(() => {
    const unsub = subscribeToMatches(ms => { setMatches(ms); setLoading(false); });
    return unsub;
  }, []);

  const scheduled = matches.filter(m => m.status === 'scheduled');
  const active = matches.filter(m => m.status !== 'finished' && m.status !== 'scheduled');
  const finished = matches.filter(m => m.status === 'finished');

  // Available seasons from match dates
  const seasons = useMemo(() => {
    const s = new Set();
    for (const m of finished) {
      const season = getMatchSeason(safeDate(m.date));
      if (season) s.add(season);
    }
    return Array.from(s).sort().reverse();
  }, [finished]);

  // Apply filters
  const activeFilterCount = (seasonFilter !== 'all' ? 1 : 0)
    + (winnerFilter !== 'all' ? 1 : 0)
    + (playerFilter.trim() ? 1 : 0)
    + (minGoals !== '' && Number(minGoals) > 0 ? 1 : 0);

  const filteredFinished = useMemo(() => {
    return finished.filter(m => {
      // Season
      if (seasonFilter !== 'all') {
        const season = getMatchSeason(safeDate(m.date));
        if (season !== seasonFilter) return false;
      }
      // Winner
      if (winnerFilter !== 'all') {
        const rs = m.redScore ?? 0, bs = m.blueScore ?? 0;
        if (winnerFilter === 'red' && rs <= bs) return false;
        if (winnerFilter === 'blue' && bs <= rs) return false;
        if (winnerFilter === 'draw' && rs !== bs) return false;
      }
      // Player (matches player in roster, scorers, or assistants)
      if (playerFilter.trim()) {
        const q = playerFilter.toUpperCase();
        const roster = [...(m.redTeam || []), ...(m.blueTeam || [])].map(p => (p.name || '').toUpperCase());
        const scorers = getMatchScorers(m);
        const assistants = getMatchAssistants(m);
        if (![...roster, ...scorers, ...assistants].some(n => n.includes(q))) return false;
      }
      // Min goals
      const mg = Number(minGoals);
      if (mg > 0) {
        if ((m.redScore ?? 0) + (m.blueScore ?? 0) < mg) return false;
      }
      return true;
    });
  }, [finished, seasonFilter, winnerFilter, playerFilter, minGoals]);

  const clearFilters = () => {
    setSeasonFilter('all');
    setWinnerFilter('all');
    setPlayerFilter('');
    setMinGoals('');
  };

  const chipStyle = (active) => ({
    padding: '0.3rem 0.65rem',
    borderRadius: '999px',
    fontSize: '0.72rem',
    fontWeight: 600,
    border: active ? '1px solid rgba(79,209,197,0.5)' : '1px solid #4A5568',
    background: active ? 'rgba(79,209,197,0.15)' : 'transparent',
    color: active ? '#4FD1C5' : '#A0AEC0',
    cursor: 'pointer',
  });

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
          {/* Header with filter toggle */}
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm text-muted">
              CONCLUSE ({filteredFinished.length}{activeFilterCount > 0 ? `/${finished.length}` : ''})
            </h3>
            <div className="flex gap-2 items-center">
              {activeFilterCount > 0 && (
                <button onClick={clearFilters} style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#FC8181', fontSize: '0.7rem', fontWeight: 600, padding: '0.2rem 0.4rem',
                }}>
                  Resetta
                </button>
              )}
              <button
                onClick={() => setShowFilters(v => !v)}
                style={{
                  background: activeFilterCount > 0 ? 'rgba(79,209,197,0.15)' : 'transparent',
                  border: activeFilterCount > 0 ? '1px solid rgba(79,209,197,0.5)' : '1px solid #4A5568',
                  borderRadius: '8px',
                  padding: '0.35rem 0.7rem',
                  cursor: 'pointer',
                  color: activeFilterCount > 0 ? '#4FD1C5' : '#A0AEC0',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  display: 'flex', alignItems: 'center', gap: '0.3rem',
                }}
              >
                🔍 Filtri{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
              </button>
            </div>
          </div>

          {/* Filter panel */}
          {showFilters && (
            <div className="card mb-3" style={{ border: '1px solid #4A5568', padding: '0.85rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>

                {/* Season */}
                <div>
                  <div style={{ fontSize: '0.68rem', color: '#718096', fontWeight: 600, marginBottom: '0.35rem', letterSpacing: '0.04em' }}>STAGIONE</div>
                  <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                    <button type="button" style={chipStyle(seasonFilter === 'all')} onClick={() => setSeasonFilter('all')}>
                      Tutte
                    </button>
                    {seasons.map(s => (
                      <button key={s} type="button" style={chipStyle(seasonFilter === s)} onClick={() => setSeasonFilter(s)}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Winner */}
                <div>
                  <div style={{ fontSize: '0.68rem', color: '#718096', fontWeight: 600, marginBottom: '0.35rem', letterSpacing: '0.04em' }}>RISULTATO</div>
                  <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                    {[
                      { key: 'all', label: 'Tutti' },
                      { key: 'red', label: '🔴 Rossa' },
                      { key: 'blue', label: '🔵 Blu' },
                      { key: 'draw', label: '🤝 Pareggio' },
                    ].map(o => (
                      <button key={o.key} type="button" style={chipStyle(winnerFilter === o.key)} onClick={() => setWinnerFilter(o.key)}>
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Player / Scorer */}
                <div>
                  <div style={{ fontSize: '0.68rem', color: '#718096', fontWeight: 600, marginBottom: '0.35rem', letterSpacing: '0.04em' }}>GIOCATORE / MARCATORE</div>
                  <input
                    className="input"
                    placeholder="Cerca per nome..."
                    value={playerFilter}
                    onChange={e => setPlayerFilter(e.target.value)}
                    style={{ fontSize: '0.82rem', padding: '0.4rem 0.65rem', minHeight: 'auto' }}
                  />
                </div>

                {/* Min goals */}
                <div>
                  <div style={{ fontSize: '0.68rem', color: '#718096', fontWeight: 600, marginBottom: '0.35rem', letterSpacing: '0.04em' }}>GOL TOTALI (MIN)</div>
                  <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                    {['', '5', '8', '10', '15'].map(v => (
                      <button
                        key={v}
                        type="button"
                        style={chipStyle(minGoals === v)}
                        onClick={() => setMinGoals(v)}
                      >
                        {v === '' ? 'Tutti' : `${v}+`}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {filteredFinished.length > 0 ? (
            filteredFinished.map(m => <MatchCard key={m.id} match={m} onClick={() => navigate(`/history/${m.id}`)} />)
          ) : (
            <div style={{ textAlign: 'center', padding: '2rem 1rem', color: '#718096' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🔍</div>
              <p style={{ fontSize: '0.85rem' }}>Nessuna partita trovata con questi filtri</p>
            </div>
          )}
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
