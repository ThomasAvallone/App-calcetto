import {
  collection, doc, getDocs, getDoc, addDoc, setDoc, updateDoc,
  deleteDoc, query, orderBy, limit, where, serverTimestamp,
  onSnapshot, writeBatch, Timestamp
} from 'firebase/firestore';
import { db } from './config';

// ─── PLAYERS ─────────────────────────────────────────────────────────────────

export async function getPlayers() {
  const snap = await getDocs(query(collection(db, 'players'), orderBy('name')));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getPlayer(id) {
  const snap = await getDoc(doc(db, 'players', id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createPlayer(data) {
  const emptyStats = { goals: 0, assists: 0, autogoals: 0, gkGoalsConceded: 0, gkMatches: 0, wins: 0, losses: 0, draws: 0, matches: 0 };
  const initialPI = computeCombinedPowerIndex(emptyStats, data.historicalStats || null);
  return await addDoc(collection(db, 'players'), {
    ...data,
    powerIndex: initialPI,
    stats: emptyStats,
    createdAt: serverTimestamp(),
  });
}

export async function updatePlayer(id, data) {
  await updateDoc(doc(db, 'players', id), { ...data, updatedAt: serverTimestamp() });
}

export async function deletePlayer(id) {
  await deleteDoc(doc(db, 'players', id));
}

export function subscribeToPlayers(callback) {
  return onSnapshot(query(collection(db, 'players'), orderBy('name')), snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

// ─── MATCHES ─────────────────────────────────────────────────────────────────

export async function getMatches() {
  const snap = await getDocs(query(collection(db, 'matches'), orderBy('date', 'desc')));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getMatch(id) {
  const snap = await getDoc(doc(db, 'matches', id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createMatch(data) {
  const ref = await addDoc(collection(db, 'matches'), {
    ...data,
    status: 'pending',
    date: serverTimestamp(),
    events: [],
    redScore: 0,
    blueScore: 0,
  });
  return ref.id;
}

export async function updateMatch(id, data) {
  await updateDoc(doc(db, 'matches', id), { ...data, updatedAt: serverTimestamp() });
}

export async function deleteMatch(id) {
  await deleteDoc(doc(db, 'matches', id));
}

export function subscribeToMatch(id, callback) {
  return onSnapshot(doc(db, 'matches', id), snap => {
    callback(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  });
}

export function subscribeToMatches(callback) {
  return onSnapshot(query(collection(db, 'matches'), orderBy('date', 'desc')), snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

// ─── POWER INDEX RECALCULATION ────────────────────────────────────────────────

export async function recalculatePlayerStats(playerIds) {
  const [allMatches, allPlayers] = await Promise.all([getMatches(), getPlayers()]);
  const playerMap = Object.fromEntries(allPlayers.map(p => [p.id, p]));
  const batch = writeBatch(db);

  for (const pid of playerIds) {
    const stats = {
      goals: 0, assists: 0, autogoals: 0,
      gkGoalsConceded: 0, gkMatches: 0,
      wins: 0, losses: 0, draws: 0, matches: 0
    };

    for (const match of allMatches) {
      if (match.status !== 'finished') continue;
      const redTeam = match.redTeam || [];
      const blueTeam = match.blueTeam || [];
      const inRed = redTeam.some(p => p.id === pid);
      const inBlue = blueTeam.some(p => p.id === pid);
      if (!inRed && !inBlue) continue;

      stats.matches++;
      const myScore = inRed ? match.redScore : match.blueScore;
      const theirScore = inRed ? match.blueScore : match.redScore;
      if (myScore > theirScore) stats.wins++;
      else if (myScore < theirScore) stats.losses++;
      else stats.draws++;

      for (const ev of (match.events || [])) {
        if (ev.type === 'goal') {
          if (ev.scorerId === pid) stats.goals++;
          if (ev.assistId === pid) stats.assists++;
        }
        if (ev.type === 'autogoal' && ev.scorerId === pid) stats.autogoals++;
        if (ev.type === 'gk_turn' && ev.playerId === pid) {
          stats.gkMatches++;
          stats.gkGoalsConceded += ev.goalsConceded || 0;
        }
      }
    }

    // Power Index = app stats + historical stats combined
    const historicalStats = playerMap[pid]?.historicalStats || null;
    const pi = computeCombinedPowerIndex(stats, historicalStats);
    const recentForm = computeRecentForm(allMatches, pid);
    batch.update(doc(db, 'players', pid), { stats, powerIndex: pi, recentForm: recentForm ?? null, updatedAt: serverTimestamp() });
  }

  await batch.commit();
}

export function computePowerIndex(stats) {
  const { goals, assists, autogoals, gkGoalsConceded, gkMatches, wins, draws, matches } = stats;
  if (matches === 0) return 50;
  const winRate = (wins + draws * 0.5) / matches;
  // Normalize attack contribution per match so historical cumulative data doesn't overflow
  const attackPerMatch = (goals * 3 + assists * 2 - autogoals * 2) / matches;
  // Normalize GK penalty per GK match (not total goals conceded)
  const gkPenalty = gkMatches > 0 ? (gkGoalsConceded / gkMatches) * 2 : 0;
  const raw = 50 + winRate * 20 + attackPerMatch * 6 - gkPenalty;
  return Math.max(0, Math.min(100, Math.round(raw * 10) / 10));
}

// ─── RATINGS & RECENT FORM ───────────────────────────────────────────────────

export async function rateMatch(matchId, userId, scores) {
  // scores: { [playerId]: number (1-10) }
  await updateDoc(doc(db, 'matches', matchId), {
    [`ratings.${userId}`]: { scores, ratedAt: serverTimestamp() },
    updatedAt: serverTimestamp(),
  });
}

// Pure function: compute recent form for a player from allMatches data
export function computeRecentForm(allMatches, playerId) {
  const getMs = d => d?.toMillis ? d.toMillis() : d ? new Date(d).getTime() : 0;
  const playerMatches = allMatches
    .filter(m =>
      m.status === 'finished' &&
      [...(m.redTeam || []), ...(m.blueTeam || [])].some(p => p.id === playerId)
    )
    .sort((a, b) => getMs(b.date) - getMs(a.date))
    .slice(0, 5);

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

// Recalculate recentForm for given players and save to Firestore
export async function recalculateRecentFormForPlayers(playerIds) {
  const allMatches = await getMatches();
  const batch = writeBatch(db);
  for (const pid of playerIds) {
    const form = computeRecentForm(allMatches, pid);
    batch.update(doc(db, 'players', pid), { recentForm: form ?? null, updatedAt: serverTimestamp() });
  }
  await batch.commit();
}

// ─── HISTORICAL SEASONS ─────────────────────────────────────────────────────

export async function seedHistoricalSeasons(seasons) {
  const batch = writeBatch(db);
  for (const season of seasons) {
    batch.set(doc(db, 'historicalSeasons', season.id), season);
  }
  await batch.commit();
}

export async function getHistoricalSeasons() {
  const snap = await getDocs(query(collection(db, 'historicalSeasons'), orderBy('id')));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// Recalculate Power Index using app stats + historical stats combined
export function computeCombinedPowerIndex(stats, historicalStats) {
  const combined = {
    goals: (stats?.goals || 0) + (historicalStats?.goals || 0),
    assists: (stats?.assists || 0) + (historicalStats?.assists || 0),
    autogoals: (stats?.autogoals || 0) + (historicalStats?.autogoals || 0),
    gkGoalsConceded: stats?.gkGoalsConceded || 0,
    wins: (stats?.wins || 0) + (historicalStats?.wins || 0),
    draws: (stats?.draws || 0) + (historicalStats?.draws || 0),
    matches: (stats?.matches || 0) + (historicalStats?.matches || 0),
  };
  return computePowerIndex(combined);
}

// ─── LIVE MATCH STATE (timer sync) ───────────────────────────────────────────

export async function saveMatchTimerState(matchId, state) {
  await setDoc(doc(db, 'matchStates', matchId), {
    ...state,
    updatedAt: serverTimestamp()
  }, { merge: true });
}

export async function getMatchTimerState(matchId) {
  const snap = await getDoc(doc(db, 'matchStates', matchId));
  return snap.exists() ? snap.data() : null;
}

export function subscribeToMatchState(matchId, callback) {
  return onSnapshot(doc(db, 'matchStates', matchId), snap => {
    callback(snap.exists() ? snap.data() : null);
  });
}
