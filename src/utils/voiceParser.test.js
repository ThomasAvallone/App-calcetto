import { describe, it, expect } from 'vitest';
import { parseVoiceGoal, findPlayer } from './voiceParser';

const redTeam = [
  { id: 'r1', name: 'Marco' },
  { id: 'r2', name: 'Luca' },
  { id: 'r3', name: 'Gianni' },
];
const blueTeam = [
  { id: 'b1', name: 'Thomas' },
  { id: 'b2', name: 'Bruno' },
  { id: 'b3', name: 'Edo' },
];

describe('findPlayer', () => {
  it('match esatto case-insensitive', () => {
    expect(findPlayer('marco', redTeam)).toEqual({ id: 'r1', name: 'Marco' });
    expect(findPlayer('MARCO', redTeam)).toEqual({ id: 'r1', name: 'Marco' });
  });

  it('match per prefisso del nome', () => {
    expect(findPlayer('thom', blueTeam)).toEqual({ id: 'b1', name: 'Thomas' });
  });

  it('match per prefisso reverse (trascritto più lungo del nome)', () => {
    // "edoardo" trascritto → matcha "Edo" (Edo è nickname di Edoardo)
    expect(findPlayer('edoardo', blueTeam)).toEqual({ id: 'b3', name: 'Edo' });
  });

  it('non matcha stopwords', () => {
    expect(findPlayer('di', [{ id: 'x', name: 'Di Marco' }])).toBeNull();
    expect(findPlayer('il', redTeam)).toBeNull();
  });

  it('rimuove punteggiatura', () => {
    expect(findPlayer('marco,', redTeam)).toEqual({ id: 'r1', name: 'Marco' });
    expect(findPlayer('luca.', redTeam)).toEqual({ id: 'r2', name: 'Luca' });
  });

  it('ritorna null per parola sconosciuta', () => {
    expect(findPlayer('xyz', redTeam)).toBeNull();
    expect(findPlayer('', redTeam)).toBeNull();
    expect(findPlayer(null, redTeam)).toBeNull();
  });
});

describe('parseVoiceGoal', () => {
  it('gol semplice "gol marco"', () => {
    const r = parseVoiceGoal('gol marco', redTeam, blueTeam);
    expect(r.isAutogoal).toBe(false);
    expect(r.scorer?.name).toBe('Marco');
    expect(r.team).toBe('red');
    expect(r.assist).toBeNull();
    expect(r.gk).toBeNull();
  });

  it('gestisce stopword "gol di marco"', () => {
    const r = parseVoiceGoal('gol di marco', redTeam, blueTeam);
    expect(r.scorer?.name).toBe('Marco');
    expect(r.team).toBe('red');
  });

  it('gol con assist "gol marco assist luca"', () => {
    const r = parseVoiceGoal('gol marco assist luca', redTeam, blueTeam);
    expect(r.scorer?.name).toBe('Marco');
    expect(r.assist?.name).toBe('Luca');
    expect(r.team).toBe('red');
  });

  it('gol completo con portiere "gol marco assist luca portiere bruno"', () => {
    const r = parseVoiceGoal('gol marco assist luca portiere bruno', redTeam, blueTeam);
    expect(r.scorer?.name).toBe('Marco');
    expect(r.assist?.name).toBe('Luca');
    expect(r.gk?.name).toBe('Bruno');
    expect(r.team).toBe('red');
  });

  it('autogol semplice "autogol thomas"', () => {
    const r = parseVoiceGoal('autogol thomas', redTeam, blueTeam);
    expect(r.isAutogoal).toBe(true);
    expect(r.scorer?.name).toBe('Thomas');
    expect(r.team).toBe('blue');
  });

  it('autogol con stopword "autogol di thomas"', () => {
    const r = parseVoiceGoal('autogol di thomas', redTeam, blueTeam);
    expect(r.isAutogoal).toBe(true);
    expect(r.scorer?.name).toBe('Thomas');
  });

  it('normalizza "auto gol" → "autogol"', () => {
    const r = parseVoiceGoal('auto gol thomas', redTeam, blueTeam);
    expect(r.isAutogoal).toBe(true);
    expect(r.scorer?.name).toBe('Thomas');
  });

  it('normalizza "auto goal" → "autogol"', () => {
    const r = parseVoiceGoal('auto goal di thomas', redTeam, blueTeam);
    expect(r.isAutogoal).toBe(true);
    expect(r.scorer?.name).toBe('Thomas');
  });

  it('normalizza "auto-gol" → "autogol"', () => {
    const r = parseVoiceGoal('auto-gol thomas', redTeam, blueTeam);
    expect(r.isAutogoal).toBe(true);
    expect(r.scorer?.name).toBe('Thomas');
  });

  it('case-insensitive globale', () => {
    const r = parseVoiceGoal('GOL MARCO ASSIST LUCA', redTeam, blueTeam);
    expect(r.scorer?.name).toBe('Marco');
    expect(r.assist?.name).toBe('Luca');
  });

  it('autogol con portiere "autogol thomas portiere bruno"', () => {
    const r = parseVoiceGoal('autogol thomas portiere bruno', redTeam, blueTeam);
    expect(r.isAutogoal).toBe(true);
    expect(r.scorer?.name).toBe('Thomas');
    expect(r.gk?.name).toBe('Bruno');
    expect(r.team).toBe('blue');
  });

  it('determina team blu se scorer in blueTeam', () => {
    const r = parseVoiceGoal('gol thomas', redTeam, blueTeam);
    expect(r.team).toBe('blue');
  });

  it('ritorna scorer null se nome non riconosciuto', () => {
    const r = parseVoiceGoal('gol xyz', redTeam, blueTeam);
    expect(r.scorer).toBeNull();
    expect(r.team).toBeNull();
  });

  it('ritorna tutti null su trascrizione vuota', () => {
    const r = parseVoiceGoal('', redTeam, blueTeam);
    expect(r.scorer).toBeNull();
    expect(r.assist).toBeNull();
    expect(r.gk).toBeNull();
  });

  it('gestisce null transcript senza crashare', () => {
    const r = parseVoiceGoal(null, redTeam, blueTeam);
    expect(r.scorer).toBeNull();
  });

  it('punteggiatura nel transcript non blocca il match', () => {
    const r = parseVoiceGoal('gol marco, assist luca!', redTeam, blueTeam);
    expect(r.scorer?.name).toBe('Marco');
    expect(r.assist?.name).toBe('Luca');
  });

  it('frase con preposizioni multiple "gol di marco con assist di luca"', () => {
    const r = parseVoiceGoal('gol di marco con assist di luca', redTeam, blueTeam);
    expect(r.scorer?.name).toBe('Marco');
    expect(r.assist?.name).toBe('Luca');
  });
});
