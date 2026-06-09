import React from 'react';
import { matchSyncState, shouldShowSyncChip } from '../../utils/matchSyncState';

// Chip di stato sincronizzazione della partita live. Tre stati:
//   - offline  (rosso):  rete assente — gli eventi restano in coda e si sincronizzano da soli.
//   - syncing  (giallo): online, ci sono scritture non ancora confermate dal server.
//   - synced   (verde):  online, tutto confermato.
//
// I messaggi sono ACCURATI: con la persistenza offline di Firestore le scritture
// fatte offline NON vanno perse — restano salvate e vengono inviate al ritorno della
// rete. Per un viewer (non-admin) lo stato "synced" non ha nulla da dire → niente chip.
// La logica di stato/visibilità è pura e testata in `utils/matchSyncState.js`.
export default function MatchSyncChip({ isOnline, hasPendingWrites, isAdmin }) {
  const state = matchSyncState(isOnline, hasPendingWrites);
  if (!shouldShowSyncChip(state, isAdmin)) return null;

  const cfg = {
    offline: {
      bg: 'rgba(252,129,129,0.12)', border: 'rgba(252,129,129,0.4)', color: '#FC8181',
      dot: '#FC8181', pulse: false, radius: '10px',
      text: isAdmin
        ? '📡 Offline — gli eventi restano salvati e si sincronizzano da soli al ritorno della rete'
        : '📡 Offline — aggiornamenti in diretta in pausa',
    },
    syncing: {
      bg: 'rgba(246,173,85,0.12)', border: 'rgba(246,173,85,0.4)', color: '#F6AD55',
      dot: '#F6AD55', pulse: true, radius: '999px',
      text: '🟡 Salvataggio in corso…',
    },
    synced: {
      bg: 'rgba(104,211,145,0.10)', border: 'rgba(104,211,145,0.30)', color: '#68D391',
      dot: '#68D391', pulse: false, radius: '999px',
      text: '✅ Tutto sincronizzato',
    },
  }[state];

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
      margin: '0 auto 0.75rem', padding: '0.4rem 0.85rem', borderRadius: cfg.radius,
      background: cfg.bg, border: `1px solid ${cfg.border}`, width: 'fit-content',
      maxWidth: '100%', fontSize: '0.76rem', fontWeight: 600, color: cfg.color,
      textAlign: 'center', lineHeight: 1.35,
    }}>
      <span style={{
        width: 8, height: 8, borderRadius: '50%', background: cfg.dot, flexShrink: 0,
        display: 'inline-block', animation: cfg.pulse ? 'pulse 1.2s infinite' : 'none',
      }} />
      <span>{cfg.text}</span>
    </div>
  );
}
