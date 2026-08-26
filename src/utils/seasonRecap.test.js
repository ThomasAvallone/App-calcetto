import { describe, it, expect } from 'vitest';
import { seasonIdOf, seasonBounds, seasonLabelOf, listAppSeasonIds, computeSeasonRecap, isSeasonInProgress, withSeasonProgressFlag } from './seasonRecap';
import { buildSeasonCSV } from './dataExport';

const D = (y, m, d, h = 21) => new Date(y, m, d, h, 0).getTime();

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

  it('unattributedGoals: gol del punteggio senza evento marcatore', () => {
    // 3-1 ma solo 2 eventi gol registrati → 2 gol senza marcatore
    const parziale = [appMatch({
      date: D(2026, 0, 10), red: 3, blue: 1,
      events: [goal(players[0]), goal(players[2])],
    })];
    const r = computeSeasonRecap(players, parziale, '2025-26', D(2026, 9, 1));
    expect(r.totalGoals).toBe(4);
    expect(r.unattributedGoals).toBe(2);
  });

  it('unattributedGoals: conta anche i gol di chi non è in formazione (nessuna riga)', () => {
    // evento con un marcatore che non compare in nessun roster → nessuna riga
    // lo rivendica, quindi la colonna G non torna di 1
    const strano = [appMatch({
      date: D(2026, 0, 10), red: 2, blue: 0,
      events: [goal(players[0]), { type: 'goal', scorerId: 'pZ', scorerName: 'Fantasma' }],
    })];
    const r = computeSeasonRecap(players, strano, '2025-26', D(2026, 9, 1));
    expect(r.players.some(p => p.name === 'Fantasma')).toBe(false);
    expect(r.unattributedGoals).toBe(1);
  });

  it('unattributedGoals: 0 quando ogni gol ha un evento (autogol inclusi)', () => {
    const completo = [appMatch({
      date: D(2026, 0, 10), red: 2, blue: 1,
      events: [
        goal(players[0]), goal(players[1]),
        { type: 'autogoal', scorerId: 'p1', scorerName: 'Marco', team: 'red' },
      ],
    })];
    const r = computeSeasonRecap(players, completo, '2025-26', D(2026, 9, 1));
    expect(r.totalGoals).toBe(3);
    expect(r.totalAutoGoals).toBe(1);
    expect(r.unattributedGoals).toBe(0);
  });

  it('input degeneri non lanciano mai (StagioniPage è una pagina utente)', () => {
    // un throw qui finirebbe nell'ErrorBoundary → schermata di errore
    expect(computeSeasonRecap(null, null, null)).toBe(null);
    expect(computeSeasonRecap(undefined, undefined, '2025-26')).toBe(null);
    expect(computeSeasonRecap([null], [null], '2025-26')).toBe(null);
    expect(computeSeasonRecap([], [{}], '2025-26')).toBe(null);
    expect(listAppSeasonIds([null, {}, undefined])).toEqual([]);
    // partita con campi mancanti: nessuna eccezione
    const bare = [{ status: 'finished', date: D(2026, 0, 5), redTeam: null, blueTeam: null, events: null }];
    expect(computeSeasonRecap([{ id: 'p1', name: 'X' }], bare, '2025-26').totalMatches).toBe(1);
    // id malformato → nessun 'NaN/NaN' mostrato all'utente
    expect(seasonLabelOf('boh')).toBe('boh');
    expect(seasonLabelOf(null)).toBe('');
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

describe('chiusura stagione a fine agosto', () => {
  const matches = [
    appMatch({ date: D(2025, 8, 2), over: { isHistorical: true } }), // 2 set 2025
    appMatch({ date: D(2026, 7, 25) }),                              // 25 ago 2026
  ];

  it('resta In Corso fino al 31 agosto compreso', () => {
    expect(computeSeasonRecap(players, matches, '2025-26', D(2026, 7, 26)).inCorso).toBe(true);
    // ultimo istante utile della stagione
    const lastMs = new Date(2026, 7, 31, 23, 59, 59, 999).getTime();
    expect(computeSeasonRecap(players, matches, '2025-26', lastMs).inCorso).toBe(true);
  });

  it('si chiude esattamente il 1° settembre alle 00:00', () => {
    const firstMs = new Date(2026, 8, 1, 0, 0, 0, 0).getTime();
    const r = computeSeasonRecap(players, matches, '2025-26', firstMs);
    expect(r.inCorso).toBe(false);
    expect(r.months).toBe('settembre – agosto');
    // e la nuova stagione diventa quella in corso
    expect(isSeasonInProgress('2026-27', firstMs)).toBe(true);
  });

  it('una partita del 1° settembre apre la stagione nuova, non prolunga la vecchia', () => {
    const conNuova = [...matches, appMatch({ date: D(2026, 8, 1, 0) })];
    expect(listAppSeasonIds(conNuova)).toEqual(['2025-26', '2026-27']);
    expect(computeSeasonRecap(players, conNuova, '2025-26', D(2026, 8, 2)).totalMatches).toBe(2);
  });

  it('withSeasonProgressFlag corregge il flag hardcoded delle stagioni statiche', () => {
    const statica = { id: '2025-26', inCorso: true, months: 'settembre – in corso' };
    // a stagione finita il flag va spento
    const chiusa = withSeasonProgressFlag(statica, D(2026, 8, 15));
    expect(chiusa.inCorso).toBe(false);
    expect(chiusa.months).toBe('settembre – agosto');
    // durante la stagione resta invariata (stessa referenza)
    expect(withSeasonProgressFlag(statica, D(2026, 3, 1))).toBe(statica);
    // le vecchie stagioni con months personalizzati non vengono toccate
    const vecchia = { id: '2020-21', months: 'set–ott 2020 + apr–ago 2021' };
    expect(withSeasonProgressFlag(vecchia, D(2026, 8, 15))).toBe(vecchia);
  });

  it('a stagione chiusa sparisce anche la nota "in corso" (banner contraddittorio)', () => {
    const statica = { id: '2025-26', inCorso: true, notes: 'Stagione in corso (dati aggiornati a febbraio 2026)' };
    expect(withSeasonProgressFlag(statica, D(2026, 8, 15)).notes).toBeUndefined();
    // una nota non temporale resta
    const conNota = { id: '2025-26', inCorso: true, notes: '3 partite non giocate' };
    expect(withSeasonProgressFlag(conNota, D(2026, 8, 15)).notes).toBe('3 partite non giocate');
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
    // 3-0 e 2-1 valgono entrambe 3 gol: pari merito uniti come nei dati storici
    expect(r.records.biggestMatch).toMatchObject({ score: '3-0 / 2-1', totalGoals: 3 });
    expect(r.records.smallestMatch).toMatchObject({ score: '0-1', totalGoals: 1 });
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

describe('computeSeasonRecap — risoluzione marcatore (id, non nome)', () => {
  it('conta i gol storici anche senza scorerName (risolti da scorerId)', () => {
    // gli eventi importati dallo storico possono non avere scorerName
    const matches = [
      appMatch({
        date: D(2025, 9, 7), red: 5, blue: 0, over: { isHistorical: true },
        events: Array.from({ length: 5 }, () => ({ type: 'goal', scorerId: 'p1' })),
      }),
      appMatch({ date: D(2026, 1, 3), red: 1, blue: 0, events: [goal(players[1])] }),
    ];
    const r = computeSeasonRecap(players, matches, '2025-26', D(2026, 9, 1));
    expect(r.records.bestMatchGoals).toMatchObject({ name: 'Marco', value: 5 });
    expect(r.records.bestMonthGoals).toMatchObject({ name: 'Marco', value: 5 });
  });

  it('un rename non spezza i gol su due chiavi (chiave = scorerId)', () => {
    // eventi vecchi col nome precedente, nuovi col nome attuale, stesso id
    const matches = [appMatch({
      date: D(2026, 0, 10), red: 4, blue: 0,
      events: [
        { type: 'goal', scorerId: 'p1', scorerName: 'Marchino' },
        { type: 'goal', scorerId: 'p1', scorerName: 'Marchino' },
        { type: 'goal', scorerId: 'p1', scorerName: 'Marco' },
        { type: 'goal', scorerId: 'p1', scorerName: 'Marco' },
      ],
    })];
    const r = computeSeasonRecap(players, matches, '2025-26', D(2026, 9, 1));
    // 4 gol sulla stessa chiave, col nome ATTUALE del giocatore
    expect(r.records.bestMatchGoals).toMatchObject({ name: 'Marco', value: 4 });
  });
});

describe('computeSeasonRecap — giocatori eliminati e pari merito', () => {
  it('un giocatore eliminato dall app resta nel riepilogo (roster con id ignoto)', () => {
    const matches = [appMatch({
      date: D(2026, 0, 10), red: 3, blue: 0,
      over: { redTeam: [players[0], { id: 'pX', name: 'Ex Socio' }] },
      events: [goal(players[0]), { type: 'goal', scorerId: 'pX', scorerName: 'Ex Socio' },
               { type: 'goal', scorerId: 'pX', scorerName: 'Ex Socio' }],
    })];
    const r = computeSeasonRecap(players, matches, '2025-26', D(2026, 9, 1));
    const ex = r.players.find(p => p.name === 'Ex Socio');
    // presenze, gol e V/N/P completi anche se non è più fra i players
    expect(ex).toMatchObject({ presenze: 1, gol: 2, vinte: 1, perse: 0 });
    expect(r.records.topScorer).toMatchObject({ name: 'Ex Socio', value: 2 });
  });

  it('pari merito uniti anche su bestMatchGoals (nomi e date)', () => {
    const matches = [
      appMatch({ date: D(2026, 0, 10), red: 2, blue: 0, events: [goal(players[0]), goal(players[0])] }),
      appMatch({ date: D(2026, 1, 10), red: 2, blue: 0, events: [goal(players[1]), goal(players[1])] }),
    ];
    const r = computeSeasonRecap(players, matches, '2025-26', D(2026, 9, 1));
    expect(r.records.bestMatchGoals.value).toBe(2);
    expect(r.records.bestMatchGoals.name).toBe('Marco / Luca');
    expect(r.records.bestMatchGoals.detail).toContain(' e ');
  });

  it('bestMatchGoals non si mostra se nessuno ha fatto almeno una doppietta', () => {
    const matches = [appMatch({ date: D(2026, 0, 10), red: 1, blue: 1, events: [goal(players[0]), goal(players[2])] })];
    const r = computeSeasonRecap(players, matches, '2025-26', D(2026, 9, 1));
    expect(r.records.bestMatchGoals).toBeUndefined();
  });
});

describe('computeSeasonRecap — riconciliazione residui / collegati', () => {
  it('lo stesso giocatore risolto in una partita e non nell altra NON produce due righe', () => {
    const marco = { id: 'p1', name: 'Marco', historicalNames: ['MARCHINO'] };
    const roster = [{ id: 'p2', name: 'Luca' }];
    const matches = [
      // risolto (con id)
      { status: 'finished', date: D(2025, 9, 7), isHistorical: true,
        redTeam: [marco], blueTeam: roster, redScore: 1, blueScore: 0,
        events: [{ type: 'goal', scorerId: 'p1' }] },
      // stessa persona ma nome non risolto dall'import (senza id)
      { status: 'finished', date: D(2025, 10, 7), isHistorical: true,
        redTeam: [{ name: 'MARCHINO' }], blueTeam: roster, redScore: 0, blueScore: 2, events: [] },
    ];
    const r = computeSeasonRecap([marco, ...roster], matches, '2025-26', D(2026, 9, 1));
    expect(r.players.filter(p => /marco|marchino/i.test(p.name))).toHaveLength(1);
    const row = r.players.find(p => p.name === 'Marco');
    // presenze e V/N/P comprendono anche la partita non risolta
    expect(row).toMatchObject({ presenze: 2, gol: 1, vinte: 1, perse: 1 });
    expect(r.records.mostPresent.value).toBe(2);
  });

  it('una sconfitta riconciliata per nome AZZERA la striscia di vittorie', () => {
    // Boro collegato dopo l'import: vince la 1ª e la 3ª (roster con id) e perde
    // la 2ª, dove compare come nudo nome. Senza la normalizzazione dei roster la
    // striscia salterebbe la sconfitta e annuncerebbe "2 vittorie consecutive"
    // pur mostrando quella sconfitta nella riga sopra.
    const boro = { id: 'pB', name: 'Boro', historicalNames: ['BORO'] };
    const avv = { id: 'pA', name: 'Avversario' };
    const mk = (date, red, win) => ({
      status: 'finished', date, isHistorical: true,
      redTeam: [red], blueTeam: [avv],
      redScore: win ? 2 : 0, blueScore: win ? 0 : 2, events: [],
    });
    const matches = [
      mk(D(2025, 9, 1), boro, true),
      mk(D(2025, 9, 8), { name: 'BORO' }, false), // stessa persona, non risolta
      mk(D(2025, 9, 15), boro, true),
    ];
    const r = computeSeasonRecap([boro, avv], matches, '2025-26', D(2026, 9, 1));
    expect(r.players.find(p => p.name === 'Boro')).toMatchObject({ presenze: 3, vinte: 2, perse: 1 });
    // niente striscia da 2: la sconfitta di mezzo la interrompe
    expect(r.records.bestWinStreak).toBeUndefined();
    expect(r.records.bestLossStreak).toBeUndefined();
  });

  it('le strisce coprono anche i giocatori eliminati dall app', () => {
    const ghost = { id: 'pX', name: 'Ex Socio' };
    const mk = (date, redWin) => ({
      status: 'finished', date, redTeam: [players[0], ghost], blueTeam: [players[2]],
      redScore: redWin ? 2 : 0, blueScore: redWin ? 0 : 2, events: [],
    });
    const matches = [mk(D(2026, 0, 1), true), mk(D(2026, 0, 8), true), mk(D(2026, 0, 15), true)];
    const r = computeSeasonRecap(players, matches, '2025-26', D(2026, 9, 1));
    expect(r.records.bestWinStreak.value).toBe(3);
    expect(r.records.bestWinStreak.name).toContain('Ex Socio');
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
    expect(csv).toContain('Partita più prolifica,3–0,3,7 ottobre 2025');
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

  it('i punteggi dei record non vengono letti da Excel come date', () => {
    // "3-0" in una cella diventerebbe "03-mar": si usa la lineetta –
    const csv = buildSeasonCSV(season);
    expect(csv).toContain('Partita più prolifica,3–0,3,7 ottobre 2025');
    expect(csv).not.toContain(',3-0,');
    // pari merito: tutti i trattini del punteggio sostituiti
    const tie = buildSeasonCSV({ ...season, records: { biggestMatch: { score: '3-0 / 2-1', totalGoals: 3 } } });
    expect(tie).toContain('3–0 / 2–1');
    // i nomi normali non vengono toccati
    expect(buildSeasonCSV({ ...season, records: { topScorer: { name: 'Jean-Luc', value: 4 } } })).toContain('Jean-Luc');
  });
});
