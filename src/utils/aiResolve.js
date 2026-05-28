// ─── Risoluzione output AI → oggetti dominio ─────────────────────────────────
// Funzioni pure (niente network/localStorage) usate da geminiService per mappare
// le risposte JSON di Gemini su player objects. Isolate qui per essere testabili.

// Risolve l'output di generateAIBalancedTeams in due squadre di player objects.
// - mappa i nomi (case-insensitive) ai player
// - squadre DISGIUNTE: un nome ripetuto da Gemini in entrambe le liste non finisce
//   in tutte e due (altrimenti un giocatore comparirebbe in rossa E blu)
// - i non assegnati vengono distribuiti alla squadra più piccola
export function resolveBalancedTeams(parsed, players) {
  const nameToPlayer = Object.fromEntries(
    (players || []).map(p => [p.name.toLowerCase().trim(), p]),
  );
  const used = new Set();
  const pick = (names) => {
    const out = [];
    for (const n of (names || [])) {
      const p = nameToPlayer[String(n).toLowerCase().trim()];
      if (p && !used.has(p.id)) { used.add(p.id); out.push(p); }
    }
    return out;
  };
  const red = pick(parsed?.red);
  const blue = pick(parsed?.blue);
  // Safety: chiunque non sia stato assegnato va alla squadra più piccola.
  for (const p of (players || [])) {
    if (!used.has(p.id)) {
      if (red.length <= blue.length) red.push(p); else blue.push(p);
      used.add(p.id);
    }
  }
  return { red, blue, reasoning: parsed?.reasoning || '' };
}

// Risolve l'output di parseVoiceGoalWithAI in player objects + team.
// Scarta gli ID non presenti nei roster (Gemini a volte ne inventa). Il team
// viene dedotto dallo scorer se presente, altrimenti si usa quello dichiarato.
export function resolveVoiceGoal(parsed, redTeam, blueTeam) {
  const playerById = Object.fromEntries(
    [...(redTeam || []), ...(blueTeam || [])].map(p => [p.id, p]),
  );
  const scorer = parsed?.scorerId ? (playerById[parsed.scorerId] || null) : null;
  const assist = parsed?.assistId ? (playerById[parsed.assistId] || null) : null;
  const gk     = parsed?.gkId     ? (playerById[parsed.gkId]     || null) : null;
  const team = scorer
    ? ((redTeam || []).some(p => p.id === scorer.id) ? 'red' : 'blue')
    : (parsed?.team === 'red' || parsed?.team === 'blue' ? parsed.team : null);
  return { isAutogoal: !!parsed?.isAutogoal, scorer, assist, gk, team };
}
