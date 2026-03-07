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
    desc: 'Power Index > 90',
    positive: true,
    check: (_s, p) => (p.powerIndex || 0) > 90,
  },
  {
    id: 'il_prescelto',
    icon: '⚡',
    label: 'Il Prescelto',
    desc: 'Power Index > 95 — élite assoluta, quasi irraggiungibile',
    positive: true,
    check: (_s, p) => (p.powerIndex || 0) > 95,
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
    desc: '150+ partite all-time — una leggenda del campo',
    positive: true,
    check: (_s, p) => (p.stats?.matches || 0) >= 150,
  },
  {
    id: 'altruista',
    icon: '🛵',
    label: 'Altruista',
    desc: 'Più assist che gol in stagione (min 8 assist) — regista puro',
    positive: true,
    check: (s) =>
      (s.assists || 0) >= 8 &&
      (s.assists || 0) > (s.goals || 0),
  },
  {
    id: 'diamante',
    icon: '💎',
    label: 'Diamante',
    desc: 'Gol + assist all-time ≥ 100 — contributo totale da centenario',
    positive: true,
    check: (_s, p) => (p.stats?.goals || 0) + (p.stats?.assists || 0) >= 100,
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
    id: 'pokemon_leggendario',
    icon: '✨',
    label: 'Pokémon Leggendario',
    desc: '5 gol in una singola partita — quasi impossibile, quasi mitologico',
    positive: true,
    check: (_s, p, matches) => {
      if (!matches?.length || !p?.id) return false;
      const pid = p.id;
      for (const m of matches) {
        if (m.status !== 'finished' || m.isHistorical) continue;
        const inMatch = [...(m.redTeam || []), ...(m.blueTeam || [])].some(pl => pl.id === pid);
        if (!inMatch) continue;
        const goals = (m.events || []).filter(ev => ev.type === 'goal' && ev.scorerId === pid);
        if (goals.length >= 5) return true;
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
  {
    id: 'rockstar',
    icon: '🎸',
    label: 'Rockstar',
    desc: 'Gol in 5 partite consecutive',
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
        const scored = (m.events || []).some(ev => ev.type === 'goal' && ev.scorerId === pid);
        if (scored) { streak++; if (streak >= 5) return true; }
        else streak = 0;
      }
      return false;
    },
  },
  {
    id: 'che_io_tassista',
    icon: '🔔',
    label: 'Che io t\'assista',
    desc: '3+ assist in una singola partita — regia da applausi',
    positive: true,
    check: (_s, p, matches) => {
      if (!matches?.length || !p?.id) return false;
      const pid = p.id;
      for (const m of matches) {
        if (m.status !== 'finished' || m.isHistorical) continue;
        const inMatch = [...(m.redTeam || []), ...(m.blueTeam || [])].some(pl => pl.id === pid);
        if (!inMatch) continue;
        const assists = (m.events || []).filter(ev => ev.type === 'goal' && ev.assistId === pid);
        if (assists.length >= 3) return true;
      }
      return false;
    },
  },
  {
    id: 'chirurgo',
    icon: '🏥',
    label: 'Chirurgo',
    desc: 'Tutti i gol dell\'app con assist ricevuto (min 5 gol) — non segna mai da solo',
    positive: true,
    check: (_s, p, matches) => {
      if (!matches?.length || !p?.id) return false;
      const pid = p.id;
      const allGoals = [];
      for (const m of matches) {
        if (m.status !== 'finished' || m.isHistorical) continue;
        for (const ev of (m.events || [])) {
          if (ev.type === 'goal' && ev.scorerId === pid) allGoals.push(ev);
        }
      }
      return allGoals.length >= 5 && allGoals.every(ev => !!ev.assistId);
    },
  },
  {
    id: 'bulldozer',
    icon: '🌪️',
    label: 'Bulldozer',
    desc: 'Vince con 5+ gol di scarto in almeno una partita — passaggio devastante',
    positive: true,
    check: (_s, p, matches) => {
      if (!matches?.length || !p?.id) return false;
      const pid = p.id;
      for (const m of matches) {
        if (m.status !== 'finished' || m.isHistorical) continue;
        const inRed = (m.redTeam || []).some(pl => pl.id === pid);
        const inBlue = (m.blueTeam || []).some(pl => pl.id === pid);
        if (!inRed && !inBlue) continue;
        const my = inRed ? m.redScore : m.blueScore;
        const their = inRed ? m.blueScore : m.redScore;
        if (my - their >= 5) return true;
      }
      return false;
    },
  },
  {
    id: 'last_minute',
    icon: '⏱️',
    label: 'Last Minute',
    desc: 'Gol al minuto ≥ 40 per 3 partite — campione del recupero',
    positive: true,
    check: (_s, p, matches) => {
      if (!matches?.length || !p?.id) return false;
      const pid = p.id;
      let count = 0;
      for (const m of matches) {
        if (m.status !== 'finished' || m.isHistorical) continue;
        const inMatch = [...(m.redTeam || []), ...(m.blueTeam || [])].some(pl => pl.id === pid);
        if (!inMatch) continue;
        const lateGoal = (m.events || []).some(
          ev => ev.type === 'goal' && ev.scorerId === pid && (ev.minute || 0) >= 40
        );
        if (lateGoal) { count++; if (count >= 3) return true; }
      }
      return false;
    },
  },
  {
    id: 'mutombo',
    icon: '🚫',
    label: 'MUTOMBO NOT IN MY HOUSE',
    desc: 'Gioca contro Dani in una partita in cui Dani segna 0 gol — il muro invalicabile',
    positive: true,
    check: (_s, p, matches) => {
      if (!matches?.length || !p?.id) return false;
      const pid = p.id;
      for (const m of matches) {
        if (m.status !== 'finished' || m.isHistorical) continue;
        const daniInRed  = (m.redTeam  || []).find(pl => pl.name?.toLowerCase().includes('dani'));
        const daniInBlue = (m.blueTeam || []).find(pl => pl.name?.toLowerCase().includes('dani'));
        const dani = daniInRed || daniInBlue;
        if (!dani) continue;
        // Dani deve aver segnato 0 gol
        const daniScored = (m.events || []).some(ev => ev.type === 'goal' && ev.scorerId === dani.id);
        if (daniScored) continue;
        // Il giocatore deve essere nella squadra avversaria a Dani
        const opposingTeam = daniInRed ? (m.blueTeam || []) : (m.redTeam || []);
        if (opposingTeam.some(pl => pl.id === pid)) return true;
      }
      return false;
    },
  },
  {
    id: 'wild_card',
    icon: '🃏',
    label: 'Wild Card',
    desc: 'Vittorie e sconfitte quasi identiche in stagione (|V−S| ≤ 1, min 12 partite) — puro caos',
    positive: true,
    check: (s) =>
      (s.matches || 0) >= 12 &&
      Math.abs((s.wins || 0) - (s.losses || 0)) <= 1,
  },

  {
    id: 'giancarlo',
    icon: '🎲',
    label: 'Giancarlo',
    desc: 'In ogni partita c\'è UN Giancarlo — estratto a sorte tra i presenti. Nessuno sa perché, nessuno sa come. È lui. È Giancarlo.',
    positive: true,
    check: (_s, p, matches) => {
      if (!matches?.length || !p?.id) return false;
      const pid = p.id;
      const hash = (str) => {
        let h = 0;
        for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
        return Math.abs(h);
      };
      for (const m of matches) {
        if (m.status !== 'finished' || m.isHistorical) continue;
        const all = [...(m.redTeam || []), ...(m.blueTeam || [])];
        if (!all.length) continue;
        const giancarlo = all[hash(m.id || m.date || '') % all.length];
        if (giancarlo?.id === pid) return true;
      }
      return false;
    },
  },
  {
    id: 'miglior_luciano',
    icon: '🥇',
    label: 'Miglior Luciano',
    desc: 'Riservato esclusivamente a Luciano. Ogni partita ha il 10% di possibilità di conferirgli questo ambito riconoscimento. Perché il Miglior Luciano merita di essere celebrato.',
    positive: true,
    check: (_s, p, matches) => {
      if (!matches?.length || !p?.id) return false;
      if (!p.name?.toLowerCase().includes('luciano')) return false;
      const pid = p.id;
      const hash = (str) => {
        let h = 0;
        for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
        return Math.abs(h);
      };
      for (const m of matches) {
        if (m.status !== 'finished' || m.isHistorical) continue;
        const inMatch = [...(m.redTeam || []), ...(m.blueTeam || [])].some(pl => pl.id === pid);
        if (!inMatch) continue;
        if (hash(m.id || m.date || '') % 10 === 0) return true;
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
    desc: 'Premio giuria Admin — la "Madonna" più sincera e sentita della partita',
    positive: false,
    // Assigned manually by admins via match.bestieId; auto-computed from autogoals as fallback
    check: (_s, p, matches) => {
      if (!p?.id) return false;
      return (matches || []).some(m => !m.isHistorical && m.bestieId === p.id);
    },
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
