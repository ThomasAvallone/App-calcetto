// Firma deterministica degli eventi di una partita, usata per capire se un
// contenuto AI derivato dagli eventi (titolo, pagelle) è ancora aggiornato.
// Include solo i campi che cambiano la narrativa: tipo, squadra, protagonista,
// assist e minuto. La firma è insensibile all'ordine (sort) così un semplice
// riordino dell'array non invalida contenuti ancora corretti.

export function eventsSignature(events) {
  const list = Array.isArray(events) ? events : [];
  const parts = list
    .map(e => [
      e?.type || '',
      e?.team || '',
      e?.scorerId || e?.playerId || '',
      e?.assistId || '',
      e?.minute ?? '',
    ].join(':'))
    .sort();
  return `${parts.length}#${parts.join('|')}`;
}

/** true se il titolo AI della partita riflette gli eventi correnti */
export function isHeadlineFresh(match) {
  if (!match?.aiHeadline || !match?.aiHeadlineSig) return false;
  return match.aiHeadlineSig === eventsSignature(match.events);
}
