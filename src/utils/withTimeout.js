// ─── Bound temporale per promise che possono non risolvere mai ───────────────
// Con la persistenza offline di Firestore (IndexedDB), le write fatte senza rete
// restano in coda e si sincronizzano da sole — ma la loro promise risolve SOLO
// all'ack del server, cioè mai finché si è offline. Ogni `await` diretto su una
// write Firestore può quindi bloccare per sempre un flusso UI (fine partita,
// avvio partita, ecc.). `withTimeout` limita l'attesa: al timeout il flusso
// prosegue, la write resta comunque in coda e verrà applicata al ritorno della
// rete. Usare `isTimeout(e)` per distinguere il timeout (→ prosegui) da un
// errore reale (→ gestisci/rollback).

export class TimeoutError extends Error {
  constructor(ms) {
    super(`Timeout dopo ${ms}ms`);
    this.name = 'TimeoutError';
  }
}

export function withTimeout(promise, ms) {
  let timer;
  const p = Promise.resolve(promise);
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      // La promise originale può ancora fallire DOPO il timeout (es. write
      // rifiutata dalle rules al riconnect): aggancia un catch no-op per non
      // generare "unhandled rejection" in console.
      p.catch(() => {});
      reject(new TimeoutError(ms));
    }, ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

export function isTimeout(e) {
  return e instanceof TimeoutError || e?.name === 'TimeoutError';
}
