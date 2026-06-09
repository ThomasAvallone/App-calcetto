import { useEffect, useState } from 'react';
import { subscribeToMatchSync } from '../firebase/firestore';

// Stato di sincronizzazione della partita live, per dare all'admin la certezza che
// gli eventi registrati siano salvati anche con rete instabile al campo.
//
//  - isOnline:         `navigator.onLine` + eventi `online`/`offline` del browser.
//  - hasPendingWrites: scritture locali sul doc `matches/{id}` non ancora confermate
//                      dal server. Con la persistenza IndexedDB attiva (config.js),
//                      le scritture offline restano in coda e si sincronizzano da sole
//                      al ritorno della rete.
//
// Il listener è SOLO-LETTURA e isolato: non tocca lo store né l'optimistic-update,
// quindi non può interferire con la registrazione dei gol. Tutto difensivo: nessun
// percorso può lanciare (no crash della MatchPage live).
export function useMatchSyncStatus(matchId) {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean' ? navigator.onLine : true
  );
  const [hasPendingWrites, setHasPendingWrites] = useState(false);

  // Online/offline del browser
  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    // Allinea allo stato attuale al mount (può essere cambiato prima dell'effect)
    if (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean') {
      setIsOnline(navigator.onLine);
    }
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  // Pending writes sul doc partita (snapshot metadata-aware)
  useEffect(() => {
    if (!matchId) { setHasPendingWrites(false); return; }
    let active = true;
    let unsub = () => {};
    try {
      unsub = subscribeToMatchSync(matchId, ({ hasPendingWrites: pending }) => {
        if (active) setHasPendingWrites(!!pending);
      });
    } catch {
      /* Firestore non inizializzato/non disponibile: lo status resta al default,
         nessun crash. L'indicatore semplicemente non mostrerà lo stato "syncing". */
    }
    return () => {
      active = false;
      try { unsub(); } catch { /* già scollegato */ }
    };
  }, [matchId]);

  return { isOnline, hasPendingWrites };
}
