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

/** '2025-26' → '2025/2026'. Id non valido → la stringa grezza (mai 'NaN/NaN'). */
export function seasonLabelOf(seasonId) {
  const year = parseInt(String(seasonId).slice(0, 4), 10);
  return Number.isFinite(year) ? `${year}/${year + 1}` : String(seasonId ?? '');
}

/** True se `seasonId` è la stagione in corso alla data `now`. */
export function isSeasonInProgress(seasonId, now = Date.now()) {
  return !!seasonId && seasonId === seasonIdOf(now);
}

/**
 * Allinea il flag temporale di una stagione STATICA (HISTORICAL_SEASONS) alla
 * data corrente: `inCorso` lì è hardcoded e diventa stale al cambio stagione
 * (la 2025/26 resterebbe "In Corso" per sempre, anche nel 2027). Ritorna la
 * STESSA referenza quando non serve correggere, così i testi `months`
 * personalizzati delle vecchie stagioni ('aprile – agosto', 'set–ott 2020 +
 * apr–ago 2021') restano intatti.
 */
export function withSeasonProgressFlag(season, now = Date.now()) {
  if (!season) return season;
  const inCorso = isSeasonInProgress(season.id, now);
  if (!!season.inCorso === inCorso) return season;
  const out = { ...season, inCorso, months: inCorso ? 'settembre – in corso' : 'settembre – agosto' };
  // `notes` di una stagione dichiarata "in corso" resterebbe in contraddizione
  // col badge Conclusa ("Stagione in corso, dati aggiornati a febbraio 2026").
  if (!inCorso && /in corso/i.test(season.notes || '')) delete out.notes;
  return out;
}

/** Id (ordinati) delle stagioni con almeno una partita APP conclusa. */
export function listAppSeasonIds(matches) {
  const ids = new Set();
  for (const m of matches || []) {
    if (m?.status !== 'finished' || m.isHistorical) continue;
    const id = seasonIdOf(getMs(m.date));
    if (id) ids.add(id);
  }
  return [...ids].sort();
}

function fmtDate(ms) {
  const d = new Date(ms);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
}

// Unisce i pari merito come nelle stagioni storiche: 'Fede M. / Luciano'.
function joinNames(names) {
  return names.length > 3
    ? `${names.slice(0, 3).join(' / ')} +${names.length - 3}`
    : names.join(' / ');
}

// Valore massimo con TUTTI i pari merito (nomi e dettagli uniti, come nei dati
// storici: 'Dani / Salmi', 11, 'ottobre e aprile'). `entries` = [{name, value, detail?}].
function topEntry(entries, { min = 1 } = {}) {
  let best = null;
  for (const e of entries) {
    if (!(e.value >= min)) continue;
    if (!best || e.value > best.value) {
      best = { names: [e.name], value: e.value, details: e.detail ? [e.detail] : [] };
    } else if (e.value === best.value) {
      if (!best.names.includes(e.name)) best.names.push(e.name);
      if (e.detail && !best.details.includes(e.detail)) best.details.push(e.detail);
    }
  }
  if (!best) return null;
  const out = { name: joinNames(best.names), value: best.value };
  if (best.details.length) out.detail = best.details.slice(0, 3).join(' e ');
  return out;
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
    .filter(m => m?.status === 'finished')
    .filter(m => {
      const ms = getMs(m.date);
      return ms >= bounds.startMs && ms < bounds.endMs;
    })
    .sort((a, b) => getMs(a.date) - getMs(b.date));
  if (seasonMatches.length === 0) return null;

  // ── Totali ──────────────────────────────────────────────────────────────
  // totalGoals viene dal punteggio delle partite (per le storiche importate è
  // il dato dell'Excel, autorevole); eventGoals conta i gol che hanno davvero
  // un marcatore. La differenza sono gol senza attribuzione — succede quando
  // un nome storico non è collegato a nessun giocatore e l'import ha scartato
  // l'evento. Esporla evita che la classifica sembri "non tornare".
  let totalGoals = 0, totalAutoGoals = 0, eventGoals = 0;
  for (const m of seasonMatches) {
    totalGoals += (m.redScore ?? 0) + (m.blueScore ?? 0);
    for (const ev of m.events || []) {
      if (ev.type === 'autogoal') { totalAutoGoals++; eventGoals++; }
      else if (ev.type === 'goal') eventGoals++;
    }
  }
  const unattributedGoals = Math.max(0, totalGoals - eventGoals);

  // ── Righe giocatore (source of truth: aggregatePlayerMatchStats) ────────
  const rows = [];
  const rowById = new Map();
  const addRow = (p) => {
    const s = aggregatePlayerMatchStats(p, seasonMatches);
    if (s.matches === 0) return;
    const row = {
      name: p.name,
      presenze: s.matches, gol: s.goals, autogol: s.autogoals, assist: s.assists,
      vinte: s.wins, nulle: s.draws, perse: s.losses,
    };
    rows.push(row);
    rowById.set(p.id, row);
  };
  for (const p of players || []) addRow(p);

  // Giocatori ELIMINATI dall'app: i loro roster hanno ancora un id, quindi non
  // rientrano nei residui per-nome, ma non esistono più in `players` — senza
  // questo passaggio sparirebbero dal riepilogo pur avendo giocato (e i loro
  // gol resterebbero nel totale, facendo "non tornare" la classifica).
  // Si aggregano dallo stesso motore con un player sintetico {id, name}: gli
  // assist storici non sono prorabili (manca historicalNames) ma gol,
  // presenze e V/N/P sono completi.
  const knownIds = new Set((players || []).filter(p => p?.id).map(p => p.id));
  const ghosts = new Map();
  for (const m of seasonMatches) {
    for (const pl of [...(m.redTeam || []), ...(m.blueTeam || [])]) {
      if (!pl?.id || knownIds.has(pl.id) || ghosts.has(pl.id)) continue;
      ghosts.set(pl.id, { id: pl.id, name: pl.name || '?' });
    }
  }
  for (const g of ghosts.values()) addRow(g);

  // Residui: nomi nei roster SENZA id (storici non collegati dall'import).
  // ⚠️ Riconciliazione: lo stesso giocatore può comparire risolto (con id) in
  // alcune partite e come nudo nome in altre — se una sola variante del nome è
  // fra i suoi historicalNames. Senza il match per nome si creerebbero DUE
  // righe per la stessa persona (presenze spezzate, totalPlayers gonfiato e
  // "più presente" sbagliato): le presenze non risolte vengono quindi sommate
  // alla riga del giocatore collegato. I suoi gol restano quelli degli eventi
  // con id — lo scarto è già dichiarato da unattributedGoals.
  const playerIdByName = new Map();
  for (const p of players || []) {
    if (!p?.id) continue;
    for (const n of [p.name, ...(p.historicalNames || [])]) {
      const k = String(n || '').toUpperCase().trim();
      if (k && !playerIdByName.has(k)) playerIdByName.set(k, p.id);
    }
  }
  const residuals = new Map();
  for (const m of seasonMatches) {
    for (const [team, other] of [['redTeam', 'blue'], ['blueTeam', 'red']]) {
      for (const pl of m[team] || []) {
        if (pl.id) continue;
        const key = (pl.name || '').toUpperCase().trim();
        if (!key) continue;
        const my = team === 'redTeam' ? (m.redScore ?? 0) : (m.blueScore ?? 0);
        const their = other === 'blue' ? (m.blueScore ?? 0) : (m.redScore ?? 0);
        const linkedRow = rowById.get(playerIdByName.get(key));
        const r = linkedRow
          || residuals.get(key)
          || { name: pl.name, presenze: 0, gol: null, autogol: null, assist: null, vinte: 0, nulle: 0, perse: 0 };
        r.presenze++;
        if (my > their) r.vinte++; else if (my < their) r.perse++; else r.nulle++;
        if (!linkedRow) residuals.set(key, r);
      }
    }
  }
  rows.push(...residuals.values());
  rows.sort((a, b) => (b.gol || 0) - (a.gol || 0));

  // ── Record ──────────────────────────────────────────────────────────────
  const records = {};
  // Conserva `detail` quando presente: è il dettaglio mostrato nei record
  // storici ('17 settembre 2024', 'ottobre e aprile').
  const put = (key, entry) => {
    if (!entry) return;
    records[key] = entry.detail
      ? { name: entry.name, value: entry.value, detail: entry.detail }
      : { name: entry.name, value: entry.value };
  };
  put('topScorer', topEntry(rows.filter(r => r.gol != null).map(r => ({ name: r.name, value: r.gol }))));
  put('assistman', topEntry(rows.filter(r => r.assist != null).map(r => ({ name: r.name, value: r.assist }))));
  put('mostPresent', topEntry(rows.map(r => ({ name: r.name, value: r.presenze }))));
  put('topWinner', topEntry(rows.map(r => ({ name: r.name, value: r.vinte }))));
  put('mostLosses', topEntry(rows.map(r => ({ name: r.name, value: r.perse }))));
  put('mostAutoGoals', topEntry(rows.filter(r => r.autogol != null).map(r => ({ name: r.name, value: r.autogol }))));

  // Partita più/meno prolifica — pari merito uniti come nei dati storici
  // ('2-2 / 1-3', 4, '14/1 e 17/6'). topEntry lavora sul massimo, quindi per la
  // meno prolifica si massimizza il valore negato e si rimette il segno.
  const matchEntries = seasonMatches.map(m => ({
    name: `${m.redScore ?? 0}-${m.blueScore ?? 0}`,
    value: (m.redScore ?? 0) + (m.blueScore ?? 0),
    detail: fmtDate(getMs(m.date)),
  }));
  const biggest = topEntry(matchEntries, { min: 0 });
  if (biggest) records.biggestMatch = { score: biggest.name, totalGoals: biggest.value, detail: biggest.detail };
  if (seasonMatches.length > 1) {
    const inv = topEntry(matchEntries.map(e => ({ ...e, value: -e.value })), { min: -Infinity });
    if (inv && -inv.value !== biggest?.value) {
      records.smallestMatch = { score: inv.name, totalGoals: -inv.value, detail: inv.detail };
    }
  }

  // Gol di squadra per mese + gol di un giocatore in una partita/in un mese.
  // La chiave è lo scorerId (stabile ai rename: gli eventi vecchi conservano il
  // vecchio scorerName e altrimenti si spezzerebbero su due chiavi); il nome
  // mostrato si risolve come nel resto dell'app — scorerName || roster/players —
  // perché gli eventi importati dallo storico possono non avere scorerName
  // (vedi reportService.js, MatchDetailPage.jsx, geminiService.js).
  const nameById = new Map((players || []).filter(p => p?.id).map(p => [p.id, p.name]));
  const monthGoals = new Map();       // 'YYYY-M' → gol totali
  const playerMonthGoals = new Map(); // 'key|YYYY-M' → { name, n }
  const matchGoalEntries = [];        // [{name, value, detail}] per i pari merito
  for (const m of seasonMatches) {
    const ms = getMs(m.date);
    const d = new Date(ms);
    const mk = `${d.getFullYear()}-${d.getMonth()}`;
    monthGoals.set(mk, (monthGoals.get(mk) || 0) + (m.redScore ?? 0) + (m.blueScore ?? 0));
    const rosterNames = new Map();
    for (const pl of [...(m.redTeam || []), ...(m.blueTeam || [])]) {
      if (pl?.id) rosterNames.set(pl.id, pl.name);
    }
    const perScorer = new Map(); // key → { name, n }
    for (const ev of m.events || []) {
      if (ev.type !== 'goal') continue;
      const key = ev.scorerId || (ev.scorerName ? `n:${ev.scorerName}` : null);
      if (!key) continue;
      const name = nameById.get(ev.scorerId) || rosterNames.get(ev.scorerId) || ev.scorerName || '?';
      const cur = perScorer.get(key) || { name, n: 0 };
      cur.n++; cur.name = name;
      perScorer.set(key, cur);
      const pk = `${key}|${mk}`;
      const pm = playerMonthGoals.get(pk) || { name, n: 0 };
      pm.n++; pm.name = name;
      playerMonthGoals.set(pk, pm);
    }
    for (const { name, n } of perScorer.values()) {
      matchGoalEntries.push({ name, value: n, detail: fmtDate(ms) });
    }
  }
  // min 2: un solo gol non è un record da esibire
  put('bestMatchGoals', topEntry(matchGoalEntries, { min: 2 }));
  // lastIndexOf: la chiave è 'scorerId|YYYY-M', ma il fallback per nome
  // ('n:Mario|2026-0') potrebbe contenere altri separatori.
  const monthOf = (key) => MONTH_NAMES[Number(key.slice(key.lastIndexOf('-') + 1))];
  put('bestMonth', topEntry([...monthGoals].map(([mk, gol]) => ({ name: monthOf(mk), value: gol }))));
  put('bestMonthGoals', topEntry([...playerMonthGoals].map(([pk, { name, n }]) => ({
    name, value: n, detail: monthOf(pk.slice(pk.lastIndexOf('|') + 1)).toLowerCase(),
  })), { min: 2 }));

  // Strisce di vittorie/sconfitte consecutive (sulle partite GIOCATE dal
  // giocatore, in ordine cronologico: l'assenza non interrompe la striscia).
  // Copre TUTTI i giocatori con una riga (compresi i "ghost", cioè gli
  // eliminati dall'app): altrimenti una striscia record sparirebbe pur avendo
  // le presenze mostrate in classifica.
  const streaks = new Map(); // playerId → { name, win, loss, bestWin, bestLoss }
  for (const [id, row] of rowById) {
    streaks.set(id, { name: row.name, win: 0, loss: 0, bestWin: 0, bestLoss: 0 });
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

  const inCorso = isSeasonInProgress(seasonId, now);
  return {
    id: seasonId,
    label: seasonLabelOf(seasonId),
    months: inCorso ? 'settembre – in corso' : 'settembre – agosto',
    totalMatches: seasonMatches.length,
    totalGoals,
    totalAutoGoals,
    unattributedGoals,
    totalPlayers: rows.length,
    inCorso,
    isLive: true,
    notes: 'Calcolata in tempo reale dalle partite registrate',
    records,
    players: rows,
  };
}
