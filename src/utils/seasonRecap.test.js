import { describe, it, expect } from 'vitest';
import { seasonIdOf, seasonBounds, seasonLabelOf, listAppSeasonIds, computeSeasonRecap } from './seasonRecap';
import { buildSeasonCSV } from './dataExport';

const D = (y, m, d) => new Date(y, m, d, 21, 0).getTime();

const players = [
  { id: 'p1', name: 'Marco' },
  { id: 'p2', name: 'Luca' },
  { id: 'p3', name: 'Gianni' },
  { id: 'p4', name: 'Dani' },
];

const goal = (scorer, extra = {}) => ({
  type: 'goal',
  scorerId: scorer.id, scorerName: scorer.name,
  ...extra,
});

// Partita app minimale: p1+p2 (rossi) vs p3+p4 (blu)
function appMatch({ date, red = 0, blue = 0, events = [], over = {} }) {
  return {
    status: 'finished', date,
    redTeam: [players[0], players[1]],
    blueTeam: [players[2], players[3]],
    redScore: red, blueScore: blue, events,
    ...over,
  };
}

describe('seasonIdOf / seasonBounds / seasonLabelOf', () => {
  it('la stagione va dal 1° settembre al 31 agosto', () => {
    expect(seasonIdOf(D(2025, 8, 1))).toBe('2025-26');   // 1 set 2025
    expect(seasonIdOf(D(2026, 7, 31))).toBe('2025-26');  // 31 ago 2026
    expect(seasonIdOf(D(2026, 8, 1))).toBe('2026-27');   // 1 set 2026
    expect(seasonIdOf(NaN)).toBe(null);
  });

  it('bounds coerenti con seasonIdOf', () => {
    const b = seasonBounds('2025-26');
    expect(seasonIdOf(b.startMs)).toBe('2025-26');
    expect(seasonIdOf(b.endMs - 1)).toBe('2025-26');
    expect(seasonIdOf(b.endMs)).toBe('2026-27');
    expect(seasonBounds('boh')).toBe(null);
  });

  it('label 2025-26 → 2025/2026', () => {
    expect(seasonLabelOf('2025-26')).toBe('2025/2026');
  });
});

describe('listAppSeasonIds', () => {
  it('solo stagioni con partite app concluse (no storiche, no attive)', () => {
    const ms = [
      appMatch({ date: D(2026, 2, 10) }),                                  // 2025-26 app
      appMatch({ date: D(2025, 10, 5), over: { isHistorical: true } }),    // storica: esclusa
      appMatch({ date: D(2026, 8, 15) }),                                  // 2026-27 app
      appMatch({ date: D(2026, 3, 1), over: { status: 'active' } }),       // attiva: esclusa
    ];
    expect(listAppSeasonIds(ms)).toEqual(['2025-26', '2026-27']);
  });
});

describe('computeSeasonRecap — totali e righe giocatore', () => {
  const matches = [
    // parte "storica" della stagione (doc importati, stessi id giocatore)
    appMatch({
      date: D(2025, 9, 7), red: 2, blue: 1, over: { isHistorical: true },
      events: [goal(players[0]), goal(players[0]), goal(players[2])],
    }),
    // parte app
    appMatch({
      date: D(2026, 3, 14), red: 1, blue: 3,
      events: [goal(players[0]), goal(players[3]), goal(players[3]), goal(players[2], { assistId: 'p4', assistName: 'Dani' })],
    }),
    // fuori stagione: ignorata
    appMatch({ date: D(2026, 8, 20), red: 9, blue: 9 }),
  ];

  it('somma storica + app della stessa stagione, ignora le altre', () => {
    const r = computeSeasonRecap(players, matches, '2025-26', D(2026, 9, 10));
    expect(r.totalMatches).toBe(2);
    expect(r.totalGoals).toBe(7);
    expect(r.totalPlayers).toBe(4);
    expect(r.inCorso).toBe(false);
    expect(r.months).toBe('settembre – agosto');
  });

  it('righe giocatore da aggregatePlayerMatchStats (gol/assist/V-N-P)', () => {
    const r = computeSeasonRecap(players, matches, '2025-26', D(2026, 9, 10));
    const marco = r.players.find(p => p.name === 'Marco');
    expect(marco).toMatchObject({ presenze: 2, gol: 3, vinte: 1, perse: 1, nulle: 0 });
    const dani = r.players.find(p => p.name === 'Dani');
    expect(dani).toMatchObject({ gol: 2, assist: 1, vinte: 1, perse: 1 });
  });

  it('stagione senza partite → null', () => {
    expect(computeSeasonRecap(players, matches, '2019-20')).toBe(null);
    expect(computeSeasonRecap(players, [], '2025-26')).toBe(null);
  });

  it('stagione corrente → inCorso', () => {
    const r = computeSeasonRecap(players, matches, '2025-26', D(2026, 4, 1));
    expect(r.inCorso).toBe(true);
    expect(r.months).toBe('settembre – in corso');
  });
});

describe('computeSeasonRecap — record', () => {
  const matches = [
    appMatch({
      date: D(2025, 9, 7), red: 3, blue: 0,
      events: [goal(players[0]), goal(players[0]), goal(players[0])],
    }),
    appMatch({
      date: D(2025, 9, 14), red: 2, blue: 1,
      events: [goal(players[0]), goal(players[1]), goal(players[2])],
    }),
    appMatch({
      date: D(2026, 0, 10), red: 0, blue: 1,
      events: [goal(players[3]), { type: 'autogoal', scorerId: 'p1', scorerName: 'Marco', team: 'red' }],
    }),
  ];
  const r = computeSeasonRecap(players, matches, '2025-26', D(2026, 9, 10));

  it('capocannoniere, più presente, più vittorioso', () => {
    expect(r.records.topScorer).toMatchObject({ name: 'Marco', value: 4 });
    // tutti a 3 presenze → tie con nomi uniti
    expect(r.records.mostPresent.value).toBe(3);
    expect(r.records.mostPresent.name).toContain(' / ');
    expect(r.records.topWinner).toMatchObject({ value: 2 });
  });

  it('partita record, gol in una partita, mese top, autogol', () => {
    expect(r.records.biggestMatch).toMatchObject({ score: '3-0', totalGoals: 3 });
    expect(r.records.smallestMatch).toMatchObject({ totalGoals: 1 });
    expect(r.records.bestMatchGoals).toMatchObject({ name: 'Marco', value: 3 });
    expect(r.records.bestMonth).toMatchObject({ name: 'Ottobre', value: 6 });
    expect(r.records.mostAutoGoals).toMatchObject({ name: 'Marco', value: 1 });
  });

  it('strisce: vittorie consecutive (assenza non interrompe), min 2', () => {
    // p1/p2 vincono le prime due, perdono la terza → bestWin 2
    expect(r.records.bestWinStreak).toMatchObject({ value: 2 });
    expect(r.records.bestWinStreak.name).toContain('Marco');
    // p3/p4 perdono le prime due → striscia di sconfitte 2
    expect(r.records.bestLossStreak).toMatchObject({ value: 2 });
    expect(r.records.bestLossStreak.name).toContain('Gianni');
  });
});

describe('computeSeasonRecap — roster senza id (storici non collegati)', () => {
  it('righe residue con presenze/V-N-P e gol ignoti (null)', () => {
    const matches = [{
      status: 'finished', date: D(2025, 10, 1),
      redTeam: [players[0], { name: 'PISCO' }],
      blueTeam: [players[2], players[3]],
      redScore: 4, blueScore: 2, events: [], isHistorical: true,
    }];
    const r = computeSeasonRecap(players, matches, '2025-26', D(2026, 9, 10));
    const pisco = r.players.find(p => p.name === 'PISCO');
    expect(pisco).toMatchObject({ presenze: 1, vinte: 1, gol: null, assist: null });
    expect(r.totalPlayers).toBe(4); // 3 collegati + 1 residuo
  });
});

describe('buildSeasonCSV', () => {
  const season = {
    id: '2025-26', label: '2025/2026',
    totalMatches: 2, totalGoals: 7, totalAutoGoals: 1, totalPlayers: 2,
    records: {
      topScorer: { name: 'Marco', value: 4 },
      biggestMatch: { score: '3-0', totalGoals: 3, detail: '7 ottobre 2025' },
    },
    players: [
      { name: 'Marco', presenze: 2, gol: 4, autogol: 1, assist: 0, vinte: 1, nulle: 0, perse: 1 },
      { name: '=EVIL()', presenze: 1, gol: null, autogol: null, assist: null, vinte: 0, nulle: 0, perse: 1 },
    ],
  };

  it('struttura: intestazione, record, tabella giocatori', () => {
    const csv = buildSeasonCSV(season);
    expect(csv).toContain('Stagione,2025/2026');
    expect(csv).toContain('Partite,2');
    expect(csv).toContain('Capocannoniere,Marco,4');
    expect(csv).toContain('Partita più prolifica,3-0,3,7 ottobre 2025');
    expect(csv).toContain('Nome,Presenze,Gol,Autogol,Assist,Vinte,Nulle,Perse');
    expect(csv).toContain('Marco,2,4,1,0,1,0,1');
  });

  it('gol ignoti → campo vuoto, niente 0 inventati', () => {
    const csv = buildSeasonCSV(season);
    const evilRow = csv.split('\n').find(l => l.includes('EVIL'));
    expect(evilRow).toBe("'=EVIL(),1,,,,0,0,1");
  });

  it('anti CSV-injection sui nomi', () => {
    expect(buildSeasonCSV(season)).toContain("'=EVIL()");
  });
});
