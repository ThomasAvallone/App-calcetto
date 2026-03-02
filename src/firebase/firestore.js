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
  const initialPI = 50; // Will be recalculated after match import
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
    events: [],
    redScore: 0,
    blueScore: 0,
    status: 'pending',
    date: serverTimestamp(),
    ...data,
    createdAt: serverTimestamp(),
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

const RECENT_MATCHES_WINDOW = 20; // last N matches for recent PI

export async function recalculatePlayerStats(playerIds) {
  const [allMatches, allPlayers] = await Promise.all([getMatches(), getPlayers()]);
  // Map playerId → historicalStats (authoritative source for all historical data)
  const playerHistoricalMap = new Map(allPlayers.map(p => [p.id, p.historicalStats]));
  const batch = writeBatch(db);
  const getMs = d => d?.toMillis ? d.toMillis() : d ? new Date(d).getTime() : 0;
  const now = Date.now();

  // Helper: calculate stats from a list of matches for a player
  function calcStatsForPlayer(matchList, pid) {
    const s = {
      goals: 0, assists: 0, autogoals: 0,
      gkGoalsConceded: 0, gkMatches: 0,
      wins: 0, losses: 0, draws: 0, matches: 0
    };
    for (const match of matchList) {
      const inRed = (match.redTeam || []).some(p => p.id === pid);
      s.matches++;
      const myScore = inRed ? match.redScore : match.blueScore;
      const theirScore = inRed ? match.blueScore : match.redScore;
      if (myScore > theirScore) s.wins++;
      else if (myScore < theirScore) s.losses++;
      else s.draws++;
      for (const ev of (match.events || [])) {
        if (ev.type === 'goal') {
          if (ev.scorerId === pid) s.goals++;
          if (ev.assistId === pid) s.assists++;
        }
        if (ev.type === 'autogoal' && ev.scorerId === pid) s.autogoals++;
        if (ev.type === 'gk_turn' && ev.playerId === pid) {
          s.gkMatches++;
          s.gkGoalsConceded += ev.goalsConceded || 0;
        }
      }
    }
    return s;
  }

  for (const pid of playerIds) {
    // Get all finished matches for this player, sorted newest first
    const playerMatches = allMatches
      .filter(m => {
        if (m.status !== 'finished') return false;
        return [...(m.redTeam || []), ...(m.blueTeam || [])].some(p => p.id === pid);
      })
      .sort((a, b) => getMs(b.date) - getMs(a.date));

    // App-only stats (exclude historical matches – those come from historicalStats
    // below). This avoids double-counting for players linked at import time AND
    // correctly adds stats for aliases linked after the import (e.g. Boro, Santi).
    const appMatches = playerMatches.filter(m => !m.isHistorical);
    const stats = calcStatsForPlayer(appMatches, pid);

    // Add full historicalStats (goals, assists, autogoals, record, matches).
    // historicalStats is the authoritative source computed from the original Excel
    // season data (historicalData.js via computeCumulativeStats).
    const historicalStats = playerHistoricalMap.get(pid);
    if (historicalStats) {
      stats.goals += historicalStats.goals || 0;
      stats.assists += historicalStats.assists || 0;
      stats.autogoals += historicalStats.autogoals || 0;
      stats.wins += historicalStats.wins || 0;
      stats.losses += historicalStats.losses || 0;
      stats.draws += historicalStats.draws || 0;
      stats.matches += historicalStats.matches || 0;
    }

    // Recent stats (last 20 app matches – historical are too old to affect recent form)
    const recentStats = calcStatsForPlayer(appMatches.slice(0, RECENT_MATCHES_WINDOW), pid);

    // Calculate both PIs
    const overallPI = computePowerIndex(stats);
    const recentPI = computePowerIndex(recentStats);

    // Activity decay: penalize inactive players (30+ days without playing)
    let activityFactor = 1;
    if (playerMatches.length > 0) {
      const lastMatchMs = getMs(playerMatches[0].date);
      const daysSinceLastMatch = (now - lastMatchMs) / (1000 * 60 * 60 * 24);
      if (daysSinceLastMatch > 30) {
        // Decay from 1.0 at 30 days → 0.5 floor at ~1 year
        activityFactor = Math.max(0.5, 1 - (daysSinceLastMatch - 30) / 730);
      }
    } else {
      activityFactor = 0.5;
    }

    // Blend: 60% recent + 40% overall (need at least 3 recent matches)
    const blendedPI = recentStats.matches >= 3
      ? recentPI * 0.6 + overallPI * 0.4
      : overallPI;

    // Apply activity decay
    const finalPI = Math.max(0, Math.min(100, Math.round(blendedPI * activityFactor * 10) / 10));

    const recentForm = computeRecentForm(allMatches, pid);
    const streak = computeStreak(allMatches, pid);
    batch.update(doc(db, 'players', pid), {
      stats,
      powerIndex: finalPI,
      recentForm: recentForm ?? null,
      streak: streak ?? null,
      updatedAt: serverTimestamp(),
    });
  }

  await batch.commit();
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

// ─── RATINGS & RECENT FORM ───────────────────────────────────────────────────

export async function rateMatch(matchId, userId, scores) {
  // scores: { [playerId]: number (1-10) }
  await updateDoc(doc(db, 'matches', matchId), {
    [`ratings.${userId}`]: { scores, ratedAt: serverTimestamp() },
    updatedAt: serverTimestamp(),
  });
}

// Pure function: compute recent form for a player from allMatches data
export function computeStreak(allMatches, playerId) {
  const getMs = d => d?.toMillis ? d.toMillis() : d ? new Date(d).getTime() : 0;
  const playerMatches = allMatches
    .filter(m =>
      m.status === 'finished' &&
      [...(m.redTeam || []), ...(m.blueTeam || [])].some(p => p.id === playerId)
    )
    .sort((a, b) => getMs(b.date) - getMs(a.date));

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

export function computeRecentForm(allMatches, playerId) {
  const getMs = d => d?.toMillis ? d.toMillis() : d ? new Date(d).getTime() : 0;
  const playerMatches = allMatches
    .filter(m =>
      m.status === 'finished' &&
      [...(m.redTeam || []), ...(m.blueTeam || [])].some(p => p.id === playerId)
    )
    .sort((a, b) => getMs(b.date) - getMs(a.date))
    .slice(0, 15);

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
    gkGoalsConceded: (stats?.gkGoalsConceded || 0) + (historicalStats?.gkGoalsConceded || 0),
    gkMatches: (stats?.gkMatches || 0) + (historicalStats?.gkMatches || 0),
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

// ─── SCHEDULED MATCH ─────────────────────────────────────────────────────────

export async function setScheduledMatch(date, note) {
  await setDoc(doc(db, 'settings', 'nextMatch'), {
    date, // ISO string
    note: note || '',
    updatedAt: serverTimestamp(),
  });
}

export async function clearScheduledMatch() {
  await deleteDoc(doc(db, 'settings', 'nextMatch'));
}

export function subscribeToScheduledMatch(callback) {
  return onSnapshot(doc(db, 'settings', 'nextMatch'), snap => {
    callback(snap.exists() ? snap.data() : null);
  });
}

// ─── HISTORICAL MATCH IMPORT ─────────────────────────────────────────────────

/**
 * Import historical matches from parsed Excel data.
 * @param {Array} historicalMatches - array from HISTORICAL_MATCHES
 * @param {Array} players - current players array from Firestore (with historicalNames)
 * @param {Function} onProgress - callback(done, total, matchNum)
 */
export async function importHistoricalMatches(historicalMatches, players, onProgress) {
  // Build name → { id, name } lookup from historicalNames
  const nameMap = new Map(); // uppercase name → { id, name }
  for (const p of players) {
    // Map the display name
    nameMap.set(p.name.toUpperCase().trim(), { id: p.id, name: p.name });
    // Map all historical names
    for (const hn of (p.historicalNames || [])) {
      nameMap.set(hn.toUpperCase().trim(), { id: p.id, name: p.name });
    }
  }

  function lookupPlayer(rawName) {
    const key = rawName.toUpperCase().trim();
    // Exact match
    if (nameMap.has(key)) return nameMap.get(key);
    // Partial match: check if any map key starts with or includes this name
    for (const [k, v] of nameMap) {
      if (k.startsWith(key) || key.startsWith(k)) return v;
    }
    return null; // unknown player
  }

  const total = historicalMatches.length;
  let done = 0;

  // Process in batches of 400 (Firestore limit is 500)
  const BATCH_SIZE = 400;
  for (let i = 0; i < historicalMatches.length; i += BATCH_SIZE) {
    const chunk = historicalMatches.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);

    for (const hm of chunk) {
      // Map teams to player objects
      const redTeam = hm.leftTeam.map(p => {
        const found = lookupPlayer(p.name);
        return found ? { id: found.id, name: found.name } : { name: p.name };
      });
      const blueTeam = hm.rightTeam.map(p => {
        const found = lookupPlayer(p.name);
        return found ? { id: found.id, name: found.name } : { name: p.name };
      });

      // Build events: one goal event per goal scored
      const events = [];
      for (const p of hm.leftTeam) {
        const found = lookupPlayer(p.name);
        if (found && p.goals > 0) {
          for (let g = 0; g < p.goals; g++) {
            events.push({ type: 'goal', scorerId: found.id, team: 'red' });
          }
        }
      }
      for (const p of hm.rightTeam) {
        const found = lookupPlayer(p.name);
        if (found && p.goals > 0) {
          for (let g = 0; g < p.goals; g++) {
            events.push({ type: 'goal', scorerId: found.id, team: 'blue' });
          }
        }
      }
      // Autogoals
      for (const ag of (hm.autogoals || [])) {
        const found = lookupPlayer(ag.scorerName);
        if (found) {
          // The scorer's team is the opposite of the benefited team
          const scorerTeam = ag.benefitedTeam === 'right' ? 'red' : 'blue';
          events.push({ type: 'autogoal', scorerId: found.id, team: scorerTeam });
        }
      }

      // Parse date string to Firestore Timestamp
      const dateTs = Timestamp.fromDate(new Date(hm.date + 'T12:00:00'));

      const matchRef = doc(collection(db, 'matches'));
      batch.set(matchRef, {
        status: 'finished',
        date: dateTs,
        redTeam,
        blueTeam,
        redScore: hm.leftScore,
        blueScore: hm.rightScore,
        events,
        isHistorical: true,
        matchNum: hm.matchNum,
        createdAt: serverTimestamp(),
      });

      done++;
      if (onProgress) onProgress(done, total, hm.matchNum);
    }

    await batch.commit();
  }

  return done;
}
