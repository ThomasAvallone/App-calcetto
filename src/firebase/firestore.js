import {
  collection, doc, getDocs, getDoc, addDoc, setDoc, updateDoc,
  deleteDoc, query, orderBy, limit, where, serverTimestamp,
  onSnapshot, writeBatch, Timestamp, arrayUnion, increment
} from 'firebase/firestore';
import { db } from './config';
import { getMs } from '../utils/dateUtils';
import {
  DEFAULT_PI_CONFIG,
  calcStatsForPlayer,
  computePowerIndex,
  computeCombinedPowerIndex,
  computeStreak,
  computeRecentForm,
} from '../utils/playerStats';

// Re-export per retrocompatibilità con i moduli che importano da firebase/firestore
export { DEFAULT_PI_CONFIG, computePowerIndex, computeCombinedPowerIndex, computeStreak, computeRecentForm };

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

// Scrittura atomica di un evento gol/autogol: arrayUnion previene race condition
// se due admin registrano gol contemporaneamente (increment è atomico su Firestore).
export async function recordGoalEvent(matchId, event) {
  const pointTeam = event.type === 'autogoal'
    ? (event.team === 'red' ? 'blue' : 'red')
    : event.team;
  await updateDoc(doc(db, 'matches', matchId), {
    events: arrayUnion(event),
    ...(pointTeam === 'red' ? { redScore: increment(1) } : { blueScore: increment(1) }),
    updatedAt: serverTimestamp(),
  });
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

export async function recalculatePlayerStats(playerIds, { cachedMatches, cachedPlayers } = {}) {
  const [allMatches, allPlayers, piConfigSnap] = await Promise.all([
    cachedMatches || getMatches(),
    cachedPlayers || getPlayers(),
    getDoc(doc(db, 'settings', 'piConfig')).catch(() => ({ exists: () => false })),
  ]);
  // Strip server metadata fields (updatedAt) before merging into formula config
  const { updatedAt: _u, ...piConfigData } = piConfigSnap.exists() ? piConfigSnap.data() : {};
  const cfg = { ...DEFAULT_PI_CONFIG, ...piConfigData };
  // Map playerId → player doc (for historicalStats and existing powerHistory)
  const playerMap = new Map(allPlayers.map(p => [p.id, p]));
  const playerHistoricalMap = new Map(allPlayers.map(p => [p.id, p.historicalStats]));
  const batch = writeBatch(db);
  const now = Date.now();

  // Pre-build Map<pid, finishedMatches sorted newest-first> to avoid O(n×m) filtering
  const finishedSorted = allMatches
    .filter(m => m.status === 'finished')
    .sort((a, b) => getMs(b.date) - getMs(a.date));
  const playerMatchMap = new Map();
  for (const m of finishedSorted) {
    for (const p of [...(m.redTeam || []), ...(m.blueTeam || [])]) {
      if (!playerMatchMap.has(p.id)) playerMatchMap.set(p.id, []);
      playerMatchMap.get(p.id).push(m);
    }
  }

  for (const pid of playerIds) {
    // All finished matches for this player, sorted newest first (from pre-built map)
    const playerMatches = playerMatchMap.get(pid) || [];

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

    // Recent stats (last N app matches – historical are too old to affect recent form)
    const recentStats = calcStatsForPlayer(appMatches.slice(0, cfg.recentMatchesWindow), pid);

    // Calculate both PIs using the current config
    const overallPI = computePowerIndex(stats, cfg);
    const recentPI = computePowerIndex(recentStats, cfg);

    // Activity decay: penalize inactive players
    let activityFactor = 1;
    if (playerMatches.length > 0) {
      const lastMatchMs = getMs(playerMatches[0].date);
      const daysSinceLastMatch = (now - lastMatchMs) / (1000 * 60 * 60 * 24);
      if (daysSinceLastMatch > cfg.activityDecayStartDays) {
        activityFactor = Math.max(
          cfg.activityDecayFloor,
          1 - (daysSinceLastMatch - cfg.activityDecayStartDays) / cfg.activityDecayDuration,
        );
      }
    } else {
      activityFactor = cfg.activityDecayFloor;
    }

    // Blend: recentWeight% recent + (1-recentWeight)% overall
    const blendedPI = recentStats.matches >= cfg.minRecentMatchesForBlend
      ? recentPI * cfg.recentWeight + overallPI * (1 - cfg.recentWeight)
      : overallPI;

    const recentForm = computeRecentForm(playerMatches, pid, true);
    const streak = computeStreak(playerMatches, pid, true);

    // Bonus da rating peer
    const ratingBonus = (recentForm && recentForm.ratedMatches >= cfg.minRatedMatchesForBonus)
      ? (recentForm.avg - cfg.ratingNeutral) * cfg.ratingBonusMultiplier
      : 0;

    // Apply activity decay
    const finalPI = Math.max(0, Math.min(100, Math.round((blendedPI + ratingBonus) * activityFactor * 10) / 10));

    // Append snapshot to powerHistory (keep last 30 entries, one per recalc date)
    const today = new Date().toISOString().slice(0, 10);
    const existingHistory = playerMap.get(pid)?.powerHistory || [];
    const lastEntry = existingHistory[existingHistory.length - 1];
    const powerHistory = lastEntry?.d === today
      ? [...existingHistory.slice(0, -1), { d: today, pi: finalPI }]
      : [...existingHistory, { d: today, pi: finalPI }].slice(-30);

    batch.update(doc(db, 'players', pid), {
      stats,
      powerIndex: finalPI,
      powerHistory,
      recentForm: recentForm ?? null,
      streak: streak ?? null,
      updatedAt: serverTimestamp(),
    });
  }

  await batch.commit();
}

// ─── RATINGS & RECENT FORM ───────────────────────────────────────────────────

export async function rateMatch(matchId, userId, scores, raterName) {
  // scores: { [playerId]: number (1-10) }
  await updateDoc(doc(db, 'matches', matchId), {
    [`ratings.${userId}`]: { scores, ratedAt: serverTimestamp(), raterName: raterName || null },
    updatedAt: serverTimestamp(),
  });
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

// ─── ONE-TIME FIX: ricalcola minuti gol usando timestamps assoluti ────────────
// NOTA: questa funzione funziona correttamente SOLO per partite mai messe in pausa.
// Se il timer è stato messo in pausa e riavviato, startTimestamp corrisponde
// all'ultimo resume e i gol segnati prima della pausa avranno minuti errati.
// Per partite con pause multiple sarebbe necessario registrare la cronologia
// completa dei cicli pausa/riavvio nel matchState, funzionalità non ancora implementata.
export async function fixLastMatchGoalMinutes() {
  // 1. Prendi l'ultima partita
  const snap = await getDocs(query(collection(db, 'matches'), orderBy('date', 'desc'), limit(1)));
  if (snap.empty) throw new Error('Nessuna partita trovata');
  const matchDoc = snap.docs[0];
  const match = { id: matchDoc.id, ...matchDoc.data() };

  // 2. Prendi il matchState per avere startTimestamp reale
  const stateSnap = await getDoc(doc(db, 'matchStates', match.id));
  if (!stateSnap.exists()) throw new Error('matchState non trovato per ' + match.id);
  const { startTimestamp } = stateSnap.data();
  if (!startTimestamp) throw new Error('startTimestamp non presente nel matchState');

  // 3. Ricalcola ogni evento
  const preview = [];
  const fixedEvents = (match.events || []).map(e => {
    const correctMinute = Math.floor((e.timestamp - startTimestamp) / 60000);
    preview.push(`${e.scorerName || e.type}: ${e.minute} → ${correctMinute}`);
    return { ...e, minute: correctMinute };
  });

  return { matchId: match.id, fixedEvents, preview, startTimestamp };
}

// ─── AI CACHE (settings collection) ──────────────────────────────────────────
// key: stringa arbitraria (es. 'report_season', 'hall', 'rivalry_id1_id2')
// data: { text, lastMatchId, generatedAt }

export async function getAICache(key) {
  const snap = await getDoc(doc(db, 'settings', `aiCache_${key}`));
  return snap.exists() ? snap.data() : null;
}

export async function setAICache(key, data) {
  await setDoc(doc(db, 'settings', `aiCache_${key}`), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

// ─── PI CONFIG ────────────────────────────────────────────────────────────────

export async function getPIConfig() {
  const snap = await getDoc(doc(db, 'settings', 'piConfig'));
  return snap.exists() ? snap.data() : null;
}

export async function setPIConfig(config) {
  await setDoc(doc(db, 'settings', 'piConfig'), {
    ...config,
    updatedAt: serverTimestamp(),
  });
}

export function subscribeToPIConfig(callback) {
  return onSnapshot(doc(db, 'settings', 'piConfig'), snap => {
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
            events.push({ type: 'goal', scorerId: found.id, scorerName: found.name, team: 'red' });
          }
        }
      }
      for (const p of hm.rightTeam) {
        const found = lookupPlayer(p.name);
        if (found && p.goals > 0) {
          for (let g = 0; g < p.goals; g++) {
            events.push({ type: 'goal', scorerId: found.id, scorerName: found.name, team: 'blue' });
          }
        }
      }
      // Autogoals
      for (const ag of (hm.autogoals || [])) {
        const found = lookupPlayer(ag.scorerName);
        if (found) {
          // The scorer's team is the opposite of the benefited team
          const scorerTeam = ag.benefitedTeam === 'right' ? 'red' : 'blue';
          events.push({ type: 'autogoal', scorerId: found.id, scorerName: found.name, team: scorerTeam });
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
