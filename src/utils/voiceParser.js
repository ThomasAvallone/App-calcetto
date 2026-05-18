// ─── Voice goal parser ───────────────────────────────────────────────────────
// Parser puro per le trascrizioni vocali italiane del tipo:
//   "gol marco assist luca portiere gianni"
//   "autogol di thomas"
//   "auto gol marco"
//
// L'output è una struttura { isAutogoal, scorer, assist, gk, team } pronta
// per essere usata da matchStore.recordGoal/recordAutogoal.

// Stopword italiane comuni che il riconoscimento inserisce ("gol di marco")
const STOPWORDS = new Set([
  'di', 'da', 'il', 'lo', 'la', 'i', 'gli', 'le', 'a', 'al',
  'del', 'della', 'su', 'per', 'e', 'ed', 'un', 'una', 'uno',
]);

export function findPlayer(word, pool) {
  if (!word) return null;
  const w = word.toLowerCase().replace(/[.,!?;:]/g, '');
  if (!w || STOPWORDS.has(w)) return null;
  // Priorità: match esatto > prefisso nome (transcript→nome) > prefisso reverse
  // (con vincolo di lunghezza min 3 per evitare match troppo larghi)
  const exact = pool.find(p =>
    p.name.toLowerCase().split(/\s+/).some(part => part === w),
  );
  if (exact) return exact;
  return pool.find(p =>
    p.name.toLowerCase().split(/\s+/).some(part =>
      part.startsWith(w) || (w.length >= 4 && w.startsWith(part) && part.length >= 3),
    ),
  ) || null;
}

// Cerca il primo nome valido dopo una keyword, saltando fino a 3 stopwords
export function extractAfter(text, keyword, pool) {
  const re = new RegExp(`\\b${keyword}\\b\\s+(.+?)(?=\\s+(?:assist|portiere|gol|autogol)\\b|$)`);
  const m = text.match(re);
  if (!m) return null;
  const words = m[1].trim().split(/\s+/).slice(0, 3);
  for (const w of words) {
    const p = findPlayer(w, pool);
    if (p) return p;
  }
  return null;
}

export function parseVoiceGoal(transcript, redTeam, blueTeam) {
  // Normalizza varianti: "auto gol" / "auto-gol" / "auto goal" → "autogol"
  const text = (transcript || '').toLowerCase().trim()
    .replace(/\bauto[\s-]?goa?l\b/g, 'autogol');
  const allPlayers = [...(redTeam || []), ...(blueTeam || [])];
  const isAutogoal = /\bautogol\b/.test(text);
  const keyword = isAutogoal ? 'autogol' : 'gol';
  const scorer = extractAfter(text, keyword, allPlayers);
  const assist = extractAfter(text, 'assist', allPlayers);
  const gk     = extractAfter(text, 'portiere', allPlayers);
  const team = scorer
    ? ((redTeam || []).some(p => p.id === scorer.id) ? 'red' : 'blue')
    : null;
  return { isAutogoal, scorer, assist, gk, team };
}
