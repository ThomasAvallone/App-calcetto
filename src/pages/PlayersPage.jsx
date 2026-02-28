import React, { useState, useMemo } from 'react';
import usePlayersStore from '../store/playersStore';
import useAuthStore from '../store/authStore';
import { computeCombinedPowerIndex } from '../firebase/firestore';
import { suggestHistoricalNames, computeCumulativeStats, getUnlinkedNames } from '../data/historicalData';
import toast from 'react-hot-toast';

const ROLES = ['Portiere', 'Difensore', 'Centrocampista', 'Attaccante'];

const defaultForm = { name: '', primaryRole: 'Centrocampista', secondaryRole: '' };

export default function PlayersPage() {
  const { players, addPlayer, updatePlayer: editPlayer, removePlayer } = usePlayersStore();
  const { role } = useAuthStore();
  const isAdmin = role === 'admin';

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const [editId, setEditId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedPlayer, setSelectedPlayer] = useState(null);

  // Historical linking state
  const [linkedNames, setLinkedNames] = useState([]);
  const [showAllHistorical, setShowAllHistorical] = useState(false);
  const [historicalSearch, setHistoricalSearch] = useState('');

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
        toast.success('Giocatore aggiornato');
      } else {
        // createPlayer already computes PI from historicalStats on creation
        await addPlayer(playerData);
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

  const handleDelete = async (p) => {
    if (!window.confirm(`Eliminare ${p.name}? Questa azione è irreversibile.`)) return;
    await removePlayer(p.id);
    toast.success(`${p.name} eliminato`);
    setSelectedPlayer(null);
  };

  if (selectedPlayer) {
    const p = players.find(pl => pl.id === selectedPlayer);
    if (!p) { setSelectedPlayer(null); return null; }

    const hs = p.historicalStats || {};
    const as = p.stats || {};
    const total = {
      goals: (as.goals || 0) + (hs.goals || 0),
      assists: (as.assists || 0) + (hs.assists || 0),
      autogoals: (as.autogoals || 0) + (hs.autogoals || 0),
      matches: (as.matches || 0) + (hs.matches || 0),
      wins: (as.wins || 0) + (hs.wins || 0),
      draws: (as.draws || 0) + (hs.draws || 0),
      losses: (as.losses || 0) + (hs.losses || 0),
      gkMatches: as.gkMatches || 0,
      gkGoalsConceded: as.gkGoalsConceded || 0,
    };
    const hasHistory = (p.historicalNames || []).length > 0;

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

        <div className="card mb-4" style={{ textAlign: 'center', padding: '2rem' }}>
          <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>{getRoleIcon(p.primaryRole)}</div>
          <div style={{ fontSize: '2.5rem', fontWeight: 900, color: '#4FD1C5' }}>
            {(p.powerIndex || 50).toFixed(1)}
          </div>
          <div className="text-sm text-muted">Power Index</div>
          <div className="flex gap-2 justify-center mt-2">
            <span className="badge badge-teal">{p.primaryRole || 'N/D'}</span>
            {p.secondaryRole && <span className="badge badge-gray">{p.secondaryRole}</span>}
            {hasHistory && <span className="badge" style={{ background: 'rgba(246,224,94,0.15)', color: '#F6E05E', border: '1px solid rgba(246,224,94,0.3)', fontSize: '0.65rem' }}>📚 Storico</span>}
          </div>
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

        {hasHistory && (
          <div className="card" style={{ background: 'rgba(246,224,94,0.05)', border: '1px solid rgba(246,224,94,0.2)' }}>
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
            {hs.matches > 0 && (
              <p className="text-xs text-muted mt-2">
                Storico: {hs.matches} partite · {hs.goals} gol · {hs.assists} assist
              </p>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="page-content">
      <div className="flex items-center justify-between mb-4" style={{ paddingTop: '0.5rem' }}>
        <h2>👥 Giocatori</h2>
        {isAdmin && (
          <button className="btn btn-teal" style={{ padding: '0.5rem 1rem' }} onClick={() => openForm()}>
            + Aggiungi
          </button>
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
        const hs = p.historicalStats || {};
        const as = p.stats || {};
        const totalGoals = (as.goals || 0) + (hs.goals || 0);
        const totalAssists = (as.assists || 0) + (hs.assists || 0);
        const totalMatches = (as.matches || 0) + (hs.matches || 0);
        const hasHistory = (p.historicalNames || []).length > 0;

        return (
          <div key={p.id}
            className="card mb-2"
            style={{ cursor: 'pointer' }}
            onClick={() => setSelectedPlayer(p.id)}
          >
            <div className="flex items-center gap-3">
              <span style={{
                fontSize: '1rem', minWidth: '28px', fontWeight: 700,
                color: i === 0 ? '#F6E05E' : i === 1 ? '#A0AEC0' : i === 2 ? '#C05621' : '#718096',
              }}>
                {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}
              </span>
              <span style={{ fontSize: '1.3rem' }}>{getRoleIcon(p.primaryRole)}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  {p.name}
                  {hasHistory && <span style={{ fontSize: '0.65rem', color: '#F6E05E' }}>📚</span>}
                </div>
                <div className="text-xs text-muted">
                  {p.primaryRole || 'N/D'} · {totalMatches} partite
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 700, color: '#4FD1C5' }}>{(p.powerIndex || 50).toFixed(1)}</div>
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

function getRoleIcon(role) {
  const icons = { 'Portiere': '🧤', 'Difensore': '🛡️', 'Centrocampista': '⚙️', 'Attaccante': '⚡' };
  return icons[role] || '⚽';
}
