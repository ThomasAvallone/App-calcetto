// Funzioni pure per calcoli su giocatori e partite.
// Nessuna dipendenza da Firestore: testabili in isolamento.

import { getMs } from './dateUtils';
import { HISTORICAL_SEASONS } from '../data/historicalData';

// Mappa stagione → nome giocatore → { presenze, assist } per la proration degli assist storici.
// Usata in PlayersPage e DashboardPage per calcolare gli assist nelle partite isHistorical.
export const SEASON_PLAYER_MAP = {};
for (const season of HISTORICAL_SEASONS) {
  SEASON_PLAYER_MAP[season.id] = {};
  for (const sp of season.players) {
    SEASON_PLAYER_MAP[season.id][sp.name.toUpperCase()] = { presenze: sp.presenze || 0, assist: sp.assist || 0 };
  }
}

// Restituisce l'id stagione "YYYY-YY" per una data (es. 2025-10-01 → "2025-26").
// La stagione inizia a settembre: agosto appartiene alla stagione precedente
// (coerente con seasonStartMs = 1 settembre in PlayersPage/DashboardPage).
export function getSeasonId(dateVal) {
  const d = dateVal?.toMillis ? new Date(dateVal.toMillis()) : new Date(dateVal);
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  return month >= 9 ? `${year}-${String(year + 1).slice(2)}` : `${year - 1}-${String(year).slice(2)}`;
}

export const DEFAULT_PI_CONFIG = {
  base: 50,
  winRateMultiplier: 20,
  drawValue: 0.5,
  attackMultiplier: 6,
  goalWeight: 3,
  assistWeight: 2,
  autogoalPenalty: 2,
  gkPenaltyMultiplier: 2,
  recentMatchesWindow: 20,
  minRecentMatchesForBlend: 3,
  recentWeight: 0.6,
  ratingNeutral: 5.5,
  ratingBonusMultiplier: 1.5,
  minRatedMatchesForBonus: 3,
  activityDecayStartDays: 30,
  activityDecayFloor: 0.5,
  activityDecayDuration: 730,
};

export function calcStatsForPlayer(matchList, pid) {
  const s = {
    goals: 0, assists: 0, autogoals: 0,
    gkGoalsConceded: 0, gkMatches: 0,
    wins: 0, losses: 0, draws: 0, matches: 0,
  };
  for (const match of matchList) {
    const inRed = (match.redTeam || []).some(p => p.id === pid);
    s.matches++;
    const myScore = inRed ? match.redScore : match.blueScore;
    const theirScore = inRed ? match.blueScore : match.redScore;
    if (myScore > theirScore) s.wins++;
    else if (myScore < theirScore) s.losses++;
    else s.draws++;
    // Tutti ruotano in porta: ogni partita giocata = 2 turni da portiere
    s.gkMatches += 2;
    for (const ev of (match.events || [])) {
      if (ev.type === 'goal') {
        if (ev.scorerId === pid) s.goals++;
        if (ev.assistId === pid) s.assists++;
      }
      if (ev.type === 'autogoal' && ev.scorerId === pid) s.autogoals++;
      if (ev.gkConcededId === pid) s.gkGoalsConceded++;
    }
  }
  return s;
}

export function computePowerIndex(stats, cfg = DEFAULT_PI_CONFIG) {
  if (!stats) return cfg.base;
  const { goals = 0, assists = 0, autogoals = 0, gkGoalsConceded = 0, gkMatches = 0, wins = 0, draws = 0, matches = 0 } = stats;
  if (matches === 0) return cfg.base;
  const winRate = (wins + draws * cfg.drawValue) / matches;
  const attackPerMatch = (goals * cfg.goalWeight + assists * cfg.assistWeight - autogoals * cfg.autogoalPenalty) / matches;
  const gkPenalty = gkMatches > 0 ? (gkGoalsConceded / gkMatches) * cfg.gkPenaltyMultiplier : 0;
  const raw = cfg.base + winRate * cfg.winRateMultiplier + attackPerMatch * cfg.attackMultiplier - gkPenalty;
  return Math.max(0, Math.min(100, Math.round(raw * 10) / 10));
}

export function computeCombinedPowerIndex(stats, historicalStats, cfg = DEFAULT_PI_CONFIG) {
  const combined = {
    goals: (stats?.goals || 0) + (historicalStats?.goals || 0),
    assists: (stats?.assists || 0) + (historicalStats?.assists || 0),
    autogoals: (stats?.autogoals || 0) + (historicalStats?.autogoals || 0),
    gkGoalsConceded: (stats?.gkGoalsConceded || 0) + (historicalStats?.gkGoalsConceded || 0),
    gkMatches: (stats?.gkMatches || 0) + (historicalStats?.gkMatches || 0),
    wins: (stats?.wins || 0) + (historicalStats?.wins || 0),
    draws: (stats?.draws || 0) + (historicalStats?.draws || 0),
    matches: (stats?.matches || 0) + (historicalStats?.matches || 0),
  };
  return computePowerIndex(combined, cfg);
}

// Calcola stats complete (gol, assist con proration storica, V/N/P, GK, cleanSheet) per
// un array di giocatori su un set di partite pre-filtrate. Unica fonte di verità condivisa
// da StatsPage, e utilizzabile da altri componenti che necessitano di stat aggregate.
// Restituisce l'array di giocatori arricchito con campi totalGoals, totalAssists, ecc.
export function computeStatsFromMatches(players, matches) {
  return players.map(p => {
    const s = aggregatePlayerMatchStats(p, matches);
    return { ...p, totalGoals: s.goals, totalAssists: s.assists, totalAutogoals: s.autogoals, totalMatches: s.matches, totalWins: s.wins, totalDraws: s.draws, gkMatches: s.gkMatches, gkGoalsConceded: s.gkGoalsConceded, cleanSheets: s.cleanSheets };
  });
}

// Aggrega le statistiche di UN giocatore su una lista di partite GIÀ filtrate dal
// caller (stagione corrente, all-time, ecc.). Source of truth condivisa: usata da
// computeStatsFromMatches, PlayersPage.playerSeasonStats e DashboardPage.myStats,
// così la logica (inclusa la proration degli assist storici col cap a 1) non può
// divergere tra le viste. Le partite `isHistorical` non contano per gkMatches/
// cleanSheets/assist-da-evento (gli assist storici sono prorati a parte).
export function aggregatePlayerMatchStats(player, matches) {
  const s = { goals: 0, assists: 0, autogoals: 0, matches: 0, wins: 0, draws: 0, losses: 0, gkMatches: 0, gkGoalsConceded: 0, cleanSheets: 0 };
  const histBySeason = {};
  for (const m of (matches || [])) {
    const inRed = (m.redTeam || []).some(pl => pl.id === player.id);
    const inBlue = (m.blueTeam || []).some(pl => pl.id === player.id);
    if (!inRed && !inBlue) continue;
    s.matches++;
    const my = inRed ? (m.redScore ?? 0) : (m.blueScore ?? 0);
    const their = inRed ? (m.blueScore ?? 0) : (m.redScore ?? 0);
    if (my > their) s.wins++;
    else if (my < their) s.losses++;
    else s.draws++;
    if (!m.isHistorical) s.gkMatches += 2;
    let gkConcededThisMatch = 0;
    for (const ev of (m.events || [])) {
      if (ev.type === 'goal') {
        if (ev.scorerId === player.id) s.goals++;
        if (!m.isHistorical && ev.assistId === player.id) s.assists++;
      }
      if (ev.gkConcededId === player.id) { s.gkGoalsConceded++; gkConcededThisMatch++; }
      if (ev.type === 'autogoal' && ev.scorerId === player.id) s.autogoals++;
    }
    if (!m.isHistorical && gkConcededThisMatch === 0) s.cleanSheets++;
    if (m.isHistorical) {
      const sid = getSeasonId(m.date);
      histBySeason[sid] = (histBySeason[sid] || 0) + 1;
    }
  }
  const histNames = (player.historicalNames || []).map(n => n.toUpperCase());
  for (const [sid, countInPeriod] of Object.entries(histBySeason)) {
    const seasonData = SEASON_PLAYER_MAP[sid];
    if (!seasonData) continue;
    let pData = null;
    for (const name of histNames) {
      if (seasonData[name]) { pData = seasonData[name]; break; }
    }
    if (!pData || !pData.presenze || !pData.assist) continue;
    // Cap del rapporto a 1: se Firestore ha più partite storiche delle presenze
    // dichiarate, evita di superare il totale assist storici.
    s.assists += Math.round(pData.assist * Math.min(1, countInPeriod / pData.presenze));
  }
  return s;
}

function filterPlayerMatches(allMatches, playerId, prefiltered) {
  if (prefiltered) return allMatches.filter(m => !m.isHistorical);
  return allMatches
    .filter(m =>
      m.status === 'finished' &&
      !m.isHistorical &&
      [...(m.redTeam || []), ...(m.blueTeam || [])].some(p => p.id === playerId)
    )
    .sort((a, b) => getMs(b.date) - getMs(a.date));
}

export function computeStreak(allMatches, playerId, prefiltered = false) {
  const playerMatches = filterPlayerMatches(allMatches, playerId, prefiltered);
  if (playerMatches.length === 0) return null;

  const getOutcome = m => {
    const inRed = (m.redTeam || []).some(p => p.id === playerId);
    const my = inRed ? m.redScore : m.blueScore;
    const their = inRed ? m.blueScore : m.redScore;
    return my > their ? 'win' : my < their ? 'loss' : 'draw';
  };

  const firstType = getOutcome(playerMatches[0]);
  let count = 0;
  for (const m of playerMatches) {
    if (getOutcome(m) === firstType) count++;
    else break;
  }
  return { type: firstType, count };
}

export function computeRecentForm(allMatches, playerId, prefiltered = false) {
  const playerMatches = filterPlayerMatches(allMatches, playerId, prefiltered).slice(0, 15);
  if (playerMatches.length === 0) return null;

  const matchAvgs = playerMatches
    .map(m => {
      const raterScores = Object.values(m.ratings || {})
        .map(r => r.scores?.[playerId])
        .filter(s => typeof s === 'number');
      if (raterScores.length === 0) return null;
      return raterScores.reduce((a, b) => a + b, 0) / raterScores.length;
    })
    .filter(a => a !== null);

  if (matchAvgs.length === 0) return null;

  const avg = matchAvgs.reduce((a, b) => a + b, 0) / matchAvgs.length;
  return {
    avg: Math.round(avg * 10) / 10,
    ratedMatches: matchAvgs.length,
    totalMatches: playerMatches.length,
  };
}
