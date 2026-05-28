import { getMs } from './dateUtils';

// Timestamp del 1° settembre della stagione calcistica corrente.
export function getSeasonStartMs(now = new Date()) {
  const year = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  return new Date(year, 8, 1).getTime();
}

// Classifica a punti (V×3 + P) da partite app, con tie-break su diff. reti e gol fatti.
// period: 'all' | 'season' | '30d'.
// Per l'all-time si escludono i doc storici (isHistorical) e si sommano invece le
// p.historicalStats (vinte/nulle/perse) → garantisce P == p.stats.matches, coerente
// con recalculatePlayerStats. GF/GS restano app-only (non disponibili nello storico).
export function computeStandings(players, finishedMatches, period, now = Date.now()) {
  const cutoff = period === '30d'
    ? now - 30 * 24 * 60 * 60 * 1000
    : period === 'season' ? getSeasonStartMs() : 0;
  const appMatches = (finishedMatches || []).filter(m => !m.isHistorical);
  const filtered = cutoff === 0 ? appMatches : appMatches.filter(m => getMs(m.date) >= cutoff);
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
