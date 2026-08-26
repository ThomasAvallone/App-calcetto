import { describe, it } from 'vitest';
import { HISTORICAL_SEASONS } from '../data/historicalData';

describe('conv', () => {
  it('static goals convention', () => {
    for (const s of HISTORICAL_SEASONS) {
      const sum = s.players.reduce((a, p) => a + (p.gol || 0), 0);
      const sumAuto = s.players.reduce((a, p) => a + (p.autogol || 0), 0);
      console.log(s.id, 'totalGoals', s.totalGoals, 'sumPlayerGol', sum, 'diff', s.totalGoals - sum,
        'totalAuto', s.totalAutoGoals, 'sumAuto', sumAuto);
    }
  });
});
