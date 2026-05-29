import React, { useState, useEffect } from 'react';
import { generatePeriodReport } from '../../services/geminiService';
import { getAICache, setAICache } from '../../firebase/firestore';
import { getMs } from '../../utils/dateUtils';
import { getSeasonStartMs } from '../../utils/leaderboards';
import { computeStatsFromMatches } from '../../utils/playerStats';
import toast from 'react-hot-toast';

export const REPORT_PERIODS = [
  { key: '30d',    label: 'Ultimo mese' },
  { key: 'season', label: 'Stagione' },
  { key: 'all',    label: 'All-time' },
];

export default function ReportAITab({ finishedMatches, players, reportText, setReportText, reportLoading, setReportLoading, reportPeriod, setReportPeriod, lastMatchId, weatherStats }) {
  const [reportStale, setReportStale] = useState(false);

  useEffect(() => {
    setReportText('');
    setReportStale(false);
    let cancelled = false;
    getAICache(`report_${reportPeriod}`).then(data => {
      if (cancelled) return;
      if (data?.text) {
        setReportText(data.text);
        setReportStale(!!lastMatchId && data.lastMatchId !== lastMatchId);
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [reportPeriod]); // eslint-disable-line react-hooks/exhaustive-deps

  const buildStats = (period) => {
    const now = Date.now();
    const cutoff = period === '30d'
      ? now - 30 * 24 * 60 * 60 * 1000
      : period === 'season'
        ? getSeasonStartMs()
        : 0;
    const filtered = cutoff === 0 ? finishedMatches : finishedMatches.filter(m => getMs(m.date) >= cutoff);
    const matchCount = filtered.length;
    const totalGoals = filtered.reduce((s, m) => s + (m.redScore || 0) + (m.blueScore || 0), 0);

    // Stat aggregate dalla funzione condivisa (include proration assist storici)
    const ps = {};
    for (const cp of computeStatsFromMatches(players, filtered)) {
      ps[cp.id] = {
        name: cp.name, goals: cp.totalGoals, assists: cp.totalAssists,
        autogoals: cp.totalAutogoals, gkGoals: cp.gkGoalsConceded,
        matches: cp.totalMatches, wins: cp.totalWins,
      };
    }

    // Infortuni: computeStatsFromMatches non li traccia, ricavati direttamente
    // dagli eventi (skip partite storiche — non hanno injury events)
    const injuriesByPid = {};
    const fallbackNameByPid = {};
    let totalInjuries = 0;
    for (const m of filtered) {
      if (m.isHistorical) continue;
      for (const ev of (m.events || [])) {
        if (ev.type === 'injury' && ev.playerId) {
          injuriesByPid[ev.playerId] = (injuriesByPid[ev.playerId] || 0) + 1;
          if (ev.playerName) fallbackNameByPid[ev.playerId] = ev.playerName;
          totalInjuries++;
        }
      }
    }

    const list = Object.values(ps).filter(p => p.matches > 0);
    const topScorer   = list.filter(p => p.goals > 0).sort((a, b) => b.goals - a.goals)[0] || null;
    const topAssist   = list.filter(p => p.assists > 0).sort((a, b) => b.assists - a.assists)[0] || null;
    const topAutogoal = list.filter(p => p.autogoals > 0).sort((a, b) => b.autogoals - a.autogoals)[0] || null;
    const worstGk     = list.filter(p => p.gkGoals >= 2).sort((a, b) => b.gkGoals - a.gkGoals)[0] || null;
    const mostMatches = list.sort((a, b) => b.matches - a.matches)[0] || null;
    const withMinMatches = list.filter(p => p.matches >= 5);
    const topWinRate  = withMinMatches.length > 0
      ? [...withMinMatches].sort((a, b) => (b.wins / b.matches) - (a.wins / a.matches))[0]
      : null;
    const streaks = players.filter(p => p.streak?.count >= 3 && ps[p.id]?.matches > 0);
    const bestStreak  = streaks.filter(p => p.streak.type === 'win').sort((a, b) => b.streak.count - a.streak.count)[0] || null;
    const worstStreak = streaks.filter(p => p.streak.type === 'loss').sort((a, b) => b.streak.count - a.streak.count)[0] || null;

    const injuredEntries = Object.entries(injuriesByPid)
      .map(([pid, n]) => ({ name: ps[pid]?.name || fallbackNameByPid[pid] || 'Sconosciuto', injuries: n }))
      .sort((a, b) => b.injuries - a.injuries);
    const mostInjured = injuredEntries[0] || null;

    return {
      matchCount, totalGoals, totalInjuries,
      topScorer: topScorer ? { name: topScorer.name, goals: topScorer.goals } : null,
      topAssist: topAssist ? { name: topAssist.name, assists: topAssist.assists } : null,
      topAutogoal: topAutogoal ? { name: topAutogoal.name, autogoals: topAutogoal.autogoals } : null,
      worstGk: worstGk ? { name: worstGk.name, goals: worstGk.gkGoals } : null,
      mostMatches: mostMatches ? { name: mostMatches.name, matches: mostMatches.matches } : null,
      topWinRate: topWinRate ? { name: topWinRate.name, pct: Math.round((topWinRate.wins / topWinRate.matches) * 100) } : null,
      bestStreak: bestStreak ? { name: bestStreak.name, count: bestStreak.streak.count } : null,
      worstStreak: worstStreak ? { name: worstStreak.name, count: worstStreak.streak.count } : null,
      mostInjured,
    };
  };

  const handleGenerate = async () => {
    setReportLoading(true);
    try {
      const periodLabel = REPORT_PERIODS.find(p => p.key === reportPeriod)?.label || reportPeriod;
      const stats = buildStats(reportPeriod);
      if (stats.matchCount === 0) { toast('Nessuna partita nel periodo selezionato'); setReportLoading(false); return; }
      const text = await generatePeriodReport(periodLabel, stats, weatherStats);
      setReportText(text);
      setReportStale(false);
      setAICache(`report_${reportPeriod}`, { text, lastMatchId, generatedAt: new Date().toISOString() }).catch(() => {});
    } catch (e) {
      toast.error('Report AI: ' + e.message);
    } finally {
      setReportLoading(false);
    }
  };

  return (
    <div>
      <div className="card mb-4" style={{ border: '1px solid rgba(104,211,145,0.25)' }}>
        <div className="flex items-center gap-2 mb-3">
          <h3 style={{ fontSize: '0.95rem', color: '#68D391', margin: 0 }}>📝 Report AI</h3>
          {reportStale && (
            <span style={{ fontSize: '0.68rem', color: '#F6AD55', background: 'rgba(246,173,85,0.15)', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
              ⚠️ Nuova partita
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          {REPORT_PERIODS.map(p => (
            <button key={p.key} onClick={() => setReportPeriod(p.key)}
              style={{
                padding: '0.3rem 0.75rem', borderRadius: '999px', border: 'none', cursor: 'pointer',
                fontWeight: 600, fontSize: '0.8rem',
                background: reportPeriod === p.key ? 'rgba(104,211,145,0.25)' : 'rgba(74,85,104,0.4)',
                color: reportPeriod === p.key ? '#68D391' : '#A0AEC0',
              }}>
              {p.label}
            </button>
          ))}
        </div>
        <button
          onClick={handleGenerate}
          disabled={reportLoading}
          style={{
            width: '100%', padding: '0.65rem', border: `1px solid ${reportStale ? 'rgba(246,173,85,0.5)' : 'rgba(104,211,145,0.4)'}`,
            borderRadius: '8px', background: 'rgba(104,211,145,0.08)',
            color: reportStale ? '#F6AD55' : '#68D391', fontWeight: 700, fontSize: '0.9rem', cursor: reportLoading ? 'default' : 'pointer',
          }}>
          {reportLoading ? '⏳ Generando il report...' : reportText ? '↺ Rigenera Report' : '✨ Genera Report'}
        </button>
      </div>

      {reportText && (
        <div className="card" style={{ border: `1px solid ${reportStale ? 'rgba(246,173,85,0.4)' : 'rgba(104,211,145,0.3)'}`, background: 'rgba(104,211,145,0.04)' }}>
          <div style={{ maxHeight: '16rem', overflowY: 'auto', paddingRight: '0.25rem' }}>
            <p style={{ fontSize: '0.84rem', color: '#CBD5E0', lineHeight: 1.8, margin: 0, whiteSpace: 'pre-wrap' }}>{reportText}</p>
          </div>
        </div>
      )}
    </div>
  );
}
