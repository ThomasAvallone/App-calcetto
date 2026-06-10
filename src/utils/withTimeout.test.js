import { describe, it, expect } from 'vitest';
import { withTimeout, isTimeout, TimeoutError } from './withTimeout';

const delay = (ms, value) => new Promise(resolve => setTimeout(() => resolve(value), ms));
const delayReject = (ms, err) => new Promise((_, reject) => setTimeout(() => reject(err), ms));

describe('withTimeout', () => {
  it('risolve col valore originale se la promise completa in tempo', async () => {
    await expect(withTimeout(delay(10, 'ok'), 200)).resolves.toBe('ok');
  });

  it('propaga il rejection originale se avviene prima del timeout', async () => {
    const boom = new Error('boom');
    await expect(withTimeout(delayReject(10, boom), 200)).rejects.toBe(boom);
  });

  it('rigetta con TimeoutError se la promise non risolve in tempo', async () => {
    await expect(withTimeout(delay(500, 'late'), 20)).rejects.toBeInstanceOf(TimeoutError);
  });

  it('accetta anche valori non-promise (li risolve subito)', async () => {
    await expect(withTimeout(42, 50)).resolves.toBe(42);
  });

  it('non genera unhandled rejection se la promise fallisce dopo il timeout', async () => {
    // Il catch no-op interno deve assorbire il rejection tardivo
    const late = delayReject(40, new Error('late-fail'));
    await expect(withTimeout(late, 10)).rejects.toBeInstanceOf(TimeoutError);
    // Attendi che il rejection tardivo avvenga: nessun crash/unhandled
    await delay(60);
  });
});

describe('isTimeout', () => {
  it('riconosce TimeoutError', () => {
    expect(isTimeout(new TimeoutError(100))).toBe(true);
  });

  it('riconosce errori con name TimeoutError (cross-realm)', () => {
    const e = new Error('x');
    e.name = 'TimeoutError';
    expect(isTimeout(e)).toBe(true);
  });

  it('rifiuta errori normali, null e undefined', () => {
    expect(isTimeout(new Error('boom'))).toBe(false);
    expect(isTimeout(null)).toBe(false);
    expect(isTimeout(undefined)).toBe(false);
  });
});
