import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getMatch, updateMatch, deleteMatch, recalculatePlayerStats, rateMatch, recalculateRecentFormForPlayers } from '../firebase/firestore';
import useAuthStore from '../store/authStore';
import usePlayersStore from '../store/playersStore';
import { generateMatchReport } from '../services/reportService';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import toast from 'react-hot-toast';

function RatingSection({ match, userId, onRated }) {
  const allPlayers = [...(match.redTeam || []), ...(match.blueTeam || [])];
  const hasVoted = !!(match.ratings?.[userId]);
  const [scores, setScores] = React.useState(() =>
    Object.fromEntries(allPlayers.map(p => [p.id, 6]))
  );
  const [submitting, setSubmitting] = React.useState(false);

  const bump = (pid, delta) =>
    setScores(s => ({ ...s, [pid]: Math.max(1, Math.min(10, (s[pid] ?? 6) + delta)) }));

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await rateMatch(match.id, userId, scores);
      await recalculateRecentFormForPlayers(allPlayers.map(p => p.id));
      const updated = await getMatch(match.id);
      onRated(updated);
      toast.success('Voti salvati!');
    } catch (e) {
      toast.error('Errore: ' + e.message);
      setSubmitting(false);
    }
  };

  if (hasVoted) {
    const myRating = match.ratings[userId];
    return (
      <div className="card mb-4" style={{ border: '1px solid rgba(246,224,94,0.25)', background: 'rgba(246,224,94,0.03)' }}>
        <h3 className="mb-3" style={{ fontSize: '0.95rem' }}>⭐ Il tuo voto</h3>
        {allPlayers.map(p => {
          const s = myRating.scores?.[p.id];
          if (s == null) return null;
          const c = s >= 7 ? '#68D391' : s >= 5 ? '#F6E05E' : '#FC8181';
          return (
            <div key={p.id} className="flex items-center justify-between"
              style={{ padding: '0.35rem 0', borderBottom: '1px solid #2D3748' }}>
              <span style={{ fontSize: '0.9rem' }}>{p.name}</span>
              <span style={{ fontWeight: 700, color: c }}>{s}/10</span>
            </div>
          );
        })}
        <p className="text-xs text-muted mt-2 text-center">Hai già votato per questa partita</p>
      </div>
    );
  }

  return (
    <div className="card mb-4" style={{ border: '1px solid rgba(79,209,197,0.3)' }}>
      <h3 className="mb-1" style={{ fontSize: '0.95rem' }}>⭐ Valuta i Giocatori</h3>
      <p className="text-xs text-muted mb-3">Dai un voto 1–10 a ogni giocatore</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '1rem' }}>
        {allPlayers.map(p => {
          const s = scores[p.id] ?? 6;
          const c = s >= 7 ? '#68D391' : s >= 5 ? '#F6E05E' : '#FC8181';
          const isRed = (match.redTeam || []).some(r => r.id === p.id);
          return (
            <div key={p.id} className="flex items-center gap-2">
              <span style={{ fontSize: '0.7rem', minWidth: '18px' }}>{isRed ? '🔴' : '🔵'}</span>
              <span style={{ flex: 1, fontSize: '0.88rem' }}>{p.name}</span>
              <div className="flex items-center gap-2">
                <button onClick={() => bump(p.id, -1)}
                  style={{ background: '#2D3748', border: 'none', borderRadius: '6px', width: 30, height: 30, cursor: 'pointer', color: '#A0AEC0', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  −
                </button>
                <span style={{ minWidth: '20px', textAlign: 'center', fontWeight: 700, color: c, fontSize: '1rem' }}>{s}</span>
                <button onClick={() => bump(p.id, +1)}
                  style={{ background: '#2D3748', border: 'none', borderRadius: '6px', width: 30, height: 30, cursor: 'pointer', color: '#A0AEC0', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  +
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <button className="btn btn-teal btn-full" onClick={handleSubmit} disabled={submitting}>
        {submitting ? '⏳ Salvataggio...' : '✅ Salva Voti'}
      </button>
    </div>
  );
}

function safeDate(val) {
  if (!val) return null;
  if (val?.toDate) return val.toDate();
  if (val instanceof Date) return val;
  return new Date(val);
}

export default function MatchDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { role, user } = useAuthStore();
  const { players } = usePlayersStore();
  const isAdmin = role === 'admin';

  const [match, setMatch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reportText, setReportText] = useState('');
  const [showReport, setShowReport] = useState(false);

  useEffect(() => {
    getMatch(id).then(m => { setMatch(m); setLoading(false); }).catch(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="page-content" style={{ textAlign: 'center', paddingTop: '3rem', color: '#718096' }}>Caricamento...</div>;
  if (!match) return <div className="page-content" style={{ textAlign: 'center', paddingTop: '3rem', color: '#FC8181' }}>Partita non trovata</div>;

  const d = safeDate(match.date);
  const events = match.events || [];
  const goals = events.filter(e => e.type === 'goal' || e.type === 'autogoal');

  const handleDeleteEvent = async (evId) => {
    const newEvents = events.filter(e => e.id !== evId);
    let redScore = 0, blueScore = 0;
    for (const ev of newEvents) {
      if (ev.type === 'goal') { if (ev.team === 'red') redScore++; else blueScore++; }
      else if (ev.type === 'autogoal') { if (ev.team === 'red') blueScore++; else redScore++; }
    }
    const updated = { ...match, events: newEvents, redScore, blueScore };
    setMatch(updated);
    setSaving(true);
    try {
      await updateMatch(id, { events: newEvents, redScore, blueScore });
      const allIds = [...(match.redTeam || []), ...(match.blueTeam || [])].map(p => p.id);
      await recalculatePlayerStats(allIds);
      toast.success('Evento eliminato e statistiche ricalcolate');
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleEditScorer = async (evId, field, value) => {
    const newEvents = events.map(e => e.id === evId ? { ...e, [field]: value } : e);
    setMatch(m => ({ ...m, events: newEvents }));
    setSaving(true);
    try {
      await updateMatch(id, { events: newEvents });
      const allIds = [...(match.redTeam || []), ...(match.blueTeam || [])].map(p => p.id);
      await recalculatePlayerStats(allIds);
      toast.success('Evento aggiornato');
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleShowReport = () => {
    const r = generateMatchReport(match, players);
    setReportText(r);
    setShowReport(true);
  };

  const handleDeleteMatch = async () => {
    if (!window.confirm('Eliminare questa partita? Le statistiche verranno ricalcolate. Azione irreversibile.')) return;
    setSaving(true);
    try {
      const allIds = [...(match.redTeam || []), ...(match.blueTeam || [])].map(p => p.id);
      await deleteMatch(id);
      await recalculatePlayerStats(allIds);
      toast.success('Partita eliminata');
      navigate('/history');
    } catch (e) {
      toast.error(e.message);
      setSaving(false);
    }
  };

  if (showReport) {
    return (
      <div className="page-content">
        <div className="flex items-center gap-3 mb-4" style={{ paddingTop: '0.5rem' }}>
          <button className="btn btn-ghost btn-icon" onClick={() => setShowReport(false)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <h2>🏆 Verdetto Finale</h2>
        </div>
        <div className="card mb-4">
          <pre style={{ fontFamily: 'Inter, monospace', fontSize: '0.78rem', color: '#A0AEC0', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
            {reportText}
          </pre>
        </div>
        <div className="flex gap-3">
          <button className="btn btn-teal" style={{ flex: 1 }}
            onClick={() => navigator.clipboard.writeText(reportText).then(() => toast.success('Copiato!'))}>
            📋 Copia
          </button>
          <button className="btn" style={{ flex: 1, background: '#25D366', color: '#fff', border: 'none' }}
            onClick={() => window.open('https://wa.me/?text=' + encodeURIComponent(reportText), '_blank')}>
            📲 WhatsApp
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-content">
      <div className="flex items-center gap-3 mb-4" style={{ paddingTop: '0.5rem' }}>
        <button className="btn btn-ghost btn-icon" onClick={() => navigate(-1)}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <div>
          <h2>Dettaglio Partita</h2>
          <p className="text-sm text-muted">{d ? format(d, 'dd MMMM yyyy · HH:mm', { locale: it }) : '–'}</p>
        </div>
        {saving && <span className="text-xs text-muted animate-pulse" style={{ marginLeft: 'auto' }}>Salvataggio...</span>}
      </div>

      {/* Score */}
      <div className="card mb-4" style={{ textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '2rem', padding: '1rem 0' }}>
          <div>
            <div className="score-display score-red">{match.redScore}</div>
            <div className="text-xs text-muted">ROSSI</div>
          </div>
          <div style={{ fontSize: '1.5rem', color: '#4A5568' }}>—</div>
          <div>
            <div className="score-display score-blue">{match.blueScore}</div>
            <div className="text-xs text-muted">BLU</div>
          </div>
        </div>
        <button className="btn btn-gold" style={{ marginTop: '0.5rem' }} onClick={handleShowReport}>
          🏆 Genera Verdetto
        </button>
      </div>

      {/* Teams */}
      <div className="grid-2 mb-4">
        <div className="card team-red-bg">
          <h3 className="team-red-text text-sm mb-2">🔴 Squadra Rossa</h3>
          {(match.redTeam || []).map(p => <div key={p.id} style={{ fontSize: '0.9rem', padding: '0.2rem 0' }}>{p.name}</div>)}
        </div>
        <div className="card team-blue-bg">
          <h3 className="team-blue-text text-sm mb-2">🔵 Squadra Blu</h3>
          {(match.blueTeam || []).map(p => <div key={p.id} style={{ fontSize: '0.9rem', padding: '0.2rem 0' }}>{p.name}</div>)}
        </div>
      </div>

      {/* Rating section */}
      {isAdmin && match.status === 'finished' && user && (
        <RatingSection match={match} userId={user.uid} onRated={setMatch} />
      )}

      {/* Delete match */}
      {isAdmin && (
        <div style={{ marginBottom: '1rem', textAlign: 'right' }}>
          <button
            className="btn btn-danger text-sm"
            style={{ padding: '0.4rem 0.9rem', minHeight: 'auto' }}
            onClick={handleDeleteMatch}
            disabled={saving}
          >
            🗑️ Elimina Partita
          </button>
        </div>
      )}

      {/* Events */}
      <div className="card">
        <h3 className="mb-3">📋 Cronaca ({goals.length} eventi)</h3>
        {goals.length === 0 ? (
          <p className="text-muted text-sm text-center" style={{ padding: '1rem' }}>Nessun evento</p>
        ) : [...goals].sort((a, b) => a.minute - b.minute).map(ev => (
          <div key={ev.id} style={{
            display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
            padding: '0.75rem 0', borderBottom: '1px solid #2D3748',
          }}>
            <span style={{ fontSize: '0.8rem', color: '#718096', minWidth: '28px', paddingTop: '2px' }}>{ev.minute}'</span>
            <span style={{ fontSize: '1.1rem' }}>
              {ev.type === 'goal' ? (ev.team === 'red' ? '🔴⚽' : '🔵⚽') : '🤦'}
            </span>
            <div style={{ flex: 1 }}>
              {isAdmin ? (
                <input
                  className="input"
                  style={{ marginBottom: '0.25rem', padding: '0.4rem 0.6rem', fontSize: '0.875rem' }}
                  defaultValue={ev.scorerName}
                  onBlur={e => {
                    if (e.target.value !== ev.scorerName)
                      handleEditScorer(ev.id, 'scorerName', e.target.value);
                  }}
                />
              ) : (
                <div style={{ fontWeight: 500 }}>{ev.scorerName}</div>
              )}
              {ev.assistName && ev.assistName !== 'Nessuno' && (
                <div style={{ fontSize: '0.75rem', color: '#718096' }}>🎯 assist: {ev.assistName}</div>
              )}
              {ev.gkConcededName && (
                <div style={{ fontSize: '0.75rem', color: '#718096' }}>🧤 GK: {ev.gkConcededName}</div>
              )}
            </div>
            {isAdmin && (
              <button
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#FC8181', padding: '4px', marginTop: '2px' }}
                onClick={() => handleDeleteEvent(ev.id)}
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
