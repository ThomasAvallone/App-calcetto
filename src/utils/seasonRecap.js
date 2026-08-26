// Riepilogo di stagione calcolato dalle partite su Firestore (storiche + app).
//
// Le stagioni vanno dal 1° settembre al 31 agosto (stesse regole di
// getSeasonStartMs/getMatchSeason). Per le stagioni "era app" i dati vivono
// tutti nella collezione matches: i doc `isHistorical` coprono la parte
// pre-app (importati dall'Excel, gol come eventi, niente assist) e i doc
// normali la parte registrata live. L'aggregazione per giocatore delega ad
// aggregatePlayerMatchStats (source of truth unica, con proration degli
// assist storici) — non re-implementarla qui.
//
// L'output ha la STESSA forma delle entry di HISTORICAL_SEASONS
// (data/historicalData.js), così StagioniPage e l'export CSV trattano allo
// stesso modo stagioni statiche e stagioni calcolate live.

import { getMs } from './dateUtils';
import { aggregatePlayerMatchStats } from './playerStats';

const MONTH_NAMES = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];

/** 'YYYY-YY' della stagione (Sep–Aug) a cui appartiene un istante. */
export function seasonIdOf(ms) {
  const d = new Date(ms);
  if (isNaN(d.getTime())) return null;
  const year = d.getMonth() >= 8 ? d.getFullYear() : d.getFullYear() - 1;
  return `${year}-${String(year + 1).slice(2)}`;
}

/** Estremi [startMs, endMs) della stagione 'YYYY-YY'. */
export function seasonBounds(seasonId) {
  const year = parseInt(String(seasonId).slice(0, 4), 10);
  if (!Number.isFinite(year)) return null;
  return {
    startMs: new Date(year, 8, 1).getTime(),
    endMs: new Date(year + 1, 8, 1).getTime(),
  };
}

/** '2025-26' → '2025/2026'. */
export function seasonLabelOf(seasonId) {
  const year = parseInt(String(seasonId).slice(0, 4), 10);
  return `${year}/${year + 1}`;
}

/** Id (ordinati) delle stagioni con almeno una partita APP conclusa. */
export function listAppSeasonIds(matches) {
  const ids = new Set();
  for (const m of matches || []) {
    if (m.status !== 'finished' || m.isHistorical) continue;
    const id = seasonIdOf(getMs(m.date));
    if (id) ids.add(id);
  }
  return [...ids].sort();
}

function fmtDate(ms) {
  const d = new Date(ms);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
}

// Nome/i con valore massimo, formattati come nelle stagioni storiche
// ('Fede M. / Luciano'). `entries` = [{name, value}].
function topEntry(entries, { min = 1 } = {}) {
  let best = null;
  for (const e of entries) {
    if (e.value < min) continue;
    if (!best || e.value > best.value) best = { names: [e.name], value: e.value };
    else if (e.value === best.value) best.names.push(e.name);
  }
  if (!best) return null;
  const names = best.names.length > 3
    ? `${best.names.slice(0, 3).join(' / ')} +${best.names.length - 3}`
    : best.names.join(' / ');
  return { name: names, value: best.value };
}

/**
 * Riepilogo completo di una stagione dalle partite Firestore.
 * `players` = giocatori app (per l'aggregazione via aggregatePlayerMatchStats);
 * i nomi nei roster senza id (storici mai collegati) diventano righe residue
 * con le sole stats derivabili dal punteggio (presenze/V/N/P, gol ignoti).
 */
export function computeSeasonRecap(players, matches, seasonId, now = Date.now()) {
  const bounds = seasonBounds(seasonId);
  if (!bounds) return null;
  const seasonMatches = (matches || [])
    .filter(m => m.status === 'finished')
    .filter(m => {
      const ms = getMs(m.date);
      return ms >= bounds.startMs && ms < bounds.endMs;
    })
    .sort((a, b) => getMs(a.date) - getMs(b.date));
  if (seasonMatches.length === 0) return null;

  // ── Totali ──────────────────────────────────────────────────────────────
  let totalGoals = 0, totalAutoGoals = 0;
  for (const m of seasonMatches) {
    totalGoals += (m.redScore ?? 0) + (m.blueScore ?? 0);
    totalAutoGoals += (m.events || []).filter(e => e.type === 'autogoal').length;
  }

  // ── Righe giocatore (source of truth: aggregatePlayerMatchStats) ────────
  const rows = [];
  const linkedIds = new Set();
  for (const p of players || []) {
    const s = aggregatePlayerMatchStats(p, seasonMatches);
    if (s.matches === 0) continue;
    linkedIds.add(p.id);
    rows.push({
      name: p.name,
      presenze: s.matches, gol: s.goals, autogol: s.autogoals, assist: s.assists,
      vinte: s.wins, nulle: s.draws, perse: s.losses,
    });
  }
  // Residui: nomi nei roster senza id app (storici non collegati)
  const residuals = new Map();
  for (const m of seasonMatches) {
    for (const [team, other] of [['redTeam', 'blue'], ['blueTeam', 'red']]) {
      for (const pl of m[team] || []) {
        if (pl.id) continue;
        const key = (pl.name || '').toUpperCase().trim();
        if (!key) continue;
        const r = residuals.get(key) || { name: pl.name, presenze: 0, gol: null, autogol: null, assist: null, vinte: 0, nulle: 0, perse: 0 };
        r.presenze++;
        const my = team === 'redTeam' ? (m.redScore ?? 0) : (m.blueScore ?? 0);
        const their = other === 'blue' ? (m.blueScore ?? 0) : (m.redScore ?? 0);
        if (my > their) r.vinte++; else if (my < their) r.perse++; else r.nulle++;
        residuals.set(key, r);
      }
    }
  }
  rows.push(...residuals.values());
  rows.sort((a, b) => (b.gol || 0) - (a.gol || 0));

  // ── Record ──────────────────────────────────────────────────────────────
  const records = {};
  const put = (key, entry, fmt) => { if (entry) records[key] = { name: entry.name, value: fmt ? fmt(entry.value) : entry.value }; };
  put('topScorer', topEntry(rows.filter(r => r.gol != null).map(r => ({ name: r.name, value: r.gol }))));
  put('assistman', topEntry(rows.filter(r => r.assist != null).map(r => ({ name: r.name, value: r.assist }))));
  put('mostPresent', topEntry(rows.map(r => ({ name: r.name, value: r.presenze }))));
  put('topWinner', topEntry(rows.map(r => ({ name: r.name, value: r.vinte }))));
  put('mostLosses', topEntry(rows.map(r => ({ name: r.name, value: r.perse }))));
  put('mostAutoGoals', topEntry(rows.filter(r => r.autogol != null).map(r => ({ name: r.name, value: r.autogol }))));

  // Partita più/meno prolifica
  let biggest = null, smallest = null;
  for (const m of seasonMatches) {
    const tot = (m.redScore ?? 0) + (m.blueScore ?? 0);
    const entry = { score: `${m.redScore ?? 0}-${m.blueScore ?? 0}`, totalGoals: tot, detail: fmtDate(getMs(m.date)) };
    if (!biggest || tot > biggest.totalGoals) biggest = entry;
    if (!smallest || tot < smallest.totalGoals) smallest = entry;
  }
  if (biggest) records.biggestMatch = biggest;
  if (smallest && seasonMatches.length > 1) records.smallestMatch = smallest;

  // Gol di squadra per mese + gol di un giocatore in una partita/in un mese
  const monthGoals = new Map();       // 'YYYY-MM' → gol totali
  const playerMonthGoals = new Map(); // 'name|YYYY-MM' → gol
  let bestMatchGoals = null;
  for (const m of seasonMatches) {
    const ms = getMs(m.date);
    const d = new Date(ms);
    const mk = `${d.getFullYear()}-${d.getMonth()}`;
    monthGoals.set(mk, (monthGoals.get(mk) || 0) + (m.redScore ?? 0) + (m.blueScore ?? 0));
    const perScorer = new Map();
    for (const ev of m.events || []) {
      if (ev.type !== 'goal' || !ev.scorerName) continue;
      perScorer.set(ev.scorerName, (perScorer.get(ev.scorerName) || 0) + 1);
      const pk = `${ev.scorerName}|${mk}`;
      playerMonthGoals.set(pk, (playerMonthGoals.get(pk) || 0) + 1);
    }
    for (const [name, n] of perScorer) {
      if (!bestMatchGoals || n > bestMatchGoals.value) bestMatchGoals = { name, value: n, detail: fmtDate(ms) };
    }
  }
  if (bestMatchGoals) records.bestMatchGoals = bestMatchGoals;
  let bestMonth = null;
  for (const [mk, gol] of monthGoals) {
    if (!bestMonth || gol > bestMonth.value) bestMonth = { name: MONTH_NAMES[Number(mk.split('-')[1])], value: gol };
  }
  if (bestMonth) records.bestMonth = bestMonth;
  let bestMonthGoals = null;
  for (const [pk, gol] of playerMonthGoals) {
    if (!bestMonthGoals || gol > bestMonthGoals.value) {
      const [name, mk] = pk.split('|');
      bestMonthGoals = { name, value: gol, detail: MONTH_NAMES[Number(mk.split('-')[1])].toLowerCase() };
    }
  }
  if (bestMonthGoals) records.bestMonthGoals = bestMonthGoals;

  // Strisce di vittorie/sconfitte consecutive (sulle partite GIOCATE dal
  // giocatore, in ordine cronologico: l'assenza non interrompe la striscia).
  const streaks = new Map(); // playerId → { name, win, loss, bestWin, bestLoss }
  for (const p of players || []) {
    if (linkedIds.has(p.id)) streaks.set(p.id, { name: p.name, win: 0, loss: 0, bestWin: 0, bestLoss: 0 });
  }
  for (const m of seasonMatches) {
    for (const [team, myScore, theirScore] of [
      ['redTeam', m.redScore ?? 0, m.blueScore ?? 0],
      ['blueTeam', m.blueScore ?? 0, m.redScore ?? 0],
    ]) {
      for (const pl of m[team] || []) {
        const st = pl.id && streaks.get(pl.id);
        if (!st) continue;
        if (myScore > theirScore) { st.win++; st.loss = 0; if (st.win > st.bestWin) st.bestWin = st.win; }
        else if (myScore < theirScore) { st.loss++; st.win = 0; if (st.loss > st.bestLoss) st.bestLoss = st.loss; }
        else { st.win = 0; st.loss = 0; }
      }
    }
  }
  put('bestWinStreak', topEntry([...streaks.values()].map(s => ({ name: s.name, value: s.bestWin })), { min: 2 }));
  put('bestLossStreak', topEntry([...streaks.values()].map(s => ({ name: s.name, value: s.bestLoss })), { min: 2 }));

  const inCorso = seasonId === seasonIdOf(now);
  return {
    id: seasonId,
    label: seasonLabelOf(seasonId),
    months: inCorso ? 'settembre – in corso' : 'settembre – agosto',
    totalMatches: seasonMatches.length,
    totalGoals,
    totalAutoGoals,
    totalPlayers: rows.length,
    inCorso,
    isLive: true,
    notes: 'Calcolata in tempo reale dalle partite registrate',
    records,
    players: rows,
  };
}
