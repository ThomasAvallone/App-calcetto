import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import useMatchStore, { GK_TURN_DURATION } from '../store/matchStore';
import usePlayersStore from '../store/playersStore';
import useAuthStore from '../store/authStore';
import { generateMatchReport } from '../services/reportService';
import { exportMatchToSheets } from '../services/sheetsService';
import { recalculatePlayerStats } from '../firebase/firestore';
import toast from 'react-hot-toast';

const GK_INTERVAL = 6 * 60; // 6 minutes in seconds
const TOTAL_SECONDS = 60 * 60;

function pad(n) { return String(Math.floor(n)).padStart(2, '0'); }
function formatTime(secs) { return `${pad(secs / 60)}:${pad(secs % 60)}`; }

export default function MatchPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { role } = useAuthStore();
  const { players } = usePlayersStore();
  const isAdmin = role === 'admin';

  const {
    match, activeMatchId, timerState, gkRotation, currentGk,
    loadMatch, unloadMatch, startTimer, pauseTimer, getElapsedSeconds,
    updateCurrentGks, overrideGk, openGoalModal, closeGoalModal, goalModal,
    recordGoal, recordAutogoal, deleteEvent, endMatch,
  } = useMatchStore();

  const [displayTime, setDisplayTime] = useState(0);
  const [gkAlert, setGkAlert] = useState(null); // { red: GkTurn, blue: GkTurn } | null
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [goalTeam, setGoalTeam] = useState(null);
  const [goalScorerModal, setGoalScorerModal] = useState(false);
  const [selectedScorer, setSelectedScorer] = useState(null);
  const [autogoalMode, setAutogoalMode] = useState(false);
  const [pendingAssist, setPendingAssist] = useState(false);
  const [assistTimeout, setAssistTimeout] = useState(null);
  const [assistCountdown, setAssistCountdown] = useState(5);
  const [overrideModal, setOverrideModal] = useState(null); // 'red' | 'blue'
  const [reportModal, setReportModal] = useState(false);
  const [reportText, setReportText] = useState('');
  const [endConfirm, setEndConfirm] = useState(false);
  const [ending, setEnding] = useState(false);

  const timerRef = useRef(null);
  const prevTurnRef = useRef({ red: -1, blue: -1 });

  // Load match on mount
  useEffect(() => {
    if (id !== activeMatchId) {
      loadMatch(id);
    }
    return () => unloadMatch();
  }, [id]);

  // Timer display update loop
  useEffect(() => {
    timerRef.current = setInterval(() => {
      const elapsed = getElapsedSeconds();
      setDisplayTime(elapsed);
      updateCurrentGks();

      // GK rotation alert check
      const { gkRotation: rot } = useMatchStore.getState();
      const currentTurnIndex = Math.floor(elapsed / GK_INTERVAL);
      const prevRed = prevTurnRef.current.red;
      const prevBlue = prevTurnRef.current.blue;

      if (currentTurnIndex !== prevRed || currentTurnIndex !== prevBlue) {
        const redTurn = rot.red[currentTurnIndex];
        const blueTurn = rot.blue[currentTurnIndex];
        if (
          (currentTurnIndex !== prevRed && redTurn) ||
          (currentTurnIndex !== prevBlue && blueTurn)
        ) {
          if (elapsed > 0 && elapsed % GK_INTERVAL < 3) {
            setGkAlert({ red: redTurn, blue: blueTurn });
          }
        }
        prevTurnRef.current = { red: currentTurnIndex, blue: currentTurnIndex };
      }
    }, 500);

    return () => clearInterval(timerRef.current);
  }, [timerState]);

  // Assist countdown
  useEffect(() => {
    if (pendingAssist) {
      setAssistCountdown(5);
      const interval = setInterval(() => {
        setAssistCountdown(prev => {
          if (prev <= 1) {
            clearInterval(interval);
            handleAssistSelected(null, null); // auto-close
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [pendingAssist]);

  if (!match) {
    return (
      <div className="page-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="spinner" style={{ margin: '0 auto 1rem', width: 40, height: 40 }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#4FD1C5" strokeWidth="2.5" className="spinner">
              <circle cx="12" cy="12" r="10" strokeOpacity="0.2" />
              <path d="M12 2a10 10 0 0110 10" />
            </svg>
          </div>
          <p className="text-muted">Caricamento partita...</p>
        </div>
      </div>
    );
  }

  const isRunning = timerState.isRunning;
  const isFinished = match.status === 'finished';
  const remaining = Math.max(0, TOTAL_SECONDS - displayTime);
  const progress = (displayTime / TOTAL_SECONDS) * 100;
  const isNearEnd = remaining < 5 * 60;

  const redTeam = match.redTeam || [];
  const blueTeam = match.blueTeam || [];

  const currentRedGk = currentGk.red;
  const currentBlueGk = currentGk.blue;

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleTimerToggle = () => {
    if (isRunning) pauseTimer();
    else startTimer();
  };

  const handleGoalTap = (team) => {
    if (!isAdmin || isFinished) return;
    setGoalTeam(team);
    setAutogoalMode(false);
    setSelectedScorer(null);
    setGoalScorerModal(true);
  };

  const handleAutogoalTap = (team) => {
    if (!isAdmin || isFinished) return;
    setGoalTeam(team);
    setAutogoalMode(true);
    setSelectedScorer(null);
    setGoalScorerModal(true);
  };

  const handleScorerSelected = (player) => {
    setSelectedScorer(player);
    setGoalScorerModal(false);
    if (autogoalMode) {
      recordAutogoal({ team: goalTeam, scorerId: player.id, scorerName: player.name });
      toast.success(`🤦 Autogol di ${player.name}`);
    } else {
      setPendingAssist(true);
    }
  };

  const handleAssistSelected = async (player, name) => {
    setPendingAssist(false);
    if (assistTimeout) clearTimeout(assistTimeout);
    if (!selectedScorer) return;
    await recordGoal({
      team: goalTeam,
      scorerId: selectedScorer.id,
      scorerName: selectedScorer.name,
      assistId: player?.id || null,
      assistName: player?.name || name || null,
    });
    toast.success(`⚽ Gol di ${selectedScorer.name}${player ? ` (assist: ${player.name})` : ''}!`);
    setSelectedScorer(null);
    setGoalTeam(null);
  };

  const handleGkOverride = async (team, player) => {
    overrideGk(team, player.id, player.name);
    setOverrideModal(null);
    toast.success(`🧤 Portiere ${team === 'red' ? 'Rossi' : 'Blu'}: ${player.name}`);
  };

  const handleEndMatch = async () => {
    setEnding(true);
    setEndConfirm(false);
    try {
      await endMatch();
      // Recalculate stats for all players in this match
      const allIds = [
        ...(match.redTeam || []).map(p => p.id),
        ...(match.blueTeam || []).map(p => p.id),
      ];
      await recalculatePlayerStats(allIds);
      // Export to Google Sheets
      await exportMatchToSheets(match, players).catch(() => {});

      // Show report
      const report = generateMatchReport(match, players);
      setReportText(report);
      setReportModal(true);
    } catch (e) {
      toast.error('Errore: ' + e.message);
    } finally {
      setEnding(false);
    }
  };

  const teamPlayers = goalTeam === 'red' ? redTeam : blueTeam;
  const scorerLabel = autogoalMode ? 'Chi ha fatto autogol?' : `Gol ${goalTeam === 'red' ? '🔴 Rosso' : '🔵 Blu'} — Chi ha segnato?`;

  // ── GK Alert Modal ──────────────────────────────────────────────────────────
  if (gkAlert) {
    return (
      <div className="modal-overlay">
        <div className="modal animate-slide-up">
          <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
            <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>🔄</div>
            <h2 className="modal-title">Rotazione Portieri!</h2>
            <p className="text-secondary text-sm">Cambio turno — 6 minuti completati</p>
          </div>

          <div className="grid-2 mb-4">
            <div className="card team-red-bg" style={{ textAlign: 'center' }}>
              <div className="text-xs team-red-text mb-1">🔴 Portiere Rossi</div>
              <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>{gkAlert.red?.name || '–'}</div>
            </div>
            <div className="card team-blue-bg" style={{ textAlign: 'center' }}>
              <div className="text-xs team-blue-text mb-1">🔵 Portiere Blu</div>
              <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>{gkAlert.blue?.name || '–'}</div>
            </div>
          </div>

          <div className="flex gap-3">
            <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => {
              setOverrideModal('red'); setGkAlert(null);
            }}>
              ✏️ Cambia Rossi
            </button>
            <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => {
              setOverrideModal('blue'); setGkAlert(null);
            }}>
              ✏️ Cambia Blu
            </button>
          </div>
          <button className="btn btn-teal btn-full mt-2" onClick={() => setGkAlert(null)}>
            ✅ Confermo — Si gioca!
          </button>
        </div>
      </div>
    );
  }

  // ── Scorer Selection Modal ──────────────────────────────────────────────────
  if (goalScorerModal) {
    return (
      <div className="modal-overlay">
        <div className="modal animate-slide-up">
          <h2 className="modal-title">{scorerLabel}</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '60vh', overflowY: 'auto' }}>
            {teamPlayers.map(p => (
              <button
                key={p.id}
                className="btn btn-ghost"
                style={{ justifyContent: 'flex-start', padding: '0.875rem 1rem' }}
                onClick={() => handleScorerSelected(p)}
              >
                <span style={{ fontSize: '1.2rem' }}>{getRoleIcon(p.primaryRole)}</span>
                {p.name}
              </button>
            ))}
          </div>
          <button className="btn btn-ghost btn-full mt-2" onClick={() => setGoalScorerModal(false)}>
            ✕ Annulla
          </button>
        </div>
      </div>
    );
  }

  // ── Assist Modal (5s countdown) ─────────────────────────────────────────────
  if (pendingAssist && selectedScorer) {
    const otherTeamPlayers = goalTeam === 'red' ? redTeam : blueTeam;
    return (
      <div className="modal-overlay">
        <div className="modal animate-slide-up">
          <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.25rem' }}>🎯</div>
            <h2 className="modal-title">Assist per {selectedScorer.name}?</h2>
            <div style={{
              fontSize: '2rem', fontWeight: 900, color: '#F6E05E',
              margin: '0.5rem 0',
            }}>
              {assistCountdown}s
            </div>
            <div className="progress-bar" style={{ marginBottom: '1rem' }}>
              <div className="progress-bar-fill" style={{ width: `${(assistCountdown / 5) * 100}%`, background: '#F6E05E' }} />
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '45vh', overflowY: 'auto' }}>
            {otherTeamPlayers.filter(p => p.id !== selectedScorer?.id).map(p => (
              <button key={p.id} className="btn btn-ghost"
                style={{ justifyContent: 'flex-start', padding: '0.875rem 1rem' }}
                onClick={() => handleAssistSelected(p, null)}>
                <span style={{ fontSize: '1.1rem' }}>{getRoleIcon(p.primaryRole)}</span>
                {p.name}
              </button>
            ))}
          </div>
          <button
            className="btn btn-red btn-full mt-2"
            onClick={() => handleAssistSelected(null, 'Nessuno')}>
            — Nessun Assist
          </button>
        </div>
      </div>
    );
  }

  // ── Override GK Modal ───────────────────────────────────────────────────────
  if (overrideModal) {
    const teamList = overrideModal === 'red' ? redTeam : blueTeam;
    return (
      <div className="modal-overlay">
        <div className="modal animate-slide-up">
          <h2 className="modal-title">
            Scegli Portiere {overrideModal === 'red' ? '🔴 Rossi' : '🔵 Blu'}
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {teamList.map(p => (
              <button key={p.id} className="btn btn-ghost"
                style={{ justifyContent: 'flex-start', padding: '0.875rem 1rem' }}
                onClick={() => handleGkOverride(overrideModal, p)}>
                🧤 {p.name}
              </button>
            ))}
          </div>
          <button className="btn btn-ghost btn-full mt-2" onClick={() => setOverrideModal(null)}>
            ✕ Annulla
          </button>
        </div>
      </div>
    );
  }

  // ── End Confirm Modal ───────────────────────────────────────────────────────
  if (endConfirm) {
    return (
      <div className="modal-overlay">
        <div className="modal animate-slide-up" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>🏁</div>
          <h2 className="modal-title">Terminare la Partita?</h2>
          <p className="text-secondary mb-4">
            Risultato finale: 🔴 {match.redScore} — {match.blueScore} 🔵
          </p>
          <div className="flex gap-3">
            <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setEndConfirm(false)}>
              Annulla
            </button>
            <button className="btn btn-danger" style={{ flex: 1 }} onClick={handleEndMatch} disabled={ending}>
              {ending ? '⏳...' : '🏁 Fine!'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Report Modal ─────────────────────────────────────────────────────────────
  if (reportModal) {
    return (
      <div className="modal-overlay">
        <div className="modal animate-slide-up">
          <div className="flex items-center justify-between mb-3">
            <h2 className="modal-title" style={{ marginBottom: 0 }}>🏆 Verdetto Finale</h2>
            <button className="btn btn-ghost btn-icon" onClick={() => { setReportModal(false); navigate('/'); }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
          <pre style={{ fontFamily: 'Inter, monospace', fontSize: '0.78rem', color: '#A0AEC0', whiteSpace: 'pre-wrap', lineHeight: 1.6, maxHeight: '60vh', overflowY: 'auto' }}>
            {reportText}
          </pre>
          <button className="btn btn-teal btn-full mt-3"
            onClick={() => navigator.clipboard.writeText(reportText).then(() => toast.success('Copiato!'))}>
            📋 Copia Verdetto
          </button>
          <button className="btn btn-ghost btn-full mt-2"
            onClick={() => { setReportModal(false); navigate('/'); }}>
            Torna alla Home
          </button>
        </div>
      </div>
    );
  }

  // ── Main Match UI ───────────────────────────────────────────────────────────
  return (
    <div className="page-content" style={{ paddingTop: '1rem' }}>

      {/* Timer */}
      <div className="card mb-4" style={{ textAlign: 'center', padding: '2rem 1.5rem' }}>
        <div className={`timer-display ${!isRunning ? 'paused' : ''} ${isNearEnd && isRunning ? 'ending' : ''}`}>
          {formatTime(remaining)}
        </div>
        <div className="text-sm text-muted mb-3">
          {isFinished ? '⏹ Partita conclusa' : isRunning ? '⏱ In corso...' : '⏸ In pausa'}
        </div>
        <div className="progress-bar mb-4">
          <div className="progress-bar-fill" style={{
            width: `${progress}%`,
            background: isNearEnd ? '#FC8181' : '#4FD1C5',
          }} />
        </div>

        {/* Score */}
        <div className="flex items-center justify-center gap-4 mb-4">
          <div style={{ textAlign: 'center' }}>
            <div className="score-display score-red">{match.redScore ?? 0}</div>
            <div className="text-xs text-muted">ROSSI</div>
          </div>
          <div style={{ fontSize: '1.5rem', color: '#4A5568', fontWeight: 300 }}>—</div>
          <div style={{ textAlign: 'center' }}>
            <div className="score-display score-blue">{match.blueScore ?? 0}</div>
            <div className="text-xs text-muted">BLU</div>
          </div>
        </div>

        {/* Controls */}
        {isAdmin && !isFinished && (
          <div className="flex gap-3">
            <button
              className={`btn ${isRunning ? 'btn-red' : 'btn-teal'} btn-lg`}
              style={{ flex: 2 }}
              onClick={handleTimerToggle}
            >
              {isRunning ? '⏸ Pausa' : '▶ Avvia'}
            </button>
            <button
              className="btn btn-ghost"
              style={{ flex: 1 }}
              onClick={() => setEndConfirm(true)}
            >
              🏁 Fine
            </button>
          </div>
        )}
      </div>

      {/* Current GKs */}
      <div className="card mb-4">
        <h3 className="mb-3" style={{ fontSize: '0.9rem', color: '#A0AEC0' }}>
          🧤 PORTIERI TURNO CORRENTE
        </h3>
        <div className="grid-2">
          <div className="flex items-center gap-2">
            <div style={{
              width: 8, height: 8, borderRadius: '50%', background: '#FC8181', flexShrink: 0,
            }} />
            <div>
              <div className="text-xs team-red-text">Rossi</div>
              <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>
                {currentRedGk?.name || '–'}
              </div>
            </div>
            {isAdmin && !isFinished && (
              <button className="btn btn-ghost" style={{ padding: '0.2rem 0.5rem', marginLeft: 'auto', minHeight: 'auto', fontSize: '0.75rem' }}
                onClick={() => setOverrideModal('red')}>✏️</button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div style={{
              width: 8, height: 8, borderRadius: '50%', background: '#63B3ED', flexShrink: 0,
            }} />
            <div>
              <div className="text-xs team-blue-text">Blu</div>
              <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>
                {currentBlueGk?.name || '–'}
              </div>
            </div>
            {isAdmin && !isFinished && (
              <button className="btn btn-ghost" style={{ padding: '0.2rem 0.5rem', marginLeft: 'auto', minHeight: 'auto', fontSize: '0.75rem' }}
                onClick={() => setOverrideModal('blue')}>✏️</button>
            )}
          </div>
        </div>
      </div>

      {/* Goal Buttons */}
      {isAdmin && !isFinished && (
        <div className="card mb-4">
          <h3 className="mb-3" style={{ fontSize: '0.9rem', color: '#A0AEC0' }}>⚽ REGISTRA EVENTO</h3>
          <div className="grid-2 mb-2">
            <button className="btn btn-lg" style={{ background: 'rgba(252,129,129,0.15)', border: '2px solid #FC8181', color: '#FC8181', borderRadius: '12px' }}
              onClick={() => handleGoalTap('red')}>
              ⚽ Gol Rossi
            </button>
            <button className="btn btn-lg" style={{ background: 'rgba(99,179,237,0.15)', border: '2px solid #63B3ED', color: '#63B3ED', borderRadius: '12px' }}
              onClick={() => handleGoalTap('blue')}>
              ⚽ Gol Blu
            </button>
          </div>
          <div className="grid-2">
            <button className="btn btn-ghost text-sm"
              onClick={() => handleAutogoalTap('red')} style={{ fontSize: '0.8rem' }}>
              🤦 Autogol Rossi
            </button>
            <button className="btn btn-ghost text-sm"
              onClick={() => handleAutogoalTap('blue')} style={{ fontSize: '0.8rem' }}>
              🤦 Autogol Blu
            </button>
          </div>
        </div>
      )}

      {/* GK Rotation Schedule */}
      <div className="card mb-4">
        <h3 className="mb-3" style={{ fontSize: '0.9rem', color: '#A0AEC0' }}>
          🔄 ROTAZIONE PORTIERI (ogni 6')
        </h3>
        <div className="grid-2" style={{ gap: '0.5rem' }}>
          <div>
            <div className="text-xs team-red-text mb-1">🔴 Rossi</div>
            {(gkRotation.red || []).map((turn, i) => {
              const startMin = i * 6;
              const isCurrent = Math.floor(displayTime / GK_INTERVAL) === i;
              const isPast = Math.floor(displayTime / GK_INTERVAL) > i;
              return (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                  padding: '0.3rem 0.5rem', borderRadius: '6px', marginBottom: '0.2rem',
                  background: isCurrent ? 'rgba(252,129,129,0.15)' : 'transparent',
                  opacity: isPast ? 0.5 : 1,
                }}>
                  <span style={{ fontSize: '0.7rem', color: '#718096', minWidth: '28px' }}>
                    {startMin}'
                  </span>
                  <span style={{ fontSize: '0.85rem', fontWeight: isCurrent ? 700 : 400, color: isCurrent ? '#FC8181' : '#A0AEC0' }}>
                    {turn.name}
                  </span>
                  {isCurrent && <span style={{ fontSize: '0.65rem', marginLeft: 'auto', color: '#FC8181' }}>▶</span>}
                </div>
              );
            })}
          </div>
          <div>
            <div className="text-xs team-blue-text mb-1">🔵 Blu</div>
            {(gkRotation.blue || []).map((turn, i) => {
              const startMin = i * 6;
              const isCurrent = Math.floor(displayTime / GK_INTERVAL) === i;
              const isPast = Math.floor(displayTime / GK_INTERVAL) > i;
              return (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                  padding: '0.3rem 0.5rem', borderRadius: '6px', marginBottom: '0.2rem',
                  background: isCurrent ? 'rgba(99,179,237,0.15)' : 'transparent',
                  opacity: isPast ? 0.5 : 1,
                }}>
                  <span style={{ fontSize: '0.7rem', color: '#718096', minWidth: '28px' }}>
                    {startMin}'
                  </span>
                  <span style={{ fontSize: '0.85rem', fontWeight: isCurrent ? 700 : 400, color: isCurrent ? '#63B3ED' : '#A0AEC0' }}>
                    {turn.name}
                  </span>
                  {isCurrent && <span style={{ fontSize: '0.65rem', marginLeft: 'auto', color: '#63B3ED' }}>▶</span>}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Events Log */}
      <div className="card mb-4">
        <h3 className="mb-3" style={{ fontSize: '0.9rem', color: '#A0AEC0' }}>
          📋 CRONACA ({(match.events || []).length} eventi)
        </h3>
        {(match.events || []).length === 0 ? (
          <p className="text-muted text-sm text-center" style={{ padding: '0.75rem' }}>
            Nessun evento registrato
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            {[...(match.events || [])].reverse().map(ev => (
              <div key={ev.id} style={{
                display: 'flex', alignItems: 'center', gap: '0.75rem',
                padding: '0.5rem 0', borderBottom: '1px solid #2D3748',
              }}>
                <span style={{ fontSize: '0.8rem', color: '#718096', minWidth: '28px' }}>
                  {ev.minute}'
                </span>
                <span style={{ fontSize: '1rem' }}>
                  {ev.type === 'goal' ? (ev.team === 'red' ? '🔴⚽' : '🔵⚽') : '🤦'}
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.9rem', fontWeight: 500 }}>{ev.scorerName}</div>
                  {ev.assistName && ev.assistName !== 'Nessuno' && (
                    <div style={{ fontSize: '0.75rem', color: '#718096' }}>assist: {ev.assistName}</div>
                  )}
                  {ev.gkConcededName && (
                    <div style={{ fontSize: '0.75rem', color: '#718096' }}>GK: {ev.gkConcededName}</div>
                  )}
                </div>
                {isAdmin && (
                  <button
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: '#FC8181', padding: '4px', fontSize: '0.8rem',
                    }}
                    onClick={() => deleteEvent(ev.id).then(() => toast.success('Evento eliminato'))}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function getRoleIcon(role) {
  const icons = { 'Portiere': '🧤', 'Difensore': '🛡️', 'Centrocampista': '⚙️', 'Attaccante': '⚡' };
  return icons[role] || '⚽';
}

