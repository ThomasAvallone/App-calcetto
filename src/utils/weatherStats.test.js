import { describe, it, expect } from 'vitest';
import { computeWeatherStats, computePlayerWeatherStats, weatherStatsForAI } from './weatherStats';

const m = (over) => ({
  weather: { condition: 'sunny' },
  redTeam: [{ id: 'p1' }], blueTeam: [{ id: 'p2' }],
  redScore: 0, blueScore: 0, events: [], ...over,
});

describe('computeWeatherStats', () => {
  it('ignora le partite senza condizione meteo', () => {
    const res = computeWeatherStats([m({ weather: {} }), m({ weather: null })]);
    expect(res).toEqual([]);
  });

  it('aggrega per condizione e conta gol/esiti', () => {
    const res = computeWeatherStats([
      m({ condition: 'sunny', weather: { condition: 'sunny' }, redScore: 3, blueScore: 1 }),
      m({ weather: { condition: 'sunny' }, redScore: 2, blueScore: 2 }),
      m({ weather: { condition: 'rainy' }, redScore: 0, blueScore: 1 }),
    ]);
    const sunny = res.find(r => r.key === 'sunny');
    expect(sunny.matches).toBe(2);
    expect(sunny.goals).toBe(3 + 1 + 2 + 2); // somma gol di entrambe le squadre
    expect(sunny.redWins).toBe(1);
    expect(sunny.draws).toBe(1);
  });

  it('ordina per numero di partite decrescente', () => {
    const res = computeWeatherStats([
      m({ weather: { condition: 'rainy' } }),
      m({ weather: { condition: 'sunny' } }),
      m({ weather: { condition: 'sunny' } }),
    ]);
    expect(res[0].key).toBe('sunny');
  });
});

describe('computePlayerWeatherStats — esiti per giocatore', () => {
  it('conta vittoria quando la squadra del giocatore vince', () => {
    const res = computePlayerWeatherStats([m({ redScore: 3, blueScore: 1 })], 'p1');
    expect(res[0]).toMatchObject({ matches: 1, wins: 1, draws: 0, losses: 0 });
  });

  it('conta sconfitta quando la squadra del giocatore perde', () => {
    // p1 è nei rossi, vincono i blu → sconfitta
    const res = computePlayerWeatherStats([m({ redScore: 1, blueScore: 3 })], 'p1');
    expect(res[0]).toMatchObject({ wins: 0, losses: 1 });
  });

  it('conta vittoria per un giocatore nei blu', () => {
    const res = computePlayerWeatherStats([m({ redScore: 1, blueScore: 3 })], 'p2');
    expect(res[0]).toMatchObject({ wins: 1, losses: 0 });
  });

  it('pareggio', () => {
    const res = computePlayerWeatherStats([m({ redScore: 2, blueScore: 2 })], 'p1');
    expect(res[0]).toMatchObject({ draws: 1, wins: 0, losses: 0 });
  });

  it('IGNORA le partite in cui il giocatore non ha giocato (no esiti fantasma)', () => {
    // p3 non è né nei rossi né nei blu: la partita non deve contare
    const res = computePlayerWeatherStats([m({ redScore: 0, blueScore: 5 })], 'p3');
    expect(res).toEqual([]);
  });

  it('conta gol e assist del giocatore', () => {
    const match = m({
      redScore: 2, blueScore: 0,
      events: [
        { type: 'goal', scorerId: 'p1', assistId: 'p2' },
        { type: 'goal', scorerId: 'p1' },
        { type: 'autogoal', scorerId: 'p1' }, // gli autogol non contano come gol
      ],
    });
    const res = computePlayerWeatherStats([match], 'p1');
    expect(res[0].goals).toBe(2);
    expect(res[0].assists).toBe(0);
    const resP2 = computePlayerWeatherStats([match], 'p2');
    expect(resP2[0].assists).toBe(1);
  });
});

describe('weatherStatsForAI', () => {
  it('stringa vuota se nessun dato', () => {
    expect(weatherStatsForAI([])).toBe('');
    expect(weatherStatsForAI(null)).toBe('');
  });

  it('include solo condizioni con >= 2 partite', () => {
    const stats = [
      { label: 'Sole', matches: 3, avgGoals: '4.0', mvp: null },
      { label: 'Pioggia', matches: 1, avgGoals: '2.0', mvp: null },
    ];
    const out = weatherStatsForAI(stats);
    expect(out).toContain('Sole');
    expect(out).not.toContain('Pioggia');
  });
});
