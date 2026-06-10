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

describe('nuovi badge — parziali, relazioni, premi, trend PI', () => {
  const redGoal  = (over = {}) => ({ type: 'goal', team: 'red', scorerId: 'p1', ...over });
  const blueGoal = (over = {}) => ({ type: 'goal', team: 'blue', scorerId: 'p2', ...over });

  it('remuntada: vince dopo essere stato sotto di 3+', () => {
    // p1 (rosso) sotto 0-3, poi vince 4-3
    const m = match({ events: [blueGoal(), blueGoal(), blueGoal(), redGoal(), redGoal(), redGoal(), redGoal()] });
    expect(badge('remuntada').check({}, player(), [m])).toBe(true);
    // sotto solo di 2 → no
    const m2 = match({ events: [blueGoal(), blueGoal(), redGoal(), redGoal(), redGoal()] });
    expect(badge('remuntada').check({}, player(), [m2])).toBe(false);
    // sotto di 3 ma perde → no
    const m3 = match({ events: [blueGoal(), blueGoal(), blueGoal(), redGoal()] });
    expect(badge('remuntada').check({}, player(), [m3])).toBe(false);
  });

  it('crollo_verticale: perde dopo essere stato avanti di 3+', () => {
    // p1 (rosso) avanti 3-0, poi perde 3-4
    const m = match({ events: [redGoal(), redGoal(), redGoal(), blueGoal(), blueGoal(), blueGoal(), blueGoal()] });
    expect(badge('crollo_verticale').check({}, player(), [m])).toBe(true);
    expect(badge('remuntada').check({}, player(), [m])).toBe(false); // ha perso
    // avanti di 3 ma vince → nessun crollo
    const m2 = match({ events: [redGoal(), redGoal(), redGoal(), blueGoal()] });
    expect(badge('crollo_verticale').check({}, player(), [m2])).toBe(false);
  });

  it('killer_instinct: 3+ gol-partita in vittorie di misura', () => {
    // 2-1 con p1 che segna l'ultimo punto rosso
    const clutchWin = (id) => match({ id, events: [
      blueGoal(), redGoal({ scorerId: 'p9' }), redGoal(),
    ] });
    expect(badge('killer_instinct').check({}, player(), [clutchWin('a'), clutchWin('b'), clutchWin('c')])).toBe(true);
    expect(badge('killer_instinct').check({}, player(), [clutchWin('a'), clutchWin('b')])).toBe(false);
    // vittoria di 2 → non è di misura
    const easyWin = match({ events: [redGoal(), redGoal()] });
    expect(badge('killer_instinct').check({}, player(), [easyWin, easyWin, easyWin])).toBe(false);
    // il punto decisivo è un autogol avversario → nessun credito
    const autoWin = (id) => match({ id, events: [
      redGoal(), blueGoal(), { type: 'autogoal', team: 'blue', scorerId: 'p2' },
    ] });
    expect(badge('killer_instinct').check({}, player(), [autoWin('a'), autoWin('b'), autoWin('c')])).toBe(false);
  });

  it('patto_di_sangue: assist reciproco nella STESSA partita', () => {
    const m = match({ events: [
      redGoal({ assistId: 'p3' }),
      redGoal({ scorerId: 'p3', assistId: 'p1' }),
    ] });
    expect(badge('patto_di_sangue').check({}, player(), [m])).toBe(true);
    // reciprocità spalmata su due partite → no
    const m1 = match({ id: 'x', events: [redGoal({ assistId: 'p3' })] });
    const m2 = match({ id: 'y', events: [redGoal({ scorerId: 'p3', assistId: 'p1' })] });
    expect(badge('patto_di_sangue').check({}, player(), [m1, m2])).toBe(false);
  });

  it('gatto: 3+ parate in una singola partita', () => {
    const save = { type: 'save', playerId: 'p1' };
    expect(badge('gatto').check({}, player(), [match({ events: [save, save, save] })])).toBe(true);
    expect(badge('gatto').check({}, player(), [match({ events: [save, save] })])).toBe(false);
    // 3 parate ma spalmate su due partite → no
    const mA = match({ id: 'a', events: [save, save] });
    const mB = match({ id: 'b', events: [save] });
    expect(badge('gatto').check({}, player(), [mA, mB])).toBe(false);
  });

  it('giano_bifronte: gol e autogol nella stessa partita', () => {
    const m = match({ events: [redGoal(), { type: 'autogoal', team: 'red', scorerId: 'p1' }] });
    expect(badge('giano_bifronte').check({}, player(), [m])).toBe(true);
    expect(badge('giano_bifronte').check({}, player(), [match({ events: [redGoal()] })])).toBe(false);
  });

  it('madonna_seriale: 3+ premi Bestie all-time, storiche escluse', () => {
    const bestie = (id, over = {}) => match({ id, bestieId: 'p1', ...over });
    expect(badge('madonna_seriale').check({}, player(), [bestie('a'), bestie('b'), bestie('c')])).toBe(true);
    expect(badge('madonna_seriale').check({}, player(), [bestie('a'), bestie('b')])).toBe(false);
    expect(badge('madonna_seriale').check({}, player(), [bestie('a'), bestie('b'), bestie('h', { isHistorical: true })])).toBe(false);
  });

  it('ritorno_del_re: segna alla prima partita dopo 60+ giorni', () => {
    const day = 86400000;
    const old = match({ id: 'old', date: Date.now() - 100 * day });
    const back = match({ id: 'back', date: Date.now(), events: [redGoal()] });
    expect(badge('ritorno_del_re').check({}, player(), [old, back])).toBe(true);
    // assenza di soli 30 giorni → no
    const recent = match({ id: 'r', date: Date.now() - 30 * day });
    expect(badge('ritorno_del_re').check({}, player(), [recent, back])).toBe(false);
    // torna dopo 100 giorni ma non segna → no
    const backNoGoal = match({ id: 'b2', date: Date.now(), events: [] });
    expect(badge('ritorno_del_re').check({}, player(), [old, backNoGoal])).toBe(false);
  });

  it('razzo / paracadutista: delta PI ±10 negli ultimi 30 giorni', () => {
    const iso = (daysAgo) => new Date(Date.now() - daysAgo * 86400000).toISOString().slice(0, 10);
    const up = player({ powerHistory: [{ d: iso(20), pi: 60 }, { d: iso(1), pi: 70 }] });
    expect(badge('razzo').check({}, up)).toBe(true);
    expect(badge('paracadutista').check({}, up)).toBe(false);
    const down = player({ powerHistory: [{ d: iso(20), pi: 70 }, { d: iso(1), pi: 60 }] });
    expect(badge('paracadutista').check({}, down)).toBe(true);
    expect(badge('razzo').check({}, down)).toBe(false);
    // +9 → niente razzo
    const small = player({ powerHistory: [{ d: iso(20), pi: 60 }, { d: iso(1), pi: 69 }] });
    expect(badge('razzo').check({}, small)).toBe(false);
    // snapshot fuori finestra (40 giorni fa) ignorato → un solo punto utile → nessun trend
    const stale = player({ powerHistory: [{ d: iso(40), pi: 50 }, { d: iso(1), pi: 70 }] });
    expect(badge('razzo').check({}, stale)).toBe(false);
    // powerHistory assente/vuoto → nessun crash, nessun badge
    expect(badge('razzo').check({}, player())).toBe(false);
    expect(badge('paracadutista').check({}, player({ powerHistory: [] }))).toBe(false);
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
