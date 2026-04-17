import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { subscribeToMatches } from '../firebase/firestore';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { generateMatchReport } from '../services/reportService';
import toast from 'react-hot-toast';
import { safeDate } from '../utils/dateUtils';

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
    .filter(e => e.type === 'goal' && (e.assistId || (e.assistName && e.assistName !== 'Nessuno')))
    .map(e => (e.assistName || playerById[e.assistId] || '').toUpperCase())
    .filter(n => n && n !== 'NESSUNO');
}

function hashStr(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function getMatchBadges(m) {
  if (m.isHistorical) return [];
  const badges = [];
  const allPlayers = [...(m.redTeam || []), ...(m.blueTeam || [])];

  // Bestie (admin-assigned)
  if (m.bestieId) {
    const bestiePlayer = allPlayers.find(p => p.id === m.bestieId);
    const name = bestiePlayer?.name || m.bestiePlayerName;
    if (name) badges.push({ icon: '🙏', label: 'Bestie', playerName: name });
  }

  // Per-player match stats
  const playerGoals = {};
  const playerAssists = {};
  for (const ev of (m.events || [])) {
    if (ev.type === 'goal') {
      if (ev.scorerId) {
        if (!playerGoals[ev.scorerId]) playerGoals[ev.scorerId] = [];
        playerGoals[ev.scorerId].push(ev);
      }
      if (ev.assistId) {
        playerAssists[ev.assistId] = (playerAssists[ev.assistId] || 0) + 1;
      }
    }
  }

  for (const pl of allPlayers) {
    const pid = pl.id;
    const goals = playerGoals[pid] || [];
    const assistCount = playerAssists[pid] || 0;

    if (goals.length >= 5) {
      badges.push({ icon: '✨', label: 'Pokémon Leggendario', playerName: pl.name });
    } else if (goals.length >= 3) {
      badges.push({ icon: '☄️', label: 'Meteorite', playerName: pl.name });
    }

    if (goals.length >= 2 && goals.every(ev => !ev.assistId)) {
      badges.push({ icon: '🤠', label: 'Lone Ranger', playerName: pl.name });
    }

    if (assistCount >= 3) {
      badges.push({ icon: '🔔', label: "Che io t'assista", playerName: pl.name });
    }
  }

  // Bulldozer — team badge (no specific player)
  const margin = Math.abs((m.redScore || 0) - (m.blueScore || 0));
  if (margin >= 5) {
    badges.push({ icon: '🌪️', label: 'Bulldozer', playerName: null });
  }

  // Giancarlo — deterministic per match
  if (allPlayers.length > 0) {
    const giancarlo = allPlayers[hashStr(m.id || String(m.date) || '') % allPlayers.length];
    if (giancarlo) badges.push({ icon: '🎲', label: 'Giancarlo', playerName: giancarlo.name });
  }

  // Miglior Luciano — 10% chance per match for Luciano
  const luciano = allPlayers.find(pl => pl.name?.toLowerCase().includes('luciano'));
  if (luciano && hashStr(m.id || String(m.date) || '') % 10 === 0) {
    badges.push({ icon: '🥇', label: 'Miglior Luciano', playerName: luciano.name });
  }

  return badges;
}

export default function HistoryPage() {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState('list');

  // Filter state
  const [showFilters, setShowFilters] = useState(false);
  const [seasonFilter, setSeasonFilter] = useState('all');
  const [winnerFilter, setWinnerFilter] = useState('all');
  const [playerFilter, setPlayerFilter] = useState('');
  const [minGoals, setMinGoals] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

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
    + (minGoals !== '' && Number(minGoals) > 0 ? 1 : 0)
    + (dateFrom ? 1 : 0)
    + (dateTo ? 1 : 0);

  const filteredFinished = useMemo(() => {
    const fromMs = dateFrom ? new Date(dateFrom + 'T00:00:00').getTime() : null;
    const toMs = dateTo ? new Date(dateTo + 'T23:59:59').getTime() : null;
    return finished.filter(m => {
      // Date range
      if (fromMs != null || toMs != null) {
        const d = safeDate(m.date);
        const ms = d ? d.getTime() : null;
        if (ms == null) return false;
        if (fromMs != null && ms < fromMs) return false;
        if (toMs != null && ms > toMs) return false;
      }
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
  }, [finished, seasonFilter, winnerFilter, playerFilter, minGoals, dateFrom, dateTo]);

  const clearFilters = () => {
    setSeasonFilter('all');
    setWinnerFilter('all');
    setPlayerFilter('');
    setMinGoals('');
    setDateFrom('');
    setDateTo('');
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
      <div className="flex items-center justify-between stagger-1" style={{ paddingTop: '0.5rem', marginBottom: '1.25rem' }}>
        <h2>📋 Storico Partite</h2>
        <div className="flex gap-1">
          {[{ key: 'list', label: '☰' }, { key: 'calendar', label: '📅' }].map(v => (
            <button
              key={v.key}
              onClick={() => setViewMode(v.key)}
              style={{
                padding: '0.3rem 0.65rem', borderRadius: '6px', border: 'none',
                background: viewMode === v.key ? 'rgba(79,209,197,0.2)' : 'rgba(74,85,104,0.4)',
                color: viewMode === v.key ? '#4FD1C5' : '#A0AEC0',
                cursor: 'pointer', fontSize: '0.9rem', fontWeight: 600,
              }}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#718096' }}>
          Caricamento...
        </div>
      )}

      {viewMode === 'calendar' ? (
        <div className="stagger-2"><CalendarView matches={matches} onNavigate={navigate} /></div>
      ) : (
      <div className="stagger-2">

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

                {/* Date range */}
                <div>
                  <div style={{ fontSize: '0.68rem', color: '#718096', fontWeight: 600, marginBottom: '0.35rem', letterSpacing: '0.04em' }}>INTERVALLO DATE</div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <input
                      type="date"
                      className="input"
                      value={dateFrom}
                      max={dateTo || undefined}
                      onChange={e => setDateFrom(e.target.value)}
                      style={{ fontSize: '0.78rem', padding: '0.4rem 0.55rem', minHeight: 'auto', flex: 1 }}
                    />
                    <span style={{ fontSize: '0.75rem', color: '#718096' }}>→</span>
                    <input
                      type="date"
                      className="input"
                      value={dateTo}
                      min={dateFrom || undefined}
                      onChange={e => setDateTo(e.target.value)}
                      style={{ fontSize: '0.78rem', padding: '0.4rem 0.55rem', minHeight: 'auto', flex: 1 }}
                    />
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
      )}
    </div>
  );
}

const MONTH_NAMES = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];

function CalendarView({ matches, onNavigate }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [selectedDay, setSelectedDay] = useState(null);

  const matchesByDay = useMemo(() => {
    const map = {};
    for (const m of matches) {
      const d = m.date?.toDate ? m.date.toDate() : m.date ? new Date(m.date) : null;
      if (!d || isNaN(d)) continue;
      if (d.getFullYear() === year && d.getMonth() === month) {
        const day = d.getDate();
        if (!map[day]) map[day] = [];
        map[day].push(m);
      }
    }
    return map;
  }, [matches, year, month]);

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7; // 0=Lun

  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const today = new Date();
  const isToday = d => d && today.getFullYear() === year && today.getMonth() === month && today.getDate() === d;

  const prevMonth = () => { setSelectedDay(null); if (month === 0) { setYear(y => y - 1); setMonth(11); } else setMonth(m => m - 1); };
  const nextMonth = () => { setSelectedDay(null); if (month === 11) { setYear(y => y + 1); setMonth(0); } else setMonth(m => m + 1); };

  const selectedMatches = selectedDay ? (matchesByDay[selectedDay] || []) : [];

  return (
    <div className="card">
      {/* Navigation */}
      <div className="flex items-center justify-between mb-3">
        <button onClick={prevMonth} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#A0AEC0', fontSize: '1.3rem', padding: '0.2rem 0.5rem', lineHeight: 1 }}>‹</button>
        <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{MONTH_NAMES[month]} {year}</span>
        <button onClick={nextMonth} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#A0AEC0', fontSize: '1.3rem', padding: '0.2rem 0.5rem', lineHeight: 1 }}>›</button>
      </div>

      {/* Day-of-week headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: '4px' }}>
        {['L','M','M','G','V','S','D'].map((d, i) => (
          <div key={i} style={{ textAlign: 'center', fontSize: '0.65rem', fontWeight: 700, color: '#718096', padding: '0.15rem 0' }}>{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      {weeks.map((week, wi) => (
        <div key={wi} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', marginBottom: '2px' }}>
          {week.map((day, di) => {
            const dayMs = matchesByDay[day] || [];
            const hasMatch = dayMs.length > 0;
            const hasFinished = dayMs.some(m => m.status === 'finished');
            const hasScheduled = dayMs.some(m => m.status === 'scheduled');
            const hasActive = dayMs.some(m => m.status !== 'finished' && m.status !== 'scheduled');
            const isSelected = day === selectedDay;
            return (
              <div
                key={di}
                onClick={() => day && hasMatch && setSelectedDay(isSelected ? null : day)}
                style={{
                  minHeight: '42px', borderRadius: '6px', padding: '0.25rem 0',
                  background: isSelected ? 'rgba(79,209,197,0.18)' : hasMatch ? 'rgba(79,209,197,0.06)' : 'transparent',
                  border: isToday(day) ? '1px solid rgba(79,209,197,0.6)' : isSelected ? '1px solid rgba(79,209,197,0.4)' : '1px solid transparent',
                  cursor: hasMatch ? 'pointer' : 'default',
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                }}
              >
                {day && (
                  <>
                    <span style={{ fontSize: '0.78rem', fontWeight: isToday(day) ? 700 : 400, color: isToday(day) ? '#4FD1C5' : '#F7FAFC', marginBottom: '3px' }}>{day}</span>
                    <div style={{ display: 'flex', gap: '2px', justifyContent: 'center', flexWrap: 'wrap' }}>
                      {hasFinished && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#4FD1C5' }} />}
                      {hasScheduled && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#F6E05E' }} />}
                      {hasActive && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#68D391' }} />}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      ))}

      {/* Legend */}
      <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '0.75rem', marginBottom: selectedMatches.length ? '0.75rem' : 0 }}>
        {[['#4FD1C5','Conclusa'],['#F6E05E','Programmata'],['#68D391','In corso']].map(([c, l]) => (
          <span key={l} style={{ fontSize: '0.65rem', color: '#718096', display: 'flex', alignItems: 'center', gap: '3px' }}>
            <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: c }} />{l}
          </span>
        ))}
      </div>

      {/* Selected day panel */}
      {selectedMatches.length > 0 && (
        <div style={{ borderTop: '1px solid #2D3748', paddingTop: '0.75rem', marginTop: '0.25rem' }}>
          <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#4FD1C5', marginBottom: '0.5rem' }}>
            📅 {selectedDay} {MONTH_NAMES[month]} {year}
          </div>
          {selectedMatches.map(m => {
            const isFinished = m.status === 'finished';
            const isScheduled = m.status === 'scheduled';
            const path = isFinished ? `/history/${m.id}` : isScheduled ? `/history/scheduled/${m.id}` : `/match/${m.id}`;
            return (
              <div
                key={m.id}
                onClick={() => onNavigate(path)}
                style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.45rem 0', cursor: 'pointer', borderBottom: '1px solid rgba(74,85,104,0.3)' }}
              >
                <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: isFinished ? '#4FD1C5' : isScheduled ? '#F6E05E' : '#68D391' }} />
                <span style={{ fontSize: '0.88rem', fontWeight: 600, flex: 1 }}>
                  {isFinished ? `🔴 ${m.redScore ?? 0} — ${m.blueScore ?? 0} 🔵` : isScheduled ? 'Da giocare' : 'In corso'}
                </span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#718096" strokeWidth={2}><path d="M9 18l6-6-6-6"/></svg>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MatchCard({ match: m, onClick }) {
  const d = safeDate(m.date);
  const goals = (m.events || []).filter(e => e.type === 'goal');
  const autogoals = (m.events || []).filter(e => e.type === 'autogoal');
  const matchBadges = m.status === 'finished' ? getMatchBadges(m) : [];

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

  // Autogol con parziale progressivo
  const allGoalEvents = (m.events || []).filter(e => e.type === 'goal' || e.type === 'autogoal');
  let rr = 0, bb = 0;
  const eventsWithPartial = allGoalEvents.map(ev => {
    if (ev.type === 'goal') { if (ev.team === 'red') rr++; else bb++; }
    else if (ev.type === 'autogoal') { if (ev.team === 'red') bb++; else rr++; }
    return { ...ev, partialRed: rr, partialBlue: bb };
  });
  const autogoalEvents = eventsWithPartial.filter(e => e.type === 'autogoal');

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
      {/* Marcatori aggregati */}
      {(Object.keys(redMap).length > 0 || Object.keys(blueMap).length > 0) && (
        <div className="text-xs text-secondary">
          {Object.keys(redMap).length > 0 && <span>🔴 {fmt(redMap)}</span>}
          {Object.keys(redMap).length > 0 && Object.keys(blueMap).length > 0 && <span style={{ color: '#4A5568' }}> · </span>}
          {Object.keys(blueMap).length > 0 && <span>🔵 {fmt(blueMap)}</span>}
        </div>
      )}
      {/* Autogol evidenziati con parziale progressivo */}
      {autogoalEvents.length > 0 && (
        <div style={{ marginTop: '0.3rem', display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
          {autogoalEvents.map((ev, i) => {
            const name = ev.scorerName || playerById[ev.scorerId];
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.7rem' }}>
                <span style={{ color: '#FC8181', fontWeight: 700 }}>🤦 {name}</span>
                <span style={{ color: '#FC8181', fontSize: '0.63rem', fontWeight: 700 }}>(autogol)</span>
                {ev.minute && <span style={{ color: '#718096' }}>{ev.minute}'</span>}
                <span style={{ marginLeft: 'auto', fontWeight: 700 }}>
                  <span style={{ color: '#FC8181' }}>{ev.partialRed}</span>
                  <span style={{ color: '#4A5568' }}>–</span>
                  <span style={{ color: '#63B3ED' }}>{ev.partialBlue}</span>
                </span>
              </div>
            );
          })}
        </div>
      )}
      {matchBadges.length > 0 && (
        <div style={{ marginTop: '0.45rem', display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
          {matchBadges.map((b, i) => (
            <span
              key={i}
              title={b.playerName ? `${b.label} — ${b.playerName}` : b.label}
              style={{
                fontSize: '0.68rem',
                background: 'rgba(159,122,234,0.12)',
                border: '1px solid rgba(159,122,234,0.3)',
                borderRadius: '999px',
                padding: '2px 8px',
                color: '#B794F4',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px',
                lineHeight: 1.4,
              }}
            >
              {b.icon} {b.label}{b.playerName ? <span style={{ color: '#D6BCFA', fontWeight: 700 }}> · {b.playerName.toUpperCase()}</span> : null}
            </span>
          ))}
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
