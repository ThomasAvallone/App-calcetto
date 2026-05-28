import { describe, it, expect } from 'vitest';
import { resolveBalancedTeams, resolveVoiceGoal } from './aiResolve';

const players = [
  { id: 'a', name: 'Marco', powerIndex: 70 },
  { id: 'b', name: 'Luca', powerIndex: 60 },
  { id: 'c', name: 'Gianni', powerIndex: 55 },
  { id: 'd', name: 'Dani', powerIndex: 80 },
];

describe('resolveBalancedTeams', () => {
  it('mappa i nomi (case-insensitive) ai player', () => {
    const r = resolveBalancedTeams({ red: ['marco', 'LUCA'], blue: ['Gianni', 'dani'] }, players);
    expect(r.red.map(p => p.id)).toEqual(['a', 'b']);
    expect(r.blue.map(p => p.id)).toEqual(['c', 'd']);
  });

  it('squadre DISGIUNTE: un nome ripetuto in entrambe non finisce in tutte e due', () => {
    const r = resolveBalancedTeams({ red: ['Marco', 'Luca'], blue: ['Marco', 'Dani'] }, players);
    // Marco assegnato ai rossi (prima lista), non duplicato nei blu
    expect(r.red.map(p => p.id)).toEqual(['a', 'b']);
    expect(r.blue.map(p => p.id)).not.toContain('a');
    // tutti assegnati una sola volta
    const all = [...r.red, ...r.blue].map(p => p.id);
    expect(new Set(all).size).toBe(all.length);
  });

  it('assegna i non menzionati alla squadra più piccola', () => {
    const r = resolveBalancedTeams({ red: ['Marco', 'Luca', 'Gianni'], blue: [] }, players);
    // Dani non menzionato → va ai blu (più piccola)
    expect(r.blue.map(p => p.id)).toContain('d');
    expect([...r.red, ...r.blue]).toHaveLength(4);
  });

  it('ignora i nomi inventati non presenti nella rosa', () => {
    const r = resolveBalancedTeams({ red: ['Fantasma', 'Marco'], blue: ['Luca'] }, players);
    const all = [...r.red, ...r.blue].map(p => p.id);
    // 'Fantasma' non esiste → ignorato; solo i 4 player reali, ciascuno una volta
    expect(all.sort()).toEqual(['a', 'b', 'c', 'd']);
    expect(r.red.map(p => p.id)).toContain('a'); // Marco dove indicato
    expect(r.red.map(p => p.id)).not.toContain(undefined);
  });

  it('input vuoto/parsed senza liste → tutti distribuiti, nessun crash', () => {
    const r = resolveBalancedTeams({}, players);
    expect([...r.red, ...r.blue]).toHaveLength(4);
    expect(new Set([...r.red, ...r.blue].map(p => p.id)).size).toBe(4);
  });

  it('passa il reasoning, default stringa vuota', () => {
    expect(resolveBalancedTeams({ reasoning: 'ok' }, players).reasoning).toBe('ok');
    expect(resolveBalancedTeams({}, players).reasoning).toBe('');
  });
});

describe('resolveVoiceGoal', () => {
  const red = [{ id: 'r1', name: 'Marco' }, { id: 'r2', name: 'Luca' }];
  const blue = [{ id: 'b1', name: 'Gianni' }, { id: 'b2', name: 'Dani' }];

  it('risolve scorer/assist/gk e deduce il team dallo scorer', () => {
    const r = resolveVoiceGoal({ scorerId: 'r1', assistId: 'r2', gkId: 'b1', isAutogoal: false }, red, blue);
    expect(r.scorer.id).toBe('r1');
    expect(r.assist.id).toBe('r2');
    expect(r.gk.id).toBe('b1');
    expect(r.team).toBe('red'); // dedotto dallo scorer, non da campo team
  });

  it('scarta gli ID inventati da Gemini', () => {
    const r = resolveVoiceGoal({ scorerId: 'XXX', assistId: 'YYY', gkId: 'ZZZ' }, red, blue);
    expect(r.scorer).toBeNull();
    expect(r.assist).toBeNull();
    expect(r.gk).toBeNull();
  });

  it('team dedotto dallo scorer prevale anche su un team errato dichiarato', () => {
    const r = resolveVoiceGoal({ scorerId: 'b2', team: 'red' }, red, blue);
    expect(r.team).toBe('blue'); // b2 è nei blu
  });

  it('senza scorer usa il team dichiarato (solo se red/blue)', () => {
    expect(resolveVoiceGoal({ team: 'blue' }, red, blue).team).toBe('blue');
    expect(resolveVoiceGoal({ team: 'verde' }, red, blue).team).toBeNull();
    expect(resolveVoiceGoal({}, red, blue).team).toBeNull();
  });

  it('isAutogoal sempre booleano', () => {
    expect(resolveVoiceGoal({ isAutogoal: true, scorerId: 'r1' }, red, blue).isAutogoal).toBe(true);
    expect(resolveVoiceGoal({ scorerId: 'r1' }, red, blue).isAutogoal).toBe(false);
    expect(resolveVoiceGoal({ isAutogoal: 'sì', scorerId: 'r1' }, red, blue).isAutogoal).toBe(true);
  });
});
