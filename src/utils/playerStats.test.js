import { describe, it, expect } from 'vitest';
import {
  calcStatsForPlayer,
  computePowerIndex,
  computeCombinedPowerIndex,
  computeStreak,
  computeRecentForm,
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
