import React, { useState } from 'react';
import usePlayersStore from '../store/playersStore';
import useAuthStore from '../store/authStore';
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

  const filtered = players.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));
  const ranking = [...filtered].sort((a, b) => (b.powerIndex || 50) - (a.powerIndex || 50));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error('Inserisci il nome'); return; }
    setLoading(true);
    try {
      if (editId) {
        await editPlayer(editId, { name: form.name.trim(), primaryRole: form.primaryRole, secondaryRole: form.secondaryRole });
        toast.success('Giocatore aggiornato');
      } else {
        await addPlayer({ name: form.name.trim(), primaryRole: form.primaryRole, secondaryRole: form.secondaryRole });
        toast.success('Giocatore aggiunto!');
      }
      setForm(defaultForm); setEditId(null); setShowForm(false);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (p) => {
    setForm({ name: p.name, primaryRole: p.primaryRole || 'Centrocampista', secondaryRole: p.secondaryRole || '' });
    setEditId(p.id);
    setShowForm(true);
    setSelectedPlayer(null);
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
    return (
      <div className="page-content">
        <div className="flex items-center gap-3 mb-4" style={{ paddingTop: '0.5rem' }}>
          <button className="btn btn-ghost btn-icon" onClick={() => setSelectedPlayer(null)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <h2>{p.name}</h2>
          {isAdmin && (
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem' }}>
              <button className="btn btn-ghost text-sm" style={{ padding: '0.4rem 0.75rem', minHeight: 'auto' }} onClick={() => handleEdit(p)}>✏️ Modifica</button>
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
          </div>
        </div>

        <div className="grid-2 mb-4">
          {[
            { label: 'Gol', value: p.stats?.goals || 0, icon: '⚽', color: '#4FD1C5' },
            { label: 'Assist', value: p.stats?.assists || 0, icon: '🎯', color: '#63B3ED' },
            { label: 'Autogol', value: p.stats?.autogoals || 0, icon: '🤦', color: '#FC8181' },
            { label: 'Partite', value: p.stats?.matches || 0, icon: '🏟️', color: '#A0AEC0' },
          ].map(s => (
            <div key={s.label} className="card" style={{ textAlign: 'center', padding: '1rem' }}>
              <div style={{ fontSize: '1.3rem' }}>{s.icon}</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 800, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: '0.7rem', color: '#718096' }}>{s.label}</div>
            </div>
          ))}
        </div>

        <div className="card">
          <h3 className="mb-3">📊 Record Completo</h3>
          {[
            { label: 'Vittorie', value: p.stats?.wins || 0, icon: '✅' },
            { label: 'Pareggi', value: p.stats?.draws || 0, icon: '🤝' },
            { label: 'Sconfitte', value: p.stats?.losses || 0, icon: '❌' },
            { label: 'Partite GK', value: p.stats?.gkMatches || 0, icon: '🧤' },
            { label: 'Gol Subiti (GK)', value: p.stats?.gkGoalsConceded || 0, icon: '🚀' },
          ].map(s => (
            <div key={s.label} className="flex items-center justify-between"
              style={{ padding: '0.5rem 0', borderBottom: '1px solid #2D3748' }}>
              <span className="text-secondary">{s.icon} {s.label}</span>
              <span style={{ fontWeight: 600 }}>{s.value}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="page-content">
      <div className="flex items-center justify-between mb-4" style={{ paddingTop: '0.5rem' }}>
        <h2>👥 Giocatori</h2>
        {isAdmin && (
          <button className="btn btn-teal" style={{ padding: '0.5rem 1rem' }} onClick={() => { setShowForm(true); setForm(defaultForm); setEditId(null); }}>
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
              <input className="input" placeholder="Nome *" value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              <select className="input" value={form.primaryRole}
                onChange={e => setForm(f => ({ ...f, primaryRole: e.target.value }))}>
                {ROLES.map(r => <option key={r} value={r}>{getRoleIcon(r)} {r}</option>)}
              </select>
              <select className="input" value={form.secondaryRole}
                onChange={e => setForm(f => ({ ...f, secondaryRole: e.target.value }))}>
                <option value="">Ruolo Secondario (opt.)</option>
                {ROLES.map(r => <option key={r} value={r}>{getRoleIcon(r)} {r}</option>)}
              </select>
              <div className="flex gap-2">
                <button type="button" className="btn btn-ghost" style={{ flex: 1 }}
                  onClick={() => { setShowForm(false); setEditId(null); }}>
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
      ) : ranking.map((p, i) => (
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
              <div style={{ fontWeight: 600 }}>{p.name}</div>
              <div className="text-xs text-muted">
                {p.primaryRole || 'N/D'} · {p.stats?.matches || 0} partite
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: 700, color: '#4FD1C5' }}>{(p.powerIndex || 50).toFixed(1)}</div>
              <div className="text-xs text-muted">
                {p.stats?.goals || 0}⚽ {p.stats?.assists || 0}🎯
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function getRoleIcon(role) {
  const icons = { 'Portiere': '🧤', 'Difensore': '🛡️', 'Centrocampista': '⚙️', 'Attaccante': '⚡' };
  return icons[role] || '⚽';
}
