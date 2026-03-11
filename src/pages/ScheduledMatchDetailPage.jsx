import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getMatch, updateMatch, deleteMatch } from '../firebase/firestore';
import usePlayersStore from '../store/playersStore';
import useMatchStore from '../store/matchStore';
import { generateMatchPreview } from '../services/reportService';
import { fetchWeatherForDate } from '../services/weatherService';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import toast from 'react-hot-toast';
import { safeDate } from '../utils/dateUtils';

function toDatetimeLocal(val) {
  const d = safeDate(val);
  if (!d) return '';
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function getRoleIcon(role) {
  const icons = { 'Portiere': '🧤', 'Difensore': '🛡️', 'Centrocampista': '⚙️', 'Attaccante': '⚡' };
  return icons[role] || '⚽';
}

export default function ScheduledMatchDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { players } = usePlayersStore();
  const { loadMatch } = useMatchStore();

  const [loadingMatch, setLoadingMatch] = useState(true);
  const [saving, setSaving] = useState(false);
  const [teams, setTeams] = useState({ red: [], blue: [] });
  const [matchDate, setMatchDate] = useState('');
  const [weather, setWeather] = useState({ condition: 'cloudy', temp: '', description: '' });
  const [weatherAuto, setWeatherAuto] = useState(false);
  const [preview, setPreview] = useState('');
  const [swapPick, setSwapPick] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [addSearch, setAddSearch] = useState('');
  const loadedRef = useRef(false);
  const playersRef = useRef(players);
  useEffect(() => { playersRef.current = players; }, [players]);

  useEffect(() => {
    if (players.length === 0 || loadedRef.current) return;
    loadedRef.current = true;
    const enrich = (p) => {
      const full = playersRef.current.find(fp => fp.id === p.id);
      return full ? { ...full, ...p } : p;
    };
    getMatch(id).then(m => {
      if (!m || m.status !== 'scheduled') { navigate('/history'); return; }
      const red = (m.redTeam || []).map(enrich);
      const blue = (m.blueTeam || []).map(enrich);
      let w = m.weather || { condition: 'cloudy', temp: '', description: '' };
      const d = safeDate(m.date) || new Date();
      setTeams({ red, blue });
      setMatchDate(toDatetimeLocal(m.date));
      // Auto-fetch weather if not manually set yet (temp empty = never set)
      if (!w.temp) {
        fetchWeatherForDate(d).then(fw => {
          if (fw) {
            setWeather(fw);
            setWeatherAuto(true);
            setPreview(generateMatchPreview({ redTeam: red, blueTeam: blue, weather: fw, date: d }));
          }
        });
      } else {
        setWeather(w);
        setPreview(generateMatchPreview({ redTeam: red, blueTeam: blue, weather: w, date: d }));
      }
      setLoadingMatch(false);
    });
  }, [id, players]);

  const regen = (newTeams, newDate, newWeather) => {
    setPreview(generateMatchPreview({
      redTeam: newTeams.red,
      blueTeam: newTeams.blue,
      weather: newWeather,
      date: newDate ? new Date(newDate) : new Date(),
    }));
  };

  const handlePlayerTap = (playerId, team) => {
    if (!swapPick) { setSwapPick({ id: playerId, team }); return; }
    if (swapPick.id === playerId) { setSwapPick(null); return; }
    if (swapPick.team === team) { setSwapPick({ id: playerId, team }); return; }
    const redId = swapPick.team === 'red' ? swapPick.id : playerId;
    const blueId = swapPick.team === 'blue' ? swapPick.id : playerId;
    const redPlayer = teams.red.find(p => p.id === redId);
    const bluePlayer = teams.blue.find(p => p.id === blueId);
    const newRed = teams.red.map(p => p.id === redId ? bluePlayer : p);
    const newBlue = teams.blue.map(p => p.id === blueId ? redPlayer : p);
    const newTeams = { red: newRed, blue: newBlue };
    setTeams(newTeams);
    setSwapPick(null);
    regen(newTeams, matchDate, weather);
    toast.success('Giocatori scambiati');
  };

  const handleRemovePlayer = (playerId, team) => {
    const newTeams = { ...teams, [team]: teams[team].filter(p => p.id !== playerId) };
    setTeams(newTeams);
    setSwapPick(null);
    regen(newTeams, matchDate, weather);
  };

  const handleAddPlayer = (player, team) => {
    const newTeams = { ...teams, [team]: [...teams[team], player] };
    setTeams(newTeams);
    regen(newTeams, matchDate, weather);
  };

  const minimalTeam = team =>
    team.map(p => ({ id: p.id, name: p.name, primaryRole: p.primaryRole || '' }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateMatch(id, {
        redTeam: minimalTeam(teams.red),
        blueTeam: minimalTeam(teams.blue),
        date: matchDate ? new Date(matchDate) : new Date(),
        weather,
      });
      toast.success('Partita aggiornata!');
    } catch (e) {
      toast.error('Errore: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteMatch(id);
      toast.success('Partita eliminata');
      navigate('/history');
    } catch (e) {
      toast.error('Errore: ' + e.message);
    }
  };

  const handleStart = async () => {
    setSaving(true);
    try {
      await updateMatch(id, {
        redTeam: minimalTeam(teams.red),
        blueTeam: minimalTeam(teams.blue),
        date: matchDate ? new Date(matchDate) : new Date(),
        weather,
        status: 'active',
      });
      await loadMatch(id);
      navigate(`/match/${id}`);
    } catch (e) {
      toast.error('Errore: ' + e.message);
      setSaving(false);
    }
  };

  const copyPreview = () =>
    navigator.clipboard.writeText(preview).then(() => toast.success('Preview copiata!'));

  const shareWhatsApp = () =>
    window.open(`https://wa.me/?text=${encodeURIComponent(preview)}`, '_blank');

  if (loadingMatch) {
    return (
      <div className="page-content" style={{ textAlign: 'center', paddingTop: '3rem', color: '#718096' }}>
        Caricamento...
      </div>
    );
  }

  const d = matchDate ? new Date(matchDate) : null;

  return (
    <div className="page-content">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4" style={{ paddingTop: '0.5rem' }}>
        <button className="btn btn-ghost btn-icon" onClick={() => navigate(-1)}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M15 18l-6-6 6-6"/>
          </svg>
        </button>
        <div style={{ flex: 1 }}>
          <h2 style={{ marginBottom: 0 }}>Partita Programmata</h2>
          {d && (
            <p className="text-sm text-muted">
              {format(d, "EEEE d MMMM 'alle' HH:mm", { locale: it })}
            </p>
          )}
        </div>
        <button
          onClick={() => setShowDeleteConfirm(v => !v)}
          style={{
            background: 'none', border: '1px solid rgba(252,129,129,0.35)',
            borderRadius: '8px', padding: '6px 12px', cursor: 'pointer',
            color: '#FC8181', fontSize: '1rem', lineHeight: 1,
          }}
          title="Elimina partita"
        >
          🗑️
        </button>
      </div>

      {/* Delete confirm */}
      {showDeleteConfirm && (
        <div className="card mb-4" style={{
          border: '1px solid rgba(252,129,129,0.4)',
          background: 'rgba(252,129,129,0.08)',
        }}>
          <p className="text-sm" style={{ marginBottom: '0.75rem', color: '#FC8181' }}>
            Eliminare questa partita programmata?
          </p>
          <div className="flex gap-2">
            <button className="btn btn-ghost" style={{ flex: 1, fontSize: '0.85rem' }}
              onClick={() => setShowDeleteConfirm(false)}>
              Annulla
            </button>
            <button
              onClick={handleDelete}
              style={{
                flex: 1, padding: '0.6rem', borderRadius: '8px', cursor: 'pointer',
                background: '#FC8181', color: '#1A202C', fontWeight: 700,
                fontSize: '0.85rem', border: 'none',
              }}
            >
              Elimina
            </button>
          </div>
        </div>
      )}

      {/* Date & Time */}
      <div className="card mb-4">
        <h3 className="mb-3">📅 Data e Ora</h3>
        <input
          type="datetime-local"
          className="input"
          value={matchDate}
          onChange={e => {
            setMatchDate(e.target.value);
            regen(teams, e.target.value, weather);
            if (e.target.value) {
              fetchWeatherForDate(new Date(e.target.value)).then(fw => {
                if (fw) { setWeather(fw); setWeatherAuto(true); regen(teams, e.target.value, fw); }
              });
            }
          }}
          style={{ width: '100%' }}
        />
      </div>

      {/* Weather */}
      <div className="card mb-4">
        <div className="flex items-center justify-between mb-3">
          <h3 style={{ marginBottom: 0 }}>🌤️ Meteo</h3>
          {weatherAuto && (
            <span style={{ fontSize: '0.7rem', color: '#68D391' }}>📍 Bologna — rilevato auto</span>
          )}
        </div>
        <div className="grid-2" style={{ gap: '0.75rem' }}>
          <select className="input" value={weather.condition}
            onChange={e => {
              const w = { ...weather, condition: e.target.value };
              setWeather(w); setWeatherAuto(false);
              regen(teams, matchDate, w);
            }}>
            <option value="sunny">☀️ Soleggiato</option>
            <option value="cloudy">☁️ Nuvoloso</option>
            <option value="rainy">🌧️ Pioggia</option>
            <option value="cold">🥶 Freddo</option>
            <option value="hot">🔥 Caldo</option>
            <option value="wind">💨 Vento</option>
          </select>
          <input className="input" type="number" placeholder="°C (opt.)"
            value={weather.temp}
            onChange={e => {
              const w = { ...weather, temp: e.target.value };
              setWeather(w); setWeatherAuto(false);
              regen(teams, matchDate, w);
            }}
          />
        </div>
      </div>

      {/* Teams with swap */}
      {swapPick && (
        <div style={{ textAlign: 'center', marginBottom: '0.5rem', fontSize: '0.78rem', color: '#F6E05E' }}>
          ↔️ Tocca un giocatore dell'altra squadra per scambiarlo
        </div>
      )}
      <div className="grid-2 mb-3">
        {(['red', 'blue']).map(side => (
          <div key={side} className={`card team-${side}-bg`}>
            <h3 className={`team-${side}-text mb-2`}>{side === 'red' ? '🔴 Squadra Rossa' : '🔵 Squadra Blu'}</h3>
            {teams[side].length === 0 && (
              <p style={{ fontSize: '0.75rem', color: '#718096', fontStyle: 'italic' }}>Nessun giocatore</p>
            )}
            {teams[side].map(p => {
              const isPicked = swapPick?.id === p.id && swapPick?.team === side;
              const isTarget = swapPick && swapPick.team !== side;
              return (
                <div key={p.id}
                  className="flex items-center gap-2"
                  style={{
                    padding: '0.25rem 0.4rem', borderRadius: '6px',
                    background: isPicked ? 'rgba(246,224,94,0.2)' : isTarget ? (side === 'red' ? 'rgba(252,129,129,0.1)' : 'rgba(99,179,237,0.1)') : 'transparent',
                    border: isPicked ? '1px solid #F6E05E' : '1px solid transparent',
                    transition: 'all 0.15s',
                  }}
                >
                  <div onClick={() => handlePlayerTap(p.id, side)} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flex: 1, cursor: 'pointer' }}>
                    <span style={{ fontSize: '0.8rem' }}>{getRoleIcon(p.primaryRole)}</span>
                    <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>{p.name}</span>
                  </div>
                  <button
                    onClick={() => handleRemovePlayer(p.id, side)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#718096', padding: '0 2px', fontSize: '0.85rem', lineHeight: 1 }}
                    title="Rimuovi"
                  >×</button>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Add players */}
      {(() => {
        const assignedIds = new Set([...teams.red, ...teams.blue].map(p => p.id));
        const unassigned = players.filter(p => !assignedIds.has(p.id));
        const filtered = addSearch
          ? unassigned.filter(p => p.name.toLowerCase().includes(addSearch.toLowerCase()))
          : unassigned;
        return (
          <div className="card mb-4">
            <button
              className="flex items-center gap-2"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4FD1C5', fontWeight: 600, fontSize: '0.85rem', padding: 0, width: '100%', textAlign: 'left' }}
              onClick={() => { setShowAddPlayer(v => !v); setAddSearch(''); }}
            >
              <span>{showAddPlayer ? '▾' : '▸'}</span>
              <span>➕ Aggiungi giocatore {unassigned.length > 0 ? `(${unassigned.length} disponibili)` : ''}</span>
            </button>
            {showAddPlayer && (
              <div style={{ marginTop: '0.75rem' }}>
                {unassigned.length === 0 ? (
                  <p style={{ fontSize: '0.8rem', color: '#718096' }}>Tutti i giocatori sono già assegnati.</p>
                ) : (
                  <>
                    <input
                      className="input"
                      placeholder="Cerca..."
                      value={addSearch}
                      onChange={e => setAddSearch(e.target.value)}
                      style={{ width: '100%', marginBottom: '0.5rem' }}
                    />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', maxHeight: '240px', overflowY: 'auto' }}>
                      {filtered.map(p => (
                        <div key={p.id} className="flex items-center gap-2" style={{ padding: '0.3rem 0' }}>
                          <span style={{ flex: 1, fontSize: '0.85rem' }}>{getRoleIcon(p.primaryRole)} {p.name}</span>
                          <button
                            onClick={() => handleAddPlayer(p, 'red')}
                            style={{ background: 'rgba(252,129,129,0.15)', border: '1px solid rgba(252,129,129,0.4)', borderRadius: '6px', color: '#FC8181', cursor: 'pointer', padding: '0.2rem 0.5rem', fontSize: '0.75rem', fontWeight: 700 }}
                          >🔴</button>
                          <button
                            onClick={() => handleAddPlayer(p, 'blue')}
                            style={{ background: 'rgba(99,179,237,0.15)', border: '1px solid rgba(99,179,237,0.4)', borderRadius: '6px', color: '#63B3ED', cursor: 'pointer', padding: '0.2rem 0.5rem', fontSize: '0.75rem', fontWeight: 700 }}
                          >🔵</button>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* Match Preview */}
      <div className="card mb-4">
        <div className="flex items-center justify-between mb-3">
          <h3>📋 Match Preview</h3>
          <div className="flex gap-2">
            <button className="btn btn-ghost text-sm"
              style={{ padding: '0.3rem 0.75rem', minHeight: 'auto' }}
              onClick={copyPreview}>
              📋 Copia
            </button>
            <button className="btn btn-ghost text-sm"
              style={{ padding: '0.3rem 0.75rem', minHeight: 'auto', color: '#25D366' }}
              onClick={shareWhatsApp}>
              💬 WhatsApp
            </button>
          </div>
        </div>
        <pre style={{
          fontFamily: 'Inter, monospace', fontSize: '0.78rem',
          color: '#A0AEC0', whiteSpace: 'pre-wrap', lineHeight: 1.6,
        }}>
          {preview}
        </pre>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          className="btn btn-ghost btn-lg"
          style={{ flex: 1 }}
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? '⏳' : '💾 Salva'}
        </button>
        <button
          className="btn btn-teal btn-lg"
          style={{ flex: 2, fontWeight: 700 }}
          onClick={handleStart}
          disabled={saving}
        >
          🚀 Inizia Partita
        </button>
      </div>
    </div>
  );
}
