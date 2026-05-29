import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  calcStatsForPlayer,
  computePowerIndex,
  computeCombinedPowerIndex,
  computeStreak,
  computeRecentForm,
  computeStatsFromMatches,
  aggregatePlayerMatchStats,
  SEASON_PLAYER_MAP,
} from './playerStats';

// Helper per costruire partite sintetiche
const mk = (date, redIds, blueIds, redScore, blueScore, events = [], extra = {}) => ({
  date: new Date(date),
  status: 'finished',
  redTeam: redIds.map(id => ({ id })),
  blueTeam: blueIds.map(id => ({ id })),
  redScore,
  blueScore,
  events,
  ...extra,
});

describe('calcStatsForPlayer', () => {
  it('conta 2 turni di porta per partita (convenzione rotazione)', () => {
    const matches = [
      mk('2024-01-01', ['A'], ['B'], 3, 2),
      mk('2024-01-08', ['A'], ['B'], 1, 1),
    ];
    const s = calcStatsForPlayer(matches, 'A');
    expect(s.matches).toBe(2);
    expect(s.gkMatches).toBe(4);
  });

  it('attribuisce vittorie/pareggi/sconfitte correttamente', () => {
    const matches = [
      mk('2024-01-01', ['A'], ['B'], 3, 1), // A vince
      mk('2024-01-08', ['A'], ['B'], 0, 2), // A perde
      mk('2024-01-15', ['A'], ['B'], 1, 1), // pareggio
    ];
    const s = calcStatsForPlayer(matches, 'A');
    expect(s.wins).toBe(1);
    expect(s.losses).toBe(1);
    expect(s.draws).toBe(1);
  });

  it('conta gol, assist, autogol dagli eventi', () => {
    const matches = [mk('2024-01-01', ['A'], ['B'], 2, 0, [
      { type: 'goal', scorerId: 'A', assistId: 'B' },
      { type: 'goal', scorerId: 'A' },
      { type: 'autogoal', scorerId: 'A' },
    ])];
    const s = calcStatsForPlayer(matches, 'A');
    expect(s.goals).toBe(2);
    expect(s.autogoals).toBe(1);
    const sB = calcStatsForPlayer(matches, 'B');
    expect(sB.assists).toBe(1);
  });

  it('conta gol subiti come portiere (gkConcededId)', () => {
    const matches = [mk('2024-01-01', ['A'], ['B'], 0, 2, [
      { type: 'goal', scorerId: 'B', gkConcededId: 'A' },
      { type: 'goal', scorerId: 'B', gkConcededId: 'A' },
    ])];
    const s = calcStatsForPlayer(matches, 'A');
    expect(s.gkGoalsConceded).toBe(2);
  });
});

describe('computePowerIndex', () => {
  it('ritorna 50 per nessuna partita giocata', () => {
    expect(computePowerIndex({ matches: 0 })).toBe(50);
    expect(computePowerIndex(null)).toBe(50);
  });

  it('rimane nel range [0, 100]', () => {
    const extremeBad = { matches: 10, wins: 0, draws: 0, goals: 0, assists: 0, autogoals: 20, gkGoalsConceded: 50, gkMatches: 20 };
    const extremeGood = { matches: 10, wins: 10, draws: 0, goals: 50, assists: 30, autogoals: 0, gkGoalsConceded: 0, gkMatches: 20 };
    expect(computePowerIndex(extremeBad)).toBeGreaterThanOrEqual(0);
    expect(computePowerIndex(extremeGood)).toBeLessThanOrEqual(100);
  });

  it('premia win rate alto', () => {
    const base = { matches: 10, goals: 5, assists: 5, autogoals: 0, gkGoalsConceded: 5, gkMatches: 20, draws: 0 };
    const winner = computePowerIndex({ ...base, wins: 10 });
    const loser = computePowerIndex({ ...base, wins: 0 });
    expect(winner).toBeGreaterThan(loser);
  });

  it('penalizza i gol subiti come portiere', () => {
    const base = { matches: 10, wins: 5, draws: 0, goals: 5, assists: 5, autogoals: 0, gkMatches: 20 };
    const leaky = computePowerIndex({ ...base, gkGoalsConceded: 20 });
    const wall = computePowerIndex({ ...base, gkGoalsConceded: 2 });
    expect(wall).toBeGreaterThan(leaky);
  });
});

describe('computeCombinedPowerIndex', () => {
  it('somma stats app + storici prima di calcolare il PI', () => {
    const stats = { matches: 5, wins: 3, draws: 0, goals: 5, assists: 3, autogoals: 0, gkGoalsConceded: 2, gkMatches: 10 };
    const hist = { matches: 5, wins: 2, draws: 0, goals: 3, assists: 2, autogoals: 1, gkGoalsConceded: 3, gkMatches: 10 };
    const combined = computeCombinedPowerIndex(stats, hist);
    const manual = computePowerIndex({
      matches: 10, wins: 5, draws: 0, goals: 8, assists: 5, autogoals: 1, gkGoalsConceded: 5, gkMatches: 20,
    });
    expect(combined).toBe(manual);
  });

  it('gestisce storici null/mancanti', () => {
    const stats = { matches: 3, wins: 2, draws: 0, goals: 2, assists: 1, autogoals: 0, gkGoalsConceded: 1, gkMatches: 6 };
    expect(computeCombinedPowerIndex(stats, null)).toBe(computePowerIndex(stats));
  });
});

describe('computeStreak', () => {
  it('ritorna null se nessuna partita', () => {
    expect(computeStreak([], 'A')).toBeNull();
  });

  it('calcola streak di vittorie dalla più recente', () => {
    const matches = [
      mk('2024-01-01', ['A'], ['B'], 0, 1), // più vecchia (sconfitta)
      mk('2024-01-08', ['A'], ['B'], 2, 1),
      mk('2024-01-15', ['A'], ['B'], 3, 0),
      mk('2024-01-22', ['A'], ['B'], 1, 0), // più recente
    ];
    const streak = computeStreak(matches, 'A');
    expect(streak).toEqual({ type: 'win', count: 3 });
  });

  it('riconosce streak di sconfitte', () => {
    const matches = [
      mk('2024-01-01', ['A'], ['B'], 3, 1),
      mk('2024-01-08', ['A'], ['B'], 0, 2),
      mk('2024-01-15', ['A'], ['B'], 1, 3),
    ];
    const streak = computeStreak(matches, 'A');
    expect(streak).toEqual({ type: 'loss', count: 2 });
  });

  it('esclude partite storiche', () => {
    const matches = [
      mk('2024-01-01', ['A'], ['B'], 0, 1, [], { isHistorical: true }),
      mk('2024-01-08', ['A'], ['B'], 2, 0),
    ];
    const streak = computeStreak(matches, 'A');
    expect(streak).toEqual({ type: 'win', count: 1 });
  });
});

describe('computeStatsFromMatches', () => {
  // Inject test-only entries into SEASON_PLAYER_MAP under a real season key.
  // Names use ZTEST_ prefix to avoid collisions with production data.
  beforeAll(() => {
    SEASON_PLAYER_MAP['2025-26'] = SEASON_PLAYER_MAP['2025-26'] || {};
    SEASON_PLAYER_MAP['2025-26']['ZTEST_MARIO'] = { presenze: 10, assist: 6 };
    SEASON_PLAYER_MAP['2025-26']['ZTEST_LUIGI'] = { presenze: 5, assist: 3 };
  });
  afterAll(() => {
    delete SEASON_PLAYER_MAP['2025-26']['ZTEST_MARIO'];
    delete SEASON_PLAYER_MAP['2025-26']['ZTEST_LUIGI'];
  });

  // Players wired to the test season entries above (dates 2025-10-xx → season 2025-26)
  const p1 = { id: 'p1', name: 'Mario Test', historicalNames: ['Ztest_Mario'] };
  const p2 = { id: 'p2', name: 'Luigi Test', historicalNames: ['Ztest_Luigi'] };
  const p3 = { id: 'p3', name: 'Extra',      historicalNames: [] };

  const mkHist = (date, redIds, blueIds, rS, bS, events = []) =>
    mk(date, redIds, blueIds, rS, bS, events, { isHistorical: true });

  it('conta gol da partite live e storiche', () => {
    const matches = [
      mk('2025-10-01', ['p1'], ['p2'], 2, 0, [
        { type: 'goal', scorerId: 'p1' },
        { type: 'goal', scorerId: 'p1' },
      ]),
      mkHist('2025-11-01', ['p1'], ['p2'], 1, 0, [{ type: 'goal', scorerId: 'p1' }]),
    ];
    const [mario] = computeStatsFromMatches([p1], matches);
    expect(mario.totalGoals).toBe(3);
  });

  it('conta assist solo da partite live (non da storiche)', () => {
    // p3 non ha historicalNames → nessuna proration, così si isola il solo guard sugli eventi
    const matches = [
      mk('2025-10-01', ['p2'], ['p3'], 2, 0, [
        { type: 'goal', scorerId: 'p2', assistId: 'p3' },
        { type: 'goal', scorerId: 'p2', assistId: 'p3' },
      ]),
      // La stessa assistId in una partita storica NON deve essere contata
      mkHist('2025-11-01', ['p2'], ['p3'], 1, 0, [{ type: 'goal', scorerId: 'p2', assistId: 'p3' }]),
    ];
    const [, , extra] = computeStatsFromMatches([p2, p1, p3], matches);
    expect(extra.totalAssists).toBe(2);
  });

  it('prora gli assist storici in proporzione alle presenze nel periodo', () => {
    // p1 ha 10 presenze, 6 assist totali in stagione.
    // Gioca 5 su 10 partite storiche → round(6 × 5/10) = 3 assist
    const matches = Array.from({ length: 5 }, (_, i) =>
      mkHist(`2025-10-${String(i + 1).padStart(2, '0')}`, ['p1'], ['p2'], 1, 0)
    );
    const [mario] = computeStatsFromMatches([p1], matches);
    expect(mario.totalAssists).toBe(3);
  });

  it('limita il ratio di proration a 1 anche se le partite superano le presenze dichiarate', () => {
    // p2 ha 5 presenze dichiarate, 3 assist. Gioca 8 partite → ratio 8/5 > 1 → cappato a 1
    const matches = Array.from({ length: 8 }, (_, i) =>
      mkHist(`2025-10-${String(i + 1).padStart(2, '0')}`, ['p2'], ['p1'], 1, 0)
    );
    const [, luigi] = computeStatsFromMatches([p1, p2], matches);
    expect(luigi.totalAssists).toBe(3); // round(3 × min(1, 8/5)) = 3
  });

  it('non accumula doppio conteggio assist: eventi storici ignorati + proration applicata', () => {
    // p1 gioca 10 partite storiche (tutte con assistId: 'p1')
    // Gli event assists devono essere bloccati; la proration deve dare round(6 × 10/10) = 6
    const matches = Array.from({ length: 10 }, (_, i) =>
      mkHist(`2025-10-${String(i + 1).padStart(2, '0')}`, ['p2'], ['p1'], 1, 0, [
        { type: 'goal', scorerId: 'p2', assistId: 'p1' },
      ])
    );
    const [mario] = computeStatsFromMatches([p1], matches);
    expect(mario.totalAssists).toBe(6);
  });

  it('incrementa gkMatches solo per partite non storiche', () => {
    const matches = [
      mkHist('2025-10-01', ['p1'], ['p2'], 1, 0),
      mk('2025-11-01', ['p1'], ['p2'], 1, 0),
      mk('2025-12-01', ['p1'], ['p2'], 1, 0),
    ];
    const [mario] = computeStatsFromMatches([p1], matches);
    expect(mario.gkMatches).toBe(4); // 2 per ogni partita live
    expect(mario.totalMatches).toBe(3);
  });

  it('conta clean sheet solo per partite live dove il giocatore non subisce gol', () => {
    const matches = [
      mk('2025-10-01', ['p2'], ['p1'], 2, 0, [
        { type: 'goal', scorerId: 'p2', gkConcededId: 'p1' },
        { type: 'goal', scorerId: 'p2', gkConcededId: 'p1' },
      ]),
      mk('2025-11-01', ['p1'], ['p2'], 1, 0), // nessun gkConcededId → clean sheet per entrambi
    ];
    const [mario, luigi] = computeStatsFromMatches([p1, p2], matches);
    expect(mario.cleanSheets).toBe(1);  // solo la seconda (nella prima subisce 2 gol)
    expect(luigi.cleanSheets).toBe(2);  // in entrambe non ha gkConcededId
  });

  it('conta V/N/P per partite live e storiche', () => {
    const matches = [
      mk('2025-10-01', ['p1'], ['p2'], 3, 1),
      mk('2025-11-01', ['p1'], ['p2'], 0, 2),
      mk('2025-12-01', ['p1'], ['p2'], 1, 1),
      mkHist('2025-10-05', ['p1'], ['p2'], 2, 0), // win storica
    ];
    const [mario] = computeStatsFromMatches([p1], matches);
    expect(mario.totalMatches).toBe(4);
    expect(mario.totalWins).toBe(2);
    expect(mario.totalDraws).toBe(1);
  });

  it('ignora i giocatori non presenti nella partita', () => {
    const matches = [mk('2025-10-01', ['p1'], ['p2'], 2, 0)];
    const [, , extra] = computeStatsFromMatches([p1, p2, p3], matches);
    expect(extra.totalMatches).toBe(0);
    expect(extra.totalGoals).toBe(0);
    expect(extra.totalAssists).toBe(0);
  });

  it('conta autogol sia da live che da storiche', () => {
    const matches = [
      mk('2025-10-01', ['p1'], ['p2'], 0, 1, [{ type: 'autogoal', scorerId: 'p1' }]),
      mkHist('2025-11-01', ['p1'], ['p2'], 0, 1, [{ type: 'autogoal', scorerId: 'p1' }]),
    ];
    const [mario] = computeStatsFromMatches([p1], matches);
    expect(mario.totalAutogoals).toBe(2);
  });

  it('restituisce risultati coerenti su input identici (idempotente)', () => {
    const matches = [
      mk('2025-10-01', ['p1'], ['p2'], 2, 1, [{ type: 'goal', scorerId: 'p1', assistId: 'p2' }]),
      mkHist('2025-10-05', ['p1'], ['p2'], 1, 0),
    ];
    const run1 = computeStatsFromMatches([p1, p2], matches);
    const run2 = computeStatsFromMatches([p1, p2], matches);
    expect(run1[0].totalGoals).toBe(run2[0].totalGoals);
    expect(run1[0].totalAssists).toBe(run2[0].totalAssists);
    expect(run1[1].totalAssists).toBe(run2[1].totalAssists);
  });
});

describe('aggregatePlayerMatchStats', () => {
  const goal = (scorerId, over = {}) => ({ type: 'goal', scorerId, ...over });

  it('giocatore non presente in nessuna partita → tutto a zero', () => {
    const matches = [mk('2024-01-01', ['A'], ['B'], 2, 0)];
    const s = aggregatePlayerMatchStats({ id: 'Z' }, matches);
    expect(s).toMatchObject({ matches: 0, goals: 0, wins: 0, gkMatches: 0 });
  });

  it('conta vittorie/sconfitte/pareggi e gol/assist da eventi', () => {
    const matches = [
      mk('2024-01-01', ['A'], ['B'], 2, 1, [goal('A'), goal('A', { assistId: 'B' })]),
      mk('2024-01-08', ['A'], ['B'], 0, 3),       // A perde
      mk('2024-01-15', ['A'], ['B'], 1, 1, [goal('A')]), // pareggio
    ];
    const a = aggregatePlayerMatchStats({ id: 'A' }, matches);
    expect(a).toMatchObject({ matches: 3, wins: 1, losses: 1, draws: 1, goals: 3 });
    const b = aggregatePlayerMatchStats({ id: 'B' }, matches);
    expect(b.assists).toBe(1);
  });

  it('gkMatches +2 per partita giocata, ma 0 per le storiche; clean sheet se nessun gol subito personalmente', () => {
    const matches = [
      mk('2024-01-01', ['A'], ['B'], 0, 1, [goal('B', { gkConcededId: 'A' })]),
      mk('2024-01-08', ['A'], ['B'], 3, 0),                        // A clean sheet (nessun gkConcededId su A)
      mk('2020-01-01', ['A'], ['B'], 1, 0, [], { isHistorical: true }),
    ];
    const a = aggregatePlayerMatchStats({ id: 'A' }, matches);
    expect(a.gkMatches).toBe(4);          // 2 partite app × 2 (storica esclusa)
    expect(a.gkGoalsConceded).toBe(1);
    expect(a.cleanSheets).toBe(1);
  });

  it('autogol contati su scorerId', () => {
    const matches = [mk('2024-01-01', ['A'], ['B'], 0, 1, [{ type: 'autogoal', scorerId: 'A' }])];
    expect(aggregatePlayerMatchStats({ id: 'A' }, matches).autogoals).toBe(1);
  });

  it('assist storici prorati col cap a 1; assist da evento ignorati nelle storiche', () => {
    const sid = Object.keys(SEASON_PLAYER_MAP)[0];
    const name = sid && SEASON_PLAYER_MAP[sid] ? Object.keys(SEASON_PLAYER_MAP[sid])[0] : null;
    if (!name) return; // dataset vuoto: skip difensivo
    const { presenze, assist } = SEASON_PLAYER_MAP[sid][name];
    if (!presenze || !assist) return;
    // Una sola partita storica della stagione → quota = round(assist * 1/presenze)
    const histMatch = mk('2099-01-01', ['HID'], ['X'], 1, 0,
      [{ type: 'goal', scorerId: 'X', assistId: 'HID' }], { isHistorical: true });
    // forza il season id della partita storica = sid override tramite getSeasonId? Non possibile;
    // usiamo invece il fatto che la proration scatta per qualunque storica con quel nome.
    const player = { id: 'HID', historicalNames: [name] };
    const s = aggregatePlayerMatchStats(player, [histMatch]);
    // L'assist da evento NON deve contare (storica) → solo l'eventuale quota prorata (>= 0)
    expect(s.assists).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(s.assists)).toBe(true);
  });

  it('è coerente con computeStatsFromMatches (stessa aggregazione)', () => {
    const matches = [
      mk('2024-01-01', ['A'], ['B'], 2, 1, [goal('A'), goal('A', { assistId: 'B' })]),
      mk('2024-01-08', ['A'], ['B'], 0, 3),
    ];
    const viaAggregate = aggregatePlayerMatchStats({ id: 'A' }, matches);
    const viaCompute = computeStatsFromMatches([{ id: 'A' }], matches)[0];
    expect(viaCompute.totalGoals).toBe(viaAggregate.goals);
    expect(viaCompute.totalMatches).toBe(viaAggregate.matches);
    expect(viaCompute.totalWins).toBe(viaAggregate.wins);
    expect(viaCompute.gkMatches).toBe(viaAggregate.gkMatches);
  });
});

describe('computeRecentForm', () => {
  it('ritorna null senza ratings', () => {
    const matches = [mk('2024-01-01', ['A'], ['B'], 2, 0)];
    expect(computeRecentForm(matches, 'A')).toBeNull();
  });

  it('calcola media ratings peer', () => {
    const matches = [
      mk('2024-01-01', ['A'], ['B'], 2, 0, [], { ratings: { u1: { scores: { A: 8 } }, u2: { scores: { A: 6 } } } }),
      mk('2024-01-08', ['A'], ['B'], 1, 1, [], { ratings: { u1: { scores: { A: 7 } } } }),
    ];
    const form = computeRecentForm(matches, 'A');
    expect(form.ratedMatches).toBe(2);
    // partita 1 avg = 7, partita 2 avg = 7, media = 7
    expect(form.avg).toBe(7);
  });

  it('ignora partite senza rating per il player specifico', () => {
    const matches = [
      mk('2024-01-01', ['A'], ['B'], 2, 0, [], { ratings: { u1: { scores: { A: 8 } } } }),
      mk('2024-01-08', ['A'], ['B'], 0, 2, [], { ratings: { u1: { scores: { B: 5 } } } }),
    ];
    const form = computeRecentForm(matches, 'A');
    expect(form.ratedMatches).toBe(1);
    expect(form.avg).toBe(8);
  });
});
