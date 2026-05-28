import { describe, it, expect, vi } from 'vitest';
import { BADGE_DEFS, computeBadges } from './badges';

// Helpers per costruire dati minimi
const player = (over = {}) => ({ id: 'p1', name: 'Test', powerIndex: 50, stats: {}, ...over });
const match = (over = {}) => ({
  id: 'm1', status: 'finished', isHistorical: false,
  redTeam: [{ id: 'p1', name: 'Test' }], blueTeam: [{ id: 'p2', name: 'Avv' }],
  redScore: 0, blueScore: 0, events: [], date: Date.now(), ...over,
});
const badge = (id) => BADGE_DEFS.find(b => b.id === id);
const has = (badges, id) => badges.some(b => b.id === id);

describe('computeBadges — robustezza', () => {
  it('ritorna [] se player è null/undefined', () => {
    expect(computeBadges(null, {}, [])).toEqual([]);
    expect(computeBadges(undefined, {}, [])).toEqual([]);
  });

  it('non lancia se seasonStats e allMatches sono mancanti', () => {
    expect(() => computeBadges(player(), null, null)).not.toThrow();
    expect(() => computeBadges(player(), undefined, undefined)).not.toThrow();
  });

  it('isola gli errori: un check che lancia non azzera gli altri badge', () => {
    // Inietta temporaneamente un badge il cui check lancia
    const boom = { id: '__boom__', icon: '💣', label: 'Boom', positive: true, check: () => { throw new Error('boom'); } };
    BADGE_DEFS.push(boom);
    try {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      // Player chiaramente Bomber: deve comparire nonostante il badge che esplode
      const badges = computeBadges(player(), { goals: 12 }, []);
      expect(has(badges, 'bomber')).toBe(true);
      expect(has(badges, '__boom__')).toBe(false);
      warn.mockRestore();
    } finally {
      BADGE_DEFS.pop();
    }
  });

  it('non assegna badge a stats vuote', () => {
    const badges = computeBadges(player(), {}, []);
    // Nessun badge stagionale positivo a stats vuote (PI 50 non sblocca fenomeno)
    expect(has(badges, 'bomber')).toBe(false);
    expect(has(badges, 'fenomeno')).toBe(false);
  });
});

describe('badge stagionali (stats-based)', () => {
  it('bomber: 10+ gol', () => {
    expect(badge('bomber').check({ goals: 10 })).toBe(true);
    expect(badge('bomber').check({ goals: 9 })).toBe(false);
  });

  it('cecchino: >0.5 gol/partita, min 5 partite', () => {
    expect(badge('cecchino').check({ goals: 3, matches: 5 })).toBe(true); // 0.6
    expect(badge('cecchino').check({ goals: 3, matches: 4 })).toBe(false); // <5 partite
    expect(badge('cecchino').check({ goals: 2, matches: 5 })).toBe(false); // 0.4
  });

  it('altruista: assist >= 8 e assist > gol', () => {
    expect(badge('altruista').check({ assists: 8, goals: 5 })).toBe(true);
    expect(badge('altruista').check({ assists: 8, goals: 8 })).toBe(false);
    expect(badge('altruista').check({ assists: 7, goals: 0 })).toBe(false);
  });

  it('jolly: 5+ gol, assist e vittorie', () => {
    expect(badge('jolly').check({ goals: 5, assists: 5, wins: 5 })).toBe(true);
    expect(badge('jolly').check({ goals: 5, assists: 5, wins: 4 })).toBe(false);
  });

  it('muro / colabrodo / gufo usano media gol/turno = conceded/(matches*2)', () => {
    // matches=5 → 10 turni GK. Muro: <1.5/turno → <15 gol
    expect(badge('muro').check({ matches: 5, gkGoalsConceded: 14 })).toBe(true);
    expect(badge('muro').check({ matches: 5, gkGoalsConceded: 15 })).toBe(false);
    // Colabrodo: >3/turno con matches=5 → >30 gol
    expect(badge('colabrodo').check({ matches: 5, gkGoalsConceded: 31 })).toBe(true);
    expect(badge('colabrodo').check({ matches: 5, gkGoalsConceded: 30 })).toBe(false);
    // Gufo: >4/turno, min 3 partite (6 turni) → >24 gol
    expect(badge('gufo').check({ matches: 3, gkGoalsConceded: 25 })).toBe(true);
    expect(badge('gufo').check({ matches: 3, gkGoalsConceded: 24 })).toBe(false);
  });

  it('fantasma: 10+ partite, 0 gol', () => {
    expect(badge('fantasma').check({ matches: 10, goals: 0 })).toBe(true);
    expect(badge('fantasma').check({ matches: 10, goals: 1 })).toBe(false);
    expect(badge('fantasma').check({ matches: 9, goals: 0 })).toBe(false);
  });

  it('wild_card: |V-S| <= 1, min 12 partite', () => {
    expect(badge('wild_card').check({ matches: 12, wins: 6, losses: 6 })).toBe(true);
    expect(badge('wild_card').check({ matches: 12, wins: 8, losses: 6 })).toBe(false);
    expect(badge('wild_card').check({ matches: 11, wins: 5, losses: 5 })).toBe(false);
  });
});

describe('badge PI / all-time (player-based)', () => {
  it('fenomeno / il_prescelto soglie PI', () => {
    expect(badge('fenomeno').check({}, player({ powerIndex: 91 }))).toBe(true);
    expect(badge('fenomeno').check({}, player({ powerIndex: 90 }))).toBe(false);
    expect(badge('il_prescelto').check({}, player({ powerIndex: 96 }))).toBe(true);
    expect(badge('il_prescelto').check({}, player({ powerIndex: 95 }))).toBe(false);
  });

  it('veterano / diamante usano stats all-time', () => {
    expect(badge('veterano').check({}, player({ stats: { matches: 150 } }))).toBe(true);
    expect(badge('veterano').check({}, player({ stats: { matches: 149 } }))).toBe(false);
    expect(badge('diamante').check({}, player({ stats: { goals: 60, assists: 40 } }))).toBe(true);
    expect(badge('diamante').check({}, player({ stats: { goals: 60, assists: 39 } }))).toBe(false);
  });

  it('on_fire / crisi leggono player.streak', () => {
    expect(badge('on_fire').check({}, player({ streak: { type: 'win', count: 4 } }))).toBe(true);
    expect(badge('on_fire').check({}, player({ streak: { type: 'win', count: 3 } }))).toBe(false);
    expect(badge('crisi').check({}, player({ streak: { type: 'loss', count: 4 } }))).toBe(true);
    expect(badge('on_fire').check({}, player({}))).toBe(false); // nessuna streak
  });
});

describe('badge match-event-based', () => {
  it('meteorite: hat-trick (3+ gol in una partita)', () => {
    const m = match({ events: [
      { type: 'goal', scorerId: 'p1' }, { type: 'goal', scorerId: 'p1' }, { type: 'goal', scorerId: 'p1' },
    ] });
    expect(badge('meteorite').check({}, player(), [m])).toBe(true);
  });

  it('pokemon_leggendario: 5 gol in una partita', () => {
    const ev = { type: 'goal', scorerId: 'p1' };
    const m = match({ events: [ev, ev, ev, ev] });
    expect(badge('pokemon_leggendario').check({}, player(), [m])).toBe(false);
    const m5 = match({ events: [ev, ev, ev, ev, ev] });
    expect(badge('pokemon_leggendario').check({}, player(), [m5])).toBe(true);
  });

  it('lone_ranger: 2+ gol tutti senza assist', () => {
    const m = match({ events: [
      { type: 'goal', scorerId: 'p1', assistId: null }, { type: 'goal', scorerId: 'p1', assistId: null },
    ] });
    expect(badge('lone_ranger').check({}, player(), [m])).toBe(true);
    const mAssist = match({ events: [
      { type: 'goal', scorerId: 'p1', assistId: 'p2' }, { type: 'goal', scorerId: 'p1', assistId: null },
    ] });
    expect(badge('lone_ranger').check({}, player(), [mAssist])).toBe(false);
  });

  it('rockstar: gol in 5 partite consecutive', () => {
    const scoring = (id) => match({ id, events: [{ type: 'goal', scorerId: 'p1' }] });
    const five = [scoring('a'), scoring('b'), scoring('c'), scoring('d'), scoring('e')];
    expect(badge('rockstar').check({}, player(), five)).toBe(true);
    const four = five.slice(0, 4);
    expect(badge('rockstar').check({}, player(), four)).toBe(false);
  });

  it('bulldozer: vittoria con 5+ gol di scarto', () => {
    const m = match({ redScore: 6, blueScore: 1 });
    expect(badge('bulldozer').check({}, player(), [m])).toBe(true);
    const close = match({ redScore: 5, blueScore: 1 });
    expect(badge('bulldozer').check({}, player(), [close])).toBe(false);
  });

  it('highlander: 30+ partite senza infortuni; un infortunio lo annulla', () => {
    const clean = Array.from({ length: 30 }, (_, i) => match({ id: `m${i}` }));
    expect(badge('highlander').check({}, player(), clean)).toBe(true);
    const withInjury = [...clean, match({ id: 'inj', events: [{ type: 'injury', playerId: 'p1' }] })];
    expect(badge('highlander').check({}, player(), withInjury)).toBe(false);
  });

  it('re_infermeria: più infortuni all-time (min 3) — gestisce counts vuoto', () => {
    // Nessun infortunio → false senza crash su Math.max
    expect(badge('re_infermeria').check({}, player(), [match()])).toBe(false);
    const injuries = (id, pid) => match({ id, events: [{ type: 'injury', playerId: pid }] });
    const matches = [injuries('a', 'p1'), injuries('b', 'p1'), injuries('c', 'p1')];
    expect(badge('re_infermeria').check({}, player(), matches)).toBe(true);
  });

  it('vetro_murano ignora partite storiche e non terminate', () => {
    const inj = { type: 'injury', playerId: 'p1' };
    const hist = match({ id: 'h', isHistorical: true, events: [inj, inj] });
    expect(badge('vetro_murano').check({}, player(), [hist])).toBe(false);
  });

  it('ignora partite non terminate e storiche per i badge event-based', () => {
    const goalEv = { type: 'goal', scorerId: 'p1' };
    const active = match({ status: 'active', events: [goalEv, goalEv, goalEv] });
    const hist = match({ isHistorical: true, events: [goalEv, goalEv, goalEv] });
    expect(badge('meteorite').check({}, player(), [active])).toBe(false);
    expect(badge('meteorite').check({}, player(), [hist])).toBe(false);
  });
});

describe('coerenza definizioni', () => {
  it('ogni badge ha id, icon, label, desc, positive booleano e check funzione', () => {
    const ids = new Set();
    for (const b of BADGE_DEFS) {
      expect(typeof b.id).toBe('string');
      expect(b.id.length).toBeGreaterThan(0);
      expect(ids.has(b.id)).toBe(false); // id univoci
      ids.add(b.id);
      expect(typeof b.icon).toBe('string');
      expect(typeof b.label).toBe('string');
      expect(typeof b.desc).toBe('string');
      expect(typeof b.positive).toBe('boolean');
      expect(typeof b.check).toBe('function');
    }
  });

  it('nessun check lancia con input minimi validi', () => {
    const p = player();
    const m = [match()];
    for (const b of BADGE_DEFS) {
      expect(() => b.check({}, p, m), `badge ${b.id}`).not.toThrow();
    }
  });
});
