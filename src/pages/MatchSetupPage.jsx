import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import usePlayersStore from '../store/playersStore';
import useMatchStore from '../store/matchStore';
import { generateMatchPreview } from '../services/reportService';
import { fetchWeatherForDate } from '../services/weatherService';
import { generateAIBalancedTeams, generateMatchPrediction } from '../services/geminiService';
import toast from 'react-hot-toast';

const ROLES = ['Portiere', 'Difensore', 'Centrocampista', 'Attaccante'];

export default function MatchSetupPage() {
  const navigate = useNavigate();
  const { players, balanceTeams } = usePlayersStore();
  const { createNewMatch, loadMatch } = useMatchStore();

  const [step, setStep] = useState('select'); // select | preview
  const [selectedIds, setSelectedIds] = useState([]);
  const [teams, setTeams] = useState({ red: [], blue: [] });
  const [preview, setPreview] = useState('');
  const [loading, setLoading] = useState(false);
  const [weather, setWeather] = useState({ condition: 'cloudy', temp: '', description: '' });
  const [swapPick, setSwapPick] = useState(null); // { id, team } of first-selected player
  const [matchDate, setMatchDate] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiReasoning, setAiReasoning] = useState('');
  const [prediction, setPrediction] = useState('');
  const [predictionLoading, setPredictionLoading] = useState(false);

  const togglePlayer = (id) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : prev.length < 10 ? [...prev, id] : prev
    );
  };

  const handlePlanEmpty = async () => {
    if (!matchDate) { toast.error('Seleziona una data prima di pianificare'); return; }
    setLoading(true);
    try {
      await createNewMatch({
        redTeam: [], blueTeam: [], pendingPlayers: [], weather,
        redScore: 0, blueScore: 0, status: 'scheduled',
        date: new Date(matchDate),
        events: [],
      });
      toast.success('Partita pianificata! Aggiungi i giocatori dallo storico.');
      navigate('/history');
    } catch (e) {
      toast.error('Errore: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleBalance = () => {
    if (selectedIds.length < 2) { toast.error('Seleziona almeno 2 giocatori'); return; }
    const balanced = balanceTeams(selectedIds);
    setTeams(balanced);
    setAiReasoning('');
    setPrediction('');
    const prev = generateMatchPreview({
      redTeam: balanced.red,
      blueTeam: balanced.blue,
      weather,
      date: matchDate ? new Date(matchDate) : new Date(),
    });
    setPreview(prev);
    setStep('preview');
  };

  const handleAIBalance = async () => {
    if (selectedIds.length < 2) { toast.error('Seleziona almeno 2 giocatori'); return; }
    setAiLoading(true);
    const pool = players.filter(p => selectedIds.includes(p.id));
    try {
      const { red, blue, reasoning } = await generateAIBalancedTeams(pool);
      setTeams({ red, blue });
      setAiReasoning(reasoning);
      setPrediction('');
      const prev = generateMatchPreview({
        redTeam: red,
        blueTeam: blue,
        weather,
        date: matchDate ? new Date(matchDate) : new Date(),
      });
      setPreview(prev);
      setStep('preview');
      toast.success('🤖 Squadre formate dall\'AI!');
    } catch (e) {
      toast.error('AI non disponibile, uso bilanciamento standard');
      const balanced = balanceTeams(selectedIds);
      setTeams(balanced);
      setAiReasoning('');
      const prev = generateMatchPreview({
        redTeam: balanced.red,
        blueTeam: balanced.blue,
        weather,
        date: matchDate ? new Date(matchDate) : new Date(),
      });
      setPreview(prev);
      setStep('preview');
    } finally {
      setAiLoading(false);
    }
  };

  const handleStartMatch = async () => {
    setLoading(true);
    try {
      const date = matchDate ? new Date(matchDate) : new Date();
      let currentWeather = weather;
      if (!currentWeather.temp) {
        const fw = await fetchWeatherForDate(date).catch(() => null);
        if (fw) {
          currentWeather = fw;
          setWeather({ ...fw, temp: fw.temp != null ? String(fw.temp) : '' });
        }
      }
      const matchId = await createNewMatch({
        redTeam: teams.red.map(p => ({ id: p.id, name: p.name, primaryRole: p.primaryRole || '' })),
        blueTeam: teams.blue.map(p => ({ id: p.id, name: p.name, primaryRole: p.primaryRole || '' })),
        weather: currentWeather,
        redScore: 0,
        blueScore: 0,
        status: 'active',
        date,
        events: [],
      });
      await loadMatch(matchId);
      navigate(`/match/${matchId}`);
    } catch (e) {
      toast.error('Errore creazione partita: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveMatch = async () => {
    setLoading(true);
    try {
      const date = matchDate ? new Date(matchDate) : new Date();
      await createNewMatch({
        redTeam: teams.red.map(p => ({ id: p.id, name: p.name, primaryRole: p.primaryRole || '' })),
        blueTeam: teams.blue.map(p => ({ id: p.id, name: p.name, primaryRole: p.primaryRole || '' })),
        weather,
        redScore: 0,
        blueScore: 0,
        status: 'scheduled',
        date,
        events: [],
      });
      toast.success('Partita salvata! La trovi nello storico.');
      navigate('/history');
    } catch (e) {
      toast.error('Errore: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePrediction = async () => {
    if (prediction) { setPrediction(''); return; }
    setPredictionLoading(true);
    try {
      const pool = players.filter(p => [...teams.red, ...teams.blue].some(t => t.id === p.id));
      const redFull  = teams.red.map(t  => pool.find(p => p.id === t.id) || t);
      const blueFull = teams.blue.map(t => pool.find(p => p.id === t.id) || t);
      const text = await generateMatchPrediction(redFull, blueFull);
      setPrediction(text);
    } catch (e) {
      toast.error('Pronostico AI non disponibile: ' + e.message);
    } finally {
      setPredictionLoading(false);
    }
  };

  const buildFreshPreview = async () => {
    const date = matchDate ? new Date(matchDate) : new Date();
    const fw = await fetchWeatherForDate(date);
    const w = fw || weather;
    if (fw) setWeather(fw);
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

  const handlePlayerTap = (playerId, team) => {
    if (!swapPick) {
      // First tap: select this player
      setSwapPick({ id: playerId, team });
      return;
    }
    if (swapPick.id === playerId) {
      // Tap same player: deselect
      setSwapPick(null);
      return;
    }
    if (swapPick.team === team) {
      // Same team: change selection
      setSwapPick({ id: playerId, team });
      return;
    }
    // Different team: perform swap
    const redId = swapPick.team === 'red' ? swapPick.id : playerId;
    const blueId = swapPick.team === 'blue' ? swapPick.id : playerId;
    const redPlayer = teams.red.find(p => p.id === redId);
    const bluePlayer = teams.blue.find(p => p.id === blueId);
    const newRed = teams.red.map(p => p.id === redId ? bluePlayer : p);
    const newBlue = teams.blue.map(p => p.id === blueId ? redPlayer : p);
    const newTeams = { red: newRed, blue: newBlue };
    setTeams(newTeams);
    setSwapPick(null);
    setPreview(generateMatchPreview({ redTeam: newTeams.red, blueTeam: newTeams.blue, weather, date: matchDate ? new Date(matchDate) : new Date() }));
    toast.success('Giocatori scambiati');
  };

  if (step === 'preview') {
    return (
      <div className="page-content">
        <div className="flex items-center gap-3 mb-4" style={{ paddingTop: '0.5rem' }}>
          <button className="btn btn-ghost btn-icon" onClick={() => setStep('select')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M15 18l-6-6 6-6"/>
            </svg>
          </button>
          <h2>Preview Partita</h2>
        </div>

        {/* Teams */}
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
                <div
                  key={p.id}
                  onClick={() => handlePlayerTap(p.id, 'red')}
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
                <div
                  key={p.id}
                  onClick={() => handlePlayerTap(p.id, 'blue')}
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

        {/* AI Reasoning */}
        {aiReasoning && (
          <div className="card mb-3" style={{ background: 'rgba(79,209,197,0.05)', border: '1px solid rgba(79,209,197,0.2)' }}>
            <div className="flex items-center gap-2 mb-1">
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#4FD1C5' }}>🤖 AI</span>
              <span style={{ fontSize: '0.75rem', color: '#718096' }}>Ragionamento sulla formazione</span>
            </div>
            <p style={{ fontSize: '0.82rem', color: '#A0AEC0', lineHeight: 1.5, margin: 0 }}>{aiReasoning}</p>
          </div>
        )}

        {/* AI Prediction */}
        {!prediction ? (
          <div className="card mb-3" style={{ textAlign: 'center', border: '1px dashed rgba(246,173,85,0.35)', background: 'rgba(246,173,85,0.03)' }}>
            <button
              onClick={handlePrediction}
              disabled={predictionLoading}
              style={{ background: 'none', border: 'none', cursor: predictionLoading ? 'default' : 'pointer', color: '#F6AD55', fontSize: '0.88rem', padding: '0.6rem 0', width: '100%' }}
            >
              {predictionLoading ? '⏳ Pronostico in corso...' : '🔮 Pronostico AI pre-partita'}
            </button>
          </div>
        ) : (
          <div className="card mb-3" style={{ border: '1px solid rgba(246,173,85,0.4)', background: 'rgba(246,173,85,0.04)' }}>
            <div className="flex items-center justify-between mb-2">
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#F6AD55' }}>🔮 Pronostico AI</span>
              <button onClick={() => setPrediction('')} style={{ fontSize: '0.7rem', color: '#718096', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
            </div>
            <p style={{ fontSize: '0.82rem', color: '#CBD5E0', lineHeight: 1.7, margin: 0, whiteSpace: 'pre-wrap' }}>{prediction}</p>
          </div>
        )}

        {/* Preview text */}
        <div className="card mb-4">
          <div className="flex items-center justify-between mb-3">
            <h3>🎙️ Match Preview</h3>
            <div className="flex gap-2">
              <button className="btn btn-ghost text-sm" style={{ padding: '0.3rem 0.75rem', minHeight: 'auto' }} onClick={copyPreview}>
                📋 Copia
              </button>
              <button className="btn btn-ghost text-sm" style={{ padding: '0.3rem 0.75rem', minHeight: 'auto', color: '#25D366' }} onClick={shareWhatsApp}>
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

        <div className="flex gap-3">
          <button
            className="btn btn-ghost btn-lg"
            style={{ flex: 1 }}
            onClick={handleSaveMatch}
            disabled={loading}
          >
            💾 Salva
          </button>
          <button
            className="btn btn-teal btn-lg"
            style={{ flex: 1 }}
            onClick={handleStartMatch}
            disabled={loading}
          >
            {loading ? '⏳...' : '🚀 Inizia!'}
          </button>
        </div>
      </div>
    );
  }

  const filtered = searchQuery
    ? players.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : players;
  const byRole = ROLES.reduce((acc, r) => {
    acc[r] = filtered.filter(p => p.primaryRole === r);
    return acc;
  }, {});
  const others = filtered.filter(p => !ROLES.includes(p.primaryRole));

  return (
    <div className="page-content">
      <div className="flex items-center gap-3 mb-4" style={{ paddingTop: '0.5rem' }}>
        <button className="btn btn-ghost btn-icon" onClick={() => navigate(-1)}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M15 18l-6-6 6-6"/>
          </svg>
        </button>
        <div>
          <h2>Nuova Partita</h2>
          <p className="text-sm text-muted">Seleziona fino a 10 giocatori</p>
        </div>
        <div className="badge badge-teal" style={{ marginLeft: 'auto' }}>
          {selectedIds.length}/10
        </div>
      </div>

      {/* Date & Time */}
      <div className="card mb-4">
        <h3 className="mb-3">📅 Data e Ora</h3>
        <input
          type="datetime-local"
          className="input"
          value={matchDate}
          onChange={e => setMatchDate(e.target.value)}
          style={{ width: '100%' }}
        />
      </div>

      {/* Weather */}
      <div className="card mb-4">
        <h3 className="mb-3">🌤️ Meteo (opzionale)</h3>
        <div className="grid-2" style={{ gap: '0.75rem' }}>
          <select className="input" value={weather.condition}
            onChange={e => setWeather(w => ({ ...w, condition: e.target.value }))}>
            <option value="sunny">☀️ Soleggiato</option>
            <option value="cloudy">☁️ Nuvoloso</option>
            <option value="rainy">🌧️ Pioggia</option>
            <option value="cold">🥶 Freddo</option>
            <option value="hot">🔥 Caldo</option>
            <option value="wind">💨 Vento</option>
          </select>
          <input className="input" type="number" placeholder="°C (opt.)"
            value={weather.temp}
            onChange={e => setWeather(w => ({ ...w, temp: e.target.value }))}
            inputMode="numeric"
          />
        </div>
      </div>

      {/* Search */}
      <div style={{ marginBottom: '1rem' }}>
        <input
          className="input"
          placeholder="Cerca giocatore..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          style={{ width: '100%' }}
        />
      </div>

      {/* Player Selection */}
      {[...ROLES, 'Altri'].map(role => {
        const list = role === 'Altri' ? others : byRole[role];
        if (!list || list.length === 0) return null;
        return (
          <div key={role} className="card mb-3">
            <h3 className="mb-2 text-sm" style={{ color: '#A0AEC0' }}>
              {getRoleIcon(role)} {role}
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {list.map(p => {
                const sel = selectedIds.includes(p.id);
                return (
                  <button
                    key={p.id}
                    onClick={() => togglePlayer(p.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.75rem',
                      padding: '0.7rem 0.75rem', borderRadius: '8px',
                      background: sel ? 'rgba(79,209,197,0.12)' : 'transparent',
                      border: `1px solid ${sel ? '#4FD1C5' : 'transparent'}`,
                      cursor: 'pointer', width: '100%', textAlign: 'left',
                      transition: 'all 0.15s',
                    }}
                  >
                    <div style={{
                      width: 20, height: 20, borderRadius: '50%',
                      border: `2px solid ${sel ? '#4FD1C5' : '#4A5568'}`,
                      background: sel ? '#4FD1C5' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0, transition: 'all 0.15s',
                    }}>
                      {sel && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#1A202C" strokeWidth={3}>
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>}
                    </div>
                    <span style={{ fontWeight: 500, color: sel ? '#F7FAFC' : '#A0AEC0', flex: 1 }}>
                      {p.name}
                    </span>
                    <span style={{ fontSize: '0.8rem', color: '#718096' }}>
                      PI: {p.powerIndex?.toFixed(0) || 50}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      <div style={{ height: '1rem' }} />

      <div style={{ display: 'flex', gap: '0.5rem', position: 'sticky', bottom: '80px' }}>
        <button
          className="btn btn-teal btn-lg"
          onClick={handleBalance}
          disabled={selectedIds.length < 2 || aiLoading}
          style={{ flex: 1 }}
        >
          ⚖️ Bilancia
        </button>
        <button
          className="btn btn-lg"
          onClick={handleAIBalance}
          disabled={selectedIds.length < 2 || aiLoading}
          style={{
            flex: 1,
            background: aiLoading ? 'rgba(79,209,197,0.08)' : 'rgba(79,209,197,0.15)',
            color: '#4FD1C5',
            border: '1px solid rgba(79,209,197,0.4)',
          }}
        >
          {aiLoading ? '⏳ AI...' : '🤖 AI Bilancia'}
        </button>
      </div>
      <button
        className="btn btn-ghost btn-full"
        onClick={handlePlanEmpty}
        disabled={loading}
        style={{ marginTop: '0.5rem', position: 'sticky', bottom: '36px', fontSize: '0.85rem' }}
      >
        📅 Pianifica senza giocatori
      </button>
    </div>
  );
}

function getRoleIcon(role) {
  const icons = { 'Portiere': '🧤', 'Difensore': '🛡️', 'Centrocampista': '⚙️', 'Attaccante': '⚡' };
  return icons[role] || '⚽';
}
