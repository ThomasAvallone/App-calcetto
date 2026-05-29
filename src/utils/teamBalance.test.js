import { describe, it, expect } from 'vitest';
import { balanceTeams, balanceWithLocks } from './teamBalance';

const P = (id, powerIndex) => ({ id, powerIndex });
const ids = team => team.map(p => p.id).sort();

describe('balanceTeams (snake draft)', () => {
  it('lista vuota → squadre vuote', () => {
    expect(balanceTeams([])).toEqual({ red: [], blue: [] });
    expect(balanceTeams(null)).toEqual({ red: [], blue: [] });
  });

  it('10 giocatori → 5 vs 5, tutti assegnati una sola volta', () => {
    const pool = Array.from({ length: 10 }, (_, i) => P(`p${i}`, 90 - i * 5));
    const { red, blue } = balanceTeams(pool);
    expect(red.length).toBe(5);
    expect(blue.length).toBe(5);
    const all = [...ids(red), ...ids(blue)].sort();
    expect(all).toEqual(pool.map(p => p.id).sort());
  });

  it('squadre disgiunte (nessun giocatore in entrambe)', () => {
    const pool = Array.from({ length: 8 }, (_, i) => P(`p${i}`, 50 + i));
    const { red, blue } = balanceTeams(pool);
    const overlap = red.filter(r => blue.some(b => b.id === r.id));
    expect(overlap).toEqual([]);
  });

  it('snake draft bilancia il PI: il top va in red, il 2°/3° in blue', () => {
    const pool = [P('a', 99), P('b', 90), P('c', 80), P('d', 70)];
    const { red, blue } = balanceTeams(pool);
    // ordine PI desc: a,b,c,d → idx0 a→red, idx1 b→blue, idx2 c→blue, idx3 d→red
    expect(ids(red)).toEqual(['a', 'd']);
    expect(ids(blue)).toEqual(['b', 'c']);
  });

  it('numero dispari → split 3/4, tutti assegnati una sola volta', () => {
    // Snake 0→R,1→B,2→B,3→R,4→R,5→B,6→B → red=idx{0,3,4}=3, blue=idx{1,2,5,6}=4
    const pool = Array.from({ length: 7 }, (_, i) => P(`p${i}`, 60));
    const { red, blue } = balanceTeams(pool);
    expect(red.length).toBe(3);
    expect(blue.length).toBe(4);
    expect([...ids(red), ...ids(blue)].sort()).toEqual(pool.map(p => p.id).sort());
  });
});

describe('balanceWithLocks', () => {
  it('senza lock si comporta come un greedy bilanciato e assegna tutti', () => {
    const pool = Array.from({ length: 6 }, (_, i) => P(`p${i}`, 90 - i * 10));
    const { red, blue } = balanceWithLocks(pool, {});
    expect(red.length).toBe(3);
    expect(blue.length).toBe(3);
    const all = [...ids(red), ...ids(blue)].sort();
    expect(all).toEqual(pool.map(p => p.id).sort());
  });

  it('rispetta i lock: i bloccati restano sulla loro squadra', () => {
    const pool = [P('a', 80), P('b', 70), P('c', 60), P('d', 50)];
    const { red, blue } = balanceWithLocks(pool, { a: 'red', b: 'red' });
    expect(red.map(p => p.id)).toEqual(expect.arrayContaining(['a', 'b']));
    expect(blue.some(p => p.id === 'a' || p.id === 'b')).toBe(false);
    // tutti assegnati, niente duplicati
    const all = [...ids(red), ...ids(blue)].sort();
    expect(all).toEqual(['a', 'b', 'c', 'd']);
  });

  it('ritorna null se i lock eccedono la capienza di un lato', () => {
    // 4 giocatori → targetRed=2; 3 lock su red eccede → null
    const pool = [P('a', 50), P('b', 50), P('c', 50), P('d', 50)];
    expect(balanceWithLocks(pool, { a: 'red', b: 'red', c: 'red' })).toBeNull();
  });

  it('i liberi vanno al lato con PI minore per minimizzare il gap', () => {
    // red bloccato con un fortissimo (99) → i liberi top dovrebbero andare a blue
    const pool = [P('lock', 99), P('x', 80), P('y', 78), P('z', 10)];
    const { red, blue } = balanceWithLocks(pool, { lock: 'red' });
    // targetRed=2, targetBlue=2. lock occupa 1 slot red. Free: x,y,z (PI desc).
    // remB parte da 2. x→blue (remB=1, piB=80); y: piR99>piB80 → blue (remB=0, piB=158);
    // z: remB=0 → forzato in red. Risultato: red=[lock,z], blue=[x,y].
    expect(red.map(p => p.id).sort()).toEqual(['lock', 'z']);
    expect(blue.map(p => p.id).sort()).toEqual(['x', 'y']);
  });

  it('squadre sempre disgiunte anche con lock parziali', () => {
    const pool = Array.from({ length: 10 }, (_, i) => P(`p${i}`, 50 + i));
    const { red, blue } = balanceWithLocks(pool, { p0: 'red', p1: 'blue', p2: 'red' });
    const overlap = red.filter(r => blue.some(b => b.id === r.id));
    expect(overlap).toEqual([]);
    expect(red.length + blue.length).toBe(10);
  });
});
