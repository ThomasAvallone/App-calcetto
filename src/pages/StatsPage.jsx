import React, { useState, useEffect, useMemo } from 'react';
import usePlayersStore from '../store/playersStore';
import { useMatchesSubscription } from '../hooks/useMatchesSubscription';
import { HISTORICAL_SEASONS } from '../data/historicalData';
import { getMs } from '../utils/dateUtils';
import { RESULT_COLORS, CLR_WIN, CLR_DRAW, CLR_LOSS, AVATAR_COLORS } from '../constants/colors';
import { generateRivalryNarrative } from '../services/geminiService';
import { getAICache, setAICache } from '../firebase/firestore';
import toast from 'react-hot-toast';
import ReportAITab from '../components/stats/ReportAITab';
import HallTab from '../components/stats/HallTab';

const LEADERBOARD_TABS = [
  { key: 'goals',   label: '⚽ Gol' },
  { key: 'assists', label: '🎯 Assist' },
  { key: 'winrate', label: '🏆 Win %' },
  { key: 'matches', label: '🏟️ Presenze' },
  { key: 'gk',      label: '🧤 GK' },
  { key: 'autogoals', label: '🤦 Autogol' },
  { key: 'classifica', label: '📋 Classifica' },
  { key: 'duo',     label: '👥 Duo' },
  { key: 'h2h',     label: '⚔️ H2H' },
  { key: 'squadre', label: '🆚 Squadre' },
  { key: 'report',  label: '📝 Report AI' },
  { key: 'hall',    label: '🏛️ Hall' },
];

const PERIODS = [
  { key: 'all',    label: 'All-time' },
  { key: 'season', label: 'Stagione' },
  { key: '30d',    label: '30gg' },
];


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
  const colors = RESULT_COLORS;
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
  const color = streak.type === 'W' ? CLR_WIN : streak.type === 'L' ? CLR_LOSS : CLR_DRAW;
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
    const s = { goals: 0, assists: 0, autogoals: 0, wins: 0, draws: 0, losses: 0, matches: 0, gkMatches: 0, gkGoalsConceded: 0, cleanSheets: 0 };
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
      if (!m.isHistorical) s.gkMatches += 2; // 2 turni in porta per partita (rotazione)
      let gkConcededThisMatch = 0;
      for (const ev of (m.events || [])) {
        if (ev.type === 'goal') {
          if (ev.scorerId === p.id) s.goals++;
          if (ev.assistId === p.id) s.assists++;
        }
        if (ev.gkConcededId === p.id) { s.gkGoalsConceded++; gkConcededThisMatch++; }
        if (ev.type === 'autogoal' && ev.scorerId === p.id) s.autogoals++;
      }
      // Clean sheet individuale: portiere non ha subito gol personalmente
      if (!m.isHistorical && gkConcededThisMatch === 0) s.cleanSheets++;
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

    return { ...p, totalGoals: s.goals, totalAssists: s.assists, totalAutogoals: s.autogoals, totalMatches: s.matches, totalWins: s.wins, totalDraws: s.draws, gkMatches: s.gkMatches, gkGoalsConceded: s.gkGoalsConceded, cleanSheets: s.cleanSheets };
  });
}

function H2HChronology({ h2hStats }) {
  const [showChronology, setShowChronology] = React.useState(false);
  const fmtDate = d => {
    const dt = d?.toDate ? d.toDate() : d ? new Date(d) : null;
    if (!dt) return '–';
    return dt.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: '2-digit' });
  };
  if (!h2hStats || h2hStats.againstMatchList.length === 0) return null;
  return (
    <div className="card mb-3" style={{ border: '1px solid rgba(74,85,104,0.6)' }}>
      <button
        onClick={() => setShowChronology(v => !v)}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
      >
        <h3 style={{ fontSize: '0.9rem', margin: 0 }}>📅 Cronologia scontri diretti</h3>
        <span style={{ fontSize: '0.75rem', color: '#718096' }}>
          {h2hStats.againstMatchList.length} partite {showChronology ? '▲' : '▼'}
        </span>
      </button>
      {showChronology && (
        <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {h2hStats.againstMatchList.map((m, i) => {
            const outcomeColor = m.outcome === 'p1win' ? '#4FD1C5' : m.outcome === 'p2win' ? '#63B3ED' : '#F6E05E';
            const outcomeLabel = m.outcome === 'p1win' ? `${h2hStats.p1name} vince` : m.outcome === 'p2win' ? `${h2hStats.p2name} vince` : 'Pareggio';
            const p1Side = m.p1InRed ? '🔴' : '🔵';
            const p2Side = m.p1InRed ? '🔵' : '🔴';
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.4rem 0.5rem', borderRadius: '7px', background: 'rgba(74,85,104,0.18)' }}>
                <span style={{ fontSize: '0.72rem', color: '#718096', flexShrink: 0, minWidth: '64px' }}>{fmtDate(m.date)}</span>
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#E2E8F0', flex: 1 }}>
                  <span style={{ color: '#FC8181' }}>🔴 {m.redScore}</span>
                  <span style={{ color: '#718096', margin: '0 0.2rem' }}>–</span>
                  <span style={{ color: '#63B3ED' }}>{m.blueScore} 🔵</span>
                </span>
                <span style={{ fontSize: '0.7rem', color: outcomeColor, fontWeight: 600, flexShrink: 0 }}>{outcomeLabel}</span>
                {(m.p1Goals > 0 || m.p2Goals > 0) && (
                  <span style={{ fontSize: '0.68rem', color: '#718096', flexShrink: 0 }}>
                    {p1Side}{m.p1Goals}g · {p2Side}{m.p2Goals}g
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function StatsPage() {
  const { players } = usePlayersStore();
  const [tab, setTab] = useState('goals');
  const [period, setPeriod] = useState('all');
  const allMatches = useMatchesSubscription();
  const [h2hP1, setH2hP1] = useState('');
  const [h2hP2, setH2hP2] = useState('');
  const [squadreA, setSquadreA] = useState([]);
  const [squadreB, setSquadreB] = useState([]);
  const [rivalryText, setRivalryText] = useState('');
  const [rivalryLoading, setRivalryLoading] = useState(false);
  const [rivalryStale, setRivalryStale] = useState(false);
  const [reportText, setReportText] = useState('');
  const [reportLoading, setReportLoading] = useState(false);
  const [reportPeriod, setReportPeriod] = useState('30d');
  const [hallText, setHallText] = useState('');
  const [hallLoading, setHallLoading] = useState(false);

  const finishedMatches = useMemo(() => allMatches.filter(m => m.status === 'finished'), [allMatches]);

  // ID dell'ultima partita conclusa — usato per rilevare staleness delle cache AI
  const lastMatchId = finishedMatches[0]?.id ?? null;

  // Carica cache rivalità H2H quando cambiano i giocatori selezionati
  useEffect(() => {
    if (!h2hP1 || !h2hP2) { setRivalryText(''); setRivalryStale(false); return; }
    let cancelled = false;
    const key = `rivalry_${[h2hP1, h2hP2].sort().join('_')}`;
    getAICache(key).then(data => {
      if (cancelled) return;
      if (data?.text) {
        setRivalryText(data.text);
        setRivalryStale(!!lastMatchId && data.lastMatchId !== lastMatchId);
      } else {
        setRivalryText('');
        setRivalryStale(false);
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [h2hP1, h2hP2]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pre-filter matches per period (stable refs unless finishedMatches change)
  const seasonFilteredMatches = useMemo(() => {
    const cutoff = getSeasonStartMs();
    return finishedMatches.filter(m => getMs(m.date) >= cutoff);
  }, [finishedMatches]);

  const thirtyDayFilteredMatches = useMemo(() => {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    return finishedMatches.filter(m => getMs(m.date) >= cutoff);
  }, [finishedMatches]);

  // Pre-compute stats per period (avoids recomputing on period tab switch)
  // All three periods use the same live computation from matches — no stale p.stats.
  const allTimeComputedStats = useMemo(() => computeStatsFromMatches(players, finishedMatches), [players, finishedMatches]);
  const seasonComputedStats = useMemo(() => computeStatsFromMatches(players, seasonFilteredMatches), [players, seasonFilteredMatches]);
  const thirtyDayComputedStats = useMemo(() => computeStatsFromMatches(players, thirtyDayFilteredMatches), [players, thirtyDayFilteredMatches]);

  // withStats: selects pre-computed data based on current period
  const withStats = useMemo(() => {
    if (period === 'all') return allTimeComputedStats;
    return period === '30d' ? thirtyDayComputedStats : seasonComputedStats;
  }, [period, allTimeComputedStats, seasonComputedStats, thirtyDayComputedStats]);

  // Classifica: computed from matches (GF/GS not in p.stats)
  // For all-time: excludes isHistorical match docs (those come from p.historicalStats)
  // to be consistent with p.stats.* which uses recalculatePlayerStats logic.
  const standingsStats = useMemo(() => {
    const cutoff = period === '30d'
      ? Date.now() - 30 * 24 * 60 * 60 * 1000
      : period === 'season' ? getSeasonStartMs() : 0;
    // Always exclude historical match docs: for all-time we add p.historicalStats instead
    // (same approach as recalculatePlayerStats → ensures P == p.stats.matches).
    // For season/30d historical docs fall outside the date cutoff anyway.
    const appMatches = finishedMatches.filter(m => !m.isHistorical);
    const filtered = cutoff === 0 ? appMatches : appMatches.filter(m => getMs(m.date) >= cutoff);
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
        // For all-time, add historical stats so that P = p.stats.matches
        if (period === 'all' && p.historicalStats) {
          v += p.historicalStats.wins   || 0;
          x += p.historicalStats.draws  || 0;
          s += p.historicalStats.losses || 0;
          // GF/GS not available in historicalStats – remain app-only (acceptable)
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
            if (!pairs[key]) pairs[key] = { name1: p1.name, name2: p2.name, wins: 0, draws: 0, losses: 0, matches: 0 };
            pairs[key].matches++;
            pairs[key][result]++;
          }
        }
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
    let together = { wins: 0, draws: 0, losses: 0, matches: 0, mutualAssists: 0 };
    let against  = { p1wins: 0, p2wins: 0, draws: 0, matches: 0 };
    let p1Goals = 0, p2Goals = 0;
    const againstMatchList = []; // cronologia scontri diretti
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
        // Gol dei due in questa partita
        let p1g = 0, p2g = 0;
        for (const ev of (m.events || [])) {
          if (ev.type === 'goal') {
            if (ev.scorerId === h2hP1) p1g++;
            if (ev.scorerId === h2hP2) p2g++;
          }
        }
        againstMatchList.push({
          date: m.date,
          redScore: m.redScore ?? 0,
          blueScore: m.blueScore ?? 0,
          p1InRed,
          p1Goals: p1g,
          p2Goals: p2g,
          outcome: p1s > p2s ? 'p1win' : p1s < p2s ? 'p2win' : 'draw',
        });
      }
      // Assist reciproci (solo quando insieme): p1 assiste p2 o viceversa
      if (sameTeam) {
        const nameToId = {};
        for (const pl of [...(m.redTeam || []), ...(m.blueTeam || [])]) {
          if (pl.name) nameToId[pl.name.toUpperCase()] = pl.id;
        }
        for (const ev of (m.events || [])) {
          if (ev.type !== 'goal' || !ev.scorerId) continue;
          const assistId = ev.assistId || (ev.assistName ? nameToId[ev.assistName.trim().toUpperCase()] : null);
          if (!assistId) continue;
          const pair = new Set([ev.scorerId, assistId]);
          if (pair.has(h2hP1) && pair.has(h2hP2)) together.mutualAssists++;
        }
      }
      for (const ev of (m.events || [])) {
        if (ev.type === 'goal') {
          if (ev.scorerId === h2hP1) p1Goals++;
          if (ev.scorerId === h2hP2) p2Goals++;
        }
      }
    }
    // Ordina cronologia dal più recente
    againstMatchList.sort((a, b) => getMs(b.date) - getMs(a.date));
    return { p1name, p2name, together, against, p1Goals, p2Goals, againstMatchList };
  }, [finishedMatches, h2hP1, h2hP2, players]);

  // Squadre: team vs team historical comparison
  const squadreStats = useMemo(() => {
    if (squadreA.length === 0 || squadreB.length === 0) return null;
    const setA = new Set(squadreA);
    const setB = new Set(squadreB);
    const matchResults = [];
    let aWins = 0, bWins = 0, draws = 0;
    for (const m of finishedMatches) {
      const redIds = (m.redTeam || []).map(p => p.id);
      const blueIds = (m.blueTeam || []).map(p => p.id);
      const aInRed  = redIds.filter(id => setA.has(id)).length;
      const aInBlue = blueIds.filter(id => setA.has(id)).length;
      const bInRed  = redIds.filter(id => setB.has(id)).length;
      const bInBlue = blueIds.filter(id => setB.has(id)).length;
      // A and B must be on opposite sides, each with at least 1 player overlap
      const aRedBBlue  = aInRed  >= 1 && bInBlue >= 1;
      const aBlueBRed  = aInBlue >= 1 && bInRed  >= 1;
      if (!aRedBBlue && !aBlueBRed) continue;
      const aScore = aRedBBlue ? (m.redScore ?? 0) : (m.blueScore ?? 0);
      const bScore = aRedBBlue ? (m.blueScore ?? 0) : (m.redScore ?? 0);
      if (aScore > bScore) aWins++;
      else if (aScore < bScore) bWins++;
      else draws++;
      const dateVal = m.date;
      const dateStr = dateVal?.toMillis
        ? new Date(dateVal.toMillis()).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit' })
        : new Date(dateVal).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit' });
      matchResults.push({ aScore, bScore, date: dateStr, id: m.id });
    }
    matchResults.sort((a, b) => b.date.localeCompare(a.date));
    return { aWins, bWins, draws, total: aWins + bWins + draws, matches: matchResults.slice(0, 20) };
  }, [finishedMatches, squadreA, squadreB]);

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
      (a, b) => b.gkGoalsConceded - a.gkGoalsConceded,
      p => p.gkGoalsConceded > 0
    ),
    autogoals: getRanked(
      withStats,
      (a, b) => b.totalAutogoals - a.totalAutogoals,
      p => p.totalAutogoals > 0
    ),
  }), [withStats]);

  const tabConfig = {
    goals:   { accent: '#4FD1C5', getVal: p => p.totalGoals, getLabel: () => 'gol', getSub: p => `${p.totalMatches} partite · ${(p.totalGoals / Math.max(1, p.totalMatches)).toFixed(2)} gol/match` },
    assists: { accent: '#63B3ED', getVal: p => p.totalAssists, getLabel: () => 'assist', getSub: p => `${p.totalMatches} partite` },
    winrate: { accent: CLR_DRAW, getVal: p => `${Math.round((p.totalWins + p.totalDraws * 0.5) / p.totalMatches * 100)}`, getLabel: () => '%', getSub: p => `${p.totalWins}V · ${p.totalDraws}P · ${p.totalMatches - p.totalWins - p.totalDraws}S su ${p.totalMatches} partite` },
    matches: { accent: '#A0AEC0', getVal: p => p.totalMatches, getLabel: () => 'pt', getSub: p => `${p.totalWins}V · ${p.totalDraws}P · ${p.totalMatches - p.totalWins - p.totalDraws}S` },
    gk:        { accent: CLR_WIN, getVal: p => p.gkGoalsConceded, getLabel: () => 'gs', getSub: p => p.gkMatches > 0 ? `${p.gkMatches} turni · ${(p.gkGoalsConceded / p.gkMatches).toFixed(2)} gs/turno · 🧹 ${p.cleanSheets ?? 0} clean sheet` : `${p.gkGoalsConceded} gol subiti` },
    autogoals: { accent: CLR_LOSS, getVal: p => p.totalAutogoals, getLabel: () => 'ag', getSub: p => `${p.totalMatches} partite · ${(p.totalAutogoals / Math.max(1, p.totalMatches) * 100).toFixed(1)}% delle partite` },
  };

  const cfg = tabConfig[tab];
  const list = rankings[tab] || [];
  const isSpecialTab = tab === 'duo' || tab === 'h2h' || tab === 'squadre' || tab === 'report' || tab === 'hall';
  const currentAccent = cfg?.accent || '#4FD1C5';

  return (
    <div className="page-content">
      <h2 className="stagger-1" style={{ paddingTop: '0.5rem', marginBottom: '1.25rem' }}>📊 Classifiche</h2>

      {/* Tab bar */}
      <div className="stagger-2" style={{ display: 'flex', gap: '0.4rem', marginBottom: '1rem', overflowX: 'auto', paddingBottom: '0.25rem' }}>
        {LEADERBOARD_TABS.map(t => {
          const isActive = tab === t.key;
          const accent = t.key === 'duo' ? '#B794F4' : t.key === 'h2h' ? '#F6AD55' : t.key === 'classifica' ? '#F6E05E' : t.key === 'squadre' ? '#FC8181' : t.key === 'report' ? '#68D391' : t.key === 'hall' ? '#FBD38D' : tabConfig[t.key]?.accent || '#4FD1C5';
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
        <div className="stagger-3" style={{ display: 'flex', gap: '0.35rem', marginBottom: '1.25rem' }}>
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
      <div className="stagger-4">
      {!isSpecialTab && tab !== 'classifica' && (
        list.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#718096' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>📭</div>
            <p>Nessun dato sufficiente</p>
            {tab === 'winrate' && <p className="text-xs" style={{ marginTop: '0.5rem' }}>Minimo 3 partite richieste</p>}
            {tab === 'gk' && <p className="text-xs" style={{ marginTop: '0.5rem' }}>Nessun gol subito registrato come portiere</p>}
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
                  <th style={{ textAlign: 'center', padding: '0.5rem 0.25rem', fontWeight: 700, color: CLR_DRAW }}>Pt</th>
                  <th style={{ textAlign: 'center', padding: '0.5rem 0.25rem', fontWeight: 600 }}>P</th>
                  <th style={{ textAlign: 'center', padding: '0.5rem 0.25rem', fontWeight: 600, color: CLR_WIN }}>V</th>
                  <th style={{ textAlign: 'center', padding: '0.5rem 0.25rem', fontWeight: 600, color: CLR_DRAW }}>X</th>
                  <th style={{ textAlign: 'center', padding: '0.5rem 0.25rem', fontWeight: 600, color: CLR_LOSS }}>S</th>
                  <th style={{ textAlign: 'center', padding: '0.5rem 0.25rem', fontWeight: 600 }}>GF</th>
                  <th style={{ textAlign: 'center', padding: '0.5rem 0.25rem', fontWeight: 600 }}>GS</th>
                  <th style={{ textAlign: 'center', padding: '0.5rem 0.25rem', fontWeight: 600 }}>DR</th>
                </tr>
              </thead>
              <tbody>
                {standingsStats.map((row, i) => (
                  <tr key={row.id} style={{ borderBottom: '1px solid #2D3748' }}>
                    <td style={{ padding: '0.45rem 0.3rem', color: i < 3 ? CLR_DRAW : '#718096', fontWeight: i < 3 ? 700 : 400 }}>{i + 1}</td>
                    <td style={{ padding: '0.45rem 0.3rem', fontWeight: 600, maxWidth: '90px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.name}</td>
                    <td style={{ textAlign: 'center', padding: '0.45rem 0.25rem', fontWeight: 800, color: CLR_DRAW, fontSize: '0.9rem' }}>{row.pt}</td>
                    <td style={{ textAlign: 'center', padding: '0.45rem 0.25rem', color: '#A0AEC0' }}>{row.p}</td>
                    <td style={{ textAlign: 'center', padding: '0.45rem 0.25rem', color: CLR_WIN }}>{row.v}</td>
                    <td style={{ textAlign: 'center', padding: '0.45rem 0.25rem', color: CLR_DRAW }}>{row.x}</td>
                    <td style={{ textAlign: 'center', padding: '0.45rem 0.25rem', color: CLR_LOSS }}>{row.s}</td>
                    <td style={{ textAlign: 'center', padding: '0.45rem 0.25rem' }}>{row.gf}</td>
                    <td style={{ textAlign: 'center', padding: '0.45rem 0.25rem', color: '#718096' }}>{row.gs}</td>
                    <td style={{ textAlign: 'center', padding: '0.45rem 0.25rem', fontWeight: 600, color: row.dr > 0 ? CLR_WIN : row.dr < 0 ? CLR_LOSS : '#A0AEC0' }}>
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
              <select className="input" value={h2hP1} onChange={e => { setH2hP1(e.target.value); setRivalryText(''); }}>
                <option value="">Giocatore 1</option>
                {players.map(p => (
                  <option key={p.id} value={p.id} disabled={p.id === h2hP2}>{p.name}</option>
                ))}
              </select>
              <select className="input" value={h2hP2} onChange={e => { setH2hP2(e.target.value); setRivalryText(''); }}>
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
                        { label: 'Vittorie', value: h2hStats.together.wins, color: CLR_WIN },
                        { label: 'Pareggi', value: h2hStats.together.draws, color: CLR_DRAW },
                        { label: 'Sconfitte', value: h2hStats.together.losses, color: CLR_LOSS },
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
                    {h2hStats.together.mutualAssists > 0 && (
                      <div style={{ textAlign: 'center', fontSize: '0.8rem', color: '#63B3ED', marginTop: '0.5rem' }}>
                        🎯 {h2hStats.together.mutualAssists} assist reciproci
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Avversari */}
              <div className="card mb-3" style={{ border: '1px solid rgba(252,129,129,0.3)' }}>
                <h3 className="mb-3" style={{ fontSize: '0.9rem', color: CLR_LOSS }}>⚔️ Quando si affrontano</h3>
                {h2hStats.against.matches === 0 ? (
                  <p className="text-xs text-muted">Non si sono mai affrontati</p>
                ) : (
                  <>
                    <div className="flex items-center gap-2 mb-2">
                      <div style={{ flex: 1, textAlign: 'center' }}>
                        <div style={{ fontWeight: 700, color: '#4FD1C5', fontSize: '0.9rem' }}>{h2hStats.p1name}</div>
                        <div style={{ fontSize: '2rem', fontWeight: 900, color: CLR_WIN }}>{h2hStats.against.p1wins}</div>
                        <div style={{ fontSize: '0.68rem', color: '#718096' }}>vittorie</div>
                      </div>
                      <div style={{ textAlign: 'center', minWidth: 40 }}>
                        <div style={{ fontSize: '1.1rem', color: CLR_DRAW, fontWeight: 700 }}>{h2hStats.against.draws}</div>
                        <div style={{ fontSize: '0.62rem', color: '#718096' }}>pareggi</div>
                      </div>
                      <div style={{ flex: 1, textAlign: 'center' }}>
                        <div style={{ fontWeight: 700, color: '#63B3ED', fontSize: '0.9rem' }}>{h2hStats.p2name}</div>
                        <div style={{ fontSize: '2rem', fontWeight: 900, color: CLR_WIN }}>{h2hStats.against.p2wins}</div>
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

          {/* Cronologia scontri diretti */}
          <H2HChronology h2hStats={h2hStats} />

          {h2hStats && (() => {
            const handleRivalryGenerate = async () => {
              setRivalryLoading(true);
              try {
                const text = await generateRivalryNarrative(h2hStats.p1name, h2hStats.p2name, { together: h2hStats.together, against: h2hStats.against, p1Goals: h2hStats.p1Goals, p2Goals: h2hStats.p2Goals });
                setRivalryText(text);
                setRivalryStale(false);
                const key = `rivalry_${[h2hP1, h2hP2].sort().join('_')}`;
                setAICache(key, { text, lastMatchId, generatedAt: new Date().toISOString() });
              } catch (e) { toast.error('Rivalità AI: ' + e.message); }
              finally { setRivalryLoading(false); }
            };
            return (
            <div className="mt-3">
              {!rivalryText ? (
                <div className="card" style={{ textAlign: 'center', border: '1px dashed rgba(246,173,85,0.35)', background: 'rgba(246,173,85,0.03)' }}>
                  <button
                    onClick={handleRivalryGenerate}
                    disabled={rivalryLoading}
                    style={{ background: 'none', border: 'none', cursor: rivalryLoading ? 'default' : 'pointer', color: '#F6AD55', fontSize: '0.88rem', padding: '0.6rem 0', width: '100%' }}
                  >
                    {rivalryLoading ? '⏳ Generando la storia...' : '⚔️ AI Racconta la Rivalità'}
                  </button>
                </div>
              ) : (
                <div className="card" style={{ border: `1px solid ${rivalryStale ? 'rgba(246,173,85,0.6)' : 'rgba(246,173,85,0.4)'}`, background: 'rgba(246,173,85,0.04)' }}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#F6AD55' }}>⚔️ La loro storia</span>
                      {rivalryStale && (
                        <span style={{ fontSize: '0.68rem', color: '#F6AD55', background: 'rgba(246,173,85,0.15)', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
                          ⚠️ Nuova partita
                        </span>
                      )}
                    </div>
                    <button
                      onClick={handleRivalryGenerate}
                      disabled={rivalryLoading}
                      style={{ fontSize: '0.7rem', color: '#718096', background: 'none', border: 'none', cursor: rivalryLoading ? 'default' : 'pointer' }}>
                      {rivalryLoading ? '⏳' : '↺ Rigenera'}
                    </button>
                  </div>
                  <div style={{ maxHeight: '16rem', overflowY: 'auto', paddingRight: '0.25rem' }}>
                    <p style={{ fontSize: '0.83rem', color: '#CBD5E0', lineHeight: 1.75, margin: 0, whiteSpace: 'pre-wrap' }}>{rivalryText}</p>
                  </div>
                </div>
              )}
            </div>
            );
          })()}

          {!h2hP1 || !h2hP2 ? (
            <div style={{ textAlign: 'center', padding: '2rem 1rem', color: '#718096' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⚔️</div>
              <p className="text-sm">Seleziona due giocatori per vedere il confronto</p>
            </div>
          ) : null}
        </div>
      )}

      {/* Report AI tab */}
      {tab === 'report' && (
        <ReportAITab
          finishedMatches={finishedMatches}
          players={players}
          reportText={reportText}
          setReportText={setReportText}
          reportLoading={reportLoading}
          setReportLoading={setReportLoading}
          reportPeriod={reportPeriod}
          setReportPeriod={setReportPeriod}
          lastMatchId={lastMatchId}
        />
      )}

      {/* Hall of Fame/Shame tab */}
      {tab === 'hall' && (
        <HallTab
          finishedMatches={finishedMatches}
          players={players}
          hallText={hallText}
          setHallText={setHallText}
          hallLoading={hallLoading}
          setHallLoading={setHallLoading}
          lastMatchId={lastMatchId}
        />
      )}

      {/* Squadre tab */}
      {tab === 'squadre' && (() => {
        const togglePlayer = (pid, side) => {
          if (side === 'A') {
            setSquadreA(prev => prev.includes(pid) ? prev.filter(x => x !== pid) : [...prev, pid]);
          } else {
            setSquadreB(prev => prev.includes(pid) ? prev.filter(x => x !== pid) : [...prev, pid]);
          }
        };
        const chipStyle = (selected, color) => ({
          padding: '0.3rem 0.65rem', borderRadius: '999px', fontSize: '0.78rem', fontWeight: 600,
          cursor: 'pointer', border: `1px solid ${selected ? color : 'rgba(74,85,104,0.5)'}`,
          background: selected ? color + '28' : 'rgba(74,85,104,0.2)',
          color: selected ? color : '#A0AEC0',
          transition: 'all 0.12s',
          userSelect: 'none',
        });
        return (
          <div>
            <div className="card mb-3" style={{ border: '1px solid rgba(252,129,129,0.25)' }}>
              <h3 className="mb-2" style={{ fontSize: '0.88rem', color: '#FC8181' }}>🔴 Squadra A</h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                {players
                  .filter(p => !squadreB.includes(p.id))
                  .map(p => (
                    <span key={p.id} style={chipStyle(squadreA.includes(p.id), '#FC8181')}
                      onClick={() => togglePlayer(p.id, 'A')}>
                      {p.name}
                    </span>
                  ))}
              </div>
            </div>

            <div className="card mb-4" style={{ border: '1px solid rgba(99,179,237,0.25)' }}>
              <h3 className="mb-2" style={{ fontSize: '0.88rem', color: '#63B3ED' }}>🔵 Squadra B</h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                {players
                  .filter(p => !squadreA.includes(p.id))
                  .map(p => (
                    <span key={p.id} style={chipStyle(squadreB.includes(p.id), '#63B3ED')}
                      onClick={() => togglePlayer(p.id, 'B')}>
                      {p.name}
                    </span>
                  ))}
              </div>
            </div>

            {squadreA.length === 0 || squadreB.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem 1rem', color: '#718096' }}>
                <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🆚</div>
                <p className="text-sm">Seleziona almeno un giocatore per squadra</p>
              </div>
            ) : squadreStats && squadreStats.total === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem 1rem', color: '#718096' }}>
                <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📭</div>
                <p className="text-sm">Nessuna partita trovata con queste formazioni</p>
              </div>
            ) : squadreStats ? (
              <div>
                <div className="card mb-3" style={{ border: '1px solid rgba(252,129,129,0.25)' }}>
                  <h3 className="mb-3" style={{ fontSize: '0.9rem', color: '#FC8181' }}>📊 Storico scontri ({squadreStats.total} partite)</h3>
                  <div className="flex items-center gap-2 mb-3">
                    <div style={{ flex: 1, textAlign: 'center' }}>
                      <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#FC8181', marginBottom: '0.25rem' }}>Squadra A</div>
                      <div style={{ fontSize: '2.4rem', fontWeight: 900, color: CLR_WIN }}>{squadreStats.aWins}</div>
                      <div style={{ fontSize: '0.65rem', color: '#718096' }}>vittorie</div>
                    </div>
                    <div style={{ textAlign: 'center', minWidth: 44 }}>
                      <div style={{ fontSize: '1.3rem', color: CLR_DRAW, fontWeight: 700 }}>{squadreStats.draws}</div>
                      <div style={{ fontSize: '0.62rem', color: '#718096' }}>pareggi</div>
                    </div>
                    <div style={{ flex: 1, textAlign: 'center' }}>
                      <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#63B3ED', marginBottom: '0.25rem' }}>Squadra B</div>
                      <div style={{ fontSize: '2.4rem', fontWeight: 900, color: CLR_WIN }}>{squadreStats.bWins}</div>
                      <div style={{ fontSize: '0.65rem', color: '#718096' }}>vittorie</div>
                    </div>
                  </div>
                  {squadreStats.total > 0 && (
                    <div style={{ textAlign: 'center', fontSize: '0.78rem', color: '#A0AEC0' }}>
                      Win rate A: <strong style={{ color: '#FC8181' }}>
                        {Math.round((squadreStats.aWins + squadreStats.draws * 0.5) / squadreStats.total * 100)}%
                      </strong>
                    </div>
                  )}
                </div>

                {squadreStats.matches.length > 0 && (
                  <div className="card">
                    <h3 className="mb-2" style={{ fontSize: '0.85rem', color: '#718096' }}>Ultime partite trovate</h3>
                    {squadreStats.matches.map((mr, i) => {
                      const aWon = mr.aScore > mr.bScore;
                      const bWon = mr.bScore > mr.aScore;
                      return (
                        <div key={i} className="flex items-center justify-between"
                          style={{ padding: '0.45rem 0', borderBottom: '1px solid #2D3748', fontSize: '0.82rem' }}>
                          <span style={{ color: '#718096', minWidth: 60 }}>{mr.date}</span>
                          <span style={{ fontWeight: 800, color: aWon ? CLR_WIN : bWon ? CLR_LOSS : CLR_DRAW, fontSize: '1rem' }}>
                            {mr.aScore}
                          </span>
                          <span style={{ color: '#4A5568', fontSize: '0.75rem' }}>–</span>
                          <span style={{ fontWeight: 800, color: bWon ? CLR_WIN : aWon ? CLR_LOSS : CLR_DRAW, fontSize: '1rem' }}>
                            {mr.bScore}
                          </span>
                          <span style={{ fontSize: '0.72rem', color: aWon ? CLR_WIN : bWon ? CLR_LOSS : CLR_DRAW, minWidth: 30, textAlign: 'right' }}>
                            {aWon ? 'A' : bWon ? 'B' : '—'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        );
      })()}
      </div>
    </div>
  );
}
