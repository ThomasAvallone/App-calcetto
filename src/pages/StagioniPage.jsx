import React, { useState, useMemo, useEffect } from 'react';
import { HISTORICAL_SEASONS } from '../data/historicalData';
import { useMatchesSubscription } from '../hooks/useMatchesSubscription';
import usePlayersStore from '../store/playersStore';
import { computeSeasonRecap, listAppSeasonIds, withSeasonProgressFlag } from '../utils/seasonRecap';
import { exportSeasonCSV } from '../utils/dataExport';
import toast from 'react-hot-toast';

const SORT_KEYS = [
  { key: 'gol', label: 'Gol' },
  { key: 'presenze', label: 'Pres.' },
  { key: 'assist', label: 'Assist' },
  { key: 'vinte', label: 'Vinte' },
  { key: 'perse', label: 'Perse' },
];

export default function StagioniPage() {
  const allMatches = useMatchesSubscription();
  const { players } = usePlayersStore();

  // La stagione "in corso" dipende dalla data: senza un refresh la pagina
  // aperta a cavallo del 1° settembre continuerebbe a mostrare la stagione
  // appena finita come "In Corso". Stesso pattern di StatsPage.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') setNow(Date.now()); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  // Le stagioni con partite app vengono calcolate LIVE da Firestore (la parte
  // pre-app della stagione è coperta dai doc isHistorical importati) e
  // sostituiscono l'eventuale entry statica parziale con lo stesso id.
  const seasons = useMemo(() => {
    const staticById = new Map(HISTORICAL_SEASONS.map(s => [s.id, s]));
    const live = listAppSeasonIds(allMatches)
      .map(id => computeSeasonRecap(players, allMatches, id, now))
      .filter(Boolean);
    // La live sostituisce la statica solo se copre ALMENO le stesse partite:
    // se le partite storiche non sono (ancora) state importate su Firestore la
    // versione calcolata sarebbe più povera e la stagione "si rimpicciolirebbe"
    // sotto gli occhi dell'utente. In quel caso vince il dato dichiarato.
    const chosen = new Map();
    for (const s of live) {
      const stat = staticById.get(s.id);
      chosen.set(s.id, stat && (stat.totalMatches || 0) > s.totalMatches ? stat : s);
    }
    const merged = HISTORICAL_SEASONS.map(s => chosen.get(s.id) || s);
    for (const s of live) if (!staticById.has(s.id)) merged.push(s);
    return merged
      // il flag inCorso nei dati statici è hardcoded: va riallineato a `now`
      // o la 2025/26 resterebbe "In Corso" anche a stagione finita.
      .map(s => withSeasonProgressFlag(s, now))
      .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  }, [allMatches, players, now]);

  const [selectedId, setSelectedId] = useState(null);
  const [sortKey, setSortKey] = useState('gol');
  const season = seasons.find(s => s.id === selectedId) || seasons[seasons.length - 1];

  const hasAssists = !!season && season.players.some(p => p.assist != null);
  // Le stagioni più vecchie non hanno gli assist: senza questo ripiego, passando
  // da una stagione con assist a una senza, sortKey resterebbe 'assist' e la
  // tabella verrebbe ordinata su valori tutti nulli (ordine arbitrario, nessuna
  // colonna evidenziata).
  const activeSort = sortKey === 'assist' && !hasAssists ? 'gol' : sortKey;

  const sortedPlayers = useMemo(() => {
    if (!season) return [];
    return [...season.players].sort((a, b) => (b[activeSort] || 0) - (a[activeSort] || 0));
  }, [season, activeSort]);

  // All-time totals
  const totals = useMemo(() => {
    let matches = 0, goals = 0, autogoals = 0, seasonCount = 0;
    for (const s of seasons) {
      matches += s.totalMatches;
      goals += s.totalGoals;
      autogoals += s.totalAutoGoals;
      seasonCount++;
    }
    return { matches, goals, autogoals, seasonCount };
  }, [seasons]);

  if (!season) return null;
  const rec = season.records || {};

  return (
    <div className="page-content">
      {/* Header */}
      <div className="stagger-1" style={{ paddingTop: '0.5rem', marginBottom: '1rem' }}>
        <h2 style={{ marginBottom: '0.25rem' }}>📚 Annali del Calcetto</h2>
        <p className="text-sm text-muted">
          {totals.seasonCount} stagioni · {totals.matches} partite · {totals.goals} gol
        </p>
      </div>

      {/* Season selector */}
      <div className="stagger-2" style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', paddingBottom: '0.75rem', marginBottom: '1rem' }}>
        {seasons.map(s => {
          const isSel = s.id === season?.id;
          return (
            <button
              key={s.id}
              onClick={() => setSelectedId(s.id)}
              style={{
                flexShrink: 0,
                padding: '0.4rem 0.85rem',
                borderRadius: '999px',
                border: isSel ? '2px solid #4FD1C5' : '1px solid #4A5568',
                background: isSel ? 'rgba(79,209,197,0.15)' : 'transparent',
                color: isSel ? '#4FD1C5' : '#A0AEC0',
                fontWeight: isSel ? 700 : 500,
                fontSize: '0.8rem',
                cursor: 'pointer',
                fontFamily: 'inherit',
                whiteSpace: 'nowrap',
              }}
            >
              {s.label.replace('20', "'").replace('/20', "/")}
              {s.inCorso && ' *'}
            </button>
          );
        })}
      </div>

      {/* Season banner */}
      <div className="card mb-4 stagger-3" style={{
        background: season.inCorso
          ? 'linear-gradient(135deg, rgba(246,224,94,0.12), rgba(246,224,94,0.03))'
          : 'linear-gradient(135deg, rgba(79,209,197,0.12), rgba(79,209,197,0.03))',
        border: season.inCorso ? '1px solid rgba(246,224,94,0.3)' : '1px solid rgba(79,209,197,0.3)',
      }}>
        <div className="flex items-center gap-2 mb-2">
          <h3 style={{ color: season.inCorso ? '#F6E05E' : '#4FD1C5', fontSize: '1.2rem', flex: 1 }}>
            {season.label}
          </h3>
          {season.inCorso && <span className="badge badge-gold">In Corso</span>}
          {/* "Conclusa" solo sulla stagione più recente: è l'unica per cui la
              domanda "è finita?" ha senso — sulle precedenti sarebbe rumore. */}
          {!season.inCorso && season.id === seasons[seasons.length - 1]?.id && (
            <span className="badge" style={{ background: 'rgba(79,209,197,0.2)', color: '#4FD1C5' }}>Conclusa</span>
          )}
          <button
            onClick={() => { exportSeasonCSV(season); toast.success('Riepilogo stagione scaricato'); }}
            aria-label="Scarica riepilogo CSV"
            style={{
              padding: '0.35rem 0.7rem', borderRadius: '8px', cursor: 'pointer',
              border: '1px solid #4A5568', background: 'rgba(26,32,44,0.5)',
              color: '#A0AEC0', fontSize: '0.75rem', fontWeight: 600, fontFamily: 'inherit',
              whiteSpace: 'nowrap',
            }}
          >
            📥 CSV
          </button>
        </div>
        <p className="text-xs text-muted mb-3">{season.months}</p>

        <div className="grid-3">
          {[
            { label: 'Partite', value: season.totalMatches, icon: '🏟️' },
            { label: 'Gol', value: season.totalGoals, icon: '⚽' },
            { label: 'Giocatori', value: season.totalPlayers, icon: '👥' },
          ].map(s => (
            <div key={s.label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.1rem' }}>{s.icon}</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#F7FAFC' }}>{s.value}</div>
              <div style={{ fontSize: '0.65rem', color: '#718096' }}>{s.label}</div>
            </div>
          ))}
        </div>

        {season.notes && (
          <p className="text-xs mt-2" style={{ color: '#F6E05E', fontStyle: 'italic' }}>
            {season.notes}
          </p>
        )}
      </div>

      {/* Records */}
      <div className="card mb-4 stagger-4">
        <h3 className="mb-3">🏆 Record della Stagione</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
          {rec.topScorer && (
            <RecordItem emoji="⚽" label="Capocannoniere" name={rec.topScorer.name} value={`${rec.topScorer.value} gol`} />
          )}
          {rec.mostPresent && (
            <RecordItem emoji="📋" label="Più presente" name={rec.mostPresent.name} value={`${rec.mostPresent.value} pres.`} />
          )}
          {rec.assistman && (
            <RecordItem emoji="🎯" label="Assistman" name={rec.assistman.name} value={`${rec.assistman.value} ass.`} />
          )}
          {rec.topWinner && (
            <RecordItem emoji="✅" label="Più vittorioso" name={rec.topWinner.name} value={`${rec.topWinner.value} vinte`} />
          )}
          {rec.bestMonth && (
            <RecordItem emoji="📅" label="Mese top" name={rec.bestMonth.name} value={`${rec.bestMonth.value} gol`} />
          )}
          {rec.bestWinStreak && (
            <RecordItem emoji="🔥" label="Vitt. consec." name={rec.bestWinStreak.name} value={`${rec.bestWinStreak.value}`} />
          )}
          {rec.biggestMatch && (
            <RecordItem emoji="💥" label="Partita record" name={rec.biggestMatch.score} value={`${rec.biggestMatch.totalGoals} gol`} />
          )}
          {rec.bestMatchGoals && (
            <RecordItem emoji="🎩" label="Gol in 1 partita" name={rec.bestMatchGoals.name} value={`${rec.bestMatchGoals.value}`} />
          )}
          {rec.bestMonthGoals && (
            <RecordItem emoji="🚀" label="Gol in 1 mese" name={rec.bestMonthGoals.name} value={`${rec.bestMonthGoals.value}${rec.bestMonthGoals.detail ? ` (${rec.bestMonthGoals.detail})` : ''}`} />
          )}
          {rec.mostLosses && (
            <RecordItem emoji="💀" label="Più sconfitto" name={rec.mostLosses.name} value={`${rec.mostLosses.value} perse`} />
          )}
          {rec.bestLossStreak && (
            <RecordItem emoji="📉" label="Sconf. consec." name={rec.bestLossStreak.name} value={`${rec.bestLossStreak.value}`} />
          )}
          {rec.mostAutoGoals && (
            <RecordItem emoji="🤦" label="Più autogol" name={rec.mostAutoGoals.name} value={`${rec.mostAutoGoals.value}`} />
          )}
        </div>
      </div>

      {/* Sort controls */}
      <div className="flex items-center gap-2 mb-3 stagger-5">
        <h3 style={{ flex: 1 }}>📊 Classifica Giocatori</h3>
      </div>
      <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.75rem', overflowX: 'auto' }}>
        {SORT_KEYS.filter(s => s.key !== 'assist' || hasAssists).map(s => (
          <button
            key={s.key}
            onClick={() => setSortKey(s.key)}
            style={{
              padding: '0.3rem 0.65rem',
              borderRadius: '999px',
              border: activeSort === s.key ? '1px solid #4FD1C5' : '1px solid #4A5568',
              background: activeSort === s.key ? 'rgba(79,209,197,0.15)' : 'transparent',
              color: activeSort === s.key ? '#4FD1C5' : '#A0AEC0',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
              whiteSpace: 'nowrap',
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Player table */}
      <div className="card stagger-6" style={{ padding: '0.5rem' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #4A5568', color: '#718096' }}>
              <th style={{ textAlign: 'left', padding: '0.5rem 0.3rem', fontWeight: 600 }}>#</th>
              <th style={{ textAlign: 'left', padding: '0.5rem 0.3rem', fontWeight: 600 }}>Nome</th>
              <th style={{ textAlign: 'center', padding: '0.5rem 0.2rem', fontWeight: 600 }}>P</th>
              <th style={{ textAlign: 'center', padding: '0.5rem 0.2rem', fontWeight: 600, color: activeSort === 'gol' ? '#4FD1C5' : undefined }}>G</th>
              {hasAssists && <th style={{ textAlign: 'center', padding: '0.5rem 0.2rem', fontWeight: 600, color: activeSort === 'assist' ? '#4FD1C5' : undefined }}>A</th>}
              <th style={{ textAlign: 'center', padding: '0.5rem 0.2rem', fontWeight: 600, color: activeSort === 'vinte' ? '#4FD1C5' : undefined }}>V</th>
              <th style={{ textAlign: 'center', padding: '0.5rem 0.2rem', fontWeight: 600, color: activeSort === 'perse' ? '#4FD1C5' : undefined }}>S</th>
            </tr>
          </thead>
          <tbody>
            {sortedPlayers.map((p, i) => (
              <tr key={p.name} style={{ borderBottom: '1px solid #2D3748' }}>
                <td style={{ padding: '0.45rem 0.3rem', color: i < 3 ? '#F6E05E' : '#718096', fontWeight: i < 3 ? 700 : 400 }}>
                  {i + 1}
                </td>
                <td style={{ padding: '0.45rem 0.3rem', fontWeight: 600, maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.name}
                </td>
                <td style={{ textAlign: 'center', padding: '0.45rem 0.2rem', color: '#A0AEC0' }}>{p.presenze}</td>
                <td style={{ textAlign: 'center', padding: '0.45rem 0.2rem', fontWeight: activeSort === 'gol' ? 700 : 400, color: activeSort === 'gol' ? '#4FD1C5' : '#F7FAFC' }}>
                  {p.gol ?? '-'}
                </td>
                {hasAssists && (
                  <td style={{ textAlign: 'center', padding: '0.45rem 0.2rem', fontWeight: activeSort === 'assist' ? 700 : 400, color: activeSort === 'assist' ? '#4FD1C5' : '#F7FAFC' }}>
                    {p.assist ?? '-'}
                  </td>
                )}
                <td style={{ textAlign: 'center', padding: '0.45rem 0.2rem', color: '#81E6D9' }}>{p.vinte}</td>
                <td style={{ textAlign: 'center', padding: '0.45rem 0.2rem', color: '#FC8181' }}>{p.perse}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Autogol note */}
      {season.totalAutoGoals > 0 && (
        <p className="text-xs text-muted mt-2" style={{ textAlign: 'center' }}>
          + {season.totalAutoGoals} autogol nella stagione
        </p>
      )}

      {/* Gol senza marcatore: spiega perché la colonna G non somma al totale
          (nomi storici non collegati → l'import ha scartato quegli eventi). */}
      {season.unattributedGoals > 0 && (
        <p className="text-xs mt-1" style={{ textAlign: 'center', color: '#718096' }}>
          {season.unattributedGoals} gol non attribuiti in classifica
          {season.players.some(p => p.gol == null) && ' — collega i nomi storici dalla scheda giocatore'}
        </p>
      )}
    </div>
  );
}

function RecordItem({ emoji, label, name, value }) {
  return (
    <div style={{
      background: 'rgba(26,32,44,0.5)',
      borderRadius: '8px',
      padding: '0.6rem',
    }}>
      <div style={{ fontSize: '0.65rem', color: '#718096', marginBottom: '0.15rem' }}>
        {emoji} {label}
      </div>
      <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#F7FAFC', lineHeight: 1.2 }}>
        {name}
      </div>
      <div style={{ fontSize: '0.75rem', color: '#4FD1C5', fontWeight: 600 }}>
        {value}
      </div>
    </div>
  );
}
