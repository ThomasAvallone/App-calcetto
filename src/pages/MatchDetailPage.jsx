import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getMatch, getMatches, updateMatch, deleteMatch, recalculatePlayerStats, rateMatch, recalculateRecentFormForPlayers } from '../firebase/firestore';
import useAuthStore, { selectIsAdmin } from '../store/authStore';
import usePlayersStore from '../store/playersStore';
import { generateMatchReport } from '../services/reportService';
import { generateMatchCommentary } from '../services/geminiService';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import toast from 'react-hot-toast';
import { safeDate } from '../utils/dateUtils';

function BestieSection({ match, onUpdate }) {
  const allPlayers = [...(match.redTeam || []), ...(match.blueTeam || [])];
  const [saving, setSaving] = useState(false);
  const current = match.bestieId || '';

  const assign = async (playerId, playerName) => {
    setSaving(true);
    try {
      const isClear = playerId === current;
      const newId = isClear ? null : playerId;
      const newName = isClear ? null : playerName;
      await updateMatch(match.id, { bestieId: newId, bestiePlayerName: newName });
      // recalc old and new bestie holder
      const toRecalc = [...new Set([match.bestieId, newId].filter(Boolean))];
      if (toRecalc.length) await recalculatePlayerStats(toRecalc);
      onUpdate({ ...match, bestieId: newId, bestiePlayerName: newName });
      toast.success(newId ? `🙏 Bestie assegnato a ${newName}` : '🙏 Bestie rimosso');
    } catch (e) {
      toast.error('Errore: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card mb-4" style={{ border: '1px solid rgba(252,129,129,0.25)', background: 'rgba(252,129,129,0.03)' }}>
      <h3 className="mb-1" style={{ fontSize: '0.95rem' }}>🙏 Premio Bestie</h3>
      <p className="text-xs text-muted mb-3" style={{ lineHeight: 1.5 }}>
        La "Madonna" più sincera e sentita della partita. Seleziona il giocatore, ri-clicca per rimuovere.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        {allPlayers.map(p => {
          const isSelected = current === p.id;
          return (
            <button
              key={p.id}
              disabled={saving}
              onClick={() => assign(p.id, p.name)}
              style={{
                padding: '0.4rem 0.9rem', borderRadius: '999px', fontSize: '0.82rem', fontWeight: 600,
                cursor: 'pointer', border: `1px solid ${isSelected ? '#FC8181' : '#4A5568'}`,
                background: isSelected ? 'rgba(252,129,129,0.18)' : 'rgba(74,85,104,0.25)',
                color: isSelected ? '#FC8181' : '#A0AEC0',
                transition: 'all 0.15s',
              }}
            >
              {isSelected ? '🙏 ' : ''}{p.name}
            </button>
          );
        })}
      </div>
      {current && (
        <p className="text-xs mt-2" style={{ color: '#FC8181' }}>
          Assegnato a <strong>{match.bestiePlayerName}</strong>
        </p>
      )}
    </div>
  );
}

function RatingSection({ match, userId, userName, onRated }) {
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
      await rateMatch(match.id, userId, scores, userName);
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

function weatherIcon(condition) {
  const icons = { sunny: '☀️', cloudy: '☁️', rainy: '🌧️', cold: '🥶', hot: '🔥', wind: '💨' };
  return icons[condition] || '🌤️';
}

// Estrae l'ID video da qualsiasi formato URL YouTube standard
function getYoutubeId(url) {
  if (!url) return null;
  try {
    const u = new URL(url.trim());
    if (u.hostname === 'youtu.be') return u.pathname.slice(1).split('?')[0];
    if (u.hostname.includes('youtube.com')) {
      if (u.pathname.startsWith('/shorts/')) return u.pathname.split('/shorts/')[1].split('?')[0];
      return u.searchParams.get('v');
    }
  } catch { /* url non valido */ }
  return null;
}

export default function MatchDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { role, user } = useAuthStore();
  const { players } = usePlayersStore();
  const isAdmin = useAuthStore(selectIsAdmin);

  const [match, setMatch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reportText, setReportText] = useState('');
  const [showReport, setShowReport] = useState(false);
  const [addForm, setAddForm] = useState({ type: 'goal', team: 'red', scorerId: '', assistId: '', gkId: '', minute: '' });
  const [editingEventId, setEditingEventId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [editingYoutube, setEditingYoutube] = useState(false);
  const [youtubeInput, setYoutubeInput] = useState('');
  const [showShareModal, setShowShareModal] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [showAiCommentary, setShowAiCommentary] = useState(false);
  const allMatchesRef = useRef(null);

  useEffect(() => {
    setLoading(true);
    getMatch(id).then(m => { setMatch(m); setLoading(false); }).catch(() => setLoading(false));
    getMatches().then(ms => { allMatchesRef.current = ms; });
  }, [id]);

  // Ricalcola le statistiche usando dati già in cache, evitando read extra su Firestore.
  // updatedMatch: la versione aggiornata della partita corrente (null se eliminata).
  const recalcStats = async (playerIds, updatedMatch) => {
    if (!allMatchesRef.current) {
      await recalculatePlayerStats(playerIds);
      return;
    }
    const cachedMatches = updatedMatch === null
      ? allMatchesRef.current.filter(m => m.id !== id)
      : allMatchesRef.current.map(m => m.id === updatedMatch.id ? updatedMatch : m);
    allMatchesRef.current = cachedMatches;
    await recalculatePlayerStats(playerIds, { cachedMatches, cachedPlayers: players });
  };

  if (loading) return <div className="page-content" style={{ textAlign: 'center', paddingTop: '3rem', color: '#718096' }}>Caricamento...</div>;
  if (!match) return <div className="page-content" style={{ textAlign: 'center', paddingTop: '3rem', color: '#FC8181' }}>Partita non trovata</div>;

  const d = safeDate(match.date);
  const events = match.events || [];
  const goals = events.filter(e => e.type === 'goal' || e.type === 'autogoal');

  // Fallback per partite storiche che hanno solo scorerId (senza scorerName)
  const playerById = Object.fromEntries(
    [...(match.redTeam || []), ...(match.blueTeam || [])].filter(p => p.id).map(p => [p.id, p.name])
  );
  const resolveName = (ev) => ev.scorerName || playerById[ev.scorerId] || '?';

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
      const reportDel = match.status === 'finished'
        ? { report: generateMatchReport({ ...match, events: newEvents, redScore, blueScore }, players) }
        : {};
      await updateMatch(id, { events: newEvents, redScore, blueScore, ...reportDel });
      const allIds = [...(match.redTeam || []), ...(match.blueTeam || [])].map(p => p.id);
      await recalcStats(allIds, updated);
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
      const reportSave = match.status === 'finished'
        ? { report: generateMatchReport({ ...match, events: newEvents }, players) }
        : {};
      await updateMatch(id, { events: newEvents, ...reportSave });
      const allIds = [...(match.redTeam || []), ...(match.blueTeam || [])].map(p => p.id);
      await recalcStats(allIds, { ...match, events: newEvents });
      toast.success('Evento aggiornato');
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSetTeamGk = async (team, playerId, playerName) => {
    const idField = team === 'red' ? 'redGkId' : 'blueGkId';
    const nameField = team === 'red' ? 'redGkName' : 'blueGkName';
    const current = match[idField];
    const newId = current === playerId ? null : playerId;
    const newName = current === playerId ? null : playerName;
    setSaving(true);
    try {
      await updateMatch(id, { [idField]: newId, [nameField]: newName });
      const updated = { ...match, [idField]: newId, [nameField]: newName };
      setMatch(updated);
      const allIds = [...(match.redTeam || []), ...(match.blueTeam || [])].map(p => p.id);
      await recalcStats(allIds, updated);
      toast.success(newId ? `🧤 Portiere impostato: ${newName}` : '🧤 Portiere rimosso');
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleAddEvent = async () => {
    if (!addForm.scorerId) return toast.error('Seleziona il marcatore');
    if (!addForm.gkId) return toast.error('Seleziona il portiere che ha subito il gol');
    if (addForm.minute === '') return toast.error('Inserisci il minuto');
    const teamPlayers = addForm.team === 'red' ? (match.redTeam || []) : (match.blueTeam || []);
    const oppPlayers = addForm.team === 'red' ? (match.blueTeam || []) : (match.redTeam || []);
    const scorer = teamPlayers.find(p => p.id === addForm.scorerId);
    const assist = addForm.assistId ? teamPlayers.find(p => p.id === addForm.assistId) : null;
    const gkPool = addForm.type === 'autogoal' ? teamPlayers : oppPlayers;
    const gk = addForm.gkId ? gkPool.find(p => p.id === addForm.gkId) : null;
    const newEvent = {
      id: crypto.randomUUID(),
      type: addForm.type,
      team: addForm.team,
      scorerId: scorer.id,
      scorerName: scorer.name,
      minute: parseInt(addForm.minute, 10),
      timestamp: Date.now(),
      assistId: assist?.id || null,
      assistName: assist?.name || null,
      gkConcededId: gk?.id || null,
      gkConcededName: gk?.name || null,
    };
    const newEvents = [...events, newEvent];
    let redScore = 0, blueScore = 0;
    for (const ev of newEvents) {
      if (ev.type === 'goal') { if (ev.team === 'red') redScore++; else blueScore++; }
      else if (ev.type === 'autogoal') { if (ev.team === 'red') blueScore++; else redScore++; }
    }
    const updated = { ...match, events: newEvents, redScore, blueScore };
    setMatch(updated);
    setSaving(true);
    try {
      const reportAdd = match.status === 'finished'
        ? { report: generateMatchReport({ ...match, events: newEvents, redScore, blueScore }, players) }
        : {};
      await updateMatch(id, { events: newEvents, redScore, blueScore, ...reportAdd });
      const allIds = [...(match.redTeam || []), ...(match.blueTeam || [])].map(p => p.id);
      await recalcStats(allIds, updated);
      toast.success('Evento aggiunto e statistiche ricalcolate');
      setAddForm({ type: 'goal', team: 'red', scorerId: '', assistId: '', gkId: '', minute: '' });
    } catch (e) {
      toast.error(e.message);
      setMatch(match);
    } finally {
      setSaving(false);
    }
  };

  const handleStartEdit = (ev) => {
    setEditingEventId(ev.id);
    setEditForm({
      minute: ev.minute ?? '',
      scorerId: ev.scorerId || '',
      assistId: ev.assistId || '',
      gkId: ev.gkConcededId || '',
    });
  };

  const handleSaveEvent = async () => {
    const ev = events.find(e => e.id === editingEventId);
    if (!ev) return;
    const minute = editForm.minute !== '' ? parseInt(editForm.minute, 10) : null;
    const teamPlayers = ev.team === 'red' ? (match.redTeam || []) : (match.blueTeam || []);
    const oppPlayers = ev.team === 'red' ? (match.blueTeam || []) : (match.redTeam || []);
    const scorer = teamPlayers.find(p => p.id === editForm.scorerId);
    const assist = editForm.assistId ? teamPlayers.find(p => p.id === editForm.assistId) : null;
    const gkPool = ev.type === 'autogoal' ? teamPlayers : oppPlayers;
    const gk = editForm.gkId ? gkPool.find(p => p.id === editForm.gkId) : null;
    const updates = {
      ...(editForm.minute !== '' && !isNaN(minute) ? { minute } : {}),
      ...(scorer ? { scorerId: scorer.id, scorerName: scorer.name } : {}),
      assistId: assist?.id || null,
      assistName: assist?.name || null,
      gkConcededId: gk?.id || null,
      gkConcededName: gk?.name || null,
    };
    const newEvents = events.map(e => e.id === editingEventId ? { ...e, ...updates } : e);
    setMatch(m => ({ ...m, events: newEvents }));
    setEditingEventId(null);
    setSaving(true);
    try {
      const reportEdit = match.status === 'finished'
        ? { report: generateMatchReport({ ...match, events: newEvents }, players) }
        : {};
      await updateMatch(id, { events: newEvents, ...reportEdit });
      const allIds = [...(match.redTeam || []), ...(match.blueTeam || [])].map(p => p.id);
      await recalcStats(allIds, { ...match, events: newEvents });
      toast.success('Evento aggiornato');
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleShowReport = async () => {
    const freshMatch = await getMatch(id).catch(() => null);
    const src = freshMatch || match;
    if (freshMatch) setMatch(freshMatch);
    const r = generateMatchReport(src, players);
    setReportText(r);
    setShowReport(true);
    updateMatch(id, { report: r }).catch(() => {});
  };

  const handleAiCommentary = async () => {
    if (match.aiCommentary) {
      setShowAiCommentary(v => !v);
      return;
    }
    setAiLoading(true);
    try {
      const text = await generateMatchCommentary(match, players);
      await updateMatch(id, { aiCommentary: text });
      setMatch(m => ({ ...m, aiCommentary: text }));
      setShowAiCommentary(true);
      toast.success('✨ Commento AI generato!');
    } catch (e) {
      toast.error('Errore AI: ' + e.message);
    } finally {
      setAiLoading(false);
    }
  };

  const handleSaveYoutube = async () => {
    const videoId = getYoutubeId(youtubeInput);
    if (!videoId) return toast.error('URL YouTube non valido');
    setSaving(true);
    try {
      await updateMatch(id, { youtubeUrl: youtubeInput.trim() });
      setMatch(m => ({ ...m, youtubeUrl: youtubeInput.trim() }));
      setEditingYoutube(false);
      toast.success('Video salvato');
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveYoutube = async () => {
    setSaving(true);
    try {
      await updateMatch(id, { youtubeUrl: null });
      setMatch(m => ({ ...m, youtubeUrl: null }));
      setEditingYoutube(false);
      toast.success('Video rimosso');
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteMatch = async () => {
    if (!window.confirm('Eliminare questa partita? Le statistiche verranno ricalcolate. Azione irreversibile.')) return;
    setSaving(true);
    try {
      const allIds = [...(match.redTeam || []), ...(match.blueTeam || [])].map(p => p.id);
      await deleteMatch(id);
      await recalcStats(allIds, null);
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

  // ── Share card modal ─────────────────────────────────────────────────────────
  if (showShareModal && match) {
    const goals = (match.events || [])
      .filter(e => e.type === 'goal' || e.type === 'autogoal')
      .sort((a, b) => (a.minute ?? 999) - (b.minute ?? 999));
    const winner = match.redScore > match.blueScore ? 'red' : match.blueScore > match.redScore ? 'blue' : null;
    const mvpEntry = (() => {
      const cnt = {};
      (match.events || []).forEach(e => {
        if (e.type === 'goal' && e.scorerId) {
          if (!cnt[e.scorerId]) cnt[e.scorerId] = { name: e.scorerName, n: 0 };
          cnt[e.scorerId].n++;
        }
      });
      return Object.values(cnt).sort((a, b) => b.n - a.n)[0] || null;
    })();
    const shareText = [
      `⚽ *Calcetto — Risultato*`,
      `🔴 Rosso ${match.redScore} – ${match.blueScore} Blu 🔵`,
      winner === 'red' ? '🏆 Vittoria Rosso' : winner === 'blue' ? '🏆 Vittoria Blu' : '🤝 Pareggio',
      '',
      ...goals.map(g =>
        `${g.team === 'red' ? '🔴' : '🔵'} ${g.type === 'autogoal' ? `✗ ${g.scorerName}` : g.scorerName}${g.assistName ? ` (${g.assistName})` : ''}${g.minute ? ` ${g.minute}'` : ''}`
      ),
    ].join('\n');
    const handleShare = () => {
      if (typeof navigator.share === 'function') {
        navigator.share({ title: 'Risultato Calcetto', text: shareText }).catch(() => {});
      } else {
        window.open('https://api.whatsapp.com/send?text=' + encodeURIComponent(shareText), '_blank');
      }
    };
    return (
      <div className="modal-overlay">
        <div className="modal animate-slide-up" style={{ maxHeight: '92vh', overflowY: 'auto' }}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="modal-title" style={{ marginBottom: 0 }}>📤 Condividi Risultato</h2>
            <button className="btn btn-ghost btn-icon" onClick={() => setShowShareModal(false)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>

          {/* Visual card */}
          <div style={{ borderRadius: '12px', background: 'linear-gradient(135deg, rgba(252,129,129,0.08) 0%, rgba(99,179,237,0.08) 100%)', border: '1px solid rgba(255,255,255,0.08)', padding: '1.25rem', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', marginBottom: '0.75rem' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.65rem', color: '#FC8181', fontWeight: 700, letterSpacing: '0.08em', marginBottom: '0.25rem' }}>🔴 ROSSO</div>
                <div style={{ fontSize: '3rem', fontWeight: 900, lineHeight: 1, color: winner === 'red' ? '#FC8181' : '#A0AEC0' }}>{match.redScore}</div>
              </div>
              <div style={{ fontSize: '1.2rem', color: '#4A5568', fontWeight: 300 }}>–</div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.65rem', color: '#63B3ED', fontWeight: 700, letterSpacing: '0.08em', marginBottom: '0.25rem' }}>🔵 BLU</div>
                <div style={{ fontSize: '3rem', fontWeight: 900, lineHeight: 1, color: winner === 'blue' ? '#63B3ED' : '#A0AEC0' }}>{match.blueScore}</div>
              </div>
            </div>
            <div style={{ textAlign: 'center', fontSize: '0.8rem', fontWeight: 700, color: winner === 'red' ? '#FC8181' : winner === 'blue' ? '#63B3ED' : '#F6E05E', marginBottom: '0.75rem' }}>
              {winner === 'red' ? '🏆 Vittoria Rosso' : winner === 'blue' ? '🏆 Vittoria Blu' : '🤝 Pareggio'}
            </div>
            {goals.length > 0 && (
              <div style={{ fontSize: '0.72rem', color: '#A0AEC0', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '0.6rem' }}>
                {goals.map((g, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.15rem 0' }}>
                    <span>{g.team === 'red' ? '🔴' : '🔵'} {g.type === 'autogoal' ? `✗ ${g.scorerName}` : g.scorerName}{g.assistName ? ` (${g.assistName})` : ''}</span>
                    <span style={{ color: '#718096' }}>{g.minute ? `${g.minute}'` : ''}</span>
                  </div>
                ))}
              </div>
            )}
            {mvpEntry && mvpEntry.n >= 2 && (
              <div style={{ marginTop: '0.6rem', paddingTop: '0.6rem', borderTop: '1px solid rgba(255,255,255,0.06)', textAlign: 'center', fontSize: '0.75rem', color: '#F6E05E' }}>
                ⭐ MVP: <strong>{mvpEntry.name}</strong> ({mvpEntry.n} gol)
              </div>
            )}
          </div>

          <button className="btn btn-full" style={{ background: '#25D366', color: '#fff', fontWeight: 700, border: 'none' }}
            onClick={handleShare}>
            {typeof navigator.share === 'function' ? '📤 Condividi' : '💬 Condividi su WhatsApp'}
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
        {match.weather?.condition && (
          <div style={{ fontSize: '0.75rem', color: '#718096', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}>
            <span>{weatherIcon(match.weather.condition)}</span>
            <span>{match.weather.description || match.weather.condition}</span>
            {match.weather.temp && <span>· {match.weather.temp}°C</span>}
          </div>
        )}
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
        <div className="flex gap-2" style={{ marginTop: '0.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-gold" onClick={handleShowReport}>
            🏆 Genera Verdetto
          </button>
          {isAdmin && match.status === 'finished' && (
            <button className="btn" onClick={handleAiCommentary} disabled={aiLoading}
              style={{ background: 'linear-gradient(135deg, #667eea 0%, #9f7aea 100%)', color: '#fff', border: 'none', fontWeight: 700 }}>
              {aiLoading ? '⏳' : '✨'} {match.aiCommentary ? (showAiCommentary ? 'Nascondi AI' : 'Commento AI') : 'Genera AI'}
            </button>
          )}
          {match.status === 'finished' && (
            <button className="btn" style={{ background: '#25D366', color: '#fff', border: 'none', fontWeight: 700 }}
              onClick={() => setShowShareModal(true)}>
              📤 Condividi
            </button>
          )}
        </div>
      </div>

      {/* AI Commentary Card */}
      {showAiCommentary && match.aiCommentary && (
        <div className="card mb-4" style={{ border: '1px solid rgba(159,122,234,0.4)', background: 'rgba(102,126,234,0.05)' }}>
          <div className="flex items-center justify-between mb-3">
            <h3 style={{ fontSize: '0.95rem', margin: 0 }}>✨ Commento AI</h3>
            <button
              onClick={async () => {
                setMatch(m => ({ ...m, aiCommentary: null }));
                setShowAiCommentary(false);
                await updateMatch(id, { aiCommentary: null });
              }}
              style={{ fontSize: '0.7rem', color: '#718096', background: 'none', border: 'none', cursor: 'pointer' }}>
              ↺ Rigenera
            </button>
          </div>
          <p style={{ fontSize: '0.85rem', color: '#CBD5E0', lineHeight: 1.75, margin: 0, whiteSpace: 'pre-wrap' }}>
            {match.aiCommentary}
          </p>
          <div className="flex gap-2" style={{ marginTop: '1rem' }}>
            <button className="btn" style={{ flex: 1, fontSize: '0.8rem' }}
              onClick={() => navigator.clipboard.writeText(match.aiCommentary).then(() => toast.success('Copiato!'))}>
              📋 Copia
            </button>
            <button className="btn" style={{ flex: 1, fontSize: '0.8rem', background: '#25D366', color: '#fff', border: 'none' }}
              onClick={() => window.open('https://wa.me/?text=' + encodeURIComponent(match.aiCommentary), '_blank')}>
              📲 WhatsApp
            </button>
          </div>
        </div>
      )}

      {/* YouTube Video */}
      {match.status === 'finished' && (() => {
        const videoId = getYoutubeId(match.youtubeUrl);
        if (videoId) {
          return (
            <div className="card mb-4" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0 }}>
                <iframe
                  src={`https://www.youtube.com/embed/${videoId}`}
                  title="Video partita"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none' }}
                />
              </div>
              {isAdmin && (
                <div className="flex gap-2" style={{ padding: '0.6rem' }}>
                  {editingYoutube ? (
                    <>
                      <input
                        className="input"
                        style={{ flex: 1, fontSize: '0.82rem', padding: '0.35rem 0.5rem' }}
                        placeholder="Nuovo URL YouTube..."
                        value={youtubeInput}
                        onChange={e => setYoutubeInput(e.target.value)}
                        autoFocus
                      />
                      <button className="btn btn-teal" style={{ padding: '0.35rem 0.75rem', minHeight: 'auto', fontSize: '0.82rem' }}
                        onClick={handleSaveYoutube} disabled={saving}>Salva</button>
                      <button className="btn btn-ghost" style={{ padding: '0.35rem 0.6rem', minHeight: 'auto', fontSize: '0.82rem' }}
                        onClick={() => setEditingYoutube(false)}>✕</button>
                    </>
                  ) : (
                    <>
                      <button className="btn btn-ghost text-sm" style={{ padding: '0.35rem 0.75rem', minHeight: 'auto' }}
                        onClick={() => { setYoutubeInput(match.youtubeUrl || ''); setEditingYoutube(true); }}>
                        ✏️ Cambia URL
                      </button>
                      <button className="btn btn-danger text-sm" style={{ padding: '0.35rem 0.75rem', minHeight: 'auto' }}
                        onClick={handleRemoveYoutube} disabled={saving}>
                        🗑️ Rimuovi
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        }
        if (isAdmin) {
          return (
            <div className="card mb-4" style={{ border: '1px dashed rgba(79,209,197,0.3)', background: 'rgba(79,209,197,0.03)' }}>
              {editingYoutube ? (
                <div>
                  <p className="text-sm text-muted mb-2">Incolla il link YouTube della partita (youtube.com o youtu.be)</p>
                  <div className="flex gap-2">
                    <input
                      className="input"
                      style={{ flex: 1, fontSize: '0.85rem' }}
                      placeholder="https://youtu.be/..."
                      value={youtubeInput}
                      onChange={e => setYoutubeInput(e.target.value)}
                      autoFocus
                    />
                    <button className="btn btn-teal" style={{ padding: '0.5rem 0.9rem', minHeight: 'auto' }}
                      onClick={handleSaveYoutube} disabled={saving}>
                      Salva
                    </button>
                    <button className="btn btn-ghost" style={{ padding: '0.5rem 0.6rem', minHeight: 'auto' }}
                      onClick={() => setEditingYoutube(false)}>✕</button>
                  </div>
                </div>
              ) : (
                <button
                  className="btn btn-ghost btn-full"
                  style={{ color: '#4FD1C5', border: 'none', background: 'none' }}
                  onClick={() => { setYoutubeInput(''); setEditingYoutube(true); }}
                >
                  📹 Aggiungi video YouTube
                </button>
              )}
            </div>
          );
        }
        return null;
      })()}

      {/* Teams */}
      <div className="grid-2 mb-4">
        {[
          { team: 'red', players: match.redTeam || [], gkId: match.redGkId, label: '🔴 Squadra Rossa', cls: 'team-red' },
          { team: 'blue', players: match.blueTeam || [], gkId: match.blueGkId, label: '🔵 Squadra Blu', cls: 'team-blue' },
        ].map(({ team, players, gkId, label, cls }) => (
          <div key={team} className={`card ${cls}-bg`}>
            <h3 className={`${cls}-text text-sm mb-2`}>{label}</h3>
            {players.map(p => (
              <div key={p.id} style={{ fontSize: '0.9rem', padding: '0.2rem 0', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                {p.id === gkId
                  ? <span title="Portiere" style={{ fontSize: '0.8rem', cursor: isAdmin ? 'pointer' : 'default' }}
                      onClick={() => isAdmin && handleSetTeamGk(team, p.id, p.name)}>🧤</span>
                  : isAdmin
                    ? <span title="Imposta portiere" style={{ fontSize: '0.75rem', opacity: 0.3, cursor: 'pointer' }}
                        onClick={() => handleSetTeamGk(team, p.id, p.name)}>🧤</span>
                    : null
                }
                {p.name}
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Rating section */}
      {isAdmin && match.status === 'finished' && user && (
        <RatingSection match={match} userId={user.uid} userName={user?.displayName || user?.email || ''} onRated={setMatch} />
      )}

      {/* Bestie award – admin only */}
      {isAdmin && match.status === 'finished' && (
        <BestieSection match={match} onUpdate={setMatch} />
      )}

      {/* SuperAdmin: all admin ratings */}
      {role === 'superadmin' && match.ratings && Object.keys(match.ratings).length > 0 && (
        <div className="card mb-4" style={{ border: '1px solid rgba(246,173,85,0.25)', background: 'rgba(246,173,85,0.03)' }}>
          <h3 className="mb-3" style={{ fontSize: '0.95rem' }}>👑 Voti degli Admin</h3>
          {Object.entries(match.ratings).map(([uid, rating]) => (
            <div key={uid} style={{ marginBottom: '0.75rem', paddingBottom: '0.75rem', borderBottom: '1px solid #2D3748' }}>
              <div style={{ fontWeight: 600, fontSize: '0.82rem', color: '#F6AD55', marginBottom: '0.35rem' }}>
                {rating.raterName || uid.slice(0, 8) + '…'}
              </div>
              {[...(match.redTeam || []), ...(match.blueTeam || [])].map(p => {
                const s = rating.scores?.[p.id];
                if (s == null) return null;
                const c = s >= 7 ? '#68D391' : s >= 5 ? '#F6E05E' : '#FC8181';
                const isRed = (match.redTeam || []).some(r => r.id === p.id);
                return (
                  <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.2rem 0.5rem' }}>
                    <span style={{ fontSize: '0.82rem', color: '#A0AEC0' }}>{isRed ? '🔴' : '🔵'} {p.name}</span>
                    <span style={{ fontWeight: 700, color: c, fontSize: '0.85rem' }}>{s}/10</span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
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
      <div className="card" style={{ marginBottom: '1rem' }}>
        <h3 className="mb-3">📋 Cronaca ({goals.length} eventi)</h3>
        {goals.length === 0 ? (
          <p className="text-muted text-sm text-center" style={{ padding: '1rem' }}>Nessun evento</p>
        ) : [...goals].sort((a, b) => (a.minute ?? 999) - (b.minute ?? 999)).map(ev => {
          const isEditing = isAdmin && editingEventId === ev.id;
          return (
            <div key={ev.id} style={{ borderBottom: '1px solid #2D3748' }}>
              {isEditing ? (() => {
                const editTeamPlayers = ev.team === 'red' ? (match.redTeam || []) : (match.blueTeam || []);
                const editOppPlayers = ev.team === 'red' ? (match.blueTeam || []) : (match.redTeam || []);
                const editGkPlayers = ev.type === 'autogoal' ? editTeamPlayers : editOppPlayers;
                return (
                <div style={{ padding: '0.75rem 0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <span style={{ fontSize: '1rem', flexShrink: 0 }}>
                      {ev.type === 'goal' ? (ev.team === 'red' ? '🔴⚽' : '🔵⚽') : '🤦'}
                    </span>
                    <input
                      type="number" min="0" max="120" className="input"
                      style={{ width: '60px', padding: '0.35rem 0.4rem', fontSize: '0.85rem', textAlign: 'center' }}
                      placeholder="min"
                      value={editForm.minute}
                      onChange={e => setEditForm(f => ({ ...f, minute: e.target.value }))}
                    />
                    <select
                      className="input"
                      style={{ flex: 1, padding: '0.35rem 0.5rem', fontSize: '0.875rem' }}
                      value={editForm.scorerId}
                      onChange={e => setEditForm(f => ({ ...f, scorerId: e.target.value }))}
                    >
                      <option value="">– Marcatore –</option>
                      {editTeamPlayers.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                  <select
                    className="input"
                    style={{ width: '100%', marginBottom: '0.4rem', padding: '0.3rem 0.5rem', fontSize: '0.8rem' }}
                    value={editForm.assistId}
                    onChange={e => setEditForm(f => ({ ...f, assistId: e.target.value }))}
                  >
                    <option value="">🎯 Assist – Nessuno</option>
                    {editTeamPlayers.filter(p => p.id !== editForm.scorerId).map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  <select
                    className="input"
                    style={{ width: '100%', marginBottom: '0.5rem', padding: '0.3rem 0.5rem', fontSize: '0.8rem' }}
                    value={editForm.gkId}
                    onChange={e => setEditForm(f => ({ ...f, gkId: e.target.value }))}
                  >
                    <option value="">🧤 Portiere subito – Nessuno</option>
                    {editGkPlayers.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="btn btn-teal" style={{ flex: 1, padding: '0.4rem', fontSize: '0.85rem' }}
                      onClick={handleSaveEvent} disabled={saving}>
                      ✓ Salva
                    </button>
                    <button className="btn btn-ghost" style={{ flex: 1, padding: '0.4rem', fontSize: '0.85rem' }}
                      onClick={() => setEditingEventId(null)}>
                      Annulla
                    </button>
                  </div>
                </div>
                );
              })() : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 0' }}>
                  <span style={{ fontSize: '0.8rem', color: '#718096', minWidth: '28px', flexShrink: 0 }}>
                    {ev.minute != null ? `${ev.minute}'` : '—'}
                  </span>
                  <span style={{ fontSize: '1rem', flexShrink: 0 }}>
                    {ev.type === 'goal' ? (ev.team === 'red' ? '🔴⚽' : '🔵⚽') : '🤦'}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>{resolveName(ev)}</div>
                    {ev.assistName && ev.assistName !== 'Nessuno' && (
                      <div style={{ fontSize: '0.75rem', color: '#718096' }}>🎯 {ev.assistName}</div>
                    )}
                    {ev.gkConcededName && (
                      <div style={{ fontSize: '0.75rem', color: '#718096' }}>🧤 {ev.gkConcededName}</div>
                    )}
                  </div>
                  {isAdmin && (
                    <div style={{ display: 'flex', gap: '2px', flexShrink: 0 }}>
                      <button
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#A0AEC0', padding: '4px 6px', fontSize: '0.9rem' }}
                        onClick={() => handleStartEdit(ev)}
                      >✏️</button>
                      <button
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#FC8181', padding: '4px 6px', fontSize: '0.9rem' }}
                        onClick={() => handleDeleteEvent(ev.id)}
                      >✕</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add event form – admin only */}
      {isAdmin && (
        <div className="card" style={{ border: '1px solid rgba(79,209,197,0.25)' }}>
          <h3 className="mb-3" style={{ fontSize: '0.95rem' }}>➕ Aggiungi Evento</h3>

          {/* Type */}
          <div className="flex gap-2 mb-3">
            {['goal', 'autogoal'].map(t => (
              <button key={t} onClick={() => setAddForm(f => ({ ...f, type: t }))}
                className="btn" style={{ flex: 1,
                  background: addForm.type === t ? (t === 'goal' ? 'rgba(79,209,197,0.2)' : 'rgba(246,224,94,0.15)') : 'transparent',
                  border: `1px solid ${addForm.type === t ? (t === 'goal' ? '#4FD1C5' : '#F6E05E') : '#2D3748'}`,
                  color: addForm.type === t ? (t === 'goal' ? '#4FD1C5' : '#F6E05E') : '#718096',
                }}>
                {t === 'goal' ? '⚽ Goal' : '🤦 Autogoal'}
              </button>
            ))}
          </div>

          {/* Team */}
          <div className="flex gap-2 mb-3">
            {[['red', '🔴 Rossi'], ['blue', '🔵 Blu']].map(([val, label]) => (
              <button key={val} onClick={() => setAddForm(f => ({ ...f, team: val, scorerId: '', assistId: '', gkId: '' }))}
                className="btn" style={{ flex: 1,
                  background: addForm.team === val ? (val === 'red' ? 'rgba(252,129,129,0.15)' : 'rgba(99,179,237,0.15)') : 'transparent',
                  border: `1px solid ${addForm.team === val ? (val === 'red' ? '#FC8181' : '#63B3ED') : '#2D3748'}`,
                  color: addForm.team === val ? (val === 'red' ? '#FC8181' : '#63B3ED') : '#718096',
                }}>
                {label}
              </button>
            ))}
          </div>

          {/* Scorer */}
          <label className="text-xs text-muted" style={{ display: 'block', marginBottom: '0.3rem' }}>Marcatore *</label>
          <select className="input mb-3" value={addForm.scorerId}
            onChange={e => setAddForm(f => ({ ...f, scorerId: e.target.value }))}>
            <option value="">– Seleziona –</option>
            {(addForm.team === 'red' ? (match.redTeam || []) : (match.blueTeam || [])).map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          {/* Assist */}
          <label className="text-xs text-muted" style={{ display: 'block', marginBottom: '0.3rem' }}>Assist (opzionale)</label>
          <select className="input mb-3" value={addForm.assistId}
            onChange={e => setAddForm(f => ({ ...f, assistId: e.target.value }))}>
            <option value="">– Nessuno –</option>
            {(addForm.team === 'red' ? (match.redTeam || []) : (match.blueTeam || []))
              .filter(p => p.id !== addForm.scorerId).map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          {/* GK conceded */}
          <label className="text-xs text-muted" style={{ display: 'block', marginBottom: '0.3rem' }}>Portiere subito *</label>
          <select className="input mb-3" value={addForm.gkId}
            onChange={e => setAddForm(f => ({ ...f, gkId: e.target.value }))}>
            <option value="">– Seleziona portiere –</option>
            {(addForm.type === 'autogoal'
              ? (addForm.team === 'red' ? (match.redTeam || []) : (match.blueTeam || []))
              : (addForm.team === 'red' ? (match.blueTeam || []) : (match.redTeam || []))
            ).map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          {/* Minute */}
          <label className="text-xs text-muted" style={{ display: 'block', marginBottom: '0.3rem' }}>Minuto *</label>
          <input type="number" className="input mb-3" min="0" max="120" placeholder="es. 23"
            value={addForm.minute} onChange={e => setAddForm(f => ({ ...f, minute: e.target.value }))} />

          <button className="btn btn-teal btn-full" onClick={handleAddEvent} disabled={saving}>
            {saving ? '⏳ Salvataggio...' : '✅ Aggiungi Evento'}
          </button>
        </div>
      )}
    </div>
  );
}
