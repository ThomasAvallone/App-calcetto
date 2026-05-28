// ─── Punteggio partita dagli eventi (logica pura, source of truth) ───────────
// Gli eventi sono l'unica verità della partita live: il punteggio si DERIVA da
// essi, non viceversa. Regole:
//   - goal      → punto alla squadra del marcatore
//   - autogoal  → punto alla squadra AVVERSARIA (chi sbaglia è `ev.team`)
//   - save/injury → nessun effetto sul punteggio (solo cronaca)

export function scoreFromEvents(events) {
  let redScore = 0, blueScore = 0;
  for (const ev of (events || [])) {
    if (ev.type === 'goal') {
      if (ev.team === 'red') redScore++; else blueScore++;
    } else if (ev.type === 'autogoal') {
      if (ev.team === 'red') blueScore++; else redScore++;
    }
  }
  return { redScore, blueScore };
}

// Annota ogni evento col parziale progressivo (partialRed/partialBlue) calcolato
// nell'ordine in cui gli eventi sono passati. Usato dalle cronache.
export function withProgressiveScore(events) {
  let r = 0, b = 0;
  return (events || []).map(ev => {
    if (ev.type === 'goal') { if (ev.team === 'red') r++; else b++; }
    else if (ev.type === 'autogoal') { if (ev.team === 'red') b++; else r++; }
    return { ...ev, partialRed: r, partialBlue: b };
  });
}
