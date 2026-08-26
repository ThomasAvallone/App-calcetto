import { describe, it } from 'vitest';
import { buildSeasonCSV, escapeCsv } from './dataExport';
import { HISTORICAL_SEASONS } from '../data/historicalData';
import { computeSeasonRecap } from './seasonRecap';

describe('scratch', () => {
  it('dump static', () => {
    for (const s of HISTORICAL_SEASONS) console.log('season', s.id, JSON.stringify(s.label), 'hasId', !!s.id);
    const csv = buildSeasonCSV(HISTORICAL_SEASONS[0]);
    csv.split('\n').slice(0, 24).forEach((l, i) => console.log(i, '|', l.split(',').length, '|', JSON.stringify(l)));
  });

  it('dump live', () => {
    const players = [{ id: 'p1', name: 'Marco' }, { id: 'p2', name: 'Luca' }];
    const D = (y, m, d) => new Date(y, m, d, 21, 0).getTime();
    const matches = [
      { status: 'finished', date: D(2025, 9, 7), redTeam: [players[0]], blueTeam: [players[1]], redScore: 0, blueScore: 0, events: [] },
      { status: 'finished', date: D(2025, 9, 14), redTeam: [players[0]], blueTeam: [players[1]], redScore: 0, blueScore: 0, events: [] },
    ];
    const r = computeSeasonRecap(players, matches, '2025-26', D(2026, 9, 1));
    console.log('records', JSON.stringify(r.records, null, 1));
    const csv = buildSeasonCSV(r);
    csv.split('\n').forEach((l, i) => console.log(i, '|', l.split(',').length, '|', JSON.stringify(l)));
  });
});
