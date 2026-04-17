// Funzioni pure per calcoli su giocatori e partite.
// Nessuna dipendenza da Firestore: testabili in isolamento.

import { getMs } from './dateUtils';

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

export function computePowerIndex(stats) {
  if (!stats) return 50;
  const { goals = 0, assists = 0, autogoals = 0, gkGoalsConceded = 0, gkMatches = 0, wins = 0, draws = 0, matches = 0 } = stats;
  if (matches === 0) return 50;
  const winRate = (wins + draws * 0.5) / matches;
  const attackPerMatch = (goals * 3 + assists * 2 - autogoals * 2) / matches;
  const gkPenalty = gkMatches > 0 ? (gkGoalsConceded / gkMatches) * 2 : 0;
  const raw = 50 + winRate * 20 + attackPerMatch * 6 - gkPenalty;
  return Math.max(0, Math.min(100, Math.round(raw * 10) / 10));
}

export function computeCombinedPowerIndex(stats, historicalStats) {
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
  return computePowerIndex(combined);
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
