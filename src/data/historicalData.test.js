import { describe, it, expect } from 'vitest';
import {
  HISTORICAL_SEASONS,
  getAllHistoricalNames,
  computeCumulativeStats,
  suggestHistoricalNames,
  getCurrentRosterPlayers,
  getUnlinkedNames,
} from './historicalData';
import { HISTORICAL_MATCHES } from './historicalMatches';

describe('computeCumulativeStats', () => {
  it('somma le statistiche di un nome su tutte le stagioni', () => {
    // JUAN: 2019-20 (1g,1G,1P) + 2020-21 (3g,3G,3A,1V,2P) + 2022-23 (1g,2G,1P)
    expect(computeCumulativeStats(['JUAN'])).toEqual({
      goals: 6, assists: 3, autogoals: 0, wins: 1, losses: 4, draws: 0, matches: 5,
    });
  });

  it('è case-insensitive sui nomi', () => {
    expect(computeCumulativeStats(['juan'])).toEqual(computeCumulativeStats(['JUAN']));
  });

  it('NON raddoppia quando lo stesso nome è passato due volte', () => {
    expect(computeCumulativeStats(['JUAN', 'JUAN'])).toEqual(computeCumulativeStats(['JUAN']));
  });

  it('ritorna tutti zeri per un nome inesistente', () => {
    expect(computeCumulativeStats(['NOME_CHE_NON_ESISTE'])).toEqual({
      goals: 0, assists: 0, autogoals: 0, wins: 0, losses: 0, draws: 0, matches: 0,
    });
  });

  it('ritorna tutti zeri per array vuoto', () => {
    expect(computeCumulativeStats([])).toEqual({
      goals: 0, assists: 0, autogoals: 0, wins: 0, losses: 0, draws: 0, matches: 0,
    });
  });

  it('somma più alias diversi (es. due persone collegate)', () => {
    const juan = computeCumulativeStats(['JUAN']);
    const combined = computeCumulativeStats(['JUAN', 'PISCO']);
    const pisco = computeCumulativeStats(['PISCO']);
    expect(combined.matches).toBe(juan.matches + pisco.matches);
    expect(combined.goals).toBe(juan.goals + pisco.goals);
  });

  it('gli assist null della stagione 2018/19 non rompono la somma (NaN)', () => {
    // MARCELLO gioca nel 2018/19 (assist: null). Il totale assist deve restare finito.
    const r = computeCumulativeStats(['MARCELLO']);
    expect(Number.isFinite(r.assists)).toBe(true);
    expect(r.assists).toBeGreaterThanOrEqual(0);
  });
});

describe('getAllHistoricalNames', () => {
  it('ritorna nomi unici ordinati alfabeticamente', () => {
    const names = getAllHistoricalNames();
    expect(names.length).toBe(new Set(names).size); // unicità
    const sorted = [...names].sort();
    expect(names).toEqual(sorted);
  });
});

describe('suggestHistoricalNames', () => {
  it('ritorna [] per nome vuoto o whitespace (no falsi suggerimenti all\'80%)', () => {
    expect(suggestHistoricalNames('')).toEqual([]);
    expect(suggestHistoricalNames('   ')).toEqual([]);
    expect(suggestHistoricalNames(null)).toEqual([]);
    expect(suggestHistoricalNames(undefined)).toEqual([]);
  });

  it('match esatto ha lo score massimo (100)', () => {
    const res = suggestHistoricalNames('DANI');
    expect(res[0].name).toBe('DANI');
    expect(res[0].score).toBe(100);
  });

  it('esclude i nomi già collegati', () => {
    const res = suggestHistoricalNames('DANI', ['DANI']);
    expect(res.some(r => r.name === 'DANI')).toBe(false);
  });

  it('risultati ordinati per score decrescente', () => {
    const res = suggestHistoricalNames('THOM');
    for (let i = 1; i < res.length; i++) {
      expect(res[i - 1].score).toBeGreaterThanOrEqual(res[i].score);
    }
    expect(res.some(r => r.name === 'THOMAS')).toBe(true);
  });
});

describe('getCurrentRosterPlayers', () => {
  it('include solo giocatori con >= 5 presenze totali (ultime 3 stagioni)', () => {
    const roster = getCurrentRosterPlayers();
    expect(roster.every(p => p.totalPresenze >= 5)).toBe(true);
  });

  it('ordina per presenze totali decrescenti', () => {
    const roster = getCurrentRosterPlayers();
    for (let i = 1; i < roster.length; i++) {
      expect(roster[i - 1].totalPresenze).toBeGreaterThanOrEqual(roster[i].totalPresenze);
    }
  });

  it('aggrega le presenze dello stesso nome su più stagioni recenti', () => {
    // DANI: 2023-24 (44) + 2024-25 (38) + 2025-26 (16) = 98
    const dani = getCurrentRosterPlayers().find(p => p.displayName === 'Dani');
    expect(dani).toBeTruthy();
    expect(dani.totalPresenze).toBe(98);
    expect(dani.historicalNames).toEqual(['DANI']);
  });
});

describe('getUnlinkedNames', () => {
  it('esclude i nomi già collegati ai giocatori (case-insensitive)', () => {
    const unlinked = getUnlinkedNames([{ historicalNames: ['dani', 'THOMAS'] }]);
    expect(unlinked).not.toContain('DANI');
    expect(unlinked).not.toContain('THOMAS');
    expect(unlinked.length).toBeLessThan(getAllHistoricalNames().length);
  });

  it('gestisce giocatori senza historicalNames', () => {
    const unlinked = getUnlinkedNames([{ name: 'X' }, {}]);
    expect(unlinked).toEqual(getAllHistoricalNames());
  });
});

describe('integrità dati storici (regression guard)', () => {
  it('nessuna stagione ha nomi duplicati', () => {
    for (const s of HISTORICAL_SEASONS) {
      const names = s.players.map(p => p.name.toUpperCase().trim());
      expect(new Set(names).size, `stagione ${s.id}`).toBe(names.length);
    }
  });

  it('ogni giocatore ha campi numerici non negativi', () => {
    for (const s of HISTORICAL_SEASONS) {
      for (const p of s.players) {
        for (const f of ['presenze', 'gol', 'autogol', 'vinte', 'nulle', 'perse']) {
          expect(typeof p[f], `${s.id}/${p.name}/${f}`).toBe('number');
          expect(p[f], `${s.id}/${p.name}/${f}`).toBeGreaterThanOrEqual(0);
        }
        // assist può essere null (2018/19) ma se presente è un numero >= 0
        if (p.assist !== null) expect(p.assist).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('ogni stagione ha id univoco e campi base', () => {
    const ids = HISTORICAL_SEASONS.map(s => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of HISTORICAL_SEASONS) {
      expect(typeof s.label).toBe('string');
      expect(Array.isArray(s.players)).toBe(true);
      expect(s.players.length).toBeGreaterThan(0);
    }
  });

  it('totalPlayers coincide con il numero di giocatori in elenco', () => {
    for (const s of HISTORICAL_SEASONS) {
      expect(s.players.length, `stagione ${s.id}`).toBe(s.totalPlayers);
    }
  });

  it('per ogni giocatore vinte + nulle + perse === presenze', () => {
    for (const s of HISTORICAL_SEASONS) {
      for (const p of s.players) {
        const sum = (p.vinte || 0) + (p.nulle || 0) + (p.perse || 0);
        expect(sum, `${s.id}/${p.name}`).toBe(p.presenze || 0);
      }
    }
  });
});

describe('HISTORICAL_MATCHES — copertura per stagione', () => {
  const seasonOf = (dateStr) => {
    const d = new Date(dateStr + 'T12:00:00');
    const y = d.getMonth() >= 8 ? d.getFullYear() : d.getFullYear() - 1;
    return `${y}-${String(y + 1).slice(2)}`;
  };

  const countsBySeason = () => {
    const c = {};
    for (const m of HISTORICAL_MATCHES) c[seasonOf(m.date)] = (c[seasonOf(m.date)] || 0) + 1;
    return c;
  };

  it('nessuna stagione ha PIÙ partite di quante ne dichiari (niente doppi conteggi)', () => {
    const counts = countsBySeason();
    for (const s of HISTORICAL_SEASONS) {
      expect(counts[s.id] ?? 0, `stagione ${s.id}`).toBeLessThanOrEqual(s.totalMatches);
    }
  });

  it('le partite mancanti sono solo quelle note delle prime due stagioni', () => {
    // ⚠️ STATO NOTO del dataset, non un bug del codice: le due stagioni più
    // vecchie sono state ricostruite in modo incompleto — mancano 1 partita
    // (2018-19) e 2 (2019-20) rispetto ai totali dichiarati. Dal 2020-21 in poi
    // i dati combaciano esattamente.
    // Conseguenza pratica: per quelle due stagioni il calcolo dal vivo sarebbe
    // più povero del dato dichiarato — ed è il motivo per cui StagioniPage
    // mostra la entry statica quando è più completa (vedi il commento lì).
    const counts = countsBySeason();
    const gaps = {};
    for (const s of HISTORICAL_SEASONS) {
      const d = s.totalMatches - (counts[s.id] ?? 0);
      if (d !== 0) gaps[s.id] = d;
    }
    expect(gaps).toEqual({ '2018-19': 1, '2019-20': 2 });
  });

  it('due partite hanno un anno palesemente sbagliato e restano fuori da ogni stagione', () => {
    // Le partite 18 e 20 sono datate agosto 2018 pur trovandosi fra la 17
    // (9 ago 2019) e la 19 (23 ago 2019): quasi certamente un refuso per il
    // 2019. Cadono in una stagione "2017-18" che negli annali non esiste, così
    // contano nelle statistiche all-time ma in nessun riepilogo di stagione.
    // Non si correggono d'ufficio: spostarle in agosto 2019 porterebbe la
    // 2018-19 a 21 partite contro le 20 dichiarate, quindi la fonte originale
    // va ricontrollata prima di toccare qualcosa. Questo test blocca il numero
    // di orfane a 2: se cambia, deve essere una scelta consapevole.
    const declared = new Set(HISTORICAL_SEASONS.map(s => s.id));
    const orphans = HISTORICAL_MATCHES.filter(m => !declared.has(seasonOf(m.date)));
    expect(orphans.map(m => m.date).sort()).toEqual(['2018-08-16', '2018-08-28']);
  });
});
