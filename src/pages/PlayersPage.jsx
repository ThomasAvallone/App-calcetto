import React, { useState, useMemo, useEffect, useRef } from 'react';
import usePlayersStore from '../store/playersStore';
import useAuthStore, { selectIsAdmin } from '../store/authStore';
import { computeCombinedPowerIndex, recalculatePlayerStats, computePowerIndex, updatePlayer } from '../firebase/firestore';
import { useMatchesSubscription } from '../hooks/useMatchesSubscription';
import { HISTORICAL_SEASONS, suggestHistoricalNames, computeCumulativeStats, getUnlinkedNames } from '../data/historicalData';
import { computeBadges } from '../utils/badges';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import toast from 'react-hot-toast';
import { getMs } from '../utils/dateUtils';
import { generatePlayerTrendAnalysis, generatePlayerNickname } from '../services/geminiService';
import { RESULT_COLORS, CLR_WIN, CLR_DRAW, CLR_LOSS, AVATAR_COLORS, CLR_MUTED, MEDAL_COLORS } from '../constants/colors';

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

const defaultForm = { name: '', primaryRole: 'Centrocampista', secondaryRole: '', photoURL: '' };

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

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const [editId, setEditId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [recalcLoading, setRecalcLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [statView, setStatView] = useState('season');

  useEffect(() => { setStatView('season'); }, [selectedPlayer]);

  // Historical linking state
  const [linkedNames, setLinkedNames] = useState([]);
  const [showAllHistorical, setShowAllHistorical] = useState(false);
  const [historicalSearch, setHistoricalSearch] = useState('');

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
        if (their === 0) s.cleanSheets++;
        let wasGkThisMatch = false;
        for (const ev of m.events || []) {
          if (ev.type === 'goal') {
            if (ev.scorerId === p.id) s.goals++;
            if (ev.assistId === p.id) s.assists++;
          }
          if (ev.type === 'autogoal' && ev.scorerId === p.id) s.autogoals++;
          if (ev.gkConcededId === p.id) { s.gkGoalsConceded++; wasGkThisMatch = true; }
        }
        if (wasGkThisMatch) s.gkMatches++;
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

  // All-time clean sheets per player (matches where team conceded 0)
  const playerCleanSheets = useMemo(() => {
    const cs = {};
    for (const p of players) cs[p.id] = 0;
    for (const m of finishedMatches) {
      const redCS = (m.blueScore ?? 0) === 0;
      const blueCS = (m.redScore ?? 0) === 0;
      if (!redCS && !blueCS) continue;
      for (const pl of (m.redTeam || [])) {
        if (pl.id && cs[pl.id] !== undefined && redCS) cs[pl.id]++;
      }
      for (const pl of (m.blueTeam || [])) {
        if (pl.id && cs[pl.id] !== undefined && blueCS) cs[pl.id]++;
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
      setForm({ name: p.name, primaryRole: p.primaryRole || 'Centrocampista', secondaryRole: p.secondaryRole || '', photoURL: p.photoURL || '' });
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

      if (editId) {
        // Recompute power index combining app stats + new historicalStats
        const currentPlayer = players.find(p => p.id === editId);
        const pi = computeCombinedPowerIndex(currentPlayer?.stats, historicalStats);
        await editPlayer(editId, { ...playerData, powerIndex: pi });
        // Recalculate p.stats so all-time leaderboard picks up the new historicalStats
        await recalculatePlayerStats([editId]);
        toast.success('Giocatore aggiornato');
      } else {
        const newRef = await addPlayer(playerData);
        // If aliases were linked, sync p.stats immediately
        if (linkedNames.length > 0 && newRef?.id) {
          await recalculatePlayerStats([newRef.id]);
        }
        toast.success(linkedNames.length > 0
          ? `Giocatore aggiunto con storico (${linkedNames.length} alias)!`
          : 'Giocatore aggiunto!');
      }
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
    await removePlayer(p.id);
    toast.success(`${p.name} eliminato`);
    setSelectedPlayer(null);
  };

  if (selectedPlayer) {
    const p = players.find(pl => pl.id === selectedPlayer);
    if (!p) { setSelectedPlayer(null); return null; }
    const playerRank = ranking.findIndex(r => r.id === p.id);

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

        <PiTrendChart playerMatches={playerMatchesMap[p.id] || []} playerId={p.id} playerPi={p.powerIndex} />

        <AiTrendCard player={p} playerMatches={playerMatchesMap[p.id] || []} />

        <PlayerRecords playerMatches={playerMatchesMap[p.id] || []} player={p} />

        <PlayerBadges player={p} seasonStats={playerSeasonStats[p.id]} allMatches={finishedMatches} />

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

        <PlayerMatchHistory playerMatches={playerMatchesMap[p.id] || []} playerId={p.id} />
      </div>
      </SwipeBack>
    );
  }

  return (
    <div className="page-content">
      <div className="flex items-center justify-between mb-4" style={{ paddingTop: '0.5rem' }}>
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

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: '1rem' }}>
        <input className="input" placeholder="🔍 Cerca giocatore..." value={search}
          onChange={e => setSearch(e.target.value)} />
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

      {/* Players ranking list */}
      {ranking.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#718096' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>👤</div>
          <p>{search ? 'Nessun risultato' : 'Nessun giocatore registrato'}</p>
        </div>
      ) : ranking.map((p, i) => {
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
  );
}

// ─── Historical Link Sub-component ──────────────────────────────────────────

function HistoricalLinkSection({ linkedNames, suggestions, showAll, allNames, historicalSearch, onToggle, onShowAll, onSearchChange }) {
  const hasSuggestions = suggestions.length > 0;

  return (
    <div style={{
      borderRadius: '8px',
      border: '1px solid #4A5568',
      padding: '0.75rem',
      background: 'rgba(26,32,44,0.5)',
    }}>
      <div className="flex items-center justify-between mb-2">
        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#A0AEC0' }}>
          📚 Collega allo Storico
        </span>
        <button
          type="button"
          onClick={onShowAll}
          style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: '0.2rem 0.4rem',
            color: '#4FD1C5', fontSize: '0.7rem', fontWeight: 600,
          }}
        >
          {showAll ? 'Riduci' : 'Tutti i nomi'}
        </button>
      </div>

      {/* Linked names chips */}
      {linkedNames.length > 0 && (
        <div className="flex gap-2 mb-2" style={{ flexWrap: 'wrap' }}>
          {linkedNames.map(n => (
            <button
              key={n}
              type="button"
              onClick={() => onToggle(n)}
              style={{
                padding: '0.2rem 0.6rem', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 600,
                background: 'rgba(79,209,197,0.15)', color: '#4FD1C5',
                border: '1px solid rgba(79,209,197,0.5)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '0.25rem',
              }}
            >
              {n} <span style={{ fontSize: '0.8rem' }}>×</span>
            </button>
          ))}
        </div>
      )}

      {/* Suggestions */}
      {!showAll && hasSuggestions && (
        <>
          <p style={{ fontSize: '0.68rem', color: '#718096', marginBottom: '0.4rem' }}>Suggeriti:</p>
          <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
            {suggestions.map(({ name }) => {
              const isLinked = linkedNames.includes(name);
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => onToggle(name)}
                  style={{
                    padding: '0.2rem 0.6rem', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 600,
                    background: isLinked ? 'rgba(79,209,197,0.15)' : 'rgba(74,85,104,0.4)',
                    color: isLinked ? '#4FD1C5' : '#A0AEC0',
                    border: isLinked ? '1px solid rgba(79,209,197,0.5)' : '1px solid #4A5568',
                    cursor: 'pointer',
                  }}
                >
                  {name}
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* Show all names */}
      {showAll && (
        <>
          <input
            className="input"
            placeholder="Cerca nome storico..."
            value={historicalSearch}
            onChange={e => onSearchChange(e.target.value)}
            style={{ marginBottom: '0.5rem', fontSize: '0.8rem', padding: '0.4rem 0.6rem', minHeight: 'auto' }}
          />
          <div style={{ maxHeight: '140px', overflowY: 'auto', display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
            {allNames.map(name => {
              const isLinked = linkedNames.includes(name);
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => onToggle(name)}
                  style={{
                    padding: '0.2rem 0.5rem', borderRadius: '999px', fontSize: '0.7rem', fontWeight: 600,
                    background: isLinked ? 'rgba(79,209,197,0.15)' : 'rgba(74,85,104,0.4)',
                    color: isLinked ? '#4FD1C5' : '#A0AEC0',
                    border: isLinked ? '1px solid rgba(79,209,197,0.5)' : '1px solid #4A5568',
                    cursor: 'pointer',
                  }}
                >
                  {name}
                </button>
              );
            })}
            {allNames.length === 0 && (
              <span style={{ fontSize: '0.75rem', color: '#718096' }}>Nessun nome disponibile</span>
            )}
          </div>
        </>
      )}

      {!showAll && !hasSuggestions && linkedNames.length === 0 && (
        <p style={{ fontSize: '0.72rem', color: '#718096', textAlign: 'center', padding: '0.25rem 0' }}>
          Digita il nome per vedere i suggerimenti
        </p>
      )}
    </div>
  );
}

function PiTrendChart({ playerMatches, playerId, playerPi }) {
  const points = useMemo(() => {
    const played = playerMatches
      .filter(m => !m.isHistorical)
      .sort((a, b) => getMs(a.date) - getMs(b.date));

    if (played.length < 2) return [];

    // Rolling window di 4 partite: ogni punto = PI calcolato sulle ultime 4 partite
    // fino a quel momento. Mostriamo gli ultimi 4 punti (≈ 1 mese).
    const WINDOW = 4;
    const startIdx = Math.max(0, played.length - WINDOW);
    const computed = played.slice(startIdx).map((_, relIdx) => {
      const absIdx = startIdx + relIdx;
      const winStart = Math.max(0, absIdx - WINDOW + 1);
      const window = played.slice(winStart, absIdx + 1);
      const s = { goals: 0, assists: 0, autogoals: 0, gkGoalsConceded: 0, gkMatches: 0, wins: 0, losses: 0, draws: 0, matches: 0 };
      for (const m of window) {
        const inRed = (m.redTeam || []).some(p => p.id === playerId);
        s.matches++;
        const my = inRed ? m.redScore : m.blueScore;
        const their = inRed ? m.blueScore : m.redScore;
        if (my > their) s.wins++; else if (my < their) s.losses++; else s.draws++;
        let wasGk = false;
        for (const ev of (m.events || [])) {
          if (ev.type === 'goal') { if (ev.scorerId === playerId) s.goals++; if (ev.assistId === playerId) s.assists++; }
          if (ev.type === 'autogoal' && ev.scorerId === playerId) s.autogoals++;
          if (ev.gkConcededId === playerId) { s.gkGoalsConceded++; wasGk = true; }
        }
        if (wasGk) s.gkMatches++;
      }
      return { pi: computePowerIndex(s), date: played[absIdx].date };
    });

    // L'ultimo punto usa il PI reale del giocatore (coerente con il valore in cima alla scheda)
    if (computed.length > 0 && playerPi != null) {
      computed[computed.length - 1] = { ...computed[computed.length - 1], pi: playerPi };
    }

    return computed;
  }, [playerMatches, playerId, playerPi]);

  if (points.length < 2) return null;

  const GREEN = '#68D391', RED = '#FC8181', FLAT = CLR_MUTED;
  const W = 280, H = 80, PAD_T = 14, PAD_B = 20;
  const inner = H - PAD_T - PAD_B;
  const vals = points.map(pt => pt.pi);
  const minV = Math.max(0, Math.min(...vals) - 3);
  const maxV = Math.min(100, Math.max(...vals) + 3);
  const range = maxV - minV || 1;
  const toX = i => (i / (points.length - 1)) * W;
  const toY = v => PAD_T + inner - ((v - minV) / range) * inner;

  // Colore per segmento: verde se sale, rosso se scende
  const segCols = vals.slice(1).map((v, i) => v > vals[i] ? GREEN : v < vals[i] ? RED : FLAT);

  // Blend di due colori hex (per transizione morbida ai punti di cambio)
  const hexBlend = (c1, c2) => {
    const p = c => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
    const [r1, g1, b1] = p(c1), [r2, g2, b2] = p(c2);
    const h = n => n.toString(16).padStart(2, '0');
    return `#${h(Math.round((r1 + r2) / 2))}${h(Math.round((g1 + g2) / 2))}${h(Math.round((b1 + b2) / 2))}`;
  };

  // Colore ad ogni punto = blend dei segmenti adiacenti (sfumatura senza stacco netto)
  const ptCols = vals.map((_, i) => {
    if (i === 0) return segCols[0];
    if (i === vals.length - 1) return segCols[segCols.length - 1];
    const prev = segCols[i - 1], curr = segCols[i];
    return prev === curr ? curr : hexBlend(prev, curr);
  });

  const last = vals[vals.length - 1];
  const prev = vals[vals.length - 2];
  const trendCol = last > prev ? GREEN : last < prev ? RED : FLAT;

  const fmtDate = d => {
    const ms = d?.toMillis ? d.toMillis() : new Date(d).getTime();
    const dt = new Date(ms);
    return `${dt.getDate()}/${dt.getMonth() + 1}`;
  };

  const safeId = playerId.replace(/[^a-z0-9]/gi, '-');

  return (
    <div className="card mb-4">
      <div className="flex items-center justify-between mb-2">
        <h3 style={{ fontSize: '0.95rem', margin: 0 }}>📈 Andamento Power Index</h3>
        <span style={{ fontSize: '0.72rem', color: trendCol, fontWeight: 700 }}>
          {last > prev ? '▲' : last < prev ? '▼' : '—'} {last.toFixed(1)}
        </span>
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', overflow: 'visible' }}>
        <defs>
          {segCols.map((_, i) => (
            <linearGradient key={i} id={`pi-seg-${safeId}-${i}`}
              gradientUnits="userSpaceOnUse"
              x1={toX(i).toFixed(1)} y1={toY(vals[i]).toFixed(1)}
              x2={toX(i + 1).toFixed(1)} y2={toY(vals[i + 1]).toFixed(1)}>
              <stop offset="0%" stopColor={ptCols[i]} />
              <stop offset="100%" stopColor={ptCols[i + 1]} />
            </linearGradient>
          ))}
        </defs>
        {/* Grid lines */}
        {[minV, (minV + maxV) / 2, maxV].map((v, i) => (
          <line key={i} x1={0} y1={toY(v)} x2={W} y2={toY(v)} stroke="#2D3748" strokeWidth="1" />
        ))}
        {/* Y labels */}
        <text x={2} y={toY(maxV) + 1} fill={FLAT} fontSize="8" dominantBaseline="hanging">{maxV.toFixed(0)}</text>
        <text x={2} y={toY(minV) - 1} fill={FLAT} fontSize="8" dominantBaseline="auto">{minV.toFixed(0)}</text>
        {/* Segmenti colorati con gradiente */}
        {segCols.map((_, i) => (
          <path key={i}
            d={`M${toX(i).toFixed(1)} ${toY(vals[i]).toFixed(1)} L${toX(i + 1).toFixed(1)} ${toY(vals[i + 1]).toFixed(1)}`}
            fill="none" stroke={`url(#pi-seg-${safeId}-${i})`} strokeWidth="2.5" strokeLinecap="round" />
        ))}
        {/* Dots su ogni punto */}
        {vals.map((v, i) => {
          const isLast = i === vals.length - 1;
          return (
            <circle key={i} cx={toX(i).toFixed(1)} cy={toY(v).toFixed(1)}
              r={isLast ? 5 : 3}
              fill={isLast ? ptCols[i] : '#1A202C'}
              stroke={ptCols[i]} strokeWidth={isLast ? 2 : 1.5} />
          );
        })}
        {/* Etichetta valore corrente */}
        <text x={toX(vals.length - 1)} y={toY(last) - 8}
          fill={ptCols[vals.length - 1]} fontSize="10" fontWeight="700" textAnchor="middle">
          {last.toFixed(1)}
        </text>
        {/* Date sotto ogni punto */}
        {points.map((pt, i) => (
          <text key={i} x={toX(i)} y={H - 2} fill={FLAT} fontSize="8" textAnchor="middle">
            {fmtDate(pt.date)}
          </text>
        ))}
      </svg>
      <div style={{ fontSize: '0.62rem', color: FLAT, marginTop: '0.25rem' }}>
        Ultime {points.length} partite · PI finale = valore corrente della scheda
      </div>
    </div>
  );
}

function AiTrendCard({ player, playerMatches }) {
  const [loading, setLoading] = useState(false);
  // Optimistic local state: bridges the gap between updatePlayer and Firestore subscription
  const [pendingText, setPendingText] = useState(null);

  // Most recent non-historical finished match for this player
  const mostRecentMatch = useMemo(() => {
    return playerMatches
      .filter(m => !m.isHistorical)
      .sort((a, b) => getMs(b.date) - getMs(a.date))[0] || null;
  }, [playerMatches]);

  const cached = player.aiFormAnalysis;
  // Clear optimistic state once Firestore subscription catches up
  useEffect(() => { if (cached?.text) setPendingText(null); }, [cached?.text]);
  const displayCached = pendingText
    ? { text: pendingText, generatedAt: new Date().toISOString() }
    : cached;
  const hasAnalysis = !!displayCached?.text;
  // Analysis is stale if a new match was played after the last generation (not while pending)
  const isStale = hasAnalysis && !pendingText && mostRecentMatch && cached?.lastMatchId !== mostRecentMatch.id;

  const generate = async () => {
    setLoading(true);
    try {
      const played = playerMatches
        .filter(m => !m.isHistorical)
        .sort((a, b) => getMs(a.date) - getMs(b.date))
        .slice(-4);

      if (played.length < 1) {
        toast('Nessuna partita registrata per questo giocatore.');
        return;
      }

      const recentData = played.map(match => {
        const inRed  = (match.redTeam || []).some(p => p.id === player.id);
        const my     = inRed ? match.redScore : match.blueScore;
        const their  = inRed ? match.blueScore : match.redScore;
        const result = my > their ? 'W' : my < their ? 'L' : 'D';
        let goals = 0, assists = 0, autogoals = 0;
        for (const ev of (match.events || [])) {
          if (ev.type === 'goal'     && ev.scorerId === player.id) goals++;
          if (ev.type === 'goal'     && ev.assistId === player.id) assists++;
          if (ev.type === 'autogoal' && ev.scorerId === player.id) autogoals++;
        }
        return { result, goals, assists, autogoals };
      });

      const text = await generatePlayerTrendAnalysis(player, recentData);
      setPendingText(text); // Optimistic: show immediately
      const latestMatch = played[played.length - 1];
      await updatePlayer(player.id, {
        aiFormAnalysis: {
          text,
          lastMatchId: latestMatch.id,
          generatedAt: new Date().toISOString(),
        },
      });
    } catch (e) {
      toast.error('Errore AI: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  if (!hasAnalysis) {
    return (
      <div className="card mb-4" style={{ textAlign: 'center', border: '1px dashed rgba(159,122,234,0.35)', background: 'rgba(102,126,234,0.03)' }}>
        <button onClick={generate} disabled={loading}
          style={{ background: 'none', border: 'none', cursor: loading ? 'default' : 'pointer', color: '#9F7AEA', fontSize: '0.88rem', padding: '0.6rem 0', width: '100%' }}>
          {loading ? '⏳ Analisi in corso...' : '✨ Genera analisi AI del momento di forma'}
        </button>
      </div>
    );
  }

  return (
    <div className="card mb-4" style={{ border: `1px solid ${isStale ? 'rgba(246,173,85,0.5)' : 'rgba(159,122,234,0.4)'}`, background: 'rgba(102,126,234,0.05)' }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3 style={{ fontSize: '0.95rem', margin: 0 }}>✨ Analisi AI</h3>
          {isStale && (
            <span style={{ fontSize: '0.68rem', color: '#F6AD55', background: 'rgba(246,173,85,0.15)', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
              ⚠️ Nuova partita
            </span>
          )}
        </div>
        <button
          onClick={generate}
          disabled={loading}
          style={{ fontSize: '0.7rem', color: '#718096', background: 'none', border: 'none', cursor: loading ? 'default' : 'pointer' }}>
          {loading ? '⏳' : '↺ Rigenera'}
        </button>
      </div>
      {displayCached.generatedAt && (
        <div style={{ fontSize: '0.65rem', color: '#4A5568', marginBottom: '0.75rem' }}>
          Aggiornata il {new Date(displayCached.generatedAt).toLocaleDateString('it-IT')}
        </div>
      )}
      <p style={{ fontSize: '0.84rem', color: '#CBD5E0', lineHeight: 1.75, margin: 0, whiteSpace: 'pre-wrap' }}>
        {displayCached.text}
      </p>
    </div>
  );
}

function AiNicknameCard({ player }) {
  const [loading, setLoading] = useState(false);
  // Optimistic local state: bridges the gap between updatePlayer and Firestore subscription
  const [pendingNickname, setPendingNickname] = useState(null);

  const cached = player.aiNickname;
  // Clear optimistic state once Firestore subscription catches up
  useEffect(() => { if (cached) setPendingNickname(null); }, [cached]);
  const displayCached = pendingNickname || cached;

  const generate = async () => {
    setLoading(true);
    try {
      const as = player.stats || {};
      const stats = {
        goals:       as.goals     || 0,
        assists:     as.assists   || 0,
        autogoals:   as.autogoals || 0,
        matches:     as.matches   || 0,
        wins:        as.wins      || 0,
        losses:      as.losses    || 0,
        primaryRole: player.primaryRole || '',
        powerIndex:  player.powerIndex  || 50,
        streak:      player.streak      || null,
      };
      const raw = await generatePlayerNickname(player, stats);
      // Parse "Soprannome: X\nMotivazione: Y"
      const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
      const soprannome = lines.find(l => l.toLowerCase().startsWith('soprannome:'))?.replace(/^soprannome:\s*/i, '') || raw;
      const motivazione = lines.find(l => l.toLowerCase().startsWith('motivazione:'))?.replace(/^motivazione:\s*/i, '') || '';
      setPendingNickname({ soprannome, motivazione }); // Optimistic: show immediately
      await updatePlayer(player.id, {
        aiNickname: { soprannome, motivazione, generatedAt: new Date().toISOString() },
      });
    } catch (e) {
      toast.error('Soprannome AI: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  if (!displayCached) {
    return (
      <div className="card mb-4" style={{ textAlign: 'center', border: '1px dashed rgba(246,173,85,0.35)', background: 'rgba(246,173,85,0.03)' }}>
        <button onClick={generate} disabled={loading}
          style={{ background: 'none', border: 'none', cursor: loading ? 'default' : 'pointer', color: '#F6AD55', fontSize: '0.88rem', padding: '0.6rem 0', width: '100%' }}>
          {loading ? '⏳ Generando soprannome...' : '🏷️ Genera soprannome AI'}
        </button>
      </div>
    );
  }

  return (
    <div className="card mb-4" style={{ border: '1px solid rgba(246,173,85,0.4)', background: 'rgba(246,173,85,0.05)', textAlign: 'center' }}>
      <div className="flex items-center justify-between mb-2">
        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#F6AD55' }}>🏷️ Soprannome AI</span>
        <button onClick={generate} disabled={loading}
          style={{ fontSize: '0.7rem', color: '#718096', background: 'none', border: 'none', cursor: loading ? 'default' : 'pointer' }}>
          {loading ? '⏳' : '↺ Rigenera'}
        </button>
      </div>
      <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#F6AD55', marginBottom: '0.4rem', letterSpacing: '0.02em' }}>
        "{displayCached.soprannome}"
      </div>
      {displayCached.motivazione && (
        <div style={{ fontSize: '0.78rem', color: '#A0AEC0', fontStyle: 'italic' }}>{displayCached.motivazione}</div>
      )}
    </div>
  );
}

function PiArc({ value, size = 120, glow = false }) {
  const r = size * 0.38;
  const sw = size * 0.068;
  const circ = 2 * Math.PI * r;
  const fill = (Math.max(0, Math.min(100, value)) / 100) * circ;
  const mid = size / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}
      style={{ display: 'block' }}
      className={glow ? 'pi-glow' : undefined}>
      <circle cx={mid} cy={mid} r={r} fill="none" stroke="#2D3748" strokeWidth={sw} />
      <circle cx={mid} cy={mid} r={r} fill="none" stroke="#4FD1C5" strokeWidth={sw}
        strokeDasharray={`${fill} ${circ}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${mid} ${mid})`}
      />
    </svg>
  );
}

function getRoleIcon(role) {
  const icons = { 'Portiere': '🧤', 'Difensore': '🛡️', 'Centrocampista': '⚙️', 'Attaccante': '⚡' };
  return icons[role] || '⚽';
}


function PlayerAvatar({ name, size = 36 }) {
  const idx = name ? name.charCodeAt(0) % AVATAR_COLORS.length : 0;
  const color = AVATAR_COLORS[idx];
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: color + '22',
      border: `2px solid ${color}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
      fontWeight: 800, fontSize: size * 0.42,
      color,
    }}>
      {(name || '?')[0].toUpperCase()}
    </div>
  );
}

function PlayerMatchHistory({ playerMatches: rawPlayerMatches, playerId }) {
  const getMs = d => d?.toMillis ? d.toMillis() : d ? new Date(d).getTime() : 0;
  const playerMatches = [...rawPlayerMatches]
    .sort((a, b) => getMs(b.date) - getMs(a.date))
    .slice(0, 8);

  if (playerMatches.length === 0) return null;

  return (
    <div className="card">
      <h3 className="mb-3" style={{ fontSize: '0.95rem' }}>🕐 Ultime Partite</h3>
      {playerMatches.map(m => {
        const inRed = (m.redTeam || []).some(p => p.id === playerId);
        const myScore = inRed ? m.redScore : m.blueScore;
        const theirScore = inRed ? m.blueScore : m.redScore;
        const result = myScore > theirScore ? 'win' : myScore < theirScore ? 'loss' : 'draw';
        const resultColor = result === 'win' ? CLR_WIN : result === 'loss' ? CLR_LOSS : CLR_DRAW;
        const resultLabel = result === 'win' ? 'V' : result === 'loss' ? 'S' : 'P';
        const myGoals = (m.events || []).filter(e => e.type === 'goal' && e.scorerId === playerId).length;
        const myAssists = (m.events || []).filter(e => e.type === 'goal' && e.assistId === playerId).length;
        const myAutogoals = (m.events || []).filter(e => e.type === 'autogoal' && e.scorerId === playerId).length;
        const d = m.date?.toDate ? m.date.toDate() : new Date(m.date);
        return (
          <div key={m.id} className="flex items-center gap-3"
            style={{ padding: '0.5rem 0', borderBottom: '1px solid rgba(74,85,104,0.4)' }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
              background: resultColor + '22', border: `2px solid ${resultColor}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 800, fontSize: '0.75rem', color: resultColor,
            }}>
              {resultLabel}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>
                🔴 {m.redScore ?? '–'} — {m.blueScore ?? '–'} 🔵
              </div>
              <div className="text-xs text-muted">
                {format(d, 'dd MMM yyyy', { locale: it })}
                {myGoals > 0 && <span style={{ color: '#4FD1C5', marginLeft: '0.4rem' }}>⚽{myGoals}</span>}
                {myAssists > 0 && <span style={{ color: '#63B3ED', marginLeft: '0.3rem' }}>🎯{myAssists}</span>}
                {myAutogoals > 0 && <span style={{ color: CLR_LOSS, marginLeft: '0.3rem' }}>🤦{myAutogoals}</span>}
              </div>
            </div>
            <div style={{ fontSize: '0.75rem', color: '#718096', whiteSpace: 'nowrap' }}>
              {inRed ? '🔴' : '🔵'}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PlayerRecords({ playerMatches: rawPlayerMatches, player }) {
  const pid = player.id;
  const playerMatches = [...rawPlayerMatches].sort((a, b) => getMs(a.date) - getMs(b.date)); // oldest first

  if (playerMatches.length === 0) return null;

  let maxWinStreak = 0, maxLossStreak = 0, curWin = 0, curLoss = 0;
  let bestGoals = 0, bestGoalsDate = null;

  for (const m of playerMatches) {
    const inRed = (m.redTeam || []).some(p => p.id === pid);
    const my = inRed ? (m.redScore ?? 0) : (m.blueScore ?? 0);
    const their = inRed ? (m.blueScore ?? 0) : (m.redScore ?? 0);
    if (my > their) { curWin++; curLoss = 0; }
    else if (my < their) { curLoss++; curWin = 0; }
    else { curWin = 0; curLoss = 0; }
    maxWinStreak = Math.max(maxWinStreak, curWin);
    maxLossStreak = Math.max(maxLossStreak, curLoss);
    const goals = (m.events || []).filter(e => e.type === 'goal' && e.scorerId === pid).length;
    if (goals > bestGoals) { bestGoals = goals; bestGoalsDate = m.date; }
  }

  const firstDate = (() => {
    const d = playerMatches[0]?.date;
    return d?.toDate ? d.toDate() : d ? new Date(d) : null;
  })();
  const bestGoalMatchDate = (() => {
    if (!bestGoalsDate) return null;
    return bestGoalsDate?.toDate ? bestGoalsDate.toDate() : new Date(bestGoalsDate);
  })();

  const items = [
    { icon: '🏟️', label: 'Partite totali', value: playerMatches.length },
    maxWinStreak >= 2 && { icon: '🔥', label: 'Miglior serie V', value: `${maxWinStreak} di fila` },
    maxLossStreak >= 2 && { icon: '📉', label: 'Peggior serie S', value: `${maxLossStreak} di fila` },
    bestGoals >= 2 && { icon: '🎩', label: 'Record gol in 1 partita', value: `${bestGoals} gol${bestGoalMatchDate ? ` (${format(bestGoalMatchDate, 'dd/MM/yy', { locale: it })})` : ''}` },
    firstDate && { icon: '📅', label: 'Prima partita', value: format(firstDate, 'dd MMM yyyy', { locale: it }) },
  ].filter(Boolean);

  return (
    <div className="card mb-4">
      <h3 className="mb-3" style={{ fontSize: '0.95rem' }}>📊 Record Personali</h3>
      {items.map(item => (
        <div key={item.label} className="flex items-center justify-between"
          style={{ padding: '0.5rem 0', borderBottom: '1px solid #2D3748' }}>
          <span className="text-secondary">{item.icon} {item.label}</span>
          <span style={{ fontWeight: 600 }}>{item.value}</span>
        </div>
      ))}
    </div>
  );
}

function PlayerBadges({ player, seasonStats, allMatches }) {
  const badges = computeBadges(player, seasonStats, allMatches);
  if (badges.length === 0) return null;
  return (
    <div className="card mb-4">
      <h3 className="mb-3" style={{ fontSize: '0.95rem' }}>🏅 Badge</h3>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        {badges.map(b => (
          <div key={b.id} title={b.desc} style={{
            display: 'flex', alignItems: 'center', gap: '0.35rem',
            padding: '0.3rem 0.7rem', borderRadius: '999px', fontSize: '0.8rem', fontWeight: 600,
            background: b.positive ? 'rgba(104,211,145,0.12)' : 'rgba(252,129,129,0.12)',
            color: b.positive ? CLR_WIN : CLR_LOSS,
            border: `1px solid ${b.positive ? 'rgba(104,211,145,0.35)' : 'rgba(252,129,129,0.35)'}`,
            cursor: 'default',
          }}>
            <span>{b.icon}</span>
            <span>{b.label}</span>
          </div>
        ))}
      </div>
      <div style={{ marginTop: '0.6rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
        {badges.map(b => (
          <div key={b.id} style={{ fontSize: '0.68rem', color: '#718096' }}>
            {b.icon} <strong style={{ color: b.positive ? CLR_WIN : CLR_LOSS }}>{b.label}</strong> — {b.desc}
          </div>
        ))}
      </div>
    </div>
  );
}

function PowerIndexChart({ history }) {
  if (!history || history.length < 2) return null;
  const W = 280, H = 72, PAD = 8;
  const vals = history.map(h => h.pi);
  const minV = Math.min(...vals);
  const maxV = Math.max(...vals);
  const range = maxV - minV || 1;
  const xs = vals.map((_, i) => PAD + (i / (vals.length - 1)) * (W - PAD * 2));
  const ys = vals.map(v => PAD + (1 - (v - minV) / range) * (H - PAD * 2));
  const line = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ');
  const fill = line + ` L${xs[xs.length - 1].toFixed(1)},${H} L${xs[0].toFixed(1)},${H} Z`;
  const last = vals[vals.length - 1];
  const prev = vals[vals.length - 2];
  const trend = last > prev ? '↑' : last < prev ? '↓' : '→';
  const trendColor = last > prev ? '#68D391' : last < prev ? '#FC8181' : '#A0AEC0';
  return (
    <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #2D3748' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
        <span style={{ fontSize: '0.6rem', color: '#718096', letterSpacing: '0.06em' }}>ANDAMENTO POWER INDEX (ultimi {vals.length} aggiornamenti)</span>
        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: trendColor }}>{trend} {last.toFixed(1)}</span>
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible' }}>
        <defs>
          <linearGradient id="piGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4FD1C5" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#4FD1C5" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={fill} fill="url(#piGrad)" />
        <path d={line} fill="none" stroke="#4FD1C5" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={xs[xs.length - 1].toFixed(1)} cy={ys[ys.length - 1].toFixed(1)} r="3.5" fill="#4FD1C5" />
        <text x={xs[0].toFixed(1)} y={H - 1} fill="#718096" fontSize="8" textAnchor="middle">{history[0].d?.slice(5)}</text>
        <text x={xs[xs.length - 1].toFixed(1)} y={H - 1} fill="#718096" fontSize="8" textAnchor="middle">{history[history.length - 1].d?.slice(5)}</text>
      </svg>
    </div>
  );
}

function StreakBadge({ streak }) {
  if (!streak || streak.count < 2) return null;
  const isWin = streak.type === 'win';
  const isLoss = streak.type === 'loss';
  if (!isWin && !isLoss) return null;
  return (
    <span style={{
      fontSize: '0.62rem', fontWeight: 700, padding: '0.1rem 0.35rem',
      borderRadius: '999px',
      background: isWin ? 'rgba(104,211,145,0.15)' : 'rgba(252,129,129,0.15)',
      color: isWin ? CLR_WIN : CLR_LOSS,
      border: `1px solid ${isWin ? 'rgba(104,211,145,0.4)' : 'rgba(252,129,129,0.4)'}`,
      whiteSpace: 'nowrap',
    }}>
      {isWin ? '🔥' : '📉'}{streak.count}
    </span>
  );
}
