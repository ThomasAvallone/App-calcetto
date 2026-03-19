import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import useMatchStore from '../store/matchStore';
import usePlayersStore from '../store/playersStore';
import useAuthStore, { selectIsAdmin } from '../store/authStore';
import Confetti from '../components/Confetti';
import { generateMatchReport } from '../services/reportService';
import { exportMatchToSheets } from '../services/sheetsService';
import { recalculatePlayerStats, updateMatch } from '../firebase/firestore';
import toast from 'react-hot-toast';

const MATCH_DURATION = 60 * 60; // durata regolamentare (per progress bar)

function pad(n) { return String(Math.floor(n)).padStart(2, '0'); }
function formatTime(secs) { return `${pad(secs / 60)}:${pad(secs % 60)}`; }

export default function MatchPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { players } = usePlayersStore();
  const isAdmin = useAuthStore(selectIsAdmin);

  const {
    match, activeMatchId, timerState,
    loadMatch, unloadMatch, startTimer, pauseTimer, getElapsedSeconds,
    recordGoal, recordAutogoal, deleteEvent, endMatch,
  } = useMatchStore();

  const [displayTime, setDisplayTime] = useState(0);
  const [goalTeam, setGoalTeam] = useState(null);
  const [goalScorerModal, setGoalScorerModal] = useState(false);
  const [selectedScorer, setSelectedScorer] = useState(null);
  const [autogoalMode, setAutogoalMode] = useState(false);
  const [pendingAssist, setPendingAssist] = useState(false);
  const [assistCountdown, setAssistCountdown] = useState(5);
  const [pendingGkConceded, setPendingGkConceded] = useState(false);
  const [pendingGoalData, setPendingGoalData] = useState(null);
  const [reportModal, setReportModal] = useState(false);
  const [reportText, setReportText] = useState('');
  const [matchSummary, setMatchSummary] = useState(null);
  const [endConfirm, setEndConfirm] = useState(false);
  const [ending, setEnding] = useState(false);
  const [goalFlash, setGoalFlash] = useState(null);   // 'red' | 'blue' | null
  const [showConfetti, setShowConfetti] = useState(false);
  const [scoreBounce, setScoreBounce] = useState(null); // 'red' | 'blue' | null
  const [scoreShake, setScoreShake] = useState(null);   // 'red' | 'blue' | null
  const prevRedScore  = useRef(0);
  const prevBlueScore = useRef(0);

  const timerRef = useRef(null);

  // Bounce/shake when scores change
  useEffect(() => {
    const red  = match?.redScore  || 0;
    const blue = match?.blueScore || 0;
    if (red  > prevRedScore.current)  { setScoreBounce('red');  setTimeout(() => setScoreBounce(null), 450); }
    if (blue > prevBlueScore.current) { setScoreBounce('blue'); setTimeout(() => setScoreBounce(null), 450); }
    prevRedScore.current  = red;
    prevBlueScore.current = blue;
  }, [match?.redScore, match?.blueScore]);

  useEffect(() => {
    if (id !== activeMatchId) loadMatch(id);
    return () => unloadMatch();
  }, [id]);

  // Timer loop
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setDisplayTime(getElapsedSeconds());
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
            handleAssistSelected(null, null);
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
  const progress = Math.min((displayTime / MATCH_DURATION) * 100, 100);
  const isOvertime = displayTime >= MATCH_DURATION;
  const isNearEnd = !isOvertime && displayTime >= (MATCH_DURATION - 5 * 60);
  const redTeam = match.redTeam || [];
  const blueTeam = match.blueTeam || [];

  const handleTimerToggle = () => { if (isRunning) pauseTimer(); else startTimer(); };

  const handleGoalTap = (team) => {
    if (!isAdmin || isFinished) return;
    setGoalTeam(team); setAutogoalMode(false); setSelectedScorer(null); setGoalScorerModal(true);
  };

  const handleAutogoalTap = (team) => {
    if (!isAdmin || isFinished) return;
    setGoalTeam(team); setAutogoalMode(true); setSelectedScorer(null); setGoalScorerModal(true);
  };

  const handleScorerSelected = (player) => {
    setSelectedScorer(player);
    setGoalScorerModal(false);
    if (autogoalMode) {
      // Go straight to GK selection (skip assist)
      setPendingGoalData({
        team: goalTeam,
        scorerId: player.id,
        scorerName: player.name,
        _autogoal: true,
      });
      setPendingGkConceded(true);
    } else {
      setPendingAssist(true);
    }
  };

  const handleAssistSelected = (player, name) => {
    setPendingAssist(false);
    if (!selectedScorer) return;
    setPendingGoalData({
      team: goalTeam,
      scorerId: selectedScorer.id,
      scorerName: selectedScorer.name,
      assistId: player?.id || null,
      assistName: player?.name || name || null,
    });
    setPendingGkConceded(true);
  };

  const handleGkConcededSelected = async (player) => {
    setPendingGkConceded(false);
    if (!pendingGoalData) return;
    const gkFields = { gkConcededId: player?.id || null, gkConcededName: player?.name || null };
    if (pendingGoalData._autogoal) {
      await recordAutogoal({ team: pendingGoalData.team, scorerId: pendingGoalData.scorerId, scorerName: pendingGoalData.scorerName, ...gkFields });
      toast.success(`🤦 Autogol di ${pendingGoalData.scorerName}`);
      setScoreShake(pendingGoalData.team);
      setTimeout(() => setScoreShake(null), 450);
    } else {
      await recordGoal({ ...pendingGoalData, ...gkFields });
      const assistMsg = pendingGoalData.assistId ? ` (assist: ${pendingGoalData.assistName})` : '';
      toast.success(`⚽ Gol di ${pendingGoalData.scorerName}${assistMsg}!`);
      setGoalFlash(pendingGoalData.team);
      setTimeout(() => setGoalFlash(null), 600);
    }
    setPendingGoalData(null);
    setSelectedScorer(null);
    setGoalTeam(null);
  };

  const handleEndMatch = async () => {
    setEnding(true); setEndConfirm(false);
    try {
      const snapshot = {
        redScore: match.redScore || 0,
        blueScore: match.blueScore || 0,
        redTeam: match.redTeam || [],
        blueTeam: match.blueTeam || [],
        events: match.events || [],
      };
      await endMatch();
      const allIds = [...snapshot.redTeam.map(p => p.id), ...snapshot.blueTeam.map(p => p.id)];
      await recalculatePlayerStats(allIds);
      await exportMatchToSheets(match, players).catch(e => console.warn('Sheets export failed:', e));
      const report = generateMatchReport(match, players);
      if (activeMatchId) await updateMatch(activeMatchId, { report });
      setReportText(report);
      setMatchSummary(snapshot);
      setShowConfetti(true);
      setTimeout(() => { setShowConfetti(false); setReportModal(true); }, 2200);
    } catch (e) {
      toast.error('Errore: ' + e.message);
    } finally {
      setEnding(false);
    }
  };

  const teamPlayers = goalTeam === 'red' ? redTeam : blueTeam;
  const scorerLabel = autogoalMode ? 'Chi ha fatto autogol?' : `Gol ${goalTeam === 'red' ? '🔴 Rosso' : '🔵 Blu'} — Chi ha segnato?`;

  // ── Scorer Selection Modal ──────────────────────────────────────────────────
  if (goalScorerModal) {
    return (
      <div className="modal-overlay">
        <div className="modal animate-slide-up">
          <h2 className="modal-title">{scorerLabel}</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '60vh', overflowY: 'auto' }}>
            {teamPlayers.map(p => (
              <button key={p.id} className="btn btn-ghost"
                style={{ justifyContent: 'flex-start', padding: '0.875rem 1rem' }}
                onClick={() => handleScorerSelected(p)}>
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
    const cdR = 34, cdCirc = 2 * Math.PI * cdR;
    const cdFill = (assistCountdown / 5) * cdCirc;
    return (
      <div className="modal-overlay">
        <div className="modal animate-slide-up">
          <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
            <h2 className="modal-title" style={{ marginBottom: '0.75rem' }}>🎯 Assist per {selectedScorer.name}?</h2>
            <div style={{ display: 'inline-block', position: 'relative', width: 88, height: 88 }}>
              <svg width="88" height="88" viewBox="0 0 88 88" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx="44" cy="44" r={cdR} fill="none" stroke="#2D3748" strokeWidth="6" />
                <circle cx="44" cy="44" r={cdR} fill="none" stroke="#F6E05E" strokeWidth="6"
                  strokeDasharray={`${cdFill} ${cdCirc}`} strokeLinecap="round"
                  style={{ transition: 'stroke-dasharray 0.9s linear' }} />
              </svg>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.8rem', fontWeight: 900, color: '#F6E05E' }}>
                {assistCountdown}
              </div>
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
          <button className="btn btn-red btn-full mt-2" onClick={() => handleAssistSelected(null, 'Nessuno')}>
            — Nessun Assist
          </button>
        </div>
      </div>
    );
  }

  // ── GK Conceded Modal ───────────────────────────────────────────────────────
  if (pendingGkConceded && pendingGoalData) {
    const isAutogoal = pendingGoalData._autogoal;
    // For autogoals the GK is on the scorer's own team; for regular goals it's the opposing team
    const gkTeamPlayers = isAutogoal
      ? (pendingGoalData.team === 'red' ? redTeam : blueTeam)
      : (pendingGoalData.team === 'red' ? blueTeam : redTeam);
    const gkTeamLabel = isAutogoal
      ? (pendingGoalData.team === 'red' ? '🔴 Rossi' : '🔵 Blu')
      : (pendingGoalData.team === 'red' ? '🔵 Blu' : '🔴 Rossi');
    return (
      <div className="modal-overlay">
        <div className="modal animate-slide-up">
          <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.25rem' }}>🧤</div>
            <h2 className="modal-title">Chi era in porta?</h2>
            <p className="text-secondary text-sm">{gkTeamLabel} — portiere che ha subito il gol</p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '50vh', overflowY: 'auto' }}>
            {gkTeamPlayers.map(p => (
              <button key={p.id} className="btn btn-ghost"
                style={{ justifyContent: 'flex-start', padding: '0.875rem 1rem' }}
                onClick={() => handleGkConcededSelected(p)}>
                <span style={{ fontSize: '1.1rem' }}>🧤</span>
                {p.name}
              </button>
            ))}
          </div>
          <button className="btn btn-ghost btn-full mt-2" onClick={() => handleGkConcededSelected(null)}>
            — Non ricordo / Salta
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
          <p className="text-secondary mb-4">Risultato finale: 🔴 {match.redScore} — {match.blueScore} 🔵</p>
          <div className="flex gap-3">
            <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setEndConfirm(false)}>Annulla</button>
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
    const ms = matchSummary;
    const goals = ms ? ms.events.filter(e => e.type === 'goal' || e.type === 'autogoal') : [];
    const winner = ms ? (ms.redScore > ms.blueScore ? 'red' : ms.blueScore > ms.redScore ? 'blue' : null) : null;
    const mvpEntry = ms ? (() => {
      const cnt = {};
      ms.events.forEach(e => { if (e.type === 'goal' && e.scorerId) cnt[e.scorerId] = (cnt[e.scorerId] || { name: e.scorerName, n: 0 }), cnt[e.scorerId].n++; });
      return Object.values(cnt).sort((a, b) => b.n - a.n)[0] || null;
    })() : null;

    const shareText = reportText;
    const canShare = typeof navigator.share === 'function';
    const handleShare = () => {
      if (canShare) {
        navigator.share({ title: 'Risultato Calcetto', text: shareText }).catch(() => {});
      } else {
        const wa = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`;
        window.open(wa, '_blank');
      }
    };

    return (
      <div className="modal-overlay">
        <div className="modal animate-slide-up" style={{ maxHeight: '92vh', overflowY: 'auto' }}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="modal-title" style={{ marginBottom: 0 }}>🏆 Verdetto Finale</h2>
            <button className="btn btn-ghost btn-icon" onClick={() => { setReportModal(false); navigate('/'); }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>

          {/* Match summary card */}
          {ms && (
            <div style={{ borderRadius: '12px', background: 'linear-gradient(135deg, rgba(252,129,129,0.08) 0%, rgba(99,179,237,0.08) 100%)', border: '1px solid rgba(255,255,255,0.08)', padding: '1.25rem', marginBottom: '1rem' }}>
              {/* Score */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', marginBottom: '0.75rem' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '0.65rem', color: '#FC8181', fontWeight: 700, letterSpacing: '0.08em', marginBottom: '0.25rem' }}>🔴 ROSSO</div>
                  <div style={{ fontSize: '3rem', fontWeight: 900, lineHeight: 1, color: winner === 'red' ? '#FC8181' : '#A0AEC0' }}>{ms.redScore}</div>
                </div>
                <div style={{ fontSize: '1.2rem', color: '#4A5568', fontWeight: 300 }}>–</div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '0.65rem', color: '#63B3ED', fontWeight: 700, letterSpacing: '0.08em', marginBottom: '0.25rem' }}>🔵 BLU</div>
                  <div style={{ fontSize: '3rem', fontWeight: 900, lineHeight: 1, color: winner === 'blue' ? '#63B3ED' : '#A0AEC0' }}>{ms.blueScore}</div>
                </div>
              </div>
              {/* Winner banner */}
              <div style={{ textAlign: 'center', fontSize: '0.8rem', fontWeight: 700, color: winner === 'red' ? '#FC8181' : winner === 'blue' ? '#63B3ED' : '#F6E05E', marginBottom: '0.75rem' }}>
                {winner === 'red' ? '🏆 Vittoria Rosso' : winner === 'blue' ? '🏆 Vittoria Blu' : '🤝 Pareggio'}
              </div>
              {/* Scorers with progressive partial */}
              {goals.length > 0 && (
                <div style={{ fontSize: '0.72rem', color: '#A0AEC0', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '0.6rem' }}>
                  {(() => {
                    let r = 0, b = 0;
                    return goals.map((g, i) => {
                      if (g.type === 'goal') { if (g.team === 'red') r++; else b++; }
                      else if (g.type === 'autogoal') { if (g.team === 'red') b++; else r++; }
                      const pr = r, pb = b;
                      const isAutogoal = g.type === 'autogoal';
                      return (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.2rem 0', gap: '0.5rem' }}>
                          <span style={{ flex: 1 }}>
                            {g.team === 'red' ? '🔴' : '🔵'}
                            {isAutogoal && <span style={{ color: '#FC8181', fontWeight: 700, marginLeft: '0.25rem' }}>🤦</span>}
                            {' '}{g.scorerName}
                            {isAutogoal && <span style={{ color: '#FC8181', fontWeight: 700, fontSize: '0.65rem', marginLeft: '0.2rem' }}>(autogol)</span>}
                            {!isAutogoal && g.assistName && g.assistName !== 'Nessuno' && <span style={{ color: '#718096' }}> ({g.assistName})</span>}
                          </span>
                          <span style={{ color: '#718096', whiteSpace: 'nowrap' }}>{g.minute ? `${g.minute}'` : ''}</span>
                          <span style={{ fontWeight: 700, whiteSpace: 'nowrap', minWidth: '36px', textAlign: 'right' }}>
                            <span style={{ color: '#FC8181' }}>{pr}</span>
                            <span style={{ color: '#4A5568' }}>–</span>
                            <span style={{ color: '#63B3ED' }}>{pb}</span>
                          </span>
                        </div>
                      );
                    });
                  })()}
                </div>
              )}
              {/* MVP */}
              {mvpEntry && mvpEntry.n >= 2 && (
                <div style={{ marginTop: '0.6rem', paddingTop: '0.6rem', borderTop: '1px solid rgba(255,255,255,0.06)', textAlign: 'center', fontSize: '0.75rem', color: '#F6E05E' }}>
                  ⭐ MVP: <strong>{mvpEntry.name}</strong> ({mvpEntry.n} gol)
                </div>
              )}
            </div>
          )}

          {/* Share button */}
          <button className="btn btn-full mt-1" style={{ background: '#25D366', color: '#fff', fontWeight: 700, border: 'none' }}
            onClick={handleShare}>
            {canShare ? '📤 Condividi' : '💬 Condividi su WhatsApp'}
          </button>

          {/* Full report (collapsible) */}
          <details style={{ marginTop: '0.75rem' }}>
            <summary style={{ cursor: 'pointer', fontSize: '0.78rem', color: '#718096', userSelect: 'none', padding: '0.4rem 0' }}>
              📄 Verdetto testuale completo
            </summary>
            <pre style={{ fontFamily: 'Inter, monospace', fontSize: '0.75rem', color: '#A0AEC0', whiteSpace: 'pre-wrap', lineHeight: 1.6, marginTop: '0.5rem', maxHeight: '40vh', overflowY: 'auto' }}>
              {reportText}
            </pre>
          </details>

          <button className="btn btn-teal btn-full mt-2"
            onClick={() => navigator.clipboard.writeText(reportText).then(() => toast.success('Copiato!'))}>
            📋 Copia Verdetto
          </button>
          <button className="btn btn-ghost btn-full mt-2" onClick={() => { setReportModal(false); navigate('/'); }}>
            Torna alla Home
          </button>
        </div>
      </div>
    );
  }

  // ── Main Match UI ───────────────────────────────────────────────────────────
  return (
    <div className="page-content" style={{ paddingTop: '1rem' }}>

      {showConfetti && <Confetti />}

      {/* Goal flash overlay */}
      {goalFlash && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 999, pointerEvents: 'none',
          background: goalFlash === 'red' ? 'rgba(252,129,129,0.25)' : 'rgba(99,179,237,0.25)',
          animation: 'goalFlash 0.6s ease forwards',
        }} />
      )}

      {/* Timer */}
      <div className="card mb-4" style={{ textAlign: 'center', padding: '2rem 1.5rem' }}>
        <div className={`timer-display ${!isRunning ? 'paused' : ''} ${isOvertime && isRunning ? 'ending' : ''} ${isNearEnd && isRunning ? 'ending' : ''}`}>
          {formatTime(displayTime)}
        </div>
        <div className="text-sm text-muted mb-3">
          {isFinished ? '⏹ Partita conclusa' : !isRunning ? '⏸ In pausa' : isOvertime ? '⏱ Supplementari...' : '⏱ In corso...'}
        </div>
        <div className="progress-bar mb-4">
          <div className="progress-bar-fill" style={{ width: `${progress}%`, background: isOvertime ? '#FC8181' : isNearEnd ? '#F6E05E' : '#4FD1C5' }} />
        </div>

        {/* Score */}
        <div className="flex items-center justify-center gap-4 mb-4">
          <div style={{ textAlign: 'center' }}>
            <div className={`score-display score-red${scoreBounce === 'red' ? ' score-bounce' : scoreShake === 'red' ? ' score-shake' : ''}`}>
              {match.redScore ?? 0}
            </div>
            <div className="text-xs text-muted">ROSSI</div>
          </div>
          <div style={{ fontSize: '1.5rem', color: '#4A5568', fontWeight: 300 }}>—</div>
          <div style={{ textAlign: 'center' }}>
            <div className={`score-display score-blue${scoreBounce === 'blue' ? ' score-bounce' : scoreShake === 'blue' ? ' score-shake' : ''}`}>
              {match.blueScore ?? 0}
            </div>
            <div className="text-xs text-muted">BLU</div>
          </div>
        </div>

        {isAdmin && !isFinished && (
          <div className="flex gap-3">
            <button className={`btn ${isRunning ? 'btn-red' : 'btn-teal'} btn-lg`} style={{ flex: 2 }} onClick={handleTimerToggle}>
              {isRunning ? '⏸ Pausa' : '▶ Avvia'}
            </button>
            <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setEndConfirm(true)}>
              🏁 Fine
            </button>
          </div>
        )}
      </div>

      {/* Goal Buttons */}
      {isAdmin && !isFinished && (
        <div className="card mb-4">
          <h3 className="mb-3" style={{ fontSize: '0.9rem', color: '#A0AEC0' }}>⚽ REGISTRA EVENTO</h3>
          <div className="grid-2 mb-2">
            <button className="btn btn-lg" style={{ background: 'rgba(252,129,129,0.15)', border: '2px solid #FC8181', color: '#FC8181', borderRadius: '12px' }}
              onClick={() => handleGoalTap('red')}>⚽ Gol Rossi</button>
            <button className="btn btn-lg" style={{ background: 'rgba(99,179,237,0.15)', border: '2px solid #63B3ED', color: '#63B3ED', borderRadius: '12px' }}
              onClick={() => handleGoalTap('blue')}>⚽ Gol Blu</button>
          </div>
          <div className="grid-2">
            <button className="btn btn-ghost text-sm" onClick={() => handleAutogoalTap('red')} style={{ fontSize: '0.8rem' }}>🤦 Autogol Rossi</button>
            <button className="btn btn-ghost text-sm" onClick={() => handleAutogoalTap('blue')} style={{ fontSize: '0.8rem' }}>🤦 Autogol Blu</button>
          </div>
        </div>
      )}

      {/* Events Log */}
      <div className="card mb-4">
        <h3 className="mb-3" style={{ fontSize: '0.9rem', color: '#A0AEC0' }}>
          📋 CRONACA ({(match.events || []).length} eventi)
        </h3>
        {(match.events || []).length === 0 ? (
          <p className="text-muted text-sm text-center" style={{ padding: '0.75rem' }}>Nessun evento registrato</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            {(() => {
              // Calcola parziale progressivo per ogni evento
              const events = match.events || [];
              let r = 0, b = 0;
              const withScore = events.map(ev => {
                if (ev.type === 'goal') { if (ev.team === 'red') r++; else b++; }
                else if (ev.type === 'autogoal') { if (ev.team === 'red') b++; else r++; }
                return { ...ev, partialRed: r, partialBlue: b };
              });
              return [...withScore].reverse().map(ev => (
                <div key={ev.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0', borderBottom: '1px solid #2D3748' }}>
                  <span style={{ fontSize: '0.8rem', color: '#718096', minWidth: '28px' }}>{ev.minute}'</span>
                  <span style={{ fontSize: '1rem' }}>
                    {ev.type === 'goal' ? (ev.team === 'red' ? '🔴⚽' : '🔵⚽') : (ev.team === 'red' ? '🔴🤦' : '🔵🤦')}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.9rem', fontWeight: 500 }}>
                      {ev.type === 'autogoal' && <span style={{ color: '#FC8181', fontSize: '0.72rem', fontWeight: 700, marginRight: '0.3rem' }}>AUTO</span>}
                      {ev.scorerName}
                    </div>
                    {ev.assistName && ev.assistName !== 'Nessuno' && (
                      <div style={{ fontSize: '0.75rem', color: '#718096' }}>assist: {ev.assistName}</div>
                    )}
                    {ev.gkConcededName && (
                      <div style={{ fontSize: '0.75rem', color: '#718096' }}>🧤 {ev.gkConcededName}</div>
                    )}
                  </div>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#A0AEC0', whiteSpace: 'nowrap' }}>
                    <span style={{ color: '#FC8181' }}>{ev.partialRed}</span>
                    <span style={{ color: '#4A5568' }}>–</span>
                    <span style={{ color: '#63B3ED' }}>{ev.partialBlue}</span>
                  </span>
                  {isAdmin && (
                    <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#FC8181', padding: '4px', fontSize: '0.8rem' }}
                      onClick={() => deleteEvent(ev.id).then(() => toast.success('Evento eliminato'))}>✕</button>
                  )}
                </div>
              ));
            })()}
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
