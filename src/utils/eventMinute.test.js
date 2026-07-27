import { describe, it, expect } from 'vitest';
import { deriveEventMinute, fixZeroMinutes, hasKnownTiming, maxEventMinute, MAX_PLAUSIBLE_MINUTE } from './eventMinute';

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

describe('deriveEventMinute — clamp di monotonicità (lastEventMinute)', () => {
  it('cronometro avviato DOPO gol col fallback: il minuto non torna indietro', () => {
    // cronaca già a 25' (fallback), admin avvia il timer → elapsed 120s = 2'
    expect(deriveEventMinute({ elapsedSeconds: 120, isRunning: true, matchDateMs: T0, nowMs: T0 + 27 * MIN, lastEventMinute: 25 }))
      .toBe(25);
    // quando il timer supera il massimo, riprende a contare normalmente
    expect(deriveEventMinute({ elapsedSeconds: 26 * 60, isRunning: true, matchDateMs: T0, nowMs: T0 + 51 * MIN, lastEventMinute: 25 }))
      .toBe(26);
  });

  it('è un no-op nel flusso puro-timer e puro-fallback (già monotoni)', () => {
    expect(deriveEventMinute({ elapsedSeconds: 40 * 60, isRunning: true, matchDateMs: T0, nowMs: T0, lastEventMinute: 12 }))
      .toBe(40);
    expect(deriveEventMinute({ elapsedSeconds: 0, isRunning: false, matchDateMs: T0, nowMs: T0 + 40 * MIN, lastEventMinute: 12 }))
      .toBe(40);
  });

  it('clamp anche sul fallback implausibile (0 → resta almeno lastEventMinute)', () => {
    expect(deriveEventMinute({ elapsedSeconds: 0, isRunning: false, matchDateMs: 0, nowMs: T0, lastEventMinute: 7 }))
      .toBe(7);
  });
});

describe('maxEventMinute / hasKnownTiming', () => {
  it('maxEventMinute: massimo tra i minuti numerici, 0 senza eventi', () => {
    expect(maxEventMinute([{ minute: 3 }, { minute: 41 }, { minute: null }, {}])).toBe(41);
    expect(maxEventMinute([])).toBe(0);
    expect(maxEventMinute(null)).toBe(0);
  });

  it('hasKnownTiming: true solo con almeno un minuto > 0', () => {
    expect(hasKnownTiming([{ minute: 0 }, { minute: 0 }])).toBe(false);
    expect(hasKnownTiming([{ minute: 0 }, { minute: 12 }])).toBe(true);
    expect(hasKnownTiming([])).toBe(false);
    expect(hasKnownTiming(null)).toBe(false);
  });
});

describe('fixZeroMinutes — ancora match.date plausibile (partita tutta a minute 0)', () => {
  it('corregge i minuti dai timestamp e conta solo gli eventi modificati', () => {
    const events = [
      { type: 'goal', minute: 0, timestamp: T0 + 12 * MIN },
      { type: 'goal', minute: 0, timestamp: T0 + 47 * MIN },
    ];
    const { events: out, changed } = fixZeroMinutes(events, T0);
    expect(changed).toBe(2);
    expect(out[0].minute).toBe(12);
    expect(out[1].minute).toBe(47);
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

describe('fixZeroMinutes — guard timing noto (zeri ambigui = legittimi)', () => {
  it('se qualche evento ha già minuto > 0 NON tocca nulla', () => {
    // il gol a 0' col cronometro avviato è un vero gol del primo minuto:
    // riscriverlo dal timestamp contro un'ancora diversa creerebbe incoerenza
    const events = [
      { type: 'goal', minute: 0, timestamp: T0 + 40 * MIN },  // legittimo 1° minuto (match iniziato tardi)
      { type: 'goal', minute: 33, timestamp: T0 + 73 * MIN },
    ];
    const { events: out, changed } = fixZeroMinutes(events, T0);
    expect(changed).toBe(0);
    expect(out).toBe(events);
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

  it('timestamp anomalo (clock skew, giorni dopo): quell\'evento resta intatto', () => {
    const events = [
      { type: 'goal', minute: 0, timestamp: T0 },
      { type: 'goal', minute: 0, timestamp: T0 + 9 * MIN },
      { type: 'goal', minute: 0, timestamp: T0 + 2880 * MIN }, // 2 giorni dopo
    ];
    const { events: out, changed } = fixZeroMinutes(events, 0);
    expect(changed).toBe(1);
    expect(out[1].minute).toBe(9);
    expect(out[2]).toBe(events[2]);   // mai minuti oltre MAX_PLAUSIBLE_MINUTE
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
