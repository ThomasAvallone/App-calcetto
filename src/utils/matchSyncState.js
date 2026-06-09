// ─── Stato di sincronizzazione della partita live (logica pura, testabile) ───
// Deriva lo stato dell'indicatore di sync dai due segnali disponibili:
//   - isOnline:         rete del browser (navigator.onLine)
//   - hasPendingWrites: scritture locali sul doc partita non ancora confermate
//
// Precedenza: `offline` ha priorità su tutto — anche con scritture in coda, il
// messaggio che conta è "sei offline" (le scritture sono comunque salvate e si
// sincronizzano da sole al ritorno della rete). Poi `syncing` (scritture in volo),
// infine `synced`.
export function matchSyncState(isOnline, hasPendingWrites) {
  if (!isOnline) return 'offline';
  if (hasPendingWrites) return 'syncing';
  return 'synced';
}

// Il chip "tutto sincronizzato" non dice nulla di utile a un viewer (non scrive):
// per i non-admin lo nascondiamo. Gli stati offline/syncing restano visibili a tutti.
export function shouldShowSyncChip(state, isAdmin) {
  if (state === 'synced' && !isAdmin) return false;
  return true;
}
