import { BADGE_DEFS } from './badges';

// Badge "trackable": positivi con distanza numerica al traguardo calcolabile da
// stats season/all-time. Esclusi i badge match-event-based (Meteorite, Lone Ranger)
// che dipendono da una singola partita e non sono utili come "obiettivo a cui puntare".
//
// baseline = valore minimo "neutro" (es. PI 50 per un nuovo player) — il progresso
// si misura da baseline a target, così PI 50 → 0%, PI 70 → 50%, PI 90 → 100%.
const TRACKABLE = [
  { id: 'bomber',       target: 10,    unit: 'gol',                value: (s) => s.goals     || 0 },
  { id: 'assistman',    target: 10,    unit: 'assist',             value: (s) => s.assists   || 0 },
  { id: 'campione',     target: 10,    unit: 'vittorie',           value: (s) => s.wins      || 0 },
  { id: 'altruista',    target: 8,     unit: 'assist',             value: (s) => s.assists   || 0,
    // Altruista vuole anche assist > goals: se non vero, niente hint
    eligible: (s) => (s.assists || 0) > (s.goals || 0) },
  { id: 'jolly',        target: 5,     unit: 'gol/assist/vittorie',
    // Jolly: il "peggior" stat è quello che frena, mostriamo il minimo
    value: (s) => Math.min(s.goals || 0, s.assists || 0, s.wins || 0) },
  { id: 'fenomeno',     target: 90.01, baseline: 50, unit: 'di Power Index',
    value: (_s, p) => p.powerIndex || 50 },
  { id: 'il_prescelto', target: 95.01, baseline: 50, unit: 'di Power Index',
    value: (_s, p) => p.powerIndex || 50 },
  { id: 'veterano',     target: 150,   unit: 'partite all-time',   value: (_s, p) => p.stats?.matches || 0 },
  { id: 'diamante',     target: 100,   unit: 'gol+assist all-time',
    value: (_s, p) => (p.stats?.goals || 0) + (p.stats?.assists || 0) },
];

/**
 * Restituisce il badge più vicino allo sblocco (in % di progresso) per il player.
 * Ritorna null se ogni badge trackable è già sbloccato o se non c'è progresso minimo.
 *
 * @param {object} myPlayer - oggetto player Firestore (con stats, powerIndex)
 * @param {object} seasonStats - { goals, assists, wins, matches, ... } stagione corrente
 * @param {number} minProgress - soglia minima di progresso (0..1) per mostrare l'hint
 */
export function getNextBadgeHint(myPlayer, seasonStats, minProgress = 0.3) {
  if (!myPlayer || !seasonStats) return null;

  let best = null;
  for (const t of TRACKABLE) {
    const def = BADGE_DEFS.find(b => b.id === t.id);
    if (!def) continue;
    if (t.eligible && !t.eligible(seasonStats, myPlayer)) continue;
    const current = t.value(seasonStats, myPlayer);
    if (current >= t.target) continue; // già sbloccato
    const baseline = t.baseline || 0;
    const span = t.target - baseline;
    const progress = span > 0 ? Math.max(0, (current - baseline) / span) : 0;
    if (progress < minProgress) continue;
    if (!best || progress > best.progress) {
      best = {
        id: def.id,
        icon: def.icon,
        label: def.label,
        current,
        target: t.target,
        remaining: t.target - current,
        progress,
        unit: t.unit,
      };
    }
  }
  return best;
}
