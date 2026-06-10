import { describe, it, expect } from 'vitest';
import { eventsSignature, isHeadlineFresh } from './eventsSignature';

const goal = (over = {}) => ({ type: 'goal', team: 'red', scorerId: 'p1', assistId: null, minute: 10, ...over });

describe('eventsSignature', () => {
  it('è deterministica: stessi eventi → stessa firma', () => {
    const evs = [goal(), goal({ scorerId: 'p2', minute: 20 })];
    expect(eventsSignature(evs)).toBe(eventsSignature([...evs]));
  });

  it('è insensibile all\'ordine degli eventi', () => {
    const a = goal();
    const b = goal({ scorerId: 'p2', team: 'blue', minute: 20 });
    expect(eventsSignature([a, b])).toBe(eventsSignature([b, a]));
  });

  it('cambia se cambia un campo narrativo (scorer, minuto, assist, team, tipo)', () => {
    const base = eventsSignature([goal()]);
    expect(eventsSignature([goal({ scorerId: 'p9' })])).not.toBe(base);
    expect(eventsSignature([goal({ minute: 11 })])).not.toBe(base);
    expect(eventsSignature([goal({ assistId: 'p2' })])).not.toBe(base);
    expect(eventsSignature([goal({ team: 'blue' })])).not.toBe(base);
    expect(eventsSignature([goal({ type: 'autogoal' })])).not.toBe(base);
  });

  it('cambia se un evento viene aggiunto o rimosso', () => {
    const one = eventsSignature([goal()]);
    const two = eventsSignature([goal(), goal({ minute: 30 })]);
    expect(one).not.toBe(two);
  });

  it('usa playerId per save/injury (che non hanno scorerId)', () => {
    const save = { type: 'save', team: 'red', playerId: 'p1', minute: 5 };
    const base = eventsSignature([save]);
    expect(eventsSignature([{ ...save, playerId: 'p2' }])).not.toBe(base);
  });

  it('gestisce input null/undefined/vuoto senza crash', () => {
    expect(eventsSignature(null)).toBe('0#');
    expect(eventsSignature(undefined)).toBe('0#');
    expect(eventsSignature([])).toBe('0#');
  });
});

describe('isHeadlineFresh', () => {
  it('true quando la firma salvata coincide con gli eventi correnti', () => {
    const events = [goal()];
    const m = { aiHeadline: 'Titolo', aiHeadlineSig: eventsSignature(events), events };
    expect(isHeadlineFresh(m)).toBe(true);
  });

  it('false quando gli eventi sono cambiati dopo la generazione', () => {
    const m = {
      aiHeadline: 'Titolo',
      aiHeadlineSig: eventsSignature([goal()]),
      events: [goal(), goal({ minute: 40 })],
    };
    expect(isHeadlineFresh(m)).toBe(false);
  });

  it('false senza titolo o senza firma o match null', () => {
    expect(isHeadlineFresh(null)).toBe(false);
    expect(isHeadlineFresh({ events: [] })).toBe(false);
    expect(isHeadlineFresh({ aiHeadline: 'X', events: [] })).toBe(false);
    expect(isHeadlineFresh({ aiHeadlineSig: '0#', events: [] })).toBe(false);
  });
});
