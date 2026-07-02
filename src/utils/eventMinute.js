// Calcolo del minuto degli eventi quando il cronometro manuale non è stato usato.
//
// Contesto: il minuto degli eventi live deriva dal cronometro della partita
// (avvio manuale con ▶). Se l'admin registra i gol senza mai avviarlo, tutti
// gli eventi finiscono con minute=0. Queste funzioni forniscono:
// - deriveEventMinute: fallback live sul tempo reale trascorso da match.date
// - fixZeroMinutes:    correzione retroattiva dai timestamp degli eventi
//
// ⚠️ match.date NON è l'orario di inizio reale: è la data scelta nel setup
// (può essere solo-giorno → mezzanotte, o un orario pianificato mai rispettato).
// Per questo l'ancora viene validata: se produce minuti implausibili si scarta.

/** Oltre questo minuto l'ancora match.date è considerata inaffidabile. */
export const MAX_PLAUSIBLE_MINUTE = 150;

/**
 * Minuto per un evento registrato live.
 * - Cronometro usato (elapsed > 0 o in corsa) → minuto dal cronometro.
 * - Altrimenti fallback sul tempo reale da match.date, ma SOLO se plausibile
 *   (0..MAX_PLAUSIBLE_MINUTE): una data solo-giorno o futura darebbe minuti
 *   assurdi o negativi → meglio 0, correggibile poi con fixZeroMinutes.
 */
export function deriveEventMinute({ elapsedSeconds, isRunning, matchDateMs, nowMs }) {
  if (elapsedSeconds > 0 || isRunning) return Math.floor(elapsedSeconds / 60);
  if (!(matchDateMs > 0) || !(nowMs > 0)) return 0;
  const minute = Math.floor((nowMs - matchDateMs) / 60000);
  return minute >= 0 && minute <= MAX_PLAUSIBLE_MINUTE ? minute : 0;
}

/**
 * Correzione retroattiva: assegna il minuto agli eventi con minute=0 che hanno
 * un timestamp reale. Ancora = match.date se dà minuti plausibili per tutti
 * gli eventi da correggere, altrimenti il primo timestamp disponibile
 * (progressione relativa: primo evento ≈ 0', ma gli intervalli sono reali).
 *
 * Ritorna { events, changed }: `events` è la lista con i minuti corretti
 * (referenze originali per gli eventi non toccati), `changed` il numero di
 * eventi effettivamente modificati. Non introduce mai campi `undefined`.
 */
export function fixZeroMinutes(events, matchDateMs) {
  const list = Array.isArray(events) ? events : [];
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
    if (minute === (e.minute ?? 0)) return e;
    changed++;
    return { ...e, minute };
  });
  return { events: out, changed };
}
