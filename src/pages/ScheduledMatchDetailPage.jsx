import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getMatch, updateMatch, deleteMatch } from '../firebase/firestore';
import usePlayersStore from '../store/playersStore';
import useMatchStore from '../store/matchStore';
import { useMatchesSubscription } from '../hooks/useMatchesSubscription';
import { generateMatchPreview } from '../services/reportService';
import { fetchWeatherForDate } from '../services/weatherService';
import { downloadICS } from '../utils/calendarUtils';
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
  const { players, balanceTeams } = usePlayersStore();
  const { loadMatch } = useMatchStore();
  const allMatches = useMatchesSubscription();

  // Giocatori "suggeriti" = presenti nelle ultime 3 partite finite (escludendo questa)
  const suggestedIds = useMemo(() => {
    const getMs = d => d?.toMillis ? d.toMillis() : d ? new Date(d).getTime() : 0;
    const recent = (allMatches || [])
      .filter(m => m.status === 'finished' && m.id !== id)
      .sort((a, b) => getMs(b.date) - getMs(a.date))
      .slice(0, 3);
    const set = new Set();
    recent.forEach(m => {
      [...(m.redTeam || []), ...(m.blueTeam || [])].forEach(p => set.add(p.id));
    });
    return set;
  }, [allMatches, id]);

  const [loadingMatch, setLoadingMatch] = useState(true);
  const [saving, setSaving] = useState(false);
  const [teams, setTeams] = useState({ red: [], blue: [] });
  const [pendingPlayers, setPendingPlayers] = useState([]);
  const [matchDate, setMatchDate] = useState('');
  const [weather, setWeather] = useState({ condition: 'cloudy', temp: '', description: '' });
  const [preview, setPreview] = useState('');
  const [swapPick, setSwapPick] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [addSearch, setAddSearch] = useState('');
  const loadedRef = useRef(false);
  const playersRef = useRef(players);
  useEffect(() => { playersRef.current = players; }, [players]);

  // Reset guard when navigating to a different match id
  useEffect(() => {
    loadedRef.current = false;
    setLoadingMatch(true);
  }, [id]);

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
      const pending = (m.pendingPlayers || []).map(enrich);
      const wRaw = m.weather || { condition: 'cloudy', temp: '', description: '' };
      const w = { ...wRaw, temp: wRaw.temp != null && wRaw.temp !== '' ? String(wRaw.temp) : '' };
      const d = safeDate(m.date) || new Date();
      setTeams({ red, blue });
      setPendingPlayers(pending);
      setMatchDate(toDatetimeLocal(m.date));
      setWeather(w);
      setPreview(generateMatchPreview({ redTeam: red, blueTeam: blue, weather: w, date: d }));
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

  const handleAddPending = (player) => {
    const newPending = [...pendingPlayers, player];
    const totalPlayers = newPending.length + teams.red.length + teams.blue.length;
    // Auto-balance solo quando si parte da zero (nessuna squadra) e si raggiunge il 10°
    if (teams.red.length === 0 && teams.blue.length === 0 && newPending.length === 10) {
      const balanced = balanceTeams(newPending.map(p => p.id));
      setTeams(balanced);
      setPendingPlayers([]);
      setShowAddPlayer(false);
      regen(balanced, matchDate, weather);
      toast.success('10 giocatori! Squadre bilanciate automaticamente.');
    } else if (totalPlayers > 10) {
      toast.error('Massimo 10 giocatori per partita');
    } else {
      setPendingPlayers(newPending);
    }
  };

  const handleRemovePending = (playerId) =>
    setPendingPlayers(prev => prev.filter(p => p.id !== playerId));

  const handleBalancePending = () => {
    // Ri-bilancia includendo i giocatori già nelle squadre
    const allPlayers = [...pendingPlayers, ...teams.red, ...teams.blue];
    if (allPlayers.length < 2) return;
    const balanced = balanceTeams(allPlayers.map(p => p.id));
    setTeams(balanced);
    setPendingPlayers([]);
    setShowAddPlayer(false);
    regen(balanced, matchDate, weather);
    toast.success('Squadre bilanciate!');
  };

  const minimalTeam = team =>
    team.map(p => ({ id: p.id, name: p.name, primaryRole: p.primaryRole || '' }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateMatch(id, {
        redTeam: minimalTeam(teams.red),
        blueTeam: minimalTeam(teams.blue),
        pendingPlayers: pendingPlayers.map(p => ({ id: p.id, name: p.name, primaryRole: p.primaryRole || '' })),
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
    // Pending + squadre esistenti → l'utente deve bilanciarli prima
    if (pendingPlayers.length > 0 && (teams.red.length > 0 || teams.blue.length > 0)) {
      toast.error(`${pendingPlayers.length} giocatori in attesa — bilancia prima di iniziare`);
      return;
    }
    let startTeams = teams;
    if (teams.red.length === 0 && teams.blue.length === 0 && pendingPlayers.length >= 2) {
      startTeams = balanceTeams(pendingPlayers.map(p => p.id));
    } else if (teams.red.length === 0 && teams.blue.length === 0) {
      toast.error('Aggiungi almeno 2 giocatori prima di iniziare');
      return;
    }
    setSaving(true);
    try {
      await updateMatch(id, {
        redTeam: minimalTeam(startTeams.red),
        blueTeam: minimalTeam(startTeams.blue),
        pendingPlayers: [],
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

  const buildFreshPreview = async () => {
    const date = matchDate ? new Date(matchDate) : new Date();
    // Auto-fetch del meteo solo se non è già impostato (caricato dalla partita o
    // editato a mano): copiare/condividere la preview non deve sovrascriverlo.
    let w = weather;
    if (!weather.temp) {
      const fw = await fetchWeatherForDate(date).catch(() => null);
      if (fw) { w = fw; setWeather(fw); }
    }
    const text = generateMatchPreview({ redTeam: teams.red, blueTeam: teams.blue, weather: w, date });
    setPreview(text);
    return text;
  };

  const copyPreview = async () => {
    const text = await buildFreshPreview();
    navigator.clipboard.writeText(text).then(() => toast.success('Preview copiata!'));
  };

  const shareWhatsApp = async () => {
    const text = await buildFreshPreview();
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

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
          }}
          style={{ width: '100%' }}
        />
      </div>

      {/* Weather */}
      <div className="card mb-4">
        <h3 className="mb-3">🌤️ Meteo</h3>
        <div className="grid-2" style={{ gap: '0.75rem' }}>
          <select className="input" value={weather.condition}
            onChange={e => {
              const w = { ...weather, condition: e.target.value };
              setWeather(w);
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
              setWeather(w);
              regen(teams, matchDate, w);
            }}
            inputMode="numeric"
          />
        </div>
      </div>

      {/* Pending players (before balance) */}
      {pendingPlayers.length > 0 && (
        <div className="card mb-3">
          <div className="flex items-center justify-between mb-2">
            <h3 style={{ marginBottom: 0 }}>👥 Giocatori confermati</h3>
            <span style={{ fontSize: '0.78rem', color: pendingPlayers.length === 10 ? '#68D391' : '#F6E05E', fontWeight: 700 }}>
              {pendingPlayers.length}/10
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginBottom: '0.75rem' }}>
            {pendingPlayers.map(p => (
              <div key={p.id} className="flex items-center gap-2" style={{ padding: '0.25rem 0.3rem' }}>
                <span style={{ fontSize: '0.8rem' }}>{getRoleIcon(p.primaryRole)}</span>
                <span style={{ flex: 1, fontSize: '0.85rem', fontWeight: 500 }}>{p.name}</span>
                <button
                  onClick={() => handleRemovePending(p.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#718096', padding: '0 2px', fontSize: '0.9rem', lineHeight: 1 }}
                >×</button>
              </div>
            ))}
          </div>
          {pendingPlayers.length > 0 && (pendingPlayers.length + teams.red.length + teams.blue.length) >= 2 && (
            <button
              className="btn btn-teal btn-full"
              style={{ fontSize: '0.85rem' }}
              onClick={handleBalancePending}
            >
              ⚖️ Bilancia ora ({pendingPlayers.length + teams.red.length + teams.blue.length} giocatori)
            </button>
          )}
          {(pendingPlayers.length + teams.red.length + teams.blue.length) < 10 && teams.red.length === 0 && teams.blue.length === 0 && (
            <p style={{ fontSize: '0.72rem', color: '#718096', marginTop: '0.5rem', textAlign: 'center' }}>
              Le squadre si bilanciano automaticamente al 10° giocatore
            </p>
          )}
        </div>
      )}

      {/* Teams (after balance) */}
      {(teams.red.length > 0 || teams.blue.length > 0) && (
        <>
          {swapPick && (
            <div style={{ textAlign: 'center', marginBottom: '0.5rem', fontSize: '0.78rem', color: '#F6E05E' }}>
              ↔️ Tocca un giocatore dell'altra squadra per scambiarlo
            </div>
          )}
          <div className="grid-2 mb-3">
            {(['red', 'blue']).map(side => (
              <div key={side} className={`card team-${side}-bg`}>
                <h3 className={`team-${side}-text mb-2`}>{side === 'red' ? '🔴 Rossa' : '🔵 Blu'}</h3>
                {teams[side].map(p => {
                  const isPicked = swapPick?.id === p.id && swapPick?.team === side;
                  const isTarget = swapPick && swapPick.team !== side;
                  return (
                    <div key={p.id} className="flex items-center gap-2"
                      style={{
                        padding: '0.25rem 0.3rem', borderRadius: '6px',
                        background: isPicked ? 'rgba(246,224,94,0.2)' : isTarget ? (side === 'red' ? 'rgba(252,129,129,0.1)' : 'rgba(99,179,237,0.1)') : 'transparent',
                        border: isPicked ? '1px solid #F6E05E' : '1px solid transparent',
                        transition: 'all 0.15s',
                      }}
                    >
                      <div onClick={() => handlePlayerTap(p.id, side)}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', flex: 1, cursor: 'pointer' }}>
                        <span style={{ fontSize: '0.8rem' }}>{getRoleIcon(p.primaryRole)}</span>
                        <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>{p.name}</span>
                      </div>
                      <button
                        onClick={() => handleRemovePlayer(p.id, side)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#718096', padding: '0 2px', fontSize: '0.9rem', lineHeight: 1 }}
                        title="Rimuovi"
                      >×</button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Add player picker */}
      {(() => {
        const usedIds = new Set([
          ...teams.red.map(p => p.id),
          ...teams.blue.map(p => p.id),
          ...pendingPlayers.map(p => p.id),
        ]);
        const totalPlayers = teams.red.length + teams.blue.length + pendingPlayers.length;
        const atCapacity = totalPlayers >= 10;
        const available = players.filter(p => !usedIds.has(p.id));
        const filtered = addSearch
          ? available.filter(p => p.name.toLowerCase().includes(addSearch.toLowerCase()))
          : available;
        const suggested = filtered.filter(p => suggestedIds.has(p.id));
        const others = filtered.filter(p => !suggestedIds.has(p.id));
        return (
          <div className="card mb-4">
            <button
              className="flex items-center gap-2"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: atCapacity ? '#718096' : '#4FD1C5', fontWeight: 600, fontSize: '0.85rem', padding: 0, width: '100%', textAlign: 'left' }}
              onClick={() => { if (!atCapacity) { setShowAddPlayer(v => !v); setAddSearch(''); } }}
            >
              <span>{showAddPlayer ? '▾' : '▸'}</span>
              <span>
                {atCapacity
                  ? '✅ Squadre al completo (10/10)'
                  : `➕ Aggiungi giocatore${available.length > 0 ? ` (${available.length} disponibili)` : ''}`}
              </span>
            </button>
            {showAddPlayer && !atCapacity && (
              <div style={{ marginTop: '0.75rem' }}>
                {available.length === 0 ? (
                  <p style={{ fontSize: '0.8rem', color: '#718096' }}>Tutti i giocatori sono già in lista.</p>
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
                      {suggested.length > 0 && (
                        <>
                          <div style={{ fontSize: '0.68rem', color: '#F6E05E', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', padding: '0.15rem 0 0.1rem' }}>
                            ⭐ Suggeriti · ultime 3 partite
                          </div>
                          {suggested.map(p => (
                            <div key={p.id} className="flex items-center gap-2"
                              style={{
                                padding: '0.3rem 0.4rem',
                                background: 'rgba(246,224,94,0.08)',
                                border: '1px solid rgba(246,224,94,0.25)',
                                borderRadius: '6px',
                              }}>
                              <span style={{ flex: 1, fontSize: '0.85rem' }}>{getRoleIcon(p.primaryRole)} {p.name}</span>
                              <button
                                onClick={() => handleAddPending(p)}
                                style={{ background: 'rgba(79,209,197,0.15)', border: '1px solid rgba(79,209,197,0.4)', borderRadius: '6px', color: '#4FD1C5', cursor: 'pointer', padding: '0.2rem 0.6rem', fontSize: '0.75rem', fontWeight: 700 }}
                              >+ Aggiungi</button>
                            </div>
                          ))}
                        </>
                      )}
                      {others.length > 0 && (
                        <>
                          {suggested.length > 0 && (
                            <div style={{ fontSize: '0.68rem', color: '#718096', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', padding: '0.35rem 0 0.1rem' }}>
                              Altri
                            </div>
                          )}
                          {others.map(p => (
                            <div key={p.id} className="flex items-center gap-2" style={{ padding: '0.3rem 0' }}>
                              <span style={{ flex: 1, fontSize: '0.85rem' }}>{getRoleIcon(p.primaryRole)} {p.name}</span>
                              <button
                                onClick={() => handleAddPending(p)}
                                style={{ background: 'rgba(79,209,197,0.15)', border: '1px solid rgba(79,209,197,0.4)', borderRadius: '6px', color: '#4FD1C5', cursor: 'pointer', padding: '0.2rem 0.6rem', fontSize: '0.75rem', fontWeight: 700 }}
                              >+ Aggiungi</button>
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* Match Preview — only when teams are set */}
      {(teams.red.length > 0 || teams.blue.length > 0) && <div className="card mb-4">
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
      </div>}

      {/* Actions */}
      <div className="flex gap-3 mb-2">
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
      <button
        className="btn btn-ghost btn-full"
        style={{ fontSize: '0.85rem', color: '#A0AEC0' }}
        onClick={() => {
          const matchObj = {
            id, date: matchDate ? new Date(matchDate) : new Date(),
            redTeam: teams.red, blueTeam: teams.blue,
          };
          downloadICS(matchObj, `calcetto-${id.slice(0, 8)}.ics`);
        }}
      >
        📅 Aggiungi al calendario
      </button>
    </div>
  );
}
