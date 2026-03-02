export const BADGE_DEFS = [
  // ── POSITIVI ──────────────────────────────────────────────────────────────
  {
    id: 'bomber',
    icon: '⚽',
    label: 'Bomber',
    desc: '10+ gol segnati',
    positive: true,
    check: p => (p.stats?.goals || 0) >= 10,
  },
  {
    id: 'assistman',
    icon: '🎯',
    label: 'Assistman',
    desc: '10+ assist',
    positive: true,
    check: p => (p.stats?.assists || 0) >= 10,
  },
  {
    id: 'cecchino',
    icon: '💥',
    label: 'Cecchino',
    desc: '>0.5 gol/partita (min 5 partite)',
    positive: true,
    check: p => (p.stats?.matches || 0) >= 5 && (p.stats?.goals || 0) / (p.stats?.matches || 1) > 0.5,
  },
  {
    id: 'campione',
    icon: '🏆',
    label: 'Campione',
    desc: '10+ vittorie',
    positive: true,
    check: p => (p.stats?.wins || 0) >= 10,
  },
  {
    id: 'jolly',
    icon: '🌟',
    label: 'Jolly',
    desc: '5+ gol, 5+ assist e 5+ vittorie',
    positive: true,
    check: p =>
      (p.stats?.goals || 0) >= 5 &&
      (p.stats?.assists || 0) >= 5 &&
      (p.stats?.wins || 0) >= 5,
  },
  {
    id: 'fenomeno',
    icon: '⭐',
    label: 'Fenomeno',
    desc: 'Power Index > 75',
    positive: true,
    check: p => (p.powerIndex || 0) > 75,
  },
  {
    id: 'on_fire',
    icon: '🔥',
    label: 'On Fire',
    desc: '4+ vittorie consecutive',
    positive: true,
    check: p => p.streak?.type === 'win' && (p.streak?.count || 0) >= 4,
  },
  {
    id: 'muro',
    icon: '🧱',
    label: 'Muro',
    desc: 'Media GK < 1.5 gol/turno (min 5 turni)',
    positive: true,
    check: p =>
      (p.stats?.gkMatches || 0) >= 5 &&
      (p.stats?.gkGoalsConceded || 0) / (p.stats?.gkMatches || 1) < 1.5,
  },

  // ── NEGATIVI / GOLIARDICI ─────────────────────────────────────────────────
  {
    id: 'autogolista',
    icon: '🤦',
    label: 'Autogolista',
    desc: '3+ autogol',
    positive: false,
    check: p => (p.stats?.autogoals || 0) >= 3,
  },
  {
    id: 'crisi',
    icon: '📉',
    label: 'Crisi Nera',
    desc: '4+ sconfitte consecutive',
    positive: false,
    check: p => p.streak?.type === 'loss' && (p.streak?.count || 0) >= 4,
  },
  {
    id: 'colabrodo',
    icon: '🪣',
    label: 'Colabrodo',
    desc: 'Media GK > 3 gol/turno (min 5 turni)',
    positive: false,
    check: p =>
      (p.stats?.gkMatches || 0) >= 5 &&
      (p.stats?.gkGoalsConceded || 0) / (p.stats?.gkMatches || 1) > 3,
  },
];

export function computeBadges(player) {
  return BADGE_DEFS.filter(b => b.check(player));
}
