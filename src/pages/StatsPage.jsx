import React, { useState, useEffect, useMemo } from 'react';
import usePlayersStore from '../store/playersStore';
import { subscribeToMatches } from '../firebase/firestore';
import { HISTORICAL_SEASONS } from '../data/historicalData';

const LEADERBOARD_TABS = [
  { key: 'goals',   label: '⚽ Gol' },
  { key: 'assists', label: '🎯 Assist' },
  { key: 'winrate', label: '🏆 Win %' },
  { key: 'matches', label: '🏟️ Presenze' },
  { key: 'gk',      label: '🧤 GK' },
  { key: 'classifica', label: '📋 Classifica' },
  { key: 'duo',     label: '👥 Duo' },
  { key: 'h2h',     label: '⚔️ H2H' },
];

const PERIODS = [
  { key: 'all',    label: 'All-time' },
  { key: 'season', label: 'Stagione' },
  { key: '30d',    label: '30gg' },
];

const AVATAR_COLORS = ['#4FD1C5', '#63B3ED', '#F6E05E', '#FC8181', '#68D391', '#B794F4', '#F6AD55'];

function Avatar({ name, size = 32 }) {
  const idx = name ? name.charCodeAt(0) % AVATAR_COLORS.length : 0;
  const color = AVATAR_COLORS[idx];
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: color + '22', border: `2px solid ${color}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0, fontWeight: 800, fontSize: size * 0.42, color,
    }}>
      {(name || '?')[0].toUpperCase()}
    </div>
  );
}

function MedalIcon({ rank }) {
  if (rank === 0) return <span style={{ fontSize: '1.1rem' }}>🥇</span>;
  if (rank === 1) return <span style={{ fontSize: '1.1rem' }}>🥈</span>;
  if (rank === 2) return <span style={{ fontSize: '1.1rem' }}>🥉</span>;
  return (
    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#718096', minWidth: '22px', textAlign: 'center' }}>
      {rank + 1}.
    </span>
  );
}

function FormDots({ results }) {
  const colors = { W: '#68D391', D: '#F6E05E', L: '#FC8181' };
  return (
    <div style={{ display: 'flex', gap: '3px', alignItems: 'center', marginTop: '3px' }}>
      {results.map((r, i) => (
        <div key={i} title={r === 'W' ? 'Vittoria' : r === 'D' ? 'Pareggio' : 'Sconfitta'} style={{
          width: 7, height: 7, borderRadius: '50%',
          background: colors[r],
          opacity: 0.4 + (i / Math.max(results.length - 1, 1)) * 0.6,
          flexShrink: 0,
        }} />
      ))}
      {results.length === 0 && (
        <span style={{ fontSize: '0.6rem', color: '#4A5568' }}>–</span>
      )}
    </div>
  );
}

function StreakBadge({ streak }) {
  if (!streak || streak.count < 2) return null;
  const color = streak.type === 'W' ? '#68D391' : streak.type === 'L' ? '#FC8181' : '#F6E05E';
  const label = streak.type === 'W' ? 'V' : streak.type === 'L' ? 'S' : 'P';
  return (
    <span style={{
      fontSize: '0.62rem', fontWeight: 700, color,
      border: `1px solid ${color}55`,
      borderRadius: '4px', padding: '1px 4px',
      background: color + '18',
      lineHeight: 1.2,
      flexShrink: 0,
    }}>
      {streak.count}{label}
    </span>
  );
}

function LeaderboardRow({ rank, player, primary, secondary, primaryLabel, accentColor, form }) {
  return (
    <div className="flex items-center gap-3"
      style={{ padding: '0.6rem 0', borderBottom: '1px solid rgba(74,85,104,0.4)' }}>
      <div style={{ minWidth: '28px', display: 'flex', justifyContent: 'center' }}>
        <MedalIcon rank={rank} />
      </div>
      <Avatar name={player.name} size={32} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <span style={{ fontWeight: 600, fontSize: '0.92rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {player.name}
          </span>
          {form && <StreakBadge streak={form.streak} />}
        </div>
        {secondary != null && (
          <div className="text-xs text-muted">{secondary}</div>
        )}
        {form && <FormDots results={form.lastFive} />}
      </div>
      <div style={{ fontWeight: 800, fontSize: '1.15rem', color: accentColor || '#4FD1C5' }}>
        {primary}
        {primaryLabel && <span style={{ fontSize: '0.7rem', color: '#718096', marginLeft: '2px' }}>{primaryLabel}</span>}
      </div>
    </div>
  );
}

const getMs = d => d?.toMillis ? d.toMillis() : d ? new Date(d).getTime() : 0;

// Returns the timestamp of September 1st of the current football season
function getSeasonStartMs() {
  const now = new Date();
  const year = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  return new Date(year, 8, 1).getTime();
}

// Map seasonId → { PLAYERNAME_UPPER → { presenze, assist } }
const SEASON_PLAYER_MAP = {};
for (const season of HISTORICAL_SEASONS) {
  SEASON_PLAYER_MAP[season.id] = {};
  for (const sp of season.players) {
    SEASON_PLAYER_MAP[season.id][sp.name.toUpperCase()] = {
      presenze: sp.presenze || 0,
      assist: sp.assist || 0,
    };
  }
}

// Returns season id (e.g. '2024-25') for a Firestore date value
function getSeasonId(dateVal) {
  const d = dateVal?.toMillis ? new Date(dateVal.toMillis()) : new Date(dateVal);
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  return month >= 8
    ? `${year}-${String(year + 1).slice(2)}`
    : `${year - 1}-${String(year).slice(2)}`;
}

function computeStatsFromMatches(players, matches) {
  return players.map(p => {
    const s = { goals: 0, assists: 0, wins: 0, draws: 0, losses: 0, matches: 0, gkMatches: 0, gkGoalsConceded: 0 };
    // historicalMatches per season → count of games played (for assist prorating)
    const histBySeason = {};

    for (const m of matches) {
      const inRed = (m.redTeam || []).some(pl => pl.id === p.id);
      const inBlue = (m.blueTeam || []).some(pl => pl.id === p.id);
      if (!inRed && !inBlue) continue;
      s.matches++;
      const my = inRed ? (m.redScore ?? 0) : (m.blueScore ?? 0);
      const their = inRed ? (m.blueScore ?? 0) : (m.redScore ?? 0);
      if (my > their) s.wins++;
      else if (my < their) s.losses++;
      else s.draws++;
      for (const ev of (m.events || [])) {
        if (ev.type === 'goal') {
          if (ev.scorerId === p.id) s.goals++;
          if (ev.assistId === p.id) s.assists++; // counted for real matches
        }
        if (ev.type === 'gk_turn' && ev.playerId === p.id) {
          s.gkMatches++;
          s.gkGoalsConceded += ev.goalsConceded || 0;
        }
      }
      // Track historical matches by season for assist prorating
      if (m.isHistorical) {
        const sid = getSeasonId(m.date);
        histBySeason[sid] = (histBySeason[sid] || 0) + 1;
      }
    }

    // Prorate historical assists: season_assists × (games_in_period / season_total_games)
    const histNames = (p.historicalNames || []).map(n => n.toUpperCase());
    for (const [sid, countInPeriod] of Object.entries(histBySeason)) {
      const seasonData = SEASON_PLAYER_MAP[sid];
      if (!seasonData) continue;
      let pData = null;
      for (const name of histNames) {
        if (seasonData[name]) { pData = seasonData[name]; break; }
      }
      if (!pData || !pData.presenze || !pData.assist) continue;
      s.assists += Math.round(pData.assist * (countInPeriod / pData.presenze));
    }

    return { ...p, totalGoals: s.goals, totalAssists: s.assists, totalMatches: s.matches, totalWins: s.wins, totalDraws: s.draws, gkMatches: s.gkMatches, gkGoalsConceded: s.gkGoalsConceded };
  });
}

export default function StatsPage() {
  const { players } = usePlayersStore();
  const [tab, setTab] = useState('goals');
  const [period, setPeriod] = useState('all');
  const [allMatches, setAllMatches] = useState([]);
  const [h2hP1, setH2hP1] = useState('');
  const [h2hP2, setH2hP2] = useState('');

  useEffect(() => {
    const unsub = subscribeToMatches(setAllMatches);
    return unsub;
  }, []);

  const finishedMatches = useMemo(() => allMatches.filter(m => m.status === 'finished'), [allMatches]);

  // withStats: computed from period-filtered matches or all-time aggregated
  const withStats = useMemo(() => {
    if (period === 'all') {
      return players.map(p => {
        const as = p.stats || {};
        return {
          ...p,
          totalGoals:   as.goals   || 0,
          totalAssists: as.assists || 0,
          totalMatches: as.matches || 0,
          totalWins:    as.wins    || 0,
          totalDraws:   as.draws   || 0,
          gkMatches:    as.gkMatches || 0,
          gkGoalsConceded: as.gkGoalsConceded || 0,
        };
      });
    }
    const cutoff = period === '30d'
      ? Date.now() - 30 * 24 * 60 * 60 * 1000
      : getSeasonStartMs();
    const filtered = finishedMatches.filter(m => getMs(m.date) >= cutoff);
    return computeStatsFromMatches(players, filtered);
  }, [period, players, finishedMatches]);

  // Classifica: computed from matches (GF/GS not in p.stats)
  const standingsStats = useMemo(() => {
    const cutoff = period === '30d'
      ? Date.now() - 30 * 24 * 60 * 60 * 1000
      : period === 'season' ? getSeasonStartMs() : 0;
    const filtered = cutoff === 0 ? finishedMatches : finishedMatches.filter(m => getMs(m.date) >= cutoff);
    return players
      .map(p => {
        let v = 0, x = 0, s = 0, gf = 0, gs = 0;
        for (const m of filtered) {
          const inRed = (m.redTeam || []).some(pl => pl.id === p.id);
          const inBlue = (m.blueTeam || []).some(pl => pl.id === p.id);
          if (!inRed && !inBlue) continue;
          const my = inRed ? (m.redScore ?? 0) : (m.blueScore ?? 0);
          const their = inRed ? (m.blueScore ?? 0) : (m.redScore ?? 0);
          gf += my; gs += their;
          if (my > their) v++;
          else if (my < their) s++;
          else x++;
        }
        return { ...p, pt: v * 3 + x, p: v + x + s, v, x, s, gf, gs, dr: gf - gs };
      })
      .filter(row => row.p > 0)
      .sort((a, b) => b.pt - a.pt || b.dr - a.dr || b.gf - a.gf);
  }, [players, finishedMatches, period]);

  // Duo stats – always all finished matches
  const duoStats = useMemo(() => {
    const pairs = {};
    for (const m of finishedMatches) {
      for (const [team, myScore, theirScore] of [
        [m.redTeam || [], m.redScore ?? 0, m.blueScore ?? 0],
        [m.blueTeam || [], m.blueScore ?? 0, m.redScore ?? 0],
      ]) {
        const result = myScore > theirScore ? 'wins' : myScore < theirScore ? 'losses' : 'draws';
        for (let i = 0; i < team.length; i++) {
          for (let j = i + 1; j < team.length; j++) {
            const [p1, p2] = team[i].id < team[j].id ? [team[i], team[j]] : [team[j], team[i]];
            const key = `${p1.id}|${p2.id}`;
            if (!pairs[key]) pairs[key] = { name1: p1.name, name2: p2.name, wins: 0, draws: 0, losses: 0, matches: 0, mutualAssists: 0 };
            pairs[key].matches++;
            pairs[key][result]++;
          }
        }
      }
      // Assist reciproci: A ha assistito B o viceversa nello stesso match
      // Fallback su assistName quando assistId non è salvato (eventi modificati manualmente)
      const nameToId = {};
      for (const pl of [...(m.redTeam || []), ...(m.blueTeam || [])]) {
        if (pl.name) nameToId[pl.name.toUpperCase()] = pl.id;
      }
      for (const ev of (m.events || [])) {
        if (ev.type !== 'goal' || !ev.scorerId) continue;
        const assistId = ev.assistId || (ev.assistName ? nameToId[ev.assistName.trim().toUpperCase()] : null);
        if (!assistId || ev.scorerId === assistId) continue;
        const [id1, id2] = [ev.scorerId, assistId].sort();
        const key = `${id1}|${id2}`;
        if (!pairs[key]) continue;
        const sameRed = (m.redTeam || []).some(p => p.id === id1) && (m.redTeam || []).some(p => p.id === id2);
        const sameBlue = (m.blueTeam || []).some(p => p.id === id1) && (m.blueTeam || []).some(p => p.id === id2);
        if (sameRed || sameBlue) pairs[key].mutualAssists++;
      }
    }
    return Object.values(pairs)
      .filter(p => p.matches >= 10)
      .sort((a, b) => {
        const ra = (a.wins + a.draws * 0.5) / a.matches;
        const rb = (b.wins + b.draws * 0.5) / b.matches;
        return rb - ra;
      })
      .slice(0, 10);
  }, [finishedMatches]);

  // Recent form (last 5 W/D/L) per player – always from most recent matches
  const playerForms = useMemo(() => {
    const forms = {};
    for (const p of players) {
      const pMatches = finishedMatches
        .filter(m => [...(m.redTeam || []), ...(m.blueTeam || [])].some(pl => pl.id === p.id))
        .sort((a, b) => getMs(b.date) - getMs(a.date))
        .slice(0, 5);
      const newestFirst = pMatches.map(m => {
        const inRed = (m.redTeam || []).some(pl => pl.id === p.id);
        const my = inRed ? (m.redScore ?? 0) : (m.blueScore ?? 0);
        const their = inRed ? (m.blueScore ?? 0) : (m.redScore ?? 0);
        return my > their ? 'W' : my < their ? 'L' : 'D';
      });
      let streak = null;
      if (newestFirst.length >= 2) {
        const type = newestFirst[0];
        let count = 0;
        for (const r of newestFirst) { if (r === type) count++; else break; }
        if (count >= 2) streak = { type, count };
      }
      forms[p.id] = { lastFive: [...newestFirst].reverse(), streak };
    }
    return forms;
  }, [players, finishedMatches]);

  // H2H stats
  const h2hStats = useMemo(() => {
    if (!h2hP1 || !h2hP2 || h2hP1 === h2hP2) return null;
    const p1name = players.find(p => p.id === h2hP1)?.name || '?';
    const p2name = players.find(p => p.id === h2hP2)?.name || '?';
    let together = { wins: 0, draws: 0, losses: 0, matches: 0 };
    let against  = { p1wins: 0, p2wins: 0, draws: 0, matches: 0 };
    let p1Goals = 0, p2Goals = 0;
    for (const m of finishedMatches) {
      const p1InRed  = (m.redTeam  || []).some(p => p.id === h2hP1);
      const p1InBlue = (m.blueTeam || []).some(p => p.id === h2hP1);
      const p2InRed  = (m.redTeam  || []).some(p => p.id === h2hP2);
      const p2InBlue = (m.blueTeam || []).some(p => p.id === h2hP2);
      if ((!p1InRed && !p1InBlue) || (!p2InRed && !p2InBlue)) continue;
      const sameTeam = (p1InRed && p2InRed) || (p1InBlue && p2InBlue);
      if (sameTeam) {
        together.matches++;
        const my    = p1InRed ? (m.redScore ?? 0) : (m.blueScore ?? 0);
        const their = p1InRed ? (m.blueScore ?? 0) : (m.redScore ?? 0);
        if (my > their) together.wins++;
        else if (my < their) together.losses++;
        else together.draws++;
      } else {
        against.matches++;
        const p1s = p1InRed ? (m.redScore ?? 0) : (m.blueScore ?? 0);
        const p2s = p2InRed ? (m.redScore ?? 0) : (m.blueScore ?? 0);
        if (p1s > p2s) against.p1wins++;
        else if (p1s < p2s) against.p2wins++;
        else against.draws++;
      }
      for (const ev of (m.events || [])) {
        if (ev.type === 'goal') {
          if (ev.scorerId === h2hP1) p1Goals++;
          if (ev.scorerId === h2hP2) p2Goals++;
        }
      }
    }
    return { p1name, p2name, together, against, p1Goals, p2Goals };
  }, [finishedMatches, h2hP1, h2hP2, players]);

  // Leaderboard helpers
  const getRanked = (arr, sortFn, filterFn) =>
    [...arr].filter(filterFn || (() => true)).sort(sortFn).slice(0, 10);

  const rankings = useMemo(() => ({
    goals: getRanked(withStats, (a, b) => b.totalGoals - a.totalGoals, p => p.totalGoals > 0),
    assists: getRanked(withStats, (a, b) => b.totalAssists - a.totalAssists, p => p.totalAssists > 0),
    winrate: getRanked(
      withStats,
      (a, b) => {
        const ra = a.totalMatches >= 3 ? (a.totalWins + a.totalDraws * 0.5) / a.totalMatches : -1;
        const rb = b.totalMatches >= 3 ? (b.totalWins + b.totalDraws * 0.5) / b.totalMatches : -1;
        return rb - ra;
      },
      p => p.totalMatches >= 3
    ),
    matches: getRanked(withStats, (a, b) => b.totalMatches - a.totalMatches, p => p.totalMatches > 0),
    gk: getRanked(
      withStats,
      (a, b) => {
        const ra = a.gkMatches >= 2 ? a.gkGoalsConceded / a.gkMatches : 999;
        const rb = b.gkMatches >= 2 ? b.gkGoalsConceded / b.gkMatches : 999;
        return ra - rb;
      },
      p => p.gkMatches >= 2
    ),
  }), [withStats]);

  const tabConfig = {
    goals:   { accent: '#4FD1C5', getVal: p => p.totalGoals, getLabel: () => 'gol', getSub: p => `${p.totalMatches} partite · ${(p.totalGoals / Math.max(1, p.totalMatches)).toFixed(2)} gol/match` },
    assists: { accent: '#63B3ED', getVal: p => p.totalAssists, getLabel: () => 'assist', getSub: p => `${p.totalMatches} partite` },
    winrate: { accent: '#F6E05E', getVal: p => `${Math.round((p.totalWins + p.totalDraws * 0.5) / p.totalMatches * 100)}`, getLabel: () => '%', getSub: p => `${p.totalWins}V · ${p.totalDraws}P · ${p.totalMatches - p.totalWins - p.totalDraws}S su ${p.totalMatches} partite` },
    matches: { accent: '#A0AEC0', getVal: p => p.totalMatches, getLabel: () => 'pt', getSub: p => `${p.totalWins}V · ${p.totalDraws}P · ${p.totalMatches - p.totalWins - p.totalDraws}S` },
    gk:      { accent: '#68D391', getVal: p => p.gkMatches > 0 ? (p.gkGoalsConceded / p.gkMatches).toFixed(1) : '-', getLabel: () => 'gol/match', getSub: p => `${p.gkGoalsConceded} gol subiti in ${p.gkMatches} turni da GK` },
  };

  const cfg = tabConfig[tab];
  const list = rankings[tab] || [];
  const isSpecialTab = tab === 'duo' || tab === 'h2h';
  const currentAccent = cfg?.accent || '#4FD1C5';

  return (
    <div className="page-content">
      <h2 style={{ paddingTop: '0.5rem', marginBottom: '1.25rem' }}>📊 Classifiche</h2>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1rem', overflowX: 'auto', paddingBottom: '0.25rem' }}>
        {LEADERBOARD_TABS.map(t => {
          const isActive = tab === t.key;
          const accent = t.key === 'duo' ? '#B794F4' : t.key === 'h2h' ? '#F6AD55' : t.key === 'classifica' ? '#F6E05E' : tabConfig[t.key]?.accent || '#4FD1C5';
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                padding: '0.4rem 0.75rem', borderRadius: '999px', border: 'none',
                cursor: 'pointer', whiteSpace: 'nowrap', fontSize: '0.82rem', fontWeight: 600,
                background: isActive ? accent : 'rgba(74,85,104,0.5)',
                color: isActive ? '#1A202C' : '#A0AEC0',
                transition: 'all 0.15s',
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Period filter – only for leaderboard tabs */}
      {!isSpecialTab && (
        <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '1.25rem' }}>
          {PERIODS.map(p => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              style={{
                padding: '0.25rem 0.65rem', borderRadius: '999px',
                cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600,
                background: period === p.key ? currentAccent + '33' : 'rgba(74,85,104,0.3)',
                color: period === p.key ? currentAccent : '#718096',
                border: `1px solid ${period === p.key ? currentAccent : 'transparent'}`,
                transition: 'all 0.15s',
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}

      {/* Leaderboard */}
      {!isSpecialTab && tab !== 'classifica' && (
        list.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#718096' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>📭</div>
            <p>Nessun dato sufficiente</p>
            {tab === 'winrate' && <p className="text-xs" style={{ marginTop: '0.5rem' }}>Minimo 3 partite richieste</p>}
            {tab === 'gk' && <p className="text-xs" style={{ marginTop: '0.5rem' }}>Minimo 2 turni da portiere richiesti</p>}
          </div>
        ) : (
          <div className="card">
            {list.map((p, i) => (
              <LeaderboardRow
                key={p.id}
                rank={i}
                player={p}
                primary={cfg.getVal(p)}
                primaryLabel={cfg.getLabel(p)}
                secondary={cfg.getSub(p)}
                accentColor={cfg.accent}
                form={playerForms[p.id]}
              />
            ))}
          </div>
        )
      )}

      {/* Classifica tab */}
      {tab === 'classifica' && (
        standingsStats.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#718096' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>📭</div>
            <p>Nessuna partita nel periodo selezionato</p>
          </div>
        ) : (
          <div className="card" style={{ padding: '0.5rem', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #4A5568', color: '#718096' }}>
                  <th style={{ textAlign: 'left', padding: '0.5rem 0.3rem', fontWeight: 600 }}>#</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem 0.3rem', fontWeight: 600 }}>Nome</th>
                  <th style={{ textAlign: 'center', padding: '0.5rem 0.25rem', fontWeight: 700, color: '#F6E05E' }}>Pt</th>
                  <th style={{ textAlign: 'center', padding: '0.5rem 0.25rem', fontWeight: 600 }}>P</th>
                  <th style={{ textAlign: 'center', padding: '0.5rem 0.25rem', fontWeight: 600, color: '#68D391' }}>V</th>
                  <th style={{ textAlign: 'center', padding: '0.5rem 0.25rem', fontWeight: 600, color: '#F6E05E' }}>X</th>
                  <th style={{ textAlign: 'center', padding: '0.5rem 0.25rem', fontWeight: 600, color: '#FC8181' }}>S</th>
                  <th style={{ textAlign: 'center', padding: '0.5rem 0.25rem', fontWeight: 600 }}>GF</th>
                  <th style={{ textAlign: 'center', padding: '0.5rem 0.25rem', fontWeight: 600 }}>GS</th>
                  <th style={{ textAlign: 'center', padding: '0.5rem 0.25rem', fontWeight: 600 }}>DR</th>
                </tr>
              </thead>
              <tbody>
                {standingsStats.map((row, i) => (
                  <tr key={row.id} style={{ borderBottom: '1px solid #2D3748' }}>
                    <td style={{ padding: '0.45rem 0.3rem', color: i < 3 ? '#F6E05E' : '#718096', fontWeight: i < 3 ? 700 : 400 }}>{i + 1}</td>
                    <td style={{ padding: '0.45rem 0.3rem', fontWeight: 600, maxWidth: '90px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.name}</td>
                    <td style={{ textAlign: 'center', padding: '0.45rem 0.25rem', fontWeight: 800, color: '#F6E05E', fontSize: '0.9rem' }}>{row.pt}</td>
                    <td style={{ textAlign: 'center', padding: '0.45rem 0.25rem', color: '#A0AEC0' }}>{row.p}</td>
                    <td style={{ textAlign: 'center', padding: '0.45rem 0.25rem', color: '#68D391' }}>{row.v}</td>
                    <td style={{ textAlign: 'center', padding: '0.45rem 0.25rem', color: '#F6E05E' }}>{row.x}</td>
                    <td style={{ textAlign: 'center', padding: '0.45rem 0.25rem', color: '#FC8181' }}>{row.s}</td>
                    <td style={{ textAlign: 'center', padding: '0.45rem 0.25rem' }}>{row.gf}</td>
                    <td style={{ textAlign: 'center', padding: '0.45rem 0.25rem', color: '#718096' }}>{row.gs}</td>
                    <td style={{ textAlign: 'center', padding: '0.45rem 0.25rem', fontWeight: 600, color: row.dr > 0 ? '#68D391' : row.dr < 0 ? '#FC8181' : '#A0AEC0' }}>
                      {row.dr > 0 ? '+' : ''}{row.dr}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-muted mt-2" style={{ textAlign: 'center' }}>
              3 pt per vittoria · 1 pt per pareggio · Ordine: Pt, DR, GF
            </p>
          </div>
        )
      )}

      {/* Duo stats tab */}
      {tab === 'duo' && (
        <div>
          {duoStats.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#718096' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>👥</div>
              <p>Nessuna coppia con 10+ partite insieme</p>
            </div>
          ) : (
            <div className="card">
              <p className="text-xs text-muted mb-3">Coppie con più vittorie insieme (min 10 partite)</p>
              {duoStats.map((duo, i) => {
                const wr = Math.round((duo.wins + duo.draws * 0.5) / duo.matches * 100);
                return (
                  <div key={i} className="flex items-center gap-3"
                    style={{ padding: '0.6rem 0', borderBottom: '1px solid rgba(74,85,104,0.4)' }}>
                    <div style={{ minWidth: '28px', display: 'flex', justifyContent: 'center' }}>
                      <MedalIcon rank={i} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.88rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {duo.name1} & {duo.name2}
                      </div>
                      <div className="text-xs text-muted">
                        {duo.wins}V · {duo.draws}P · {duo.losses}S su {duo.matches} partite
                      </div>
                      {duo.mutualAssists > 0 && (
                        <div className="text-xs" style={{ color: '#63B3ED' }}>🎯 {duo.mutualAssists} assist reciproci</div>
                      )}
                    </div>
                    <div style={{ fontWeight: 800, fontSize: '1.15rem', color: '#B794F4' }}>
                      {wr}<span style={{ fontSize: '0.7rem', color: '#718096', marginLeft: '2px' }}>%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* H2H tab */}
      {tab === 'h2h' && (
        <div>
          <div className="card mb-4">
            <h3 className="mb-3" style={{ fontSize: '0.95rem' }}>Seleziona 2 giocatori da confrontare</h3>
            <div className="grid-2" style={{ gap: '0.75rem' }}>
              <select className="input" value={h2hP1} onChange={e => setH2hP1(e.target.value)}>
                <option value="">Giocatore 1</option>
                {players.map(p => (
                  <option key={p.id} value={p.id} disabled={p.id === h2hP2}>{p.name}</option>
                ))}
              </select>
              <select className="input" value={h2hP2} onChange={e => setH2hP2(e.target.value)}>
                <option value="">Giocatore 2</option>
                {players.map(p => (
                  <option key={p.id} value={p.id} disabled={p.id === h2hP1}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>

          {h2hStats && (
            <div>
              {/* Insieme */}
              <div className="card mb-3" style={{ border: '1px solid rgba(247,173,85,0.3)' }}>
                <h3 className="mb-3" style={{ fontSize: '0.9rem', color: '#F6AD55' }}>🤝 Quando giocano insieme</h3>
                {h2hStats.together.matches === 0 ? (
                  <p className="text-xs text-muted">Nessuna partita disputata insieme</p>
                ) : (
                  <>
                    <div className="flex gap-3 mb-2" style={{ justifyContent: 'center' }}>
                      {[
                        { label: 'Vittorie', value: h2hStats.together.wins, color: '#68D391' },
                        { label: 'Pareggi', value: h2hStats.together.draws, color: '#F6E05E' },
                        { label: 'Sconfitte', value: h2hStats.together.losses, color: '#FC8181' },
                      ].map(s => (
                        <div key={s.label} style={{ textAlign: 'center', flex: 1 }}>
                          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: s.color }}>{s.value}</div>
                          <div style={{ fontSize: '0.68rem', color: '#718096' }}>{s.label}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ textAlign: 'center', fontSize: '0.8rem', color: '#A0AEC0' }}>
                      Win rate: <strong style={{ color: '#F6AD55' }}>
                        {Math.round((h2hStats.together.wins + h2hStats.together.draws * 0.5) / h2hStats.together.matches * 100)}%
                      </strong> su {h2hStats.together.matches} partite
                    </div>
                  </>
                )}
              </div>

              {/* Avversari */}
              <div className="card mb-3" style={{ border: '1px solid rgba(252,129,129,0.3)' }}>
                <h3 className="mb-3" style={{ fontSize: '0.9rem', color: '#FC8181' }}>⚔️ Quando si affrontano</h3>
                {h2hStats.against.matches === 0 ? (
                  <p className="text-xs text-muted">Non si sono mai affrontati</p>
                ) : (
                  <>
                    <div className="flex items-center gap-2 mb-2">
                      <div style={{ flex: 1, textAlign: 'center' }}>
                        <div style={{ fontWeight: 700, color: '#4FD1C5', fontSize: '0.9rem' }}>{h2hStats.p1name}</div>
                        <div style={{ fontSize: '2rem', fontWeight: 900, color: '#68D391' }}>{h2hStats.against.p1wins}</div>
                        <div style={{ fontSize: '0.68rem', color: '#718096' }}>vittorie</div>
                      </div>
                      <div style={{ textAlign: 'center', minWidth: 40 }}>
                        <div style={{ fontSize: '1.1rem', color: '#F6E05E', fontWeight: 700 }}>{h2hStats.against.draws}</div>
                        <div style={{ fontSize: '0.62rem', color: '#718096' }}>pareggi</div>
                      </div>
                      <div style={{ flex: 1, textAlign: 'center' }}>
                        <div style={{ fontWeight: 700, color: '#63B3ED', fontSize: '0.9rem' }}>{h2hStats.p2name}</div>
                        <div style={{ fontSize: '2rem', fontWeight: 900, color: '#68D391' }}>{h2hStats.against.p2wins}</div>
                        <div style={{ fontSize: '0.68rem', color: '#718096' }}>vittorie</div>
                      </div>
                    </div>
                    <div style={{ textAlign: 'center', fontSize: '0.75rem', color: '#718096' }}>
                      su {h2hStats.against.matches} partite disputate
                    </div>
                  </>
                )}
              </div>

              {/* Gol */}
              <div className="card">
                <h3 className="mb-3" style={{ fontSize: '0.9rem' }}>⚽ Gol segnati (in tutte le partite insieme)</h3>
                <div className="flex items-center gap-2">
                  <div style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.25rem' }}>{h2hStats.p1name}</div>
                    <div style={{ fontSize: '2.2rem', fontWeight: 900, color: '#4FD1C5' }}>{h2hStats.p1Goals}</div>
                  </div>
                  <div style={{ color: '#718096', fontSize: '1.2rem' }}>vs</div>
                  <div style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.25rem' }}>{h2hStats.p2name}</div>
                    <div style={{ fontSize: '2.2rem', fontWeight: 900, color: '#63B3ED' }}>{h2hStats.p2Goals}</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {!h2hP1 || !h2hP2 ? (
            <div style={{ textAlign: 'center', padding: '2rem 1rem', color: '#718096' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⚔️</div>
              <p className="text-sm">Seleziona due giocatori per vedere il confronto</p>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
