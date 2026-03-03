// Each badge definition uses:
//   s  → season stats (goals, assists, autogoals, matches, wins, draws, losses, gkMatches, gkGoalsConceded)
//   p  → full player object (for powerIndex and streak, which are not season-scoped)
export const BADGE_DEFS = [
  // ── POSITIVI ──────────────────────────────────────────────────────────────
  {
    id: 'bomber',
    icon: '⚽',
    label: 'Bomber',
    desc: '10+ gol in stagione',
    positive: true,
    check: (s) => (s.goals || 0) >= 10,
  },
  {
    id: 'assistman',
    icon: '🎯',
    label: 'Assistman',
    desc: '10+ assist in stagione',
    positive: true,
    check: (s) => (s.assists || 0) >= 10,
  },
  {
    id: 'cecchino',
    icon: '💥',
    label: 'Cecchino',
    desc: '>0.5 gol/partita in stagione (min 5 partite)',
    positive: true,
    check: (s) => (s.matches || 0) >= 5 && (s.goals || 0) / (s.matches || 1) > 0.5,
  },
  {
    id: 'campione',
    icon: '🏆',
    label: 'Campione',
    desc: '10+ vittorie in stagione',
    positive: true,
    check: (s) => (s.wins || 0) >= 10,
  },
  {
    id: 'jolly',
    icon: '🌟',
    label: 'Jolly',
    desc: '5+ gol, 5+ assist e 5+ vittorie in stagione',
    positive: true,
    check: (s) =>
      (s.goals || 0) >= 5 &&
      (s.assists || 0) >= 5 &&
      (s.wins || 0) >= 5,
  },
  {
    id: 'fenomeno',
    icon: '⭐',
    label: 'Fenomeno',
    desc: 'Power Index > 75',
    positive: true,
    check: (_s, p) => (p.powerIndex || 0) > 75,
  },
  {
    id: 'on_fire',
    icon: '🔥',
    label: 'On Fire',
    desc: '4+ vittorie consecutive',
    positive: true,
    check: (_s, p) => p.streak?.type === 'win' && (p.streak?.count || 0) >= 4,
  },
  {
    id: 'muro',
    icon: '🧱',
    label: 'Muro',
    desc: 'Media GK < 1.5 gol/turno in stagione (min 5 turni)',
    positive: true,
    check: (s) =>
      (s.gkMatches || 0) >= 5 &&
      (s.gkGoalsConceded || 0) / (s.gkMatches || 1) < 1.5,
  },

  // ── NEGATIVI / GOLIARDICI ─────────────────────────────────────────────────
  {
    id: 'autogolista',
    icon: '🤦',
    label: 'Autogolista',
    desc: '3+ autogol in stagione',
    positive: false,
    check: (s) => (s.autogoals || 0) >= 3,
  },
  {
    id: 'crisi',
    icon: '📉',
    label: 'Crisi Nera',
    desc: '4+ sconfitte consecutive',
    positive: false,
    check: (_s, p) => p.streak?.type === 'loss' && (p.streak?.count || 0) >= 4,
  },
  {
    id: 'colabrodo',
    icon: '🪣',
    label: 'Colabrodo',
    desc: 'Media GK > 3 gol/turno in stagione (min 5 turni)',
    positive: false,
    check: (s) =>
      (s.gkMatches || 0) >= 5 &&
      (s.gkGoalsConceded || 0) / (s.gkMatches || 1) > 3,
  },
];

// seasonStats: stats computed from current-season matches only (goals, assists, etc.)
// player: full player object (for powerIndex, streak)
export function computeBadges(player, seasonStats) {
  const s = seasonStats || player.stats || {};
  return BADGE_DEFS.filter(b => b.check(s, player));
}
