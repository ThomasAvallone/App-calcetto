import { describe, it, expect } from 'vitest';
import { scoreFromEvents, withProgressiveScore } from './matchScore';

const goal = (team) => ({ type: 'goal', team });
const autogoal = (team) => ({ type: 'autogoal', team });

describe('scoreFromEvents', () => {
  it('lista vuota / null → 0-0', () => {
    expect(scoreFromEvents([])).toEqual({ redScore: 0, blueScore: 0 });
    expect(scoreFromEvents(null)).toEqual({ redScore: 0, blueScore: 0 });
    expect(scoreFromEvents(undefined)).toEqual({ redScore: 0, blueScore: 0 });
  });

  it('gol → punto alla squadra del marcatore', () => {
    expect(scoreFromEvents([goal('red'), goal('red'), goal('blue')]))
      .toEqual({ redScore: 2, blueScore: 1 });
  });

  it('autogol → punto alla squadra AVVERSARIA', () => {
    // autogol di un rosso → punto ai blu
    expect(scoreFromEvents([autogoal('red')])).toEqual({ redScore: 0, blueScore: 1 });
    expect(scoreFromEvents([autogoal('blue')])).toEqual({ redScore: 1, blueScore: 0 });
  });

  it('save e injury non incidono sul punteggio', () => {
    const events = [
      goal('red'),
      { type: 'injury', team: 'blue', playerId: 'x' },
      { type: 'save', team: 'red', playerId: 'y' },
    ];
    expect(scoreFromEvents(events)).toEqual({ redScore: 1, blueScore: 0 });
  });

  it('mix di gol e autogol', () => {
    const events = [goal('red'), autogoal('blue'), goal('blue'), autogoal('red')];
    // red: 1 gol + 1 da autogol-blu = 2 ; blue: 1 gol + 1 da autogol-rosso = 2
    expect(scoreFromEvents(events)).toEqual({ redScore: 2, blueScore: 2 });
  });

  it('è indipendente dall\'ordine degli eventi', () => {
    const a = [goal('red'), autogoal('blue'), goal('blue')];
    const shuffled = [goal('blue'), goal('red'), autogoal('blue')];
    expect(scoreFromEvents(a)).toEqual(scoreFromEvents(shuffled));
  });
});

describe('withProgressiveScore', () => {
  it('annota il parziale progressivo nell\'ordine dato', () => {
    const events = [goal('red'), goal('blue'), autogoal('blue'), { type: 'injury', team: 'red' }];
    const out = withProgressiveScore(events);
    expect(out.map(e => [e.partialRed, e.partialBlue])).toEqual([
      [1, 0], // gol rosso
      [1, 1], // gol blu
      [2, 1], // autogol blu → punto rosso
      [2, 1], // injury → invariato
    ]);
  });

  it('il parziale finale coincide con scoreFromEvents', () => {
    const events = [goal('red'), autogoal('red'), goal('blue'), goal('blue')];
    const out = withProgressiveScore(events);
    const last = out[out.length - 1];
    const total = scoreFromEvents(events);
    expect({ redScore: last.partialRed, blueScore: last.partialBlue }).toEqual(total);
  });

  it('preserva i campi originali dell\'evento', () => {
    const out = withProgressiveScore([{ type: 'goal', team: 'red', scorerName: 'Marco', minute: 12 }]);
    expect(out[0]).toMatchObject({ scorerName: 'Marco', minute: 12, partialRed: 1, partialBlue: 0 });
  });

  it('lista vuota / null → []', () => {
    expect(withProgressiveScore([])).toEqual([]);
    expect(withProgressiveScore(null)).toEqual([]);
  });
});
