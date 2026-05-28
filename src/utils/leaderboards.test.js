import { describe, it, expect } from 'vitest';
import { computeStandings, computeDuoStats, getSeasonStartMs, computeH2HStats, computeSquadreStats } from './leaderboards';

const players = [
  { id: 'a', name: 'A' },
  { id: 'b', name: 'B' },
  { id: 'c', name: 'C' },
];

// helper partita app
const M = (over) => ({
  status: 'finished', isHistorical: false,
  redTeam: [{ id: 'a' }], blueTeam: [{ id: 'b' }],
  redScore: 0, blueScore: 0, date: '2026-01-01T00:00:00Z', ...over,
});

describe('getSeasonStartMs', () => {
  it('settembre→dicembre: stagione inizia il 1 set dello stesso anno', () => {
    const oct = new Date(2025, 9, 15); // ottobre 2025
    expect(getSeasonStartMs(oct)).toBe(new Date(2025, 8, 1).getTime());
  });
  it('gennaio→agosto: stagione inizia il 1 set dell\'anno precedente', () => {
    const feb = new Date(2026, 1, 10); // febbraio 2026
    expect(getSeasonStartMs(feb)).toBe(new Date(2025, 8, 1).getTime());
  });
});

describe('computeStandings', () => {
  it('assegna 3 punti a vittoria, 1 a pareggio, tie-break su diff reti', () => {
    const matches = [
      M({ redScore: 3, blueScore: 1 }), // a batte b
      M({ redScore: 2, blueScore: 2 }), // pareggio
    ];
    const table = computeStandings(players, matches, 'all');
    const a = table.find(r => r.id === 'a');
    const b = table.find(r => r.id === 'b');
    expect(a).toMatchObject({ v: 1, x: 1, s: 0, pt: 4, gf: 5, gs: 3, dr: 2, p: 2 });
    expect(b).toMatchObject({ v: 0, x: 1, s: 1, pt: 1, gf: 3, gs: 5, dr: -2, p: 2 });
    // a davanti a b
    expect(table[0].id).toBe('a');
  });

  it('esclude i giocatori senza partite (p === 0)', () => {
    const table = computeStandings(players, [M({ redScore: 1, blueScore: 0 })], 'all');
    expect(table.some(r => r.id === 'c')).toBe(false); // C non ha giocato
  });

  it('all-time somma p.historicalStats e preserva l\'invariante P = V+N+P', () => {
    const withHist = [{ id: 'a', name: 'A', historicalStats: { wins: 5, draws: 2, losses: 3 } }];
    const table = computeStandings(withHist, [M({ redScore: 2, blueScore: 0 })], 'all');
    const a = table[0];
    // app: 1V; storico: 5V 2N 3S → 6V 2N 3S, P = 11
    expect(a).toMatchObject({ v: 6, x: 2, s: 3, p: 11, pt: 6 * 3 + 2 });
  });

  it('NON somma lo storico per i periodi season/30d', () => {
    const withHist = [{ id: 'a', name: 'A', historicalStats: { wins: 5, draws: 0, losses: 0 } }];
    const recent = M({ redScore: 1, blueScore: 0, date: new Date().toISOString() });
    const table = computeStandings(withHist, [recent], 'season');
    expect(table[0].v).toBe(1); // solo la vittoria recente, niente storico
  });

  it('esclude i doc storici (isHistorical) anche nell\'all-time', () => {
    const matches = [M({ isHistorical: true, redScore: 9, blueScore: 0 })];
    const table = computeStandings(players, matches, 'all');
    expect(table).toEqual([]); // l'unica partita è storica → nessuna riga app
  });

  it('30d filtra le partite più vecchie del cutoff', () => {
    const now = Date.parse('2026-02-01T00:00:00Z');
    const old = M({ date: '2025-01-01T00:00:00Z', redScore: 1, blueScore: 0 });
    const fresh = M({ date: '2026-01-20T00:00:00Z', redScore: 1, blueScore: 0 });
    const table = computeStandings(players, [old, fresh], '30d', now);
    expect(table.find(r => r.id === 'a').p).toBe(1); // solo fresh
  });
});

describe('computeDuoStats', () => {
  const team = (ids) => ids.map(id => ({ id, name: id.toUpperCase() }));

  it('aggrega W/D/L per coppia di compagni e applica min partite', () => {
    // a+b insieme nei rossi, vincono 10 volte
    const matches = Array.from({ length: 10 }, () =>
      M({ redTeam: team(['a', 'b']), redScore: 3, blueScore: 1 })
    );
    const duos = computeDuoStats(matches);
    expect(duos).toHaveLength(1);
    expect(duos[0]).toMatchObject({ wins: 10, draws: 0, losses: 0, matches: 10 });
  });

  it('scarta le coppie sotto la soglia di partite', () => {
    const matches = Array.from({ length: 9 }, () =>
      M({ redTeam: team(['a', 'b']), redScore: 1, blueScore: 0 })
    );
    expect(computeDuoStats(matches)).toEqual([]); // 9 < 10
  });

  it('la chiave coppia è indipendente dall\'ordine dei giocatori', () => {
    const matches = [
      ...Array.from({ length: 5 }, () => M({ redTeam: team(['a', 'b']), redScore: 1, blueScore: 0 })),
      ...Array.from({ length: 5 }, () => M({ redTeam: team(['b', 'a']), redScore: 0, blueScore: 1 })),
    ];
    const duos = computeDuoStats(matches, 10);
    // tutte e 10 nella stessa coppia: 5 vittorie + 5 sconfitte
    expect(duos).toHaveLength(1);
    expect(duos[0]).toMatchObject({ matches: 10, wins: 5, losses: 5 });
  });

  it('soglia e topN parametrizzabili', () => {
    const matches = Array.from({ length: 2 }, () => M({ redTeam: team(['a', 'b']) }));
    expect(computeDuoStats(matches, 2, 10)).toHaveLength(1);
  });
});

describe('computeH2HStats', () => {
  const team = (ids) => ids.map(id => ({ id, name: id.toUpperCase() }));
  const pl = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }];

  it('ritorna null per selezione incompleta o stesso giocatore', () => {
    expect(computeH2HStats([], '', 'b', pl)).toBeNull();
    expect(computeH2HStats([], 'a', 'a', pl)).toBeNull();
  });

  it('distingue partite da compagni e da avversari', () => {
    const insieme = M({ redTeam: team(['a', 'b']), blueTeam: team(['c']), redScore: 2, blueScore: 1 });
    const contro  = M({ redTeam: team(['a']), blueTeam: team(['b']), redScore: 3, blueScore: 0 });
    const r = computeH2HStats([insieme, contro], 'a', 'b', pl);
    expect(r.together).toMatchObject({ matches: 1, wins: 1 });
    expect(r.against).toMatchObject({ matches: 1, p1wins: 1, p2wins: 0 });
  });

  it('conta gli assist reciproci solo da compagni', () => {
    const m = M({
      redTeam: team(['a', 'b']), blueTeam: team(['c']),
      events: [{ type: 'goal', scorerId: 'a', assistId: 'b' }],
    });
    expect(computeH2HStats([m], 'a', 'b', pl).together.mutualAssists).toBe(1);
  });

  it('cronologia scontri ordinata dal più recente (data reale, non stringa)', () => {
    const vecchia = M({ id: 'v', redTeam: team(['a']), blueTeam: team(['b']), date: '2025-12-31T00:00:00Z' });
    const nuova   = M({ id: 'n', redTeam: team(['a']), blueTeam: team(['b']), date: '2026-01-02T00:00:00Z' });
    const r = computeH2HStats([vecchia, nuova], 'a', 'b', pl);
    expect(r.againstMatchList.map(x => x.date)).toEqual(['2026-01-02T00:00:00Z', '2025-12-31T00:00:00Z']);
  });
});

describe('computeSquadreStats', () => {
  const team = (ids) => ids.map(id => ({ id, name: id.toUpperCase() }));

  it('null se una delle due squadre è vuota', () => {
    expect(computeSquadreStats([], ['a'], [])).toBeNull();
    expect(computeSquadreStats([], [], ['b'])).toBeNull();
  });

  it('conta solo le partite con A e B su lati opposti', () => {
    const opposte = M({ redTeam: team(['a']), blueTeam: team(['b']), redScore: 2, blueScore: 1 });
    const stessoLato = M({ redTeam: team(['a', 'b']), blueTeam: team(['c']) });
    const r = computeSquadreStats([opposte, stessoLato], ['a'], ['b']);
    expect(r.total).toBe(1);
    expect(r.aWins).toBe(1);
  });

  it('cronologia ordinata per data reale (non lessicografica sulla stringa GG/MM/AA)', () => {
    // 31/01 è PIÙ VECCHIA di 02/02 ma "31/01" > "02/02" come stringa: il sort
    // corretto (per millis) deve mettere la più recente per prima.
    const gen31 = M({ id: 'g', redTeam: team(['a']), blueTeam: team(['b']), date: '2026-01-31T00:00:00Z' });
    const feb02 = M({ id: 'f', redTeam: team(['a']), blueTeam: team(['b']), date: '2026-02-02T00:00:00Z' });
    const r = computeSquadreStats([gen31, feb02], ['a'], ['b']);
    expect(r.matches[0].id).toBe('f'); // 02/02 prima di 31/01
    expect(r.matches[1].id).toBe('g');
  });
});
