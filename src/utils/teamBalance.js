// ─── Bilanciamento squadre (logica pura) ─────────────────────────────────────
// Source of truth dell'algoritmo: playersStore.balanceTeams/balanceWithLocks
// delegano qui passando il `pool` già risolto (array di player objects). Tenere
// la logica qui (no Firestore/store) la rende testabile in isolamento.

const pi = (p) => p.powerIndex || 50;

// Snake draft su Power Index decrescente, poi pareggio delle dimensioni fino a
// 5v5. Distribuzione: indice 0→red, 1→blue, 2→blue, 3→red, 4→red, ... così le
// due squadre alternano la "prima scelta" di ogni coppia.
export function balanceTeams(pool) {
  const sorted = [...(pool || [])].sort((a, b) => pi(b) - pi(a));
  const red = [], blue = [];
  sorted.forEach((player, i) => {
    if (i % 4 === 0 || i % 4 === 3) red.push(player);
    else blue.push(player);
  });
  while (red.length > 5) blue.push(red.pop());
  while (blue.length > 5) red.push(blue.pop());
  return { red, blue };
}

// Bilanciamento con giocatori bloccati: i locked restano sulla loro squadra, i
// liberi sono distribuiti greedy (PI decrescente) per minimizzare il gap di PI.
// `lockedTeams` è una mappa { [playerId]: 'red' | 'blue' }.
// Ritorna `null` se i lock eccedono la capienza di un lato (il caller mostra errore).
export function balanceWithLocks(pool, lockedTeams = {}) {
  const players = pool || [];
  const total = players.length;
  const targetRed  = Math.ceil(total / 2);
  const targetBlue = Math.floor(total / 2);

  const lockedRed  = players.filter(p => lockedTeams[p.id] === 'red');
  const lockedBlue = players.filter(p => lockedTeams[p.id] === 'blue');
  const rSlots = targetRed  - lockedRed.length;
  const bSlots = targetBlue - lockedBlue.length;
  if (rSlots < 0 || bSlots < 0) return null;

  const free = players
    .filter(p => !lockedTeams[p.id])
    .sort((a, b) => pi(b) - pi(a));

  const freeRed = [], freeBlue = [];
  let remR = rSlots, remB = bSlots;
  let piR = lockedRed.reduce((s, p)  => s + pi(p), 0);
  let piB = lockedBlue.reduce((s, p) => s + pi(p), 0);

  for (const p of free) {
    const v = pi(p);
    if (remR === 0) { freeBlue.push(p); remB--; continue; }
    if (remB === 0) { freeRed.push(p);  remR--; continue; }
    if (piR <= piB) { freeRed.push(p);  remR--; piR += v; }
    else            { freeBlue.push(p); remB--; piB += v; }
  }

  return { red: [...lockedRed, ...freeRed], blue: [...lockedBlue, ...freeBlue] };
}
