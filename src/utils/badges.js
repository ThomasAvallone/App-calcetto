import { getMs, safeDate } from './dateUtils';
import { computePlayerWeatherStats } from './weatherStats';
import { withProgressiveScore } from './matchScore';

// Helper usato dai badge meteo: filtra le partite del giocatore e calcola le stats meteo.
// Esclude esplicitamente partite storiche e non terminate (defensive: computePlayerWeatherStats
// già salta quelle senza weather.condition, ma è bene non dipendere dall'implementazione).
function _getWeatherStats(player, allMatches) {
  const playerMatches = (allMatches || []).filter(m =>
    !m.isHistorical &&
    m.status === 'finished' &&
    [...(m.redTeam || []), ...(m.blueTeam || [])].some(pl => pl.id === player.id)
  );
  return computePlayerWeatherStats(playerMatches, player.id);
}

// Helper: partite finite non-storiche in cui il player è presente.
function _playedMatches(pid, matches) {
  return (matches || []).filter(m =>
    m.status === 'finished' && !m.isHistorical &&
    [...(m.redTeam || []), ...(m.blueTeam || [])].some(pl => pl.id === pid)
  );
}

// Helper Remuntada/Crollo Verticale: andamento del parziale dal punto di vista del
// player. Ritorna null se la partita non ha eventi (parziale non ricostruibile).
function _swingStats(m, pid) {
  const inRed = (m.redTeam || []).some(pl => pl.id === pid);
  const annotated = withProgressiveScore(m.events || []);
  if (!annotated.length) return null;
  const last = annotated[annotated.length - 1];
  const myFinal = inRed ? last.partialRed : last.partialBlue;
  const theirFinal = inRed ? last.partialBlue : last.partialRed;
  let maxDown = 0, maxUp = 0;
  for (const ev of annotated) {
    const diff = inRed ? ev.partialRed - ev.partialBlue : ev.partialBlue - ev.partialRed;
    if (-diff > maxDown) maxDown = -diff;
    if (diff > maxUp) maxUp = diff;
  }
  return { won: myFinal > theirFinal, lost: myFinal < theirFinal, maxDown, maxUp };
}

// Helper Razzo/Paracadutista: delta del Power Index negli ultimi 30 giorni, dal
// powerHistory del player ([{ d: 'YYYY-MM-DD', pi }], max 30 voci, ordine cronologico).
// Serve almeno 2 snapshot nella finestra, altrimenti 0 (nessun trend misurabile).
function _piDelta30(p) {
  const h = Array.isArray(p?.powerHistory) ? p.powerHistory : [];
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const win = h.filter(e => e && typeof e.pi === 'number' && e.d && new Date(e.d).getTime() >= cutoff);
  if (win.length < 2) return 0;
  return win[win.length - 1].pi - win[0].pi;
}

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
    desc: 'Media GK < 1.5 gol/turno in stagione (min 5 presenze)',
    positive: true,
    check: (s) =>
      (s.matches || 0) >= 5 &&
      (s.gkGoalsConceded || 0) / ((s.matches || 1) * 2) < 1.5,
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
    id: 'highlander',
    icon: '🛡️',
    label: 'Highlander',
    desc: '30+ partite app giocate senza un solo infortunio — indistruttibile',
    positive: true,
    check: (_s, p, matches) => {
      if (!p?.id || !matches?.length) return false;
      const pid = p.id;
      let played = 0, injuries = 0;
      for (const m of matches) {
        if (m.isHistorical || m.status !== 'finished') continue;
        const inMatch = [...(m.redTeam || []), ...(m.blueTeam || [])].some(pl => pl.id === pid);
        if (!inMatch) continue;
        played++;
        for (const ev of (m.events || [])) {
          if (ev.type === 'injury' && ev.playerId === pid) { injuries++; break; }
        }
        if (injuries > 0) return false;
      }
      return played >= 30 && injuries === 0;
    },
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
    id: 'remuntada',
    icon: '🔄',
    label: 'Remuntada',
    desc: 'Vince una partita in cui la sua squadra era sotto di 3+ gol — non è finita finché non è finita',
    positive: true,
    check: (_s, p, matches) => {
      if (!p?.id) return false;
      for (const m of _playedMatches(p.id, matches)) {
        const sw = _swingStats(m, p.id);
        if (sw && sw.won && sw.maxDown >= 3) return true;
      }
      return false;
    },
  },
  {
    id: 'killer_instinct',
    icon: '🗡️',
    label: 'Killer Instinct',
    desc: 'Segna il gol-partita (l\'ultimo gol di una vittoria di misura) in 3+ partite — freddezza glaciale',
    positive: true,
    check: (_s, p, matches) => {
      if (!p?.id) return false;
      const pid = p.id;
      let count = 0;
      for (const m of _playedMatches(pid, matches)) {
        const inRed = (m.redTeam || []).some(pl => pl.id === pid);
        const annotated = withProgressiveScore(m.events || []);
        if (!annotated.length) continue;
        const last = annotated[annotated.length - 1];
        const myFinal = inRed ? last.partialRed : last.partialBlue;
        const theirFinal = inRed ? last.partialBlue : last.partialRed;
        if (myFinal - theirFinal !== 1) continue; // serve la vittoria di misura
        // Il gol-partita è l'ultimo evento che ha dato un punto alla mia squadra
        // (con margine 1, coincide col gol che fissa il risultato). Un autogol
        // avversario decisivo non dà credito a nessuno.
        let decisive = null, prevMy = 0;
        for (const ev of annotated) {
          const my = inRed ? ev.partialRed : ev.partialBlue;
          if (my > prevMy) decisive = ev;
          prevMy = my;
        }
        if (decisive && decisive.type === 'goal' && decisive.scorerId === pid) {
          count++;
          if (count >= 3) return true;
        }
      }
      return false;
    },
  },
  {
    id: 'patto_di_sangue',
    icon: '🤝',
    label: 'Patto di Sangue',
    desc: 'Nella stessa partita segna su assist di un compagno E lo ricambia con un assist — fratelli di gol',
    positive: true,
    check: (_s, p, matches) => {
      if (!p?.id) return false;
      const pid = p.id;
      for (const m of _playedMatches(pid, matches)) {
        const goals = (m.events || []).filter(e => e.type === 'goal');
        const myAssisters = new Set(goals.filter(e => e.scorerId === pid && e.assistId).map(e => e.assistId));
        if (!myAssisters.size) continue;
        if (goals.some(e => e.assistId === pid && e.scorerId && myAssisters.has(e.scorerId))) return true;
      }
      return false;
    },
  },
  {
    id: 'gatto',
    icon: '🐱',
    label: 'Gatto',
    desc: '3+ parate registrate in una singola partita — riflessi felini tra i pali',
    positive: true,
    check: (_s, p, matches) => {
      if (!p?.id) return false;
      for (const m of _playedMatches(p.id, matches)) {
        const saves = (m.events || []).filter(e => e.type === 'save' && e.playerId === p.id);
        if (saves.length >= 3) return true;
      }
      return false;
    },
  },
  {
    id: 'ritorno_del_re',
    icon: '👑',
    label: 'Il Ritorno del Re',
    desc: 'Segna alla prima partita dopo 60+ giorni di assenza — come se non se ne fosse mai andato',
    positive: true,
    check: (_s, p, matches) => {
      if (!p?.id) return false;
      const pid = p.id;
      const played = _playedMatches(pid, matches)
        .slice()
        .sort((a, b) => getMs(a.date) - getMs(b.date));
      const GAP = 60 * 24 * 60 * 60 * 1000;
      for (let i = 1; i < played.length; i++) {
        if (getMs(played[i].date) - getMs(played[i - 1].date) < GAP) continue;
        if ((played[i].events || []).some(e => e.type === 'goal' && e.scorerId === pid)) return true;
      }
      return false;
    },
  },
  {
    id: 'razzo',
    icon: '🚀',
    label: 'Razzo',
    desc: 'Power Index salito di 10+ punti negli ultimi 30 giorni — in rampa di lancio',
    positive: true,
    check: (_s, p) => _piDelta30(p) >= 10,
  },

  // ── TIMING ──────────────────────────────────────────────────────────────────
  {
    id: 'blitz',
    icon: '⚡',
    label: 'Blitz',
    desc: 'Gol entro il 1° minuto di gioco in almeno una partita — partenza folgorante',
    positive: true,
    check: (_s, p, matches) => {
      if (!p?.id) return false;
      const pid = p.id;
      for (const m of _playedMatches(pid, matches)) {
        if ((m.events || []).some(e => e.type === 'goal' && e.scorerId === pid && (e.minute || 0) <= 1))
          return true;
      }
      return false;
    },
  },
  {
    id: 'uno_due',
    icon: '🔫',
    label: 'Uno-Due',
    desc: 'Doppietta in ≤ 5 minuti nella stessa partita — raffica fulminea',
    positive: true,
    check: (_s, p, matches) => {
      if (!p?.id) return false;
      const pid = p.id;
      for (const m of _playedMatches(pid, matches)) {
        const goals = (m.events || [])
          .filter(e => e.type === 'goal' && e.scorerId === pid && typeof e.minute === 'number')
          .sort((a, b) => a.minute - b.minute);
        for (let i = 1; i < goals.length; i++) {
          if (goals[i].minute - goals[i - 1].minute <= 5) return true;
        }
      }
      return false;
    },
  },

  // ── VOTI ────────────────────────────────────────────────────────────────────
  {
    id: 'standing_ovation',
    icon: '🎩',
    label: 'Standing Ovation',
    desc: 'Almeno un voto ≥ 9 ricevuto in una partita — serata da incorniciare',
    positive: true,
    check: (_s, p, matches) => {
      if (!p?.id) return false;
      const pid = p.id;
      for (const m of _playedMatches(pid, matches)) {
        const rating = m.ratings?.[pid];
        if (typeof rating === 'number' && rating >= 9) return true;
      }
      return false;
    },
  },
  {
    id: 'il_professore',
    icon: '📚',
    label: 'Il Professore',
    desc: 'Media voti ≥ 7.5 su tutte le partite votate (min 3) — qualità costante e riconosciuta',
    positive: true,
    check: (_s, p, matches) => {
      if (!p?.id) return false;
      const pid = p.id;
      let sum = 0, count = 0;
      for (const m of _playedMatches(pid, matches)) {
        const r = m.ratings?.[pid];
        if (typeof r === 'number') { sum += r; count++; }
      }
      return count >= 3 && sum / count >= 7.5;
    },
  },

  // ── DUO ─────────────────────────────────────────────────────────────────────
  {
    id: 'coppia_doro',
    icon: '🍀',
    label: "Coppia d'Oro",
    desc: '≥ 80% vittorie con un compagno fisso (min 5 partite insieme) — intesa telepatica',
    positive: true,
    check: (_s, p, matches) => {
      if (!p?.id) return false;
      const pid = p.id;
      const withPartner = {};
      for (const m of _playedMatches(pid, matches)) {
        const inRed = (m.redTeam || []).some(pl => pl.id === pid);
        const myTeam = inRed ? (m.redTeam || []) : (m.blueTeam || []);
        const myScore = inRed ? (m.redScore || 0) : (m.blueScore || 0);
        const theirScore = inRed ? (m.blueScore || 0) : (m.redScore || 0);
        const won = myScore > theirScore;
        for (const tm of myTeam) {
          if (tm.id === pid) continue;
          if (!withPartner[tm.id]) withPartner[tm.id] = { together: 0, wins: 0 };
          withPartner[tm.id].together++;
          if (won) withPartner[tm.id].wins++;
        }
      }
      return Object.values(withPartner).some(st => st.together >= 5 && st.wins / st.together >= 0.8);
    },
  },

  // ── PRESENZE ────────────────────────────────────────────────────────────────
  {
    id: 'equilibrista',
    icon: '⚖️',
    label: 'Equilibrista',
    desc: '3 pareggi di fila — il re del nulla alla pari',
    positive: true,
    check: (_s, p, matches) => {
      if (!p?.id) return false;
      const pid = p.id;
      const played = _playedMatches(pid, matches)
        .slice()
        .sort((a, b) => getMs(a.date) - getMs(b.date));
      let streak = 0;
      for (const m of played) {
        if ((m.redScore || 0) === (m.blueScore || 0)) {
          streak++;
          if (streak >= 3) return true;
        } else {
          streak = 0;
        }
      }
      return false;
    },
  },
  {
    id: 'stacanovista',
    icon: '📅',
    label: 'Stacanovista',
    desc: 'Presente in 10 partite consecutive del gruppo senza saltarne una — una certezza',
    positive: true,
    check: (_s, p, matches) => {
      if (!p?.id) return false;
      const pid = p.id;
      const all = (matches || [])
        .filter(m => m.status === 'finished' && !m.isHistorical)
        .sort((a, b) => getMs(a.date) - getMs(b.date));
      let streak = 0;
      for (const m of all) {
        const inMatch = [...(m.redTeam || []), ...(m.blueTeam || [])].some(pl => pl.id === pid);
        if (inMatch) {
          streak++;
          if (streak >= 10) return true;
        } else {
          streak = 0;
        }
      }
      return false;
    },
  },

  // ── COMEBACK ────────────────────────────────────────────────────────────────
  {
    id: 'terminator',
    icon: '🦾',
    label: 'Terminator',
    desc: 'Segna alla prima partita dopo un proprio infortunio — torna più forte di prima',
    positive: true,
    check: (_s, p, matches) => {
      if (!p?.id) return false;
      const pid = p.id;
      const played = _playedMatches(pid, matches)
        .slice()
        .sort((a, b) => getMs(a.date) - getMs(b.date));
      for (let i = 0; i < played.length - 1; i++) {
        const wasInjured = (played[i].events || []).some(e => e.type === 'injury' && e.playerId === pid);
        if (!wasInjured) continue;
        if ((played[i + 1].events || []).some(e => e.type === 'goal' && e.scorerId === pid)) return true;
      }
      return false;
    },
  },

  {
    id: 'giancarlo',
    icon: '🎲',
    label: 'Giancarlo',
    desc: 'Titolo in carica: il Giancarlo dell\'ultima partita giocata. Ogni partita lo riassegna a un nuovo eletto. Uno solo può portare questo peso.',
    positive: true,
    check: (_s, p, matches) => {
      if (!matches?.length || !p?.id) return false;
      const pid = p.id;
      const hash = (str) => {
        let h = 0;
        for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
        return Math.abs(h);
      };
      const lastMatch = [...matches]
        .filter(m => m.status === 'finished' && !m.isHistorical)
        .sort((a, b) => {
          const ta = a.date?.toMillis ? a.date.toMillis() : (a.date ? new Date(a.date).getTime() : 0);
          const tb = b.date?.toMillis ? b.date.toMillis() : (b.date ? new Date(b.date).getTime() : 0);
          return tb - ta;
        })[0];
      if (!lastMatch) return false;
      const all = [...(lastMatch.redTeam || []), ...(lastMatch.blueTeam || [])];
      if (!all.length) return false;
      const giancarlo = all[hash(lastMatch.id || lastMatch.date || '') % all.length];
      return giancarlo?.id === pid;
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
    desc: 'Media GK > 3 gol/turno in stagione (min 5 presenze)',
    positive: false,
    check: (s) =>
      (s.matches || 0) >= 5 &&
      (s.gkGoalsConceded || 0) / ((s.matches || 1) * 2) > 3,
  },
  {
    id: 'gufo',
    icon: '🦉',
    label: 'Gufo',
    desc: 'Media GK > 4 gol/turno (min 3 presenze) — porta sfiga dalla porta',
    positive: false,
    check: (s) =>
      (s.matches || 0) >= 3 &&
      (s.gkGoalsConceded || 0) / ((s.matches || 1) * 2) > 4,
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
  {
    id: 'vetro_murano',
    icon: '🩹',
    label: 'Vetro di Murano',
    desc: '≥2 infortuni nella stagione corrente — di una fragilità rinascimentale',
    positive: false,
    check: (_s, p, matches) => {
      if (!p?.id || !matches?.length) return false;
      const now = new Date();
      const year = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
      const seasonStart = new Date(year, 8, 1).getTime();
      let count = 0;
      for (const m of matches) {
        if (m.isHistorical || m.status !== 'finished') continue;
        if (getMs(m.date) < seasonStart) continue;
        for (const ev of (m.events || [])) {
          if (ev.type === 'injury' && ev.playerId === p.id) count++;
        }
      }
      return count >= 2;
    },
  },
  {
    id: 're_infermeria',
    icon: '🚑',
    label: 'Re dell\'Infermeria',
    desc: 'Più infortuni all-time (min 3) — il bollettino medico ufficiale del torneo',
    positive: false,
    check: (_s, p, matches) => {
      if (!p?.id || !matches?.length) return false;
      const counts = {};
      for (const m of matches) {
        if (m.isHistorical || m.status !== 'finished') continue;
        for (const ev of (m.events || [])) {
          if (ev.type === 'injury' && ev.playerId) {
            counts[ev.playerId] = (counts[ev.playerId] || 0) + 1;
          }
        }
      }
      const myCount = counts[p.id] || 0;
      if (myCount < 3) return false;
      const maxCount = Math.max(...Object.values(counts));
      return myCount === maxCount;
    },
  },
  {
    id: 'crollo_verticale',
    icon: '🫠',
    label: 'Crollo Verticale',
    desc: 'Perde una partita in cui la sua squadra era avanti di 3+ gol — l\'arte di complicarsi la vita',
    positive: false,
    check: (_s, p, matches) => {
      if (!p?.id) return false;
      for (const m of _playedMatches(p.id, matches)) {
        const sw = _swingStats(m, p.id);
        if (sw && sw.lost && sw.maxUp >= 3) return true;
      }
      return false;
    },
  },
  {
    id: 'giano_bifronte',
    icon: '🎭',
    label: 'Giano Bifronte',
    desc: 'Gol e autogol nella stessa partita — il bene e il male in un corpo solo',
    positive: false,
    check: (_s, p, matches) => {
      if (!p?.id) return false;
      const pid = p.id;
      for (const m of _playedMatches(pid, matches)) {
        const evs = m.events || [];
        const scored = evs.some(e => e.type === 'goal' && e.scorerId === pid);
        const own = evs.some(e => e.type === 'autogoal' && e.scorerId === pid);
        if (scored && own) return true;
      }
      return false;
    },
  },
  {
    id: 'madonna_seriale',
    icon: '📿',
    label: 'Madonna Seriale',
    desc: '3+ premi Bestie all-time — ormai è una liturgia: la giuria non perdona',
    positive: false,
    check: (_s, p, matches) => {
      if (!p?.id) return false;
      return (matches || []).filter(m => !m.isHistorical && m.bestieId === p.id).length >= 3;
    },
  },
  {
    id: 'paracadutista',
    icon: '🪂',
    label: 'Paracadutista',
    desc: 'Power Index sceso di 10+ punti negli ultimi 30 giorni — atterraggio morbido non garantito',
    positive: false,
    check: (_s, p) => _piDelta30(p) <= -10,
  },
  {
    id: 'incubo_ricorrente',
    icon: '😈',
    label: 'Incubo Ricorrente',
    desc: 'Perde ≥ 80% degli scontri contro uno stesso avversario (min 5 incroci) — la sua bestia nera',
    positive: false,
    check: (_s, p, matches) => {
      if (!p?.id) return false;
      const pid = p.id;
      const vsOpp = {};
      for (const m of _playedMatches(pid, matches)) {
        const inRed = (m.redTeam || []).some(pl => pl.id === pid);
        const myScore = inRed ? (m.redScore || 0) : (m.blueScore || 0);
        const theirScore = inRed ? (m.blueScore || 0) : (m.redScore || 0);
        const lost = myScore < theirScore;
        for (const opp of (inRed ? (m.blueTeam || []) : (m.redTeam || []))) {
          if (!vsOpp[opp.id]) vsOpp[opp.id] = { total: 0, losses: 0 };
          vsOpp[opp.id].total++;
          if (lost) vsOpp[opp.id].losses++;
        }
      }
      return Object.values(vsOpp).some(st => st.total >= 5 && st.losses / st.total >= 0.8);
    },
  },

  // ── STAGIONALI ──────────────────────────────────────────────────────────────
  {
    id: 'gol_halloween',
    icon: '🎃',
    label: 'Gol di Halloween',
    desc: 'Gol in una partita tra il 25 ottobre e il 2 novembre — chi ha detto che i fantasmi non segnano?',
    positive: false,
    check: (_s, p, matches) => {
      if (!p?.id) return false;
      const pid = p.id;
      for (const m of _playedMatches(pid, matches)) {
        const d = safeDate(m.date);
        if (!d || isNaN(d.getTime())) continue;
        const mon = d.getMonth(); // 0-indexed: 9=ott, 10=nov
        const day = d.getDate();
        if (!((mon === 9 && day >= 25) || (mon === 10 && day <= 2))) continue;
        if ((m.events || []).some(e => e.type === 'goal' && e.scorerId === pid)) return true;
      }
      return false;
    },
  },
  {
    id: 'gol_sotto_albero',
    icon: '🎄',
    label: "Gol sotto l'Albero",
    desc: 'Gol in una partita dal 20 al 31 dicembre — Babbo Natale porta i palloni, tu li metti in rete',
    positive: false,
    check: (_s, p, matches) => {
      if (!p?.id) return false;
      const pid = p.id;
      for (const m of _playedMatches(pid, matches)) {
        const d = safeDate(m.date);
        if (!d || isNaN(d.getTime())) continue;
        if (d.getMonth() !== 11 || d.getDate() < 20) continue;
        if ((m.events || []).some(e => e.type === 'goal' && e.scorerId === pid)) return true;
      }
      return false;
    },
  },

  // ── METEO ─────────────────────────────────────────────────────────────────────
  {
    id: 're_del_sole',
    icon: '☀️',
    label: 'Re del Sole',
    desc: '≥70% vittorie con tempo soleggiato (min 3 partite)',
    positive: true,
    check: (_s, p, matches) => {
      const ws = _getWeatherStats(p, matches);
      const s = ws.find(w => w.key === 'sunny');
      return s && s.matches >= 3 && s.wins / s.matches >= 0.7;
    },
  },
  {
    id: 're_del_fango',
    icon: '🌧️',
    label: 'Re del Fango',
    desc: '≥70% vittorie sotto la pioggia (min 3 partite)',
    positive: true,
    check: (_s, p, matches) => {
      const ws = _getWeatherStats(p, matches);
      const s = ws.find(w => w.key === 'rainy');
      return s && s.matches >= 3 && s.wins / s.matches >= 0.7;
    },
  },
  {
    id: 'inossidabile',
    icon: '🥶',
    label: 'Inossidabile',
    desc: '≥70% vittorie con freddo o vento (min 3 partite combinate)',
    positive: true,
    check: (_s, p, matches) => {
      const ws = _getWeatherStats(p, matches);
      const combined = ws.filter(w => w.key === 'cold' || w.key === 'wind');
      const tot = combined.reduce((a, b) => ({ matches: a.matches + b.matches, wins: a.wins + b.wins }), { matches: 0, wins: 0 });
      return tot.matches >= 3 && tot.wins / tot.matches >= 0.7;
    },
  },
  {
    id: 'all_weather',
    icon: '🌈',
    label: 'All Weather',
    desc: 'Almeno 1 vittoria in 4+ condizioni meteo diverse',
    positive: true,
    check: (_s, p, matches) => {
      const ws = _getWeatherStats(p, matches);
      return ws.filter(w => w.wins >= 1).length >= 4;
    },
  },
  {
    id: 'meteoropatico',
    icon: '⛈️',
    label: 'Meteoropatico',
    desc: '≤30% vittorie in qualche condizione meteo (min 4 partite) — il meteo lo distrugge',
    positive: false,
    check: (_s, p, matches) => {
      const ws = _getWeatherStats(p, matches);
      return ws.some(w => w.matches >= 4 && w.wins / w.matches <= 0.3);
    },
  },
  {
    id: 'iceman',
    icon: '🧊',
    label: 'Iceman',
    desc: 'Gol in una partita con temperatura ≤ 2°C — freddo? Che freddo?',
    positive: true,
    check: (_s, p, matches) => {
      if (!p?.id) return false;
      const pid = p.id;
      for (const m of _playedMatches(pid, matches)) {
        if (typeof m.weather?.temp !== 'number' || m.weather.temp > 2) continue;
        if ((m.events || []).some(e => e.type === 'goal' && e.scorerId === pid)) return true;
      }
      return false;
    },
  },
  {
    id: 'sahara',
    icon: '🥵',
    label: 'Sahara',
    desc: 'Gol in una partita con temperatura ≥ 32°C — caldo infernale, gol glaciale',
    positive: true,
    check: (_s, p, matches) => {
      if (!p?.id) return false;
      const pid = p.id;
      for (const m of _playedMatches(pid, matches)) {
        if (typeof m.weather?.temp !== 'number' || m.weather.temp < 32) continue;
        if ((m.events || []).some(e => e.type === 'goal' && e.scorerId === pid)) return true;
      }
      return false;
    },
  },
];

// seasonStats: stats computed from current-season matches only (goals, assists, etc.)
// player:      full player object (for powerIndex, streak, all-time stats)
// allMatches:  all Firestore matches (for match-level badge checks — optional)
export function computeBadges(player, seasonStats, allMatches) {
  if (!player) return [];
  const s = seasonStats || player.stats || {};
  // Error isolation per-badge: i check girano su dati Firestore arbitrari (eventi
  // malformati, team mancanti, date come Timestamp). Un singolo check che lancia
  // non deve azzerare tutti i badge né far crashare il render di PlayerBadges.
  return BADGE_DEFS.filter(b => {
    try {
      return b.check(s, player, allMatches);
    } catch (e) {
      if (import.meta.env?.DEV) console.warn(`[badges] check "${b.id}" failed:`, e);
      return false;
    }
  });
}
