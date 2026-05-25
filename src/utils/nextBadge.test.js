import { describe, it, expect } from 'vitest';
import { getNextBadgeHint } from './nextBadge';

const baseStats = { goals: 0, assists: 0, wins: 0, matches: 0 };
const basePlayer = { powerIndex: 50, stats: { matches: 0, goals: 0, assists: 0 } };

describe('getNextBadgeHint', () => {
  it('ritorna null per stats vuote (sotto soglia minima)', () => {
    expect(getNextBadgeHint(basePlayer, baseStats)).toBeNull();
  });

  it('ritorna null per input mancanti', () => {
    expect(getNextBadgeHint(null, baseStats)).toBeNull();
    expect(getNextBadgeHint(basePlayer, null)).toBeNull();
  });

  it('suggerisce Bomber quando il player è a 9 gol stagione', () => {
    const hint = getNextBadgeHint(basePlayer, { ...baseStats, goals: 9 });
    expect(hint).not.toBeNull();
    expect(hint.id).toBe('bomber');
    expect(hint.remaining).toBe(1);
    expect(hint.progress).toBeCloseTo(0.9);
  });

  it('skip Bomber quando il badge è già sbloccato (10+ gol)', () => {
    const hint = getNextBadgeHint(basePlayer, { ...baseStats, goals: 10 });
    // Niente da suggerire (assistman/campione sono a 0 → sotto soglia)
    expect(hint).toBeNull();
  });

  it('preferisce il badge col progresso % più alto', () => {
    // Bomber: 6/10 = 60%, Assistman: 8/10 = 80% → vince Assistman
    const hint = getNextBadgeHint(basePlayer, { ...baseStats, goals: 6, assists: 8 });
    expect(hint.id).toBe('assistman');
    expect(hint.remaining).toBe(2);
  });

  it('rispetta la condizione di eligibility di Altruista (assists > goals)', () => {
    // 7 assist, 8 gol: Altruista NON eligible (assist non sono più dei gol).
    // Bomber 8/10 = 80%, Assistman 7/10 = 70% → vince Bomber
    const hint = getNextBadgeHint(basePlayer, { ...baseStats, goals: 8, assists: 7 });
    expect(hint.id).toBe('bomber');
  });

  it('include Altruista quando assist > goals e progresso ≥ soglia', () => {
    // 4 gol, 7 assist: Altruista 7/8 = 87.5%, Assistman 7/10 = 70%, Bomber 4/10 = 40%
    // → vince Altruista
    const hint = getNextBadgeHint(basePlayer, { ...baseStats, goals: 4, assists: 7 });
    expect(hint.id).toBe('altruista');
    expect(hint.remaining).toBe(1);
  });

  it('Jolly usa il minimo tra goals/assists/wins', () => {
    // 5 gol, 5 assist, 3 vittorie: Jolly min=3 → 3/5 = 60%
    // Bomber 50%, Assistman 50%, Campione 30% → vince Jolly (con goals/assists tied a 50% and Jolly a 60%)
    const hint = getNextBadgeHint(basePlayer, { ...baseStats, goals: 5, assists: 5, wins: 3 });
    expect(hint.id).toBe('jolly');
  });

  it('Fenomeno: distanza basata su powerIndex', () => {
    // PI 85 → 85/90.01 = 94.4% → vince Fenomeno se nessun altro è più vicino
    const hint = getNextBadgeHint({ ...basePlayer, powerIndex: 85 }, baseStats);
    expect(hint.id).toBe('fenomeno');
    expect(hint.remaining).toBeCloseTo(5.01, 1);
  });

  it('Veterano: distanza basata su all-time matches', () => {
    const player = { ...basePlayer, stats: { matches: 140, goals: 0, assists: 0 } };
    const hint = getNextBadgeHint(player, baseStats);
    expect(hint.id).toBe('veterano');
    expect(hint.remaining).toBe(10);
  });

  it('soglia minProgress filtra suggerimenti troppo lontani', () => {
    // 2 gol = 20%, sotto la soglia default 30% → null (gli altri sono 0%)
    expect(getNextBadgeHint(basePlayer, { ...baseStats, goals: 2 })).toBeNull();
    // Con soglia 0.1 il suggerimento appare
    const hint = getNextBadgeHint(basePlayer, { ...baseStats, goals: 2 }, 0.1);
    expect(hint?.id).toBe('bomber');
  });

  it('default value(0) usato in modo difensivo', () => {
    const hint = getNextBadgeHint({ powerIndex: undefined, stats: undefined }, baseStats);
    expect(hint).toBeNull();
  });
});
