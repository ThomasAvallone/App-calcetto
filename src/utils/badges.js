import { getMs } from './dateUtils';

// Each badge definition uses:
//   s       → season stats (goals, assists, autogoals, matches, wins, draws, losses, gkMatches, gkGoalsConceded)
//   p       → full player object (for powerIndex, streak, all-time stats)
//   matches → all finished Firestore matches (for match-level badge checks)
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
    id: 'il_prescelto',
    icon: '⚡',
    label: 'Il Prescelto',
    desc: 'Power Index > 80 — élite assoluta',
    positive: true,
    check: (_s, p) => (p.powerIndex || 0) > 80,
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
  {
    id: 'veterano',
    icon: '🎖️',
    label: 'Veterano',
    desc: '50+ partite all-time — presente sin dall\'inizio',
    positive: true,
    check: (_s, p) => (p.stats?.matches || 0) >= 50,
  },
  {
    id: 'motorino',
    icon: '🛵',
    label: 'Motorino',
    desc: 'Più assist che gol in stagione (min 8 assist) — regista puro',
    positive: true,
    check: (s) =>
      (s.assists || 0) >= 8 &&
      (s.assists || 0) > (s.goals || 0),
  },
  {
    id: 'early_bird',
    icon: '🐦',
    label: 'Early Bird',
    desc: 'Gol nei primi 10\' per 3 partite consecutive',
    positive: true,
    check: (_s, p, matches) => {
      if (!matches?.length || !p?.id) return false;
      const pid = p.id;
      const played = matches
        .filter(m =>
          m.status === 'finished' &&
          !m.isHistorical &&
          [...(m.redTeam || []), ...(m.blueTeam || [])].some(pl => pl.id === pid)
        )
        .sort((a, b) => getMs(b.date) - getMs(a.date));
      let streak = 0;
      for (const m of played) {
        const earlyGoal = (m.events || []).some(
          ev => ev.type === 'goal' && ev.scorerId === pid && (ev.minute || 0) < 10
        );
        if (earlyGoal) { streak++; if (streak >= 3) return true; }
        else streak = 0;
      }
      return false;
    },
  },
  {
    id: 'lone_ranger',
    icon: '🤠',
    label: 'Lone Ranger',
    desc: '2+ gol in una partita, tutti senza assist — lupo solitario',
    positive: true,
    check: (_s, p, matches) => {
      if (!matches?.length || !p?.id) return false;
      const pid = p.id;
      for (const m of matches) {
        if (m.status !== 'finished' || m.isHistorical) continue;
        const inMatch = [...(m.redTeam || []), ...(m.blueTeam || [])].some(pl => pl.id === pid);
        if (!inMatch) continue;
        const goals = (m.events || []).filter(ev => ev.type === 'goal' && ev.scorerId === pid);
        if (goals.length >= 2 && goals.every(ev => !ev.assistId)) return true;
      }
      return false;
    },
  },
  {
    id: 'meteorite',
    icon: '☄️',
    label: 'Meteorite',
    desc: 'Hat-trick: 3+ gol in una singola partita',
    positive: true,
    check: (_s, p, matches) => {
      if (!matches?.length || !p?.id) return false;
      const pid = p.id;
      for (const m of matches) {
        if (m.status !== 'finished' || m.isHistorical) continue;
        const inMatch = [...(m.redTeam || []), ...(m.blueTeam || [])].some(pl => pl.id === pid);
        if (!inMatch) continue;
        const goals = (m.events || []).filter(ev => ev.type === 'goal' && ev.scorerId === pid);
        if (goals.length >= 3) return true;
      }
      return false;
    },
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
    id: 'bestie',
    icon: '🙏',
    label: 'Bestie',
    desc: '1+ autogol in stagione — "Madonna!" almeno una volta',
    positive: false,
    check: (s) => (s.autogoals || 0) >= 1,
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
  {
    id: 'gufo',
    icon: '🦉',
    label: 'Gufo',
    desc: 'Media GK > 4 gol/turno (min 3 turni) — porta sfiga dalla porta',
    positive: false,
    check: (s) =>
      (s.gkMatches || 0) >= 3 &&
      (s.gkGoalsConceded || 0) / (s.gkMatches || 1) > 4,
  },
  {
    id: 'fantasma',
    icon: '👻',
    label: 'Fantasma',
    desc: '10+ partite in stagione senza segnare un gol — c\'era ma non si è visto',
    positive: false,
    check: (s) => (s.matches || 0) >= 10 && (s.goals || 0) === 0,
  },
  {
    id: 'monolito',
    icon: '🗿',
    label: 'Monolito',
    desc: '15+ partite, ≤ 2 gol e ≤ 2 assist in stagione — c\'è, occupa spazio, non sente dolore',
    positive: false,
    check: (s) =>
      (s.matches || 0) >= 15 &&
      (s.goals || 0) <= 2 &&
      (s.assists || 0) <= 2,
  },
];

// seasonStats: stats computed from current-season matches only (goals, assists, etc.)
// player:      full player object (for powerIndex, streak, all-time stats)
// allMatches:  all Firestore matches (for match-level badge checks — optional)
export function computeBadges(player, seasonStats, allMatches) {
  const s = seasonStats || player.stats || {};
  return BADGE_DEFS.filter(b => b.check(s, player, allMatches));
}
