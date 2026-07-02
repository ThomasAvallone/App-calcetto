import { describe, it, expect } from 'vitest';
import { deriveEventMinute, fixZeroMinutes, MAX_PLAUSIBLE_MINUTE } from './eventMinute';

const MIN = 60000;
const T0 = 1750000000000; // ancora fittizia

describe('deriveEventMinute — cronometro usato', () => {
  it('usa il cronometro quando elapsed > 0', () => {
    expect(deriveEventMinute({ elapsedSeconds: 754, isRunning: false, matchDateMs: T0, nowMs: T0 + 90 * MIN }))
      .toBe(12); // il fallback (90) NON deve prevalere
  });

  it('usa il cronometro (minuto 0) se in corsa anche con elapsed 0', () => {
    expect(deriveEventMinute({ elapsedSeconds: 0, isRunning: true, matchDateMs: T0, nowMs: T0 + 90 * MIN }))
      .toBe(0);
  });
});

describe('deriveEventMinute — fallback tempo reale', () => {
  it('timer mai avviato → minuti reali da match.date', () => {
    expect(deriveEventMinute({ elapsedSeconds: 0, isRunning: false, matchDateMs: T0, nowMs: T0 + 23 * MIN }))
      .toBe(23);
  });

  it('data mancante → 0', () => {
    expect(deriveEventMinute({ elapsedSeconds: 0, isRunning: false, matchDateMs: 0, nowMs: T0 })).toBe(0);
    expect(deriveEventMinute({ elapsedSeconds: 0, isRunning: false, matchDateMs: NaN, nowMs: T0 })).toBe(0);
  });

  it('data implausibile (solo-giorno → mezzanotte, o futura) → 0, non minuti assurdi', () => {
    // partita registrata alle 21:30 con date = mezzanotte → 1290' implausibile
    expect(deriveEventMinute({ elapsedSeconds: 0, isRunning: false, matchDateMs: T0, nowMs: T0 + 1290 * MIN }))
      .toBe(0);
    // date nel futuro (pianificata 21:30, si gioca alle 21:10) → niente negativi
    expect(deriveEventMinute({ elapsedSeconds: 0, isRunning: false, matchDateMs: T0 + 20 * MIN, nowMs: T0 }))
      .toBe(0);
  });

  it('accetta esattamente il limite di plausibilità', () => {
    expect(deriveEventMinute({ elapsedSeconds: 0, isRunning: false, matchDateMs: T0, nowMs: T0 + MAX_PLAUSIBLE_MINUTE * MIN }))
      .toBe(MAX_PLAUSIBLE_MINUTE);
  });
});

describe('fixZeroMinutes — ancora match.date plausibile', () => {
  it('corregge i minuti dai timestamp e conta solo gli eventi modificati', () => {
    const events = [
      { type: 'goal', minute: 0, timestamp: T0 + 12 * MIN },
      { type: 'goal', minute: 0, timestamp: T0 + 47 * MIN },
      { type: 'goal', minute: 33, timestamp: T0 + 33 * MIN }, // già valorizzato: intoccabile
    ];
    const { events: out, changed } = fixZeroMinutes(events, T0);
    expect(changed).toBe(2);
    expect(out[0].minute).toBe(12);
    expect(out[1].minute).toBe(47);
    expect(out[2]).toBe(events[2]); // stessa referenza, non riscritto
  });

  it('include anche infortuni/parate con minuto 0', () => {
    const events = [
      { type: 'goal', minute: 0, timestamp: T0 + 5 * MIN },
      { type: 'injury', minute: 0, timestamp: T0 + 18 * MIN },
    ];
    const { events: out, changed } = fixZeroMinutes(events, T0);
    expect(changed).toBe(2);
    expect(out[1].minute).toBe(18);
  });

  it('NON conta come corretti gli eventi senza timestamp (niente conteggi fantasma)', () => {
    const events = [
      { type: 'goal', timestamp: T0 + 10 * MIN },      // minute assente ma correggibile
      { type: 'goal' },                                 // né minute né timestamp: da ignorare
      { type: 'goal', minute: 0 },                      // minute 0 senza timestamp: da ignorare
    ];
    const { events: out, changed } = fixZeroMinutes(events, T0);
    expect(changed).toBe(1);
    expect(out[0].minute).toBe(10);
    expect(out[1]).toBe(events[1]);
    expect(out[2]).toBe(events[2]);
    expect('minute' in out[1]).toBe(false); // nessun campo undefined introdotto
  });

  it('gol nel primo minuto reale resta 0 e non conta come modificato', () => {
    const events = [{ type: 'goal', minute: 0, timestamp: T0 + 30000 }];
    const { changed } = fixZeroMinutes(events, T0);
    expect(changed).toBe(0);
  });
});

describe('fixZeroMinutes — ancora inaffidabile → progressione dal primo evento', () => {
  it('date solo-giorno (mezzanotte): usa il primo timestamp come minuto 0', () => {
    const midnight = T0;
    const kickoff = T0 + 21 * 60 * MIN; // eventi alle 21:00
    const events = [
      { type: 'goal', minute: 0, timestamp: kickoff + 8 * MIN },
      { type: 'goal', minute: 0, timestamp: kickoff + 31 * MIN },
    ];
    const { events: out, changed } = fixZeroMinutes(events, midnight);
    expect(changed).toBe(1);          // il primo resta 0 (è l'ancora)
    expect(out[0].minute).toBe(0);
    expect(out[1].minute).toBe(23);   // intervallo reale preservato
  });

  it('date futura rispetto agli eventi: nessun minuto negativo, progressione relativa', () => {
    const events = [
      { type: 'goal', minute: 0, timestamp: T0 },
      { type: 'goal', minute: 0, timestamp: T0 + 15 * MIN },
    ];
    const { events: out } = fixZeroMinutes(events, T0 + 60 * MIN);
    expect(out[0].minute).toBe(0);
    expect(out[1].minute).toBe(15);
  });
});

describe('fixZeroMinutes — casi limite', () => {
  it('lista vuota / null → nessuna modifica', () => {
    expect(fixZeroMinutes([], T0)).toEqual({ events: [], changed: 0 });
    expect(fixZeroMinutes(null, T0).changed).toBe(0);
  });

  it('nessun evento correggibile → lista identica', () => {
    const events = [{ type: 'goal', minute: 7, timestamp: T0 + 7 * MIN }];
    const { events: out, changed } = fixZeroMinutes(events, T0);
    expect(changed).toBe(0);
    expect(out).toBe(events);
  });

  it('ancora mancante (0/NaN) → progressione dal primo evento', () => {
    const events = [
      { type: 'goal', minute: 0, timestamp: T0 },
      { type: 'goal', minute: 0, timestamp: T0 + 9 * MIN },
    ];
    expect(fixZeroMinutes(events, 0).events[1].minute).toBe(9);
    expect(fixZeroMinutes(events, NaN).events[1].minute).toBe(9);
  });
});
