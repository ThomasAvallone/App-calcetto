import { describe, it, expect } from 'vitest';
import { sanitizePublicName } from './firestore';

// Invariante privacy: i nomi pubblici (raterName dei voti, playerName delle reazioni)
// finiscono in documenti Firestore leggibili da ogni utente autenticato. L'email del
// giocatore deve restare visibile solo agli admin → non deve mai comparire lì.
describe('sanitizePublicName', () => {
  it('lascia passare i nomi normali', () => {
    expect(sanitizePublicName('Marco')).toBe('Marco');
    expect(sanitizePublicName('Fede M.')).toBe('Fede M.');
    expect(sanitizePublicName('Anonimo')).toBe('Anonimo');
  });

  it('scarta qualsiasi valore che sembri un\'email (contiene @)', () => {
    expect(sanitizePublicName('mario.rossi@gmail.com')).toBeNull();
    expect(sanitizePublicName('a@b')).toBeNull();
  });

  it('gestisce input non-stringa → null', () => {
    expect(sanitizePublicName(null)).toBeNull();
    expect(sanitizePublicName(undefined)).toBeNull();
    expect(sanitizePublicName(42)).toBeNull();
    expect(sanitizePublicName({})).toBeNull();
  });

  it('stringa vuota resta stringa vuota (non è un\'email)', () => {
    expect(sanitizePublicName('')).toBe('');
  });
});
