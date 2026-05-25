import React, { useState, useMemo, useEffect } from 'react';
import { updatePlayer } from '../../firebase/firestore';
import { getMs } from '../../utils/dateUtils';
import { generatePlayerTrendAnalysis } from '../../services/geminiService';
import { computePlayerWeatherStats } from '../../utils/weatherStats';
import toast from 'react-hot-toast';

export default function AiTrendCard({ player, playerMatches }) {
  const [loading, setLoading] = useState(false);
  const [pendingText, setPendingText] = useState(null);

  const mostRecentMatch = useMemo(() => {
    return playerMatches
      .filter(m => !m.isHistorical)
      .sort((a, b) => getMs(b.date) - getMs(a.date))[0] || null;
  }, [playerMatches]);

  const cached = player.aiFormAnalysis;
  useEffect(() => { if (cached?.text) setPendingText(null); }, [cached?.text]);
  const displayCached = pendingText
    ? { text: pendingText, generatedAt: new Date().toISOString() }
    : cached;
  const hasAnalysis = !!displayCached?.text;
  const isStale = hasAnalysis && !pendingText && mostRecentMatch && cached?.lastMatchId !== mostRecentMatch.id;

  const generate = async () => {
    setLoading(true);
    try {
      const played = playerMatches
        .filter(m => !m.isHistorical)
        .sort((a, b) => getMs(a.date) - getMs(b.date))
        .slice(-4);

      if (played.length < 1) {
        toast('Nessuna partita registrata per questo giocatore.');
        return;
      }

      const recentData = played.map(match => {
        const inRed  = (match.redTeam || []).some(p => p.id === player.id);
        const my     = inRed ? match.redScore : match.blueScore;
        const their  = inRed ? match.blueScore : match.redScore;
        const result = my > their ? 'W' : my < their ? 'L' : 'D';
        let goals = 0, assists = 0, autogoals = 0, injuries = 0;
        for (const ev of (match.events || [])) {
          if (ev.type === 'goal'     && ev.scorerId === player.id) goals++;
          if (ev.type === 'goal'     && ev.assistId === player.id) assists++;
          if (ev.type === 'autogoal' && ev.scorerId === player.id) autogoals++;
          if (ev.type === 'injury'   && ev.playerId === player.id) injuries++;
        }
        return { result, goals, assists, autogoals, injuries };
      });

      const weatherStats = computePlayerWeatherStats(
        playerMatches.filter(m => !m.isHistorical),
        player.id,
      );

      // Cronistoria infortuni complessiva (su tutte le partite app, non solo le 4 recenti)
      let totalInjuries = 0;
      let lastInjuryMs = 0;
      for (const match of playerMatches) {
        if (match.isHistorical) continue;
        for (const ev of (match.events || [])) {
          if (ev.type === 'injury' && ev.playerId === player.id) {
            totalInjuries++;
            const ms = getMs(match.date);
            if (ms > lastInjuryMs) lastInjuryMs = ms;
          }
        }
      }
      const injuryStats = totalInjuries > 0 ? {
        total: totalInjuries,
        lastInjuryDate: lastInjuryMs ? new Date(lastInjuryMs).toLocaleDateString('it-IT') : null,
      } : null;

      const text = await generatePlayerTrendAnalysis(player, recentData, weatherStats, injuryStats);
      setPendingText(text);
      const latestMatch = played[played.length - 1];
      await updatePlayer(player.id, {
        aiFormAnalysis: {
          text,
          lastMatchId: latestMatch.id,
          generatedAt: new Date().toISOString(),
        },
      });
    } catch (e) {
      toast.error('Errore AI: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  if (!hasAnalysis) {
    return (
      <div className="card mb-4" style={{ textAlign: 'center', border: '1px dashed rgba(159,122,234,0.35)', background: 'rgba(102,126,234,0.03)' }}>
        <button onClick={generate} disabled={loading}
          style={{ background: 'none', border: 'none', cursor: loading ? 'default' : 'pointer', color: '#9F7AEA', fontSize: '0.88rem', padding: '0.6rem 0', width: '100%' }}>
          {loading ? '⏳ Analisi in corso...' : '✨ Genera analisi AI del momento di forma'}
        </button>
      </div>
    );
  }

  return (
    <div className="card mb-4" style={{ border: `1px solid ${isStale ? 'rgba(246,173,85,0.5)' : 'rgba(159,122,234,0.4)'}`, background: 'rgba(102,126,234,0.05)' }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3 style={{ fontSize: '0.95rem', margin: 0 }}>✨ Analisi AI</h3>
          {isStale && (
            <span style={{ fontSize: '0.68rem', color: '#F6AD55', background: 'rgba(246,173,85,0.15)', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
              ⚠️ Nuova partita
            </span>
          )}
        </div>
        <button
          onClick={generate}
          disabled={loading}
          style={{ fontSize: '0.7rem', color: '#718096', background: 'none', border: 'none', cursor: loading ? 'default' : 'pointer' }}>
          {loading ? '⏳' : '↺ Rigenera'}
        </button>
      </div>
      {displayCached.generatedAt && (
        <div style={{ fontSize: '0.65rem', color: '#4A5568', marginBottom: '0.75rem' }}>
          Aggiornata il {new Date(displayCached.generatedAt).toLocaleDateString('it-IT')}
        </div>
      )}
      <p style={{ fontSize: '0.84rem', color: '#CBD5E0', lineHeight: 1.75, margin: 0, whiteSpace: 'pre-wrap' }}>
        {displayCached.text}
      </p>
    </div>
  );
}
