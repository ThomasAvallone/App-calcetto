import React, { useState, useMemo, useEffect, useRef } from 'react';
import usePlayersStore from '../store/playersStore';
import useAuthStore, { selectIsAdmin } from '../store/authStore';
import { computeCombinedPowerIndex, recalculatePlayerStats, updatePlayer } from '../firebase/firestore';
import { getAllUsers, findUserByEmail, setUserLinkedPlayer } from '../firebase/auth';
import { useMatchesSubscription } from '../hooks/useMatchesSubscription';
import { usePIConfig } from '../hooks/usePIConfig';
import { HISTORICAL_SEASONS, suggestHistoricalNames, computeCumulativeStats, getUnlinkedNames } from '../data/historicalData';
import toast from 'react-hot-toast';
import { getMs } from '../utils/dateUtils';
import { RESULT_COLORS, CLR_WIN, CLR_DRAW, CLR_LOSS, CLR_MUTED, MEDAL_COLORS } from '../constants/colors';
import FutCard from '../components/FutCard';
import HistoricalLinkSection from '../components/players/HistoricalLinkSection';
import PiTrendChart from '../components/players/PiTrendChart';
import AiTrendCard from '../components/players/AiTrendCard';
import AiNicknameCard from '../components/players/AiNicknameCard';
import { PiArc, getRoleIcon, PlayerAvatar, PlayerMatchHistory, PlayerRecords, PlayerBadges, PowerIndexChart, StreakBadge } from '../components/players/PlayerDetailComponents';
import DuoCompatibility from '../components/players/DuoCompatibility';
import PlayerAchievements from '../components/players/PlayerAchievements';
import PlayerWeatherStats from '../components/players/PlayerWeatherStats';
import GoalMinuteChart from '../components/players/GoalMinuteChart';

const ROLES = ['Portiere', 'Difensore', 'Centrocampista', 'Attaccante'];

// Map seasonId → { PLAYERNAME_UPPER → { presenze, assist } }
const SEASON_PLAYER_MAP = {};
for (const season of HISTORICAL_SEASONS) {
  SEASON_PLAYER_MAP[season.id] = {};
  for (const sp of season.players) {
    SEASON_PLAYER_MAP[season.id][sp.name.toUpperCase()] = {
      presenze: sp.presenze || 0,
      assist: sp.assist || 0,
    };
  }
}

function getSeasonId(dateVal) {
  const d = dateVal?.toMillis ? new Date(dateVal.toMillis()) : new Date(dateVal);
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  return month >= 8
    ? `${year}-${String(year + 1).slice(2)}`
    : `${year - 1}-${String(year).slice(2)}`;
}

function FormDots({ results, size = 9 }) {
  const colors = RESULT_COLORS;
  if (!results || results.length === 0) return null;
  return (
    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
      {results.map((r, i) => (
        <div key={i} title={r === 'W' ? 'Vittoria' : r === 'D' ? 'Pareggio' : 'Sconfitta'} style={{
          width: size, height: size, borderRadius: '50%',
          background: colors[r],
          opacity: 0.4 + (i / Math.max(results.length - 1, 1)) * 0.6,
          flexShrink: 0,
        }} />
      ))}
    </div>
  );
}

const defaultForm = { name: '', primaryRole: 'Centrocampista', secondaryRole: '', photoURL: '', linkedEmail: '' };

/** Riconosce uno swipe da sinistra a destra e chiama onSwipe (back gesture mobile) */
function SwipeBack({ onSwipe, children }) {
  const startX = useRef(null);
  const startY = useRef(null);
  return (
    <div
      onTouchStart={e => { startX.current = e.touches[0].clientX; startY.current = e.touches[0].clientY; }}
      onTouchEnd={e => {
        if (startX.current === null) return;
        const dx = e.changedTouches[0].clientX - startX.current;
        const dy = Math.abs(e.changedTouches[0].clientY - startY.current);
        if (dx > 60 && dy < 60) onSwipe();
        startX.current = null;
      }}
    >
      {children}
    </div>
  );
}

const MEDIA_CONTAINER_STYLE = { borderRadius: '12px 12px 0 0', overflow: 'hidden', marginBottom: 0, lineHeight: 0, border: '1px solid #2D3748', borderBottom: 'none', background: '#1A202C' };

function PlayerMedia({ url, name }) {
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  if (ytMatch) {
    return (
      <div style={MEDIA_CONTAINER_STYLE}>
        <iframe
          src={`https://www.youtube.com/embed/${ytMatch[1]}?autoplay=0&controls=1`}
          style={{ width: '100%', height: '220px', display: 'block', border: 'none' }}
          allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }
  if (/\.(mp4|webm|mov|ogg)(\?|$)/i.test(url)) {
    return (
      <div style={MEDIA_CONTAINER_STYLE}>
        <video
          src={url}
          controls
          playsInline
          style={{ width: '100%', maxHeight: '320px', display: 'block', background: '#1A202C' }}
          onError={e => { e.currentTarget.style.display = 'none'; }}
        />
      </div>
    );
  }
  return (
    <div style={MEDIA_CONTAINER_STYLE}>
      <img
        src={url}
        alt={name}
        style={{ width: '100%', maxHeight: '320px', objectFit: 'contain', objectPosition: 'top center', display: 'block', background: '#1A202C' }}
        onError={e => { e.currentTarget.style.display = 'none'; }}
      />
    </div>
  );
}

export default function PlayersPage() {
  const { players, addPlayer, updatePlayer: editPlayer, removePlayer } = usePlayersStore();
  const { role } = useAuthStore();
  const isAdmin = useAuthStore(selectIsAdmin);
  const piConfig = usePIConfig();

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const [editId, setEditId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [recalcLoading, setRecalcLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'cards'
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [statView, setStatView] = useState('season');

  useEffect(() => { setStatView('season'); }, [selectedPlayer]);

  // Resetta selectedPlayer se il giocatore viene eliminato mentre la scheda è aperta
  useEffect(() => {
    if (selectedPlayer && !players.find(pl => pl.id === selectedPlayer)) {
      setSelectedPlayer(null);
    }
  }, [players, selectedPlayer]);

  // Historical linking state
  const [linkedNames, setLinkedNames] = useState([]);
  const [showAllHistorical, setShowAllHistorical] = useState(false);
  const [historicalSearch, setHistoricalSearch] = useState('');

  // Lista utenti registrati per il dropdown di collegamento email→player (admin-only).
  // Le rule limitano la lettura agli admin, quindi i viewer non lo ricevono comunque.
  const [allUsers, setAllUsers] = useState([]);
  const [allUsersLoaded, setAllUsersLoaded] = useState(false);
  const refreshAllUsers = () => {
    if (!isAdmin) return;
    getAllUsers().then(us => { setAllUsers(us); setAllUsersLoaded(true); }).catch(() => {});
  };
  useEffect(() => { refreshAllUsers(); }, [isAdmin]);

  // Backfill linkedEmail nel form quando allUsers finisce di caricare DOPO openForm.
  // Senza questo, l'admin potrebbe aprire la modifica con allUsers vuoto, vedere
  // linkedEmail='' e salvare scollegando per sbaglio un utente effettivamente collegato.
  // Guard: solo se linkedEmail è ancora vuoto (rispetta una scollega manuale via ✕).
  // NOTA: deve stare DOPO la dichiarazione di allUsers/allUsersLoaded — altrimenti
  // TDZ sulle deps ("Cannot access 'R' before initialization" in build minificata).
  useEffect(() => {
    if (!showForm || !editId || !isAdmin || !allUsersLoaded) return;
    if (form.linkedEmail) return; // Admin ha già impostato/clearato manualmente
    const linkedUser = allUsers.find(u => u.linkedPlayerId === editId);
    if (linkedUser?.email) {
      setForm(prev => ({ ...prev, linkedEmail: linkedUser.email }));
    }
  }, [showForm, editId, isAdmin, allUsersLoaded]);

  const allMatches = useMatchesSubscription();

  const finishedMatches = useMemo(() => allMatches.filter(m => m.status === 'finished'), [allMatches]);

  // Pre-compute per-player finished matches (avoids 6+ components independently filtering allMatches)
  const playerMatchesMap = useMemo(() => {
    const map = {};
    for (const m of finishedMatches) {
      for (const pl of [...(m.redTeam || []), ...(m.blueTeam || [])]) {
        if (pl.id) {
          if (!map[pl.id]) map[pl.id] = [];
          map[pl.id].push(m);
        }
      }
    }
    return map;
  }, [finishedMatches]);

  // Current season start: September 1st of the current football season
  const seasonStartMs = useMemo(() => {
    const now = new Date();
    const year = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
    return new Date(year, 8, 1).getTime();
  }, []);

  // Season stats per player (goals/assists/etc. from current-season matches only)
  const playerSeasonStats = useMemo(() => {
    const seasonMatches = finishedMatches.filter(m => getMs(m.date) >= seasonStartMs);
    const stats = {};
    for (const p of players) {
      const s = { goals: 0, assists: 0, autogoals: 0, matches: 0, wins: 0, draws: 0, losses: 0, gkMatches: 0, gkGoalsConceded: 0, cleanSheets: 0 };
      const histBySeason = {};
      for (const m of seasonMatches) {
        const inRed = (m.redTeam || []).some(pl => pl.id === p.id);
        const inBlue = (m.blueTeam || []).some(pl => pl.id === p.id);
        if (!inRed && !inBlue) continue;
        s.matches++;
        const my = inRed ? (m.redScore ?? 0) : (m.blueScore ?? 0);
        const their = inRed ? (m.blueScore ?? 0) : (m.redScore ?? 0);
        if (my > their) s.wins++;
        else if (my < their) s.losses++;
        else s.draws++;
        // Tutti ruotano in porta: ogni partita giocata = 1 apparizione da portiere
        s.gkMatches++;
        let gkConcededThisMatch = 0;
        for (const ev of m.events || []) {
          if (ev.type === 'goal') {
            if (ev.scorerId === p.id) s.goals++;
            if (ev.assistId === p.id) s.assists++;
          }
          if (ev.type === 'autogoal' && ev.scorerId === p.id) s.autogoals++;
          if (ev.gkConcededId === p.id) { s.gkGoalsConceded++; gkConcededThisMatch++; }
        }
        // Clean sheet individuale: il portiere non ha subito gol personalmente (escluse partite storiche senza dati GK individuali)
        if (!m.isHistorical && gkConcededThisMatch === 0) s.cleanSheets++;
        // Track historical matches by season for assist proration
        if (m.isHistorical) {
          const sid = getSeasonId(m.date);
          histBySeason[sid] = (histBySeason[sid] || 0) + 1;
        }
      }
      // Prorate historical assists (historical events lack assistId)
      const histNames = (p.historicalNames || []).map(n => n.toUpperCase());
      for (const [sid, countInPeriod] of Object.entries(histBySeason)) {
        const seasonData = SEASON_PLAYER_MAP[sid];
        if (!seasonData) continue;
        let pData = null;
        for (const name of histNames) {
          if (seasonData[name]) { pData = seasonData[name]; break; }
        }
        if (!pData || !pData.presenze || !pData.assist) continue;
        s.assists += Math.round(pData.assist * (countInPeriod / pData.presenze));
      }
      stats[p.id] = s;
    }
    return stats;
  }, [players, finishedMatches, seasonStartMs]);

  // All-time clean sheets per player: il portiere non ha subito gol personalmente
  const playerCleanSheets = useMemo(() => {
    const cs = {};
    for (const p of players) cs[p.id] = 0;
    for (const m of finishedMatches) {
      if (m.isHistorical) continue; // partite storiche senza dati GK individuali
      // Trova i portieri che hanno subito almeno un gol in questa partita
      const concededSet = new Set((m.events || []).filter(ev => ev.gkConcededId).map(ev => ev.gkConcededId));
      for (const pl of [...(m.redTeam || []), ...(m.blueTeam || [])]) {
        if (pl.id && cs[pl.id] !== undefined && !concededSet.has(pl.id)) {
          cs[pl.id]++;
        }
      }
    }
    return cs;
  }, [players, finishedMatches]);

  const playerFormMap = useMemo(() => {
    const forms = {};
    for (const p of players) {
      const pMatches = finishedMatches
        .filter(m => [...(m.redTeam || []), ...(m.blueTeam || [])].some(pl => pl.id === p.id))
        .sort((a, b) => getMs(b.date) - getMs(a.date))
        .slice(0, 5);
      const newestFirst = pMatches.map(m => {
        const inRed = (m.redTeam || []).some(pl => pl.id === p.id);
        const my = inRed ? (m.redScore ?? 0) : (m.blueScore ?? 0);
        const their = inRed ? (m.blueScore ?? 0) : (m.redScore ?? 0);
        return my > their ? 'W' : my < their ? 'L' : 'D';
      });
      let formStreak = null;
      if (newestFirst.length >= 2) {
        const type = newestFirst[0];
        let count = 0;
        for (const r of newestFirst) { if (r === type) count++; else break; }
        if (count >= 2) formStreak = { type, count };
      }
      forms[p.id] = { lastFive: [...newestFirst].reverse(), streak: formStreak };
    }
    return forms;
  }, [players, finishedMatches]);

  const filtered = players.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));
  const ranking = [...filtered].sort((a, b) => (b.powerIndex || 50) - (a.powerIndex || 50));
  // Ranking globale (non filtrato dalla ricerca) — usato solo per il glow top-3 dell'arco PI
  const globalRanking = [...players].sort((a, b) => (b.powerIndex || 50) - (a.powerIndex || 50));

  // Suggestions based on current form name
  const suggestions = useMemo(() => {
    if (!form.name.trim() || form.name.trim().length < 2) return [];
    return suggestHistoricalNames(form.name.trim(), linkedNames);
  }, [form.name, linkedNames]);

  // All unlinked names (for "show all" mode)
  const allUnlinkedNames = useMemo(() => {
    const unlinked = getUnlinkedNames(players.filter(p => editId ? p.id !== editId : true));
    if (!historicalSearch.trim()) return unlinked;
    const q = historicalSearch.toUpperCase();
    return unlinked.filter(n => n.toUpperCase().includes(q));
  }, [players, editId, historicalSearch]);

  const toggleName = (name) => {
    setLinkedNames(prev =>
      prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
    );
  };

  const openForm = (p = null) => {
    if (p) {
      // Recupera l'email collegata dalla cache utenti (admin only)
      const linkedUser = allUsers.find(u => u.linkedPlayerId === p.id);
      setForm({
        name: p.name,
        primaryRole: p.primaryRole || 'Centrocampista',
        secondaryRole: p.secondaryRole || '',
        photoURL: p.photoURL || '',
        linkedEmail: linkedUser?.email || '',
      });
      setEditId(p.id);
      setLinkedNames(p.historicalNames || []);
    } else {
      setForm(defaultForm);
      setEditId(null);
      setLinkedNames([]);
    }
    setShowAllHistorical(false);
    setHistoricalSearch('');
    setShowForm(true);
    setSelectedPlayer(null);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditId(null);
    setLinkedNames([]);
    setShowAllHistorical(false);
  };

  // Sincronizza il link email→player. Valida prima dell'unlink per non perdere
  // il vecchio link se la nuova email non esiste come utente registrato.
  // Ritorna true se il link è stato cambiato (per refresh della cache).
  const syncEmailLink = async (playerId, newEmail, oldEmail) => {
    const newLower = (newEmail || '').trim().toLowerCase();
    const oldLower = (oldEmail || '').trim().toLowerCase();
    if (newLower === oldLower) return false;

    // Validazione: se c'è una nuova email, deve essere un utente registrato
    let newUser = null;
    if (newLower) {
      newUser = await findUserByEmail(newLower);
      if (!newUser) {
        toast.error(`Email "${newLower}" non registrata — l'utente deve fare prima il login Google`);
        return false; // Non scolleghiamo il vecchio link
      }
    }

    // Unlink del vecchio utente se esisteva (e non è lo stesso del nuovo)
    if (oldLower) {
      const oldUser = await findUserByEmail(oldLower);
      if (oldUser && oldUser.linkedPlayerId === playerId && (!newUser || newUser.uid !== oldUser.uid)) {
        await setUserLinkedPlayer(oldUser.uid, null);
      }
    }

    // Link del nuovo utente
    if (newUser) {
      if (newUser.linkedPlayerId && newUser.linkedPlayerId !== playerId) {
        toast(`⚠️ Email era già collegata a un altro giocatore — link sostituito`, { duration: 4000 });
      }
      await setUserLinkedPlayer(newUser.uid, playerId);
    }
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error('Inserisci il nome'); return; }
    setLoading(true);
    try {
      // Null if no names linked (avoids storing zeroed object on all players)
      const historicalStats = linkedNames.length > 0 ? computeCumulativeStats(linkedNames) : null;

      const playerData = {
        name: form.name.trim(),
        primaryRole: form.primaryRole,
        secondaryRole: form.secondaryRole,
        photoURL: form.photoURL.trim() || null,
        historicalNames: linkedNames,
        historicalStats,
      };

      let savedPlayerId = editId;
      let linkChanged = false;

      if (editId) {
        // Recompute power index combining app stats + new historicalStats
        const currentPlayer = players.find(p => p.id === editId);
        const pi = computeCombinedPowerIndex(currentPlayer?.stats, historicalStats, piConfig);
        await editPlayer(editId, { ...playerData, powerIndex: pi });
        // Recalculate p.stats so all-time leaderboard picks up the new historicalStats
        await recalculatePlayerStats([editId]);
        // Email link sync (solo admin: viewer non vede neanche il campo)
        if (isAdmin) {
          const oldLinkedUser = allUsers.find(u => u.linkedPlayerId === editId);
          linkChanged = await syncEmailLink(editId, form.linkedEmail, oldLinkedUser?.email || '');
        }
        toast.success('Giocatore aggiornato');
      } else {
        const newRef = await addPlayer(playerData);
        savedPlayerId = newRef?.id;
        // If aliases were linked, sync p.stats immediately
        if (linkedNames.length > 0 && savedPlayerId) {
          await recalculatePlayerStats([savedPlayerId]);
        }
        if (isAdmin && savedPlayerId && form.linkedEmail) {
          linkChanged = await syncEmailLink(savedPlayerId, form.linkedEmail, '');
        }
        toast.success(linkedNames.length > 0
          ? `Giocatore aggiunto con storico (${linkedNames.length} alias)!`
          : 'Giocatore aggiunto!');
      }
      if (linkChanged) refreshAllUsers();
      closeForm();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRecalcAll = async () => {
    const ids = players.filter(p => (p.historicalNames || []).length > 0).map(p => p.id);
    if (ids.length === 0) { toast('Nessun giocatore con storico collegato'); return; }
    setRecalcLoading(true);
    try {
      await recalculatePlayerStats(ids);
      toast.success(`Stats aggiornate per ${ids.length} giocator${ids.length === 1 ? 'e' : 'i'}`);
    } catch (e) {
      toast.error('Errore ricalcolo: ' + e.message);
    } finally {
      setRecalcLoading(false);
    }
  };

  const handleDelete = async (p) => {
    if (!window.confirm(`Eliminare ${p.name}? Questa azione è irreversibile.`)) return;
    // Cleanup link utente prima di eliminare il player, altrimenti users/{uid}.linkedPlayerId
    // resta orfano puntando a un player inesistente (l'utente vedrà "Profilo non collegato")
    if (isAdmin) {
      const linkedUser = allUsers.find(u => u.linkedPlayerId === p.id);
      if (linkedUser) await setUserLinkedPlayer(linkedUser.uid, null).catch(() => {});
    }
    await removePlayer(p.id);
    toast.success(`${p.name} eliminato`);
    setSelectedPlayer(null);
    refreshAllUsers();
  };

  if (selectedPlayer) {
    const p = players.find(pl => pl.id === selectedPlayer);
    if (!p) return null; // Giocatore eliminato: useEffect reimposta selectedPlayer
    const playerRank = globalRanking.findIndex(r => r.id === p.id);

    const as = p.stats || {};
    const total = {
      goals: as.goals || 0,
      assists: as.assists || 0,
      autogoals: as.autogoals || 0,
      matches: as.matches || 0,
      wins: as.wins || 0,
      draws: as.draws || 0,
      losses: as.losses || 0,
      gkMatches: as.gkMatches || 0,
      gkGoalsConceded: as.gkGoalsConceded || 0,
      cleanSheets: playerCleanSheets[p.id] || 0,
    };
    const hasHistory = (p.historicalNames || []).length > 0;
    const pForm = playerFormMap[p.id];
    const rf = p.recentForm;
    const formColor = rf ? (rf.avg >= 7 ? CLR_WIN : rf.avg >= 5 ? CLR_DRAW : CLR_LOSS) : null;
    const seasonSt = playerSeasonStats[p.id] || {};
    // cleanSheets: use all-match count since GK/CS tracking started this season
    const seasonStWithCs = { ...seasonSt, cleanSheets: playerCleanSheets[p.id] || 0 };
    const displaySt = statView === 'season' ? seasonStWithCs : total;

    return (
      <SwipeBack onSwipe={() => setSelectedPlayer(null)}>
      <div className="page-content slide-in-right">
        <div className="flex items-center gap-3 mb-4" style={{ paddingTop: '0.5rem' }}>
          <button className="btn btn-ghost btn-icon" onClick={() => setSelectedPlayer(null)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <h2>{p.name}</h2>
          {isAdmin && (
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem' }}>
              <button className="btn btn-ghost text-sm" style={{ padding: '0.4rem 0.75rem', minHeight: 'auto' }} onClick={() => openForm(p)}>✏️ Modifica</button>
              <button className="btn btn-danger text-sm" style={{ padding: '0.4rem 0.75rem', minHeight: 'auto' }} onClick={() => handleDelete(p)}>🗑️</button>
            </div>
          )}
        </div>

        <AiNicknameCard player={p} />

        {p.photoURL && <PlayerMedia url={p.photoURL} name={p.name} />}
        <div className="card mb-4" style={{ textAlign: 'center', padding: '1.75rem', ...(p.photoURL ? { borderRadius: '0 0 12px 12px', borderTop: 'none' } : {}) }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.75rem' }}>
            <div style={{ position: 'relative', width: 120, height: 120 }}>
              <PiArc value={p.powerIndex || 50} glow={playerRank < 3} />
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                <div style={{ fontSize: '1.25rem', lineHeight: 1 }}>{getRoleIcon(p.primaryRole)}</div>
                <div style={{ fontSize: '1.65rem', fontWeight: 900, color: '#4FD1C5', lineHeight: 1 }}>
                  {(p.powerIndex || 50).toFixed(1)}
                </div>
                <div style={{ fontSize: '0.55rem', color: '#718096', letterSpacing: '0.06em' }}>POWER INDEX</div>
              </div>
            </div>
          </div>
          <div className="flex gap-2 justify-center">
            <span className="badge badge-teal">{p.primaryRole || 'N/D'}</span>
            {p.secondaryRole && <span className="badge badge-gray">{p.secondaryRole}</span>}
            {hasHistory && <span className="badge" style={{ background: 'rgba(246,224,94,0.15)', color: '#F6E05E', border: '1px solid rgba(246,224,94,0.3)', fontSize: '0.65rem' }}>📚 Storico</span>}
          </div>
          {pForm && pForm.lastFive.length > 0 && (
            <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #2D3748' }}>
              <div style={{ fontSize: '0.62rem', color: '#718096', letterSpacing: '0.06em', marginBottom: '0.6rem' }}>FORMA RECENTE (ultime {pForm.lastFive.length})</div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '8px' }}>
                {pForm.lastFive.map((r, i) => {
                  const colors = RESULT_COLORS;
                  const label = { W: 'V', D: 'P', L: 'S' };
                  return (
                    <div key={i} title={r === 'W' ? 'Vittoria' : r === 'D' ? 'Pareggio' : 'Sconfitta'} style={{
                      width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                      background: colors[r] + '22', border: `2px solid ${colors[r]}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 800, fontSize: '0.82rem', color: colors[r],
                      opacity: 0.4 + (i / Math.max(pForm.lastFive.length - 1, 1)) * 0.6,
                    }}>
                      {label[r]}
                    </div>
                  );
                })}
              </div>
              {pForm.streak && pForm.streak.count >= 2 && (
                <div style={{ marginTop: '0.5rem', fontSize: '0.72rem', color: pForm.streak.type === 'W' ? CLR_WIN : pForm.streak.type === 'L' ? CLR_LOSS : CLR_DRAW }}>
                  {pForm.streak.count} {pForm.streak.type === 'W' ? 'vittorie' : pForm.streak.type === 'L' ? 'sconfitte' : 'pareggi'} di fila
                </div>
              )}
              {isAdmin && rf && (
                <div style={{ marginTop: '0.75rem', paddingTop: '0.5rem', borderTop: '1px solid rgba(45,55,72,0.6)' }}>
                  <div style={{ fontSize: '0.6rem', color: '#718096', letterSpacing: '0.05em', marginBottom: '0.15rem' }}>⭐ VOTO MEDIO (admin)</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800, lineHeight: 1, color: formColor }}>
                    {rf.avg.toFixed(1)}<span style={{ fontSize: '0.8rem', color: '#718096' }}>/10</span>
                  </div>
                  <div style={{ fontSize: '0.65rem', color: '#718096', marginTop: '0.1rem' }}>
                    {rf.ratedMatches}/{rf.totalMatches} partite valutate (ultimi 15)
                  </div>
                </div>
              )}
            </div>
          )}
          {!pForm?.lastFive?.length && isAdmin && rf && (
            <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #2D3748' }}>
              <div style={{ fontSize: '0.62rem', color: '#718096', letterSpacing: '0.06em', marginBottom: '0.2rem' }}>⭐ VOTO MEDIO (admin)</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, lineHeight: 1, color: formColor }}>
                {rf.avg.toFixed(1)}<span style={{ fontSize: '0.85rem', color: '#718096' }}>/10</span>
              </div>
              <div style={{ fontSize: '0.68rem', color: '#718096', marginTop: '0.2rem' }}>
                {rf.ratedMatches}/{rf.totalMatches} partite valutate (ultimi 15)
              </div>
            </div>
          )}
        </div>

        {/* Nemesi / Spalla / Vittima GK */}
        {(() => {
          const pid = p.id;
          const finished = playerMatchesMap[pid] || [];
          // Conta partner/avversari: giocate insieme con vittoria, sconfitte contro, gol su quel GK
          const winsWith = {};    // pid → vittorie condivise
          const lossesTo = {};    // pid → sconfitte contro quell'avversario
          const goalsVsGk = {};   // gkId → gol segnati da pid contro quel GK
          const goalsFromAssist = {}; // assistId → gol di pid con quell'assist
          for (const m of finished) {
            const inRed = (m.redTeam || []).some(pl => pl.id === pid);
            const inBlue = (m.blueTeam || []).some(pl => pl.id === pid);
            if (!inRed && !inBlue) continue;
            const myTeam = inRed ? (m.redTeam || []) : (m.blueTeam || []);
            const oppTeam = inRed ? (m.blueTeam || []) : (m.redTeam || []);
            const myScore = inRed ? m.redScore : m.blueScore;
            const theirScore = inRed ? m.blueScore : m.redScore;
            const iWin = myScore > theirScore;
            const iLose = myScore < theirScore;
            if (iWin) {
              for (const tp of myTeam) {
                if (tp.id && tp.id !== pid) winsWith[tp.id] = (winsWith[tp.id] || 0) + 1;
              }
            }
            if (iLose) {
              for (const op of oppTeam) {
                if (op.id) lossesTo[op.id] = (lossesTo[op.id] || 0) + 1;
              }
            }
            for (const ev of (m.events || [])) {
              if (ev.type === 'goal' && ev.scorerId === pid) {
                if (ev.gkConcededId) goalsVsGk[ev.gkConcededId] = (goalsVsGk[ev.gkConcededId] || 0) + 1;
                if (ev.assistId) goalsFromAssist[ev.assistId] = (goalsFromAssist[ev.assistId] || 0) + 1;
              }
            }
          }
          const allPlayerMap = Object.fromEntries(players.map(pl => [pl.id, pl.name]));
          const best = (obj, min = 2) => {
            const sorted = Object.entries(obj).sort((a, b) => b[1] - a[1]);
            return sorted[0]?.[1] >= min ? { id: sorted[0][0], count: sorted[0][1] } : null;
          };
          const spalla = best(winsWith);
          const nemesi = best(lossesTo);
          const vittima = best(goalsVsGk);
          const assistente = best(goalsFromAssist);
          const items = [
            spalla     && { emoji: '🤝', label: 'Spalla', name: allPlayerMap[spalla.id], count: `${spalla.count} vittorie insieme` },
            nemesi     && { emoji: '💀', label: 'Nemesi', name: allPlayerMap[nemesi.id], count: `${nemesi.count} sconfitte contro` },
            vittima    && { emoji: '🎯', label: 'Vittima GK', name: allPlayerMap[vittima.id], count: `${vittima.count} gol segnati` },
            assistente && { emoji: '🎁', label: 'Chi ti assiste', name: allPlayerMap[assistente.id], count: `${assistente.count} assist ricevuti` },
          ].filter(Boolean);
          if (!items.length) return null;
          return (
            <div className="card mb-4" style={{ border: '1px solid rgba(79,209,197,0.2)' }}>
              <h3 className="mb-3" style={{ fontSize: '0.85rem', color: '#718096', letterSpacing: '0.05em' }}>🔍 STATISTICHE RELAZIONALI</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                {items.map(item => (
                  <div key={item.label} style={{ padding: '0.6rem 0.75rem', borderRadius: '8px', background: 'rgba(45,55,72,0.5)', border: '1px solid rgba(74,85,104,0.4)' }}>
                    <div style={{ fontSize: '1.2rem', lineHeight: 1, marginBottom: '0.3rem' }}>{item.emoji}</div>
                    <div style={{ fontSize: '0.6rem', color: '#718096', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{item.label}</div>
                    <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#E2E8F0', marginTop: '0.15rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name || '—'}</div>
                    <div style={{ fontSize: '0.65rem', color: '#718096', marginTop: '0.1rem' }}>{item.count}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Stat view toggle */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          {[{ key: 'season', label: '📅 Stagione' }, { key: 'alltime', label: '📊 All-time' }].map(t => (
            <button
              key={t.key}
              onClick={() => setStatView(t.key)}
              style={{
                flex: 1, padding: '0.5rem 0', border: 'none', borderRadius: '8px',
                fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer',
                background: statView === t.key ? '#4FD1C5' : 'rgba(74,85,104,0.35)',
                color: statView === t.key ? '#1A202C' : '#A0AEC0',
                transition: 'background 0.15s',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="grid-2 mb-4">
          {[
            { label: 'Gol', value: displaySt.goals || 0, icon: '⚽', color: '#4FD1C5' },
            { label: 'Assist', value: displaySt.assists || 0, icon: '🎯', color: '#63B3ED' },
            { label: 'Autogol', value: displaySt.autogoals || 0, icon: '🤦', color: CLR_LOSS },
            { label: 'Partite', value: displaySt.matches || 0, icon: '🏟️', color: '#A0AEC0' },
          ].map(s => (
            <div key={s.label} className="card" style={{ textAlign: 'center', padding: '1rem' }}>
              <div style={{ fontSize: '1.3rem' }}>{s.icon}</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 800, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: '0.7rem', color: '#718096' }}>{s.label}</div>
            </div>
          ))}
        </div>

        <div className="card mb-4">
          <h3 className="mb-3">📊 Record {statView === 'season' ? 'Stagione' : 'All-time'}</h3>
          {[
            { label: 'Vittorie', value: displaySt.wins || 0, icon: '✅' },
            { label: 'Pareggi', value: displaySt.draws || 0, icon: '🤝' },
            { label: 'Sconfitte', value: displaySt.losses || 0, icon: '❌' },
            { label: 'Clean Sheet', value: displaySt.cleanSheets || 0, icon: '🧹' },
            { label: 'Gol Subiti (GK)', value: displaySt.gkGoalsConceded || 0, icon: '🧤' },
            {
              label: 'Media Gol/Turno GK',
              value: (displaySt.matches || 0) > 0
                ? ((displaySt.gkGoalsConceded || 0) / ((displaySt.matches || 1) * 2)).toFixed(2)
                : '—',
              icon: '🚀',
            },
          ].map(s => (
            <div key={s.label} className="flex items-center justify-between"
              style={{ padding: '0.5rem 0', borderBottom: '1px solid #2D3748' }}>
              <span className="text-secondary">{s.icon} {s.label}</span>
              <span style={{ fontWeight: 600 }}>{s.value}</span>
            </div>
          ))}
        </div>

        <PiTrendChart playerMatches={playerMatchesMap[p.id] || []} playerId={p.id} playerPi={p.powerIndex} piConfig={piConfig} />

        <AiTrendCard player={p} playerMatches={playerMatchesMap[p.id] || []} />

        <PlayerRecords playerMatches={playerMatchesMap[p.id] || []} player={p} />

        <PlayerBadges player={p} seasonStats={playerSeasonStats[p.id]} allMatches={finishedMatches} />

        <PlayerWeatherStats playerMatches={playerMatchesMap[p.id] || []} playerId={p.id} />

        <GoalMinuteChart playerMatches={playerMatchesMap[p.id] || []} playerId={p.id} />

        {hasHistory && (
          <div className="card mb-4" style={{ background: 'rgba(246,224,94,0.05)', border: '1px solid rgba(246,224,94,0.2)' }}>
            <h3 className="mb-2" style={{ color: '#F6E05E', fontSize: '0.95rem' }}>📚 Alias Storici Collegati</h3>
            <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
              {p.historicalNames.map(n => (
                <span key={n} style={{
                  padding: '0.25rem 0.6rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 600,
                  background: 'rgba(246,224,94,0.12)', color: '#F6E05E', border: '1px solid rgba(246,224,94,0.3)',
                }}>
                  {n}
                </span>
              ))}
            </div>
            {total.matches > 0 && (
              <p className="text-xs text-muted mt-2">
                Totale: {total.matches} partite · {total.goals} gol · {total.assists} assist
              </p>
            )}
          </div>
        )}

        <PlayerAchievements player={p} allMatches={finishedMatches} />

        <DuoCompatibility player={p} allMatches={finishedMatches} allPlayers={players} />

        <PlayerMatchHistory playerMatches={playerMatchesMap[p.id] || []} playerId={p.id} />
      </div>
      </SwipeBack>
    );
  }

  return (
    <div className="page-content">
      <div className="flex items-center justify-between mb-4 stagger-1" style={{ paddingTop: '0.5rem' }}>
        <h2>👥 Giocatori</h2>
        {isAdmin && (
          <div className="flex gap-2">
            <button
              className="btn btn-ghost"
              style={{ padding: '0.5rem 0.75rem', fontSize: '0.8rem' }}
              onClick={handleRecalcAll}
              disabled={recalcLoading}
              title="Ricalcola stats storiche per tutti i giocatori con alias"
            >
              {recalcLoading ? '⏳' : '🔄'} Storico
            </button>
            <button className="btn btn-teal" style={{ padding: '0.5rem 1rem' }} onClick={() => openForm()}>
              + Aggiungi
            </button>
          </div>
        )}
      </div>

      {/* Search + view toggle */}
      <div className="stagger-2" style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', alignItems: 'center' }}>
        <input className="input" placeholder="🔍 Cerca giocatore..." value={search}
          onChange={e => setSearch(e.target.value)} style={{ flex: 1 }} />
        {/* List view button */}
        <button
          onClick={() => setViewMode('list')}
          title="Vista lista"
          aria-label="Vista lista"
          aria-pressed={viewMode === 'list'}
          style={{
            flexShrink: 0,
            width: 40, height: 40,
            borderRadius: '8px',
            border: '1px solid',
            borderColor: viewMode === 'list' ? '#4FD1C5' : '#4A5568',
            background: viewMode === 'list' ? 'rgba(79,209,197,0.15)' : 'transparent',
            color: viewMode === 'list' ? '#4FD1C5' : '#718096',
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.15s ease',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <rect x="1" y="2" width="14" height="2.5" rx="1.2" fill="currentColor"/>
            <rect x="1" y="6.75" width="14" height="2.5" rx="1.2" fill="currentColor"/>
            <rect x="1" y="11.5" width="14" height="2.5" rx="1.2" fill="currentColor"/>
          </svg>
        </button>
        {/* Cards view button */}
        <button
          onClick={() => setViewMode('cards')}
          title="Vista carte FUT"
          aria-label="Vista carte FUT"
          aria-pressed={viewMode === 'cards'}
          style={{
            flexShrink: 0,
            width: 40, height: 40,
            borderRadius: '8px',
            border: '1px solid',
            borderColor: viewMode === 'cards' ? '#F6E05E' : '#4A5568',
            background: viewMode === 'cards' ? 'rgba(246,224,94,0.12)' : 'transparent',
            color: viewMode === 'cards' ? '#F6E05E' : '#718096',
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.15s ease',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <rect x="1"   y="1"   width="6" height="8.5" rx="1.5" fill="currentColor"/>
            <rect x="9"   y="1"   width="6" height="8.5" rx="1.5" fill="currentColor"/>
            <rect x="1"   y="11"  width="6" height="4"   rx="1.5" fill="currentColor"/>
            <rect x="9"   y="11"  width="6" height="4"   rx="1.5" fill="currentColor"/>
          </svg>
        </button>
      </div>

      {/* Add/Edit Form */}
      {showForm && (
        <div className="card mb-4" style={{ border: '1px solid #4FD1C5' }}>
          <h3 className="mb-3">{editId ? '✏️ Modifica Giocatore' : '+ Nuovo Giocatore'}</h3>
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <input
                className="input"
                placeholder="Nome *"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
              <select className="input" value={form.primaryRole}
                onChange={e => setForm(f => ({ ...f, primaryRole: e.target.value }))}>
                {ROLES.map(r => <option key={r} value={r}>{getRoleIcon(r)} {r}</option>)}
              </select>
              <select className="input" value={form.secondaryRole}
                onChange={e => setForm(f => ({ ...f, secondaryRole: e.target.value }))}>
                <option value="">Ruolo Secondario (opt.)</option>
                {ROLES.map(r => <option key={r} value={r}>{getRoleIcon(r)} {r}</option>)}
              </select>
              <input
                className="input"
                placeholder="🖼️ URL immagine o 🎬 video (Imgur, YouTube, .mp4...)"
                value={form.photoURL}
                onChange={e => setForm(f => ({ ...f, photoURL: e.target.value }))}
              />

              {/* ── Google account link (admin-only) ──────────────────────────── */}
              {isAdmin && (
                <div style={{
                  padding: '0.7rem 0.75rem',
                  borderRadius: '8px',
                  background: 'rgba(159,122,234,0.05)',
                  border: '1px solid rgba(159,122,234,0.2)',
                }}>
                  <div style={{ fontSize: '0.72rem', color: '#B794F4', fontWeight: 700, letterSpacing: '0.05em', marginBottom: '0.4rem' }}>
                    🔗 COLLEGAMENTO ACCOUNT GOOGLE
                  </div>
                  <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'stretch' }}>
                    <input
                      className="input"
                      list={editId ? `users-list-${editId}` : 'users-list-new'}
                      type="email"
                      autoComplete="off"
                      placeholder="Email Google (digita o tocca per scegliere)"
                      value={form.linkedEmail}
                      onChange={e => setForm(f => ({ ...f, linkedEmail: e.target.value }))}
                      style={{ flex: 1 }}
                    />
                    {form.linkedEmail && (
                      <button
                        type="button"
                        onClick={() => setForm(f => ({ ...f, linkedEmail: '' }))}
                        aria-label="Scollega email"
                        title="Scollega"
                        style={{
                          padding: '0 0.75rem',
                          background: 'rgba(252,129,129,0.1)',
                          border: '1px solid rgba(252,129,129,0.3)',
                          color: '#FC8181',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          fontSize: '0.9rem',
                          fontWeight: 600,
                        }}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  <datalist id={editId ? `users-list-${editId}` : 'users-list-new'}>
                    {allUsers
                      .filter(u => u.email)
                      .sort((a, b) => {
                        // Ordina: collegato a questo player → liberi → collegati ad altri
                        const aRank = a.linkedPlayerId === editId ? 0 : !a.linkedPlayerId ? 1 : 2;
                        const bRank = b.linkedPlayerId === editId ? 0 : !b.linkedPlayerId ? 1 : 2;
                        return aRank - bRank || (a.email || '').localeCompare(b.email || '');
                      })
                      .map(u => {
                        const linkedToOther = u.linkedPlayerId && u.linkedPlayerId !== editId;
                        const otherName = linkedToOther
                          ? (players.find(p => p.id === u.linkedPlayerId)?.name || '?')
                          : null;
                        const label = u.linkedPlayerId === editId
                          ? `${u.displayName || ''} ✓ già collegato`
                          : linkedToOther
                            ? `${u.displayName || ''} — in uso: ${otherName}`
                            : `${u.displayName || ''}`;
                        return <option key={u.uid} value={u.email}>{label.trim()}</option>;
                      })}
                  </datalist>
                  <p style={{ fontSize: '0.66rem', color: '#718096', marginTop: '0.35rem', lineHeight: 1.4 }}>
                    Solo utenti che hanno già fatto login compaiono in lista.
                    Visibile solo agli admin — i viewer non vedono questo campo né l'email collegata.
                  </p>
                </div>
              )}

              {/* ── Historical linking section ── */}
              <HistoricalLinkSection
                linkedNames={linkedNames}
                suggestions={suggestions}
                showAll={showAllHistorical}
                allNames={allUnlinkedNames}
                historicalSearch={historicalSearch}
                onToggle={toggleName}
                onShowAll={() => setShowAllHistorical(v => !v)}
                onSearchChange={setHistoricalSearch}
              />

              <div className="flex gap-2">
                <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={closeForm}>
                  Annulla
                </button>
                <button type="submit" className="btn btn-teal" style={{ flex: 1 }} disabled={loading}>
                  {loading ? '...' : editId ? 'Salva' : 'Aggiungi'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Players ranking — empty state + cards/list views */}
      <div className="stagger-3">
      {ranking.length === 0 && (
        <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#718096' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>👤</div>
          <p>{search ? 'Nessun risultato' : 'Nessun giocatore registrato'}</p>
        </div>
      )}

      {/* ── FUT Cards grid ── */}
      {ranking.length > 0 && viewMode === 'cards' && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '10px',
          paddingBottom: '1.5rem',
        }}>
          {ranking.map((p, i) => (
            <FutCard
              key={p.id}
              player={p}
              form={playerFormMap[p.id]}
              seasonStats={playerSeasonStats[p.id]}
              rank={i}
              onClick={() => setSelectedPlayer(p.id)}
            />
          ))}
        </div>
      )}

      {/* ── Classic list ── */}
      {ranking.length > 0 && viewMode === 'list' && ranking.map((p, i) => {
        const as = p.stats || {};
        const totalGoals = as.goals || 0;
        const totalAssists = as.assists || 0;
        const totalMatches = as.matches || 0;
        const hasHistory = (p.historicalNames || []).length > 0;

        return (
          <div key={p.id}
            className="card mb-2"
            style={{ cursor: 'pointer', borderLeft: i < 3 ? `3px solid ${MEDAL_COLORS[i]}` : undefined }}
            onClick={() => setSelectedPlayer(p.id)}
          >
            <div className="flex items-center gap-3">
              <span style={{
                fontSize: '1rem', minWidth: '24px', fontWeight: 700, textAlign: 'center',
                color: i < 3 ? MEDAL_COLORS[i] : CLR_MUTED,
              }}>
                {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}
              </span>
              <PlayerAvatar name={p.name} size={36} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                  {p.name}
                  {hasHistory && <span style={{ fontSize: '0.65rem', color: '#F6E05E' }}>📚</span>}
                  <StreakBadge streak={p.streak} />
                </div>
                <div className="text-xs text-muted">
                  {getRoleIcon(p.primaryRole)} {p.primaryRole || 'N/D'} · {totalMatches} partite
                </div>
                {playerFormMap[p.id] && <FormDots results={playerFormMap[p.id].lastFive} size={7} />}
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 700, color: '#4FD1C5', ...(i < 3 ? { filter: 'drop-shadow(0 0 4px #4FD1C5)' } : {}) }}>
                  {(p.powerIndex || 50).toFixed(1)}
                </div>
                {isAdmin && p.recentForm && (
                  <div className="text-xs" style={{ fontWeight: 600, color: p.recentForm.avg >= 7 ? CLR_WIN : p.recentForm.avg >= 5 ? CLR_DRAW : CLR_LOSS }}>
                    ⭐ {p.recentForm.avg.toFixed(1)}
                  </div>
                )}
                <div className="text-xs text-muted">
                  {totalGoals}⚽ {totalAssists}🎯
                </div>
              </div>
            </div>
          </div>
        );
      })}
      </div>
    </div>
  );
}
