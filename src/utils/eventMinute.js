// Calcolo del minuto degli eventi quando il cronometro manuale non è stato usato.
//
// Contesto: il minuto degli eventi live deriva dal cronometro della partita
// (avvio manuale con ▶). Se l'admin registra i gol senza mai avviarlo, tutti
// gli eventi finiscono con minute=0. Queste funzioni forniscono:
// - deriveEventMinute: fallback live sul tempo reale trascorso da match.date,
//   con clamp di monotonicità sui minuti già registrati
// - fixZeroMinutes:    correzione retroattiva dai timestamp degli eventi
// - hasKnownTiming:    la partita ha un timing affidabile? (guard per i badge
//   basati sul minuto: un minute 0 in una partita senza timing noto significa
//   "sconosciuto", non "primo minuto")
//
// ⚠️ match.date NON è l'orario di inizio reale: è la data scelta nel setup
// (può essere solo-giorno → mezzanotte, o un orario pianificato mai rispettato).
// Per questo l'ancora viene validata: se produce minuti implausibili si scarta.

/** Oltre questo minuto l'ancora match.date è considerata inaffidabile. */
export const MAX_PLAUSIBLE_MINUTE = 150;

/** Massimo minuto già registrato negli eventi (0 se nessuno). */
export function maxEventMinute(events) {
  let max = 0;
  for (const e of Array.isArray(events) ? events : []) {
    if (typeof e?.minute === 'number' && e.minute > max) max = e.minute;
  }
  return max;
}

/**
 * True se la partita ha un timing noto: almeno un evento con minuto > 0.
 * In una partita col cronometro mai avviato (pre-fallback) TUTTI gli eventi
 * hanno minute 0 → il timing è inconoscibile e i badge basati sul minuto
 * (Blitz, Uno-Due, Early Bird) non devono scattare.
 */
export function hasKnownTiming(events) {
  return (Array.isArray(events) ? events : []).some(e => typeof e?.minute === 'number' && e.minute > 0);
}

/**
 * Minuto per un evento registrato live.
 * - Cronometro usato (elapsed > 0 o in corsa) → minuto dal cronometro.
 * - Altrimenti fallback sul tempo reale da match.date, ma SOLO se plausibile
 *   (0..MAX_PLAUSIBLE_MINUTE): una data solo-giorno o futura darebbe minuti
 *   assurdi o negativi → meglio 0, correggibile poi con fixZeroMinutes.
 * - `lastEventMinute` (max minuto già in cronaca) fa da clamp di MONOTONICITÀ:
 *   se l'admin avvia il cronometro DOPO gol registrati col fallback (es. 25'),
 *   il timer riparte da 0 ma i minuti non devono tornare indietro — report,
 *   replay e dettaglio ordinano per minuto e ci calcolano il parziale
 *   progressivo. Nel flusso puro-timer o puro-fallback il clamp è un no-op
 *   (entrambi sono già monotoni).
 */
export function deriveEventMinute({ elapsedSeconds, isRunning, matchDateMs, nowMs, lastEventMinute = 0 }) {
  let minute = 0;
  if (elapsedSeconds > 0 || isRunning) {
    minute = Math.floor(elapsedSeconds / 60);
  } else if (matchDateMs > 0 && nowMs > 0) {
    const real = Math.floor((nowMs - matchDateMs) / 60000);
    if (real >= 0 && real <= MAX_PLAUSIBLE_MINUTE) minute = real;
  }
  return Math.max(minute, lastEventMinute);
}

/**
 * Correzione retroattiva: assegna il minuto agli eventi con minute=0 che hanno
 * un timestamp reale. Ancora = match.date se dà minuti plausibili per tutti
 * gli eventi da correggere, altrimenti il primo timestamp disponibile
 * (progressione relativa: primo evento ≈ 0', ma gli intervalli sono reali).
 *
 * Guard: se QUALCHE evento ha già un minuto > 0 il timing era noto (cronometro
 * o fallback attivi) → gli 0 residui sono gol legittimi del primo minuto, non
 * "senza minuto". Riscriverli dai timestamp contro un'ancora diversa creerebbe
 * una cronaca incoerente: non si tocca nulla.
 *
 * Ritorna { events, changed }: `events` è la lista con i minuti corretti
 * (referenze originali per gli eventi non toccati), `changed` il numero di
 * eventi effettivamente modificati. Non introduce mai campi `undefined` e non
 * assegna mai minuti oltre MAX_PLAUSIBLE_MINUTE (timestamp anomali → skip).
 */
export function fixZeroMinutes(events, matchDateMs) {
  const list = Array.isArray(events) ? events : [];
  if (hasKnownTiming(list)) return { events: list, changed: 0 };

  const targets = list.filter(e => (e?.minute ?? 0) === 0 && Number.isFinite(e?.timestamp));
  if (targets.length === 0) return { events: list, changed: 0 };

  const tsMin = Math.min(...targets.map(e => e.timestamp));
  const tsMax = Math.max(...targets.map(e => e.timestamp));
  const anchorPlausible = matchDateMs > 0
    && tsMin >= matchDateMs
    && (tsMax - matchDateMs) / 60000 <= MAX_PLAUSIBLE_MINUTE;
  const anchor = anchorPlausible ? matchDateMs : tsMin;

  let changed = 0;
  const out = list.map(e => {
    if ((e?.minute ?? 0) !== 0 || !Number.isFinite(e?.timestamp)) return e;
    const minute = Math.max(0, Math.floor((e.timestamp - anchor) / 60000));
    if (minute > MAX_PLAUSIBLE_MINUTE) return e; // timestamp anomalo (clock skew)
    if (minute === (e.minute ?? 0)) return e;
    changed++;
    return { ...e, minute };
  });
  return { events: out, changed };
}
