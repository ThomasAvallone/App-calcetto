import React, { useState, useMemo, useEffect } from 'react';
import usePlayersStore from '../store/playersStore';
import useAuthStore from '../store/authStore';
import { computeCombinedPowerIndex, subscribeToMatches, recalculatePlayerStats } from '../firebase/firestore';
import { suggestHistoricalNames, computeCumulativeStats, getUnlinkedNames } from '../data/historicalData';
import { computeBadges } from '../utils/badges';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import toast from 'react-hot-toast';

const ROLES = ['Portiere', 'Difensore', 'Centrocampista', 'Attaccante'];

const getMs = d => d?.toMillis ? d.toMillis() : d ? new Date(d).getTime() : 0;

function FormDots({ results, size = 9 }) {
  const colors = { W: '#68D391', D: '#F6E05E', L: '#FC8181' };
  if (!results || results.length === 0) return null;
  return (
    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
      {results.map((r, i) => (
        <div key={i} title={r === 'W' ? 'Vittoria' : r === 'D' ? 'Pareggio' : 'Sconfitta'} style={{
          width: size, height: size, borderRadius: '50%',
          background: colors[r],
          opacity: 1 - i * 0.1,
          flexShrink: 0,
        }} />
      ))}
    </div>
  );
}

const defaultForm = { name: '', primaryRole: 'Centrocampista', secondaryRole: '' };

export default function PlayersPage() {
  const { players, addPlayer, updatePlayer: editPlayer, removePlayer } = usePlayersStore();
  const { role } = useAuthStore();
  const isAdmin = role === 'admin';

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const [editId, setEditId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [recalcLoading, setRecalcLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedPlayer, setSelectedPlayer] = useState(null);

  // Historical linking state
  const [linkedNames, setLinkedNames] = useState([]);
  const [showAllHistorical, setShowAllHistorical] = useState(false);
  const [historicalSearch, setHistoricalSearch] = useState('');

  const [allMatches, setAllMatches] = useState([]);
  useEffect(() => {
    const unsub = subscribeToMatches(setAllMatches);
    return unsub;
  }, []);

  const finishedMatches = useMemo(() => allMatches.filter(m => m.status === 'finished'), [allMatches]);

  const playerFormMap = useMemo(() => {
    const forms = {};
    for (const p of players) {
      const pMatches = finishedMatches
        .filter(m => [...(m.redTeam || []), ...(m.blueTeam || [])].some(pl => pl.id === p.id))
        .sort((a, b) => getMs(b.date) - getMs(a.date))
        .slice(0, 5);
      const lastFive = pMatches.map(m => {
        const inRed = (m.redTeam || []).some(pl => pl.id === p.id);
        const my = inRed ? (m.redScore ?? 0) : (m.blueScore ?? 0);
        const their = inRed ? (m.blueScore ?? 0) : (m.redScore ?? 0);
        return my > their ? 'W' : my < their ? 'L' : 'D';
      });
      let formStreak = null;
      if (lastFive.length >= 2) {
        const type = lastFive[0];
        let count = 0;
        for (const r of lastFive) { if (r === type) count++; else break; }
        if (count >= 2) formStreak = { type, count };
      }
      forms[p.id] = { lastFive, streak: formStreak };
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
      setForm({ name: p.name, primaryRole: p.primaryRole || 'Centrocampista', secondaryRole: p.secondaryRole || '' });
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
    };
    const hasHistory = (p.historicalNames || []).length > 0;
    const pForm = playerFormMap[p.id];
    const rf = p.recentForm;
    const formColor = rf ? (rf.avg >= 7 ? '#68D391' : rf.avg >= 5 ? '#F6E05E' : '#FC8181') : null;

    return (
      <div className="page-content">
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

        <div className="card mb-4" style={{ textAlign: 'center', padding: '1.75rem' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.75rem' }}>
            <div style={{ position: 'relative', width: 120, height: 120 }}>
              <PiArc value={p.powerIndex || 50} />
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
                  const colors = { W: '#68D391', D: '#F6E05E', L: '#FC8181' };
                  const label = { W: 'V', D: 'P', L: 'S' };
                  return (
                    <div key={i} title={r === 'W' ? 'Vittoria' : r === 'D' ? 'Pareggio' : 'Sconfitta'} style={{
                      width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                      background: colors[r] + '22', border: `2px solid ${colors[r]}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 800, fontSize: '0.82rem', color: colors[r],
                      opacity: 1 - i * 0.1,
                    }}>
                      {label[r]}
                    </div>
                  );
                })}
              </div>
              {pForm.streak && pForm.streak.count >= 2 && (
                <div style={{ marginTop: '0.5rem', fontSize: '0.72rem', color: pForm.streak.type === 'W' ? '#68D391' : pForm.streak.type === 'L' ? '#FC8181' : '#F6E05E' }}>
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

        <div className="grid-2 mb-4">
          {[
            { label: 'Gol', value: total.goals, icon: '⚽', color: '#4FD1C5' },
            { label: 'Assist', value: total.assists, icon: '🎯', color: '#63B3ED' },
            { label: 'Autogol', value: total.autogoals, icon: '🤦', color: '#FC8181' },
            { label: 'Partite', value: total.matches, icon: '🏟️', color: '#A0AEC0' },
          ].map(s => (
            <div key={s.label} className="card" style={{ textAlign: 'center', padding: '1rem' }}>
              <div style={{ fontSize: '1.3rem' }}>{s.icon}</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 800, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: '0.7rem', color: '#718096' }}>{s.label}</div>
            </div>
          ))}
        </div>

        <div className="card mb-4">
          <h3 className="mb-3">📊 Record Completo</h3>
          {[
            { label: 'Vittorie', value: total.wins, icon: '✅' },
            { label: 'Pareggi', value: total.draws, icon: '🤝' },
            { label: 'Sconfitte', value: total.losses, icon: '❌' },
            { label: 'Partite GK', value: total.gkMatches, icon: '🧤' },
            { label: 'Gol Subiti (GK)', value: total.gkGoalsConceded, icon: '🚀' },
          ].map(s => (
            <div key={s.label} className="flex items-center justify-between"
              style={{ padding: '0.5rem 0', borderBottom: '1px solid #2D3748' }}>
              <span className="text-secondary">{s.icon} {s.label}</span>
              <span style={{ fontWeight: 600 }}>{s.value}</span>
            </div>
          ))}
        </div>

        <PlayerBadges player={p} />

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

        <PlayerMatchHistory matches={allMatches} playerId={p.id} />
      </div>
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
            style={{ cursor: 'pointer', borderLeft: i === 0 ? '3px solid #F6E05E' : i === 1 ? '3px solid #9CA3AF' : i === 2 ? '3px solid #C05621' : undefined }}
            onClick={() => setSelectedPlayer(p.id)}
          >
            <div className="flex items-center gap-3">
              <span style={{
                fontSize: '1rem', minWidth: '24px', fontWeight: 700, textAlign: 'center',
                color: i === 0 ? '#F6E05E' : i === 1 ? '#A0AEC0' : i === 2 ? '#C05621' : '#718096',
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
                <div style={{ fontWeight: 700, color: '#4FD1C5' }}>{(p.powerIndex || 50).toFixed(1)}</div>
                {isAdmin && p.recentForm && (
                  <div className="text-xs" style={{ fontWeight: 600, color: p.recentForm.avg >= 7 ? '#68D391' : p.recentForm.avg >= 5 ? '#F6E05E' : '#FC8181' }}>
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

function PiArc({ value, size = 120 }) {
  const r = size * 0.38;
  const sw = size * 0.068;
  const circ = 2 * Math.PI * r;
  const fill = (Math.max(0, Math.min(100, value)) / 100) * circ;
  const mid = size / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block' }}>
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

const AVATAR_COLORS = ['#4FD1C5', '#63B3ED', '#F6E05E', '#FC8181', '#68D391', '#B794F4', '#F6AD55'];

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

function PlayerMatchHistory({ matches, playerId }) {
  const getMs = d => d?.toMillis ? d.toMillis() : d ? new Date(d).getTime() : 0;
  const playerMatches = matches
    .filter(m =>
      m.status === 'finished' &&
      [...(m.redTeam || []), ...(m.blueTeam || [])].some(p => p.id === playerId)
    )
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
        const resultColor = result === 'win' ? '#68D391' : result === 'loss' ? '#FC8181' : '#F6E05E';
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
                {myAutogoals > 0 && <span style={{ color: '#FC8181', marginLeft: '0.3rem' }}>🤦{myAutogoals}</span>}
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

function PlayerBadges({ player }) {
  const badges = computeBadges(player);
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
            color: b.positive ? '#68D391' : '#FC8181',
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
            {b.icon} <strong style={{ color: b.positive ? '#68D391' : '#FC8181' }}>{b.label}</strong> — {b.desc}
          </div>
        ))}
      </div>
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
      color: isWin ? '#68D391' : '#FC8181',
      border: `1px solid ${isWin ? 'rgba(104,211,145,0.4)' : 'rgba(252,129,129,0.4)'}`,
      whiteSpace: 'nowrap',
    }}>
      {isWin ? '🔥' : '📉'}{streak.count}
    </span>
  );
}
