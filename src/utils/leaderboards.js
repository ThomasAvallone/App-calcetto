import { getMs } from './dateUtils';

// Timestamp del 1° settembre della stagione calcistica corrente.
export function getSeasonStartMs(now = new Date()) {
  const year = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  return new Date(year, 8, 1).getTime();
}

/** Inizio della finestra temporale di un periodo ('all' → 0 = nessun limite). */
export function periodCutoffMs(period, now = Date.now()) {
  if (period === '30d') return now - 30 * 24 * 60 * 60 * 1000;
  if (period === 'season') return getSeasonStartMs(new Date(now));
  return 0;
}

/**
 * Filtra le partite per periodo ('all' | 'season' | '30d').
 *
 * ⚠️ Filtra SOLO per data: le partite storiche (`isHistorical`) vanno CONTATE
 * in ogni vista per periodo. L'unica eccezione è l'all-time di
 * `computeStandings`, che al loro posto somma `p.historicalStats` per non
 * conteggiarle due volte. Escluderle altrove faceva divergere i numeri della
 * stessa stagione tra pagine diverse — usare questo helper per ogni nuova
 * vista per periodo, invece di re-implementare il filtro.
 */
export function filterByPeriod(matches, period, now = Date.now()) {
  const cutoff = periodCutoffMs(period, now);
  const list = matches || [];
  return cutoff === 0 ? list : list.filter(m => getMs(m.date) >= cutoff);
}

// Classifica a punti (V×3 + P) con tie-break su diff. reti e gol fatti.
// period: 'all' | 'season' | '30d'.
// ⚠️ I doc storici (isHistorical) si escludono SOLO nell'all-time, dove al loro
// posto si sommano le p.historicalStats (vinte/nulle/perse) → garantisce
// P == p.stats.matches, coerente con recalculatePlayerStats; lì GF/GS restano
// app-only (lo storico aggregato non ha i gol). Per season/30d quella
// compensazione non esiste, quindi le storiche vanno CONTATE: hanno punteggio e
// roster con id. Escluderle rendeva la classifica di stagione incoerente con
// tutto il resto dell'app — gli altri tab della stessa StatsPage
// (computeStatsFromMatches su una finestra filtrata solo per data), la scheda
// giocatore, la Dashboard e gli Annali — che le includono.
export function computeStandings(players, finishedMatches, period, now = Date.now()) {
  const base = period === 'all'
    ? (finishedMatches || []).filter(m => !m.isHistorical)
    : (finishedMatches || []);
  const filtered = filterByPeriod(base, period, now);
  return (players || [])
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
      if (period === 'all' && p.historicalStats) {
        v += p.historicalStats.wins || 0;
        x += p.historicalStats.draws || 0;
        s += p.historicalStats.losses || 0;
      }
      return { ...p, pt: v * 3 + x, p: v + x + s, v, x, s, gf, gs, dr: gf - gs };
    })
    .filter(row => row.p > 0)
    .sort((a, b) => b.pt - a.pt || b.dr - a.dr || b.gf - a.gf);
}

// Head-to-head tra due giocatori: rendimento da compagni vs da avversari, gol e
// cronologia degli scontri diretti (ordinata dal più recente per data reale).
export function computeH2HStats(finishedMatches, p1Id, p2Id, players) {
  if (!p1Id || !p2Id || p1Id === p2Id) return null;
  const p1name = (players || []).find(p => p.id === p1Id)?.name || '?';
  const p2name = (players || []).find(p => p.id === p2Id)?.name || '?';
  const together = { wins: 0, draws: 0, losses: 0, matches: 0, mutualAssists: 0 };
  const against = { p1wins: 0, p2wins: 0, draws: 0, matches: 0 };
  let p1Goals = 0, p2Goals = 0;
  const againstMatchList = [];
  for (const m of (finishedMatches || [])) {
    const p1InRed  = (m.redTeam  || []).some(p => p.id === p1Id);
    const p1InBlue = (m.blueTeam || []).some(p => p.id === p1Id);
    const p2InRed  = (m.redTeam  || []).some(p => p.id === p2Id);
    const p2InBlue = (m.blueTeam || []).some(p => p.id === p2Id);
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
      let p1g = 0, p2g = 0;
      for (const ev of (m.events || [])) {
        if (ev.type === 'goal') {
          if (ev.scorerId === p1Id) p1g++;
          if (ev.scorerId === p2Id) p2g++;
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
    // Assist reciproci (solo da compagni)
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
        if (pair.has(p1Id) && pair.has(p2Id)) together.mutualAssists++;
      }
    }
    for (const ev of (m.events || [])) {
      if (ev.type === 'goal') {
        if (ev.scorerId === p1Id) p1Goals++;
        if (ev.scorerId === p2Id) p2Goals++;
      }
    }
  }
  againstMatchList.sort((a, b) => getMs(b.date) - getMs(a.date));
  return { p1name, p2name, together, against, p1Goals, p2Goals, againstMatchList };
}

// Confronto storico tra due insiemi di giocatori (Squadra A vs Squadra B): conta
// solo le partite in cui A e B erano su lati opposti (≥1 giocatore ciascuno).
export function computeSquadreStats(finishedMatches, squadreA, squadreB) {
  if (!squadreA?.length || !squadreB?.length) return null;
  const setA = new Set(squadreA);
  const setB = new Set(squadreB);
  const matchResults = [];
  let aWins = 0, bWins = 0, draws = 0;
  for (const m of (finishedMatches || [])) {
    const redIds = (m.redTeam || []).map(p => p.id);
    const blueIds = (m.blueTeam || []).map(p => p.id);
    const aInRed  = redIds.filter(id => setA.has(id)).length;
    const aInBlue = blueIds.filter(id => setA.has(id)).length;
    const bInRed  = redIds.filter(id => setB.has(id)).length;
    const bInBlue = blueIds.filter(id => setB.has(id)).length;
    const aRedBBlue = aInRed  >= 1 && bInBlue >= 1;
    const aBlueBRed = aInBlue >= 1 && bInRed  >= 1;
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
    matchResults.push({ aScore, bScore, date: dateStr, dateMs: getMs(m.date), id: m.id });
  }
  // Ordina per data reale (millis): "GG/MM/AA" ordinata lessicograficamente darebbe
  // un ordine cronologico errato (es. 31/01 dopo 01/02).
  matchResults.sort((a, b) => b.dateMs - a.dateMs);
  return { aWins, bWins, draws, total: aWins + bWins + draws, matches: matchResults.slice(0, 20) };
}

// Classifica "miglior portiere": media gol subiti per turno crescente (più basso =
// meglio), min `minTurns` turni in porta. Tie-break: più clean sheet, poi più turni.
// Riceve i giocatori già con le stats di periodo (gkGoalsConceded, gkMatches, cleanSheets).
export function rankGoalkeepers(playersWithStats, minTurns = 6, topN = 10) {
  return (playersWithStats || [])
    .filter(p => (p.gkMatches || 0) >= minTurns)
    .sort((a, b) =>
      (a.gkGoalsConceded / a.gkMatches) - (b.gkGoalsConceded / b.gkMatches)
      || (b.cleanSheets ?? 0) - (a.cleanSheets ?? 0)
      || b.gkMatches - a.gkMatches)
    .slice(0, topN);
}

// Statistiche di coppia: per ogni coppia di compagni di squadra, W/D/L cumulativi.
// Ordina per win-rate (pareggio = mezzo punto), min `minMatches` partite insieme.
export function computeDuoStats(finishedMatches, minMatches = 10, topN = 10) {
  const pairs = {};
  for (const m of (finishedMatches || [])) {
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
    .filter(p => p.matches >= minMatches)
    .sort((a, b) => {
      const ra = (a.wins + a.draws * 0.5) / a.matches;
      const rb = (b.wins + b.draws * 0.5) / b.matches;
      return rb - ra;
    })
    .slice(0, topN);
}
