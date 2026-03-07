import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getMatch, updateMatch, deleteMatch } from '../firebase/firestore';
import usePlayersStore from '../store/playersStore';
import useMatchStore from '../store/matchStore';
import { generateMatchPreview } from '../services/reportService';
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
  const [preview, setPreview] = useState('');
  const [swapPick, setSwapPick] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Enrich stored player (id, name, primaryRole) with full stats from the store
  const enrich = (p) => {
    const full = players.find(fp => fp.id === p.id);
    return full ? { ...full, ...p } : p;
  };

  useEffect(() => {
    if (players.length === 0) return; // wait for players to load
    getMatch(id).then(m => {
      if (!m || m.status !== 'scheduled') { navigate('/history'); return; }
      const red = (m.redTeam || []).map(enrich);
      const blue = (m.blueTeam || []).map(enrich);
      const w = m.weather || { condition: 'cloudy', temp: '', description: '' };
      const d = safeDate(m.date) || new Date();
      setTeams({ red, blue });
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
          />
        </div>
      </div>

      {/* Teams with swap */}
      {swapPick && (
        <div style={{ textAlign: 'center', marginBottom: '0.5rem', fontSize: '0.78rem', color: '#F6E05E' }}>
          ↔️ Tocca un giocatore dell'altra squadra per scambiarlo
        </div>
      )}
      <div className="grid-2 mb-4">
        <div className="card team-red-bg">
          <h3 className="team-red-text mb-2">🔴 Squadra Rossa</h3>
          {teams.red.map(p => {
            const isPicked = swapPick?.id === p.id && swapPick?.team === 'red';
            const isTarget = swapPick && swapPick.team === 'blue';
            return (
              <div key={p.id} onClick={() => handlePlayerTap(p.id, 'red')}
                className="flex items-center gap-2"
                style={{
                  padding: '0.3rem 0.4rem', borderRadius: '6px', cursor: 'pointer',
                  background: isPicked ? 'rgba(246,224,94,0.2)' : isTarget ? 'rgba(252,129,129,0.1)' : 'transparent',
                  border: isPicked ? '1px solid #F6E05E' : '1px solid transparent',
                  transition: 'all 0.15s',
                }}
              >
                <span style={{ fontSize: '0.85rem' }}>{getRoleIcon(p.primaryRole)}</span>
                <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>{p.name}</span>
                <span className="text-xs text-muted" style={{ marginLeft: 'auto' }}>
                  {p.powerIndex?.toFixed(0) || 50}
                </span>
              </div>
            );
          })}
        </div>
        <div className="card team-blue-bg">
          <h3 className="team-blue-text mb-2">🔵 Squadra Blu</h3>
          {teams.blue.map(p => {
            const isPicked = swapPick?.id === p.id && swapPick?.team === 'blue';
            const isTarget = swapPick && swapPick.team === 'red';
            return (
              <div key={p.id} onClick={() => handlePlayerTap(p.id, 'blue')}
                className="flex items-center gap-2"
                style={{
                  padding: '0.3rem 0.4rem', borderRadius: '6px', cursor: 'pointer',
                  background: isPicked ? 'rgba(246,224,94,0.2)' : isTarget ? 'rgba(99,179,237,0.1)' : 'transparent',
                  border: isPicked ? '1px solid #F6E05E' : '1px solid transparent',
                  transition: 'all 0.15s',
                }}
              >
                <span style={{ fontSize: '0.85rem' }}>{getRoleIcon(p.primaryRole)}</span>
                <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>{p.name}</span>
                <span className="text-xs text-muted" style={{ marginLeft: 'auto' }}>
                  {p.powerIndex?.toFixed(0) || 50}
                </span>
              </div>
            );
          })}
        </div>
      </div>

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
