import React, { useMemo } from 'react';
import { computePowerIndex } from '../../firebase/firestore';
import { getMs } from '../../utils/dateUtils';
import { CLR_MUTED } from '../../constants/colors';

export default function PiTrendChart({ playerMatches, playerId, playerPi }) {
  const points = useMemo(() => {
    const played = playerMatches
      .filter(m => !m.isHistorical)
      .sort((a, b) => getMs(a.date) - getMs(b.date));

    if (played.length < 2) return [];

    const WINDOW = 4;
    const startIdx = Math.max(0, played.length - WINDOW);
    const computed = played.slice(startIdx).map((_, relIdx) => {
      const absIdx = startIdx + relIdx;
      const winStart = Math.max(0, absIdx - WINDOW + 1);
      const window = played.slice(winStart, absIdx + 1);
      const s = { goals: 0, assists: 0, autogoals: 0, gkGoalsConceded: 0, gkMatches: 0, wins: 0, losses: 0, draws: 0, matches: 0 };
      for (const m of window) {
        const inRed = (m.redTeam || []).some(p => p.id === playerId);
        s.matches++;
        const my = inRed ? m.redScore : m.blueScore;
        const their = inRed ? m.blueScore : m.redScore;
        if (my > their) s.wins++; else if (my < their) s.losses++; else s.draws++;
        s.gkMatches++;
        for (const ev of (m.events || [])) {
          if (ev.type === 'goal') { if (ev.scorerId === playerId) s.goals++; if (ev.assistId === playerId) s.assists++; }
          if (ev.type === 'autogoal' && ev.scorerId === playerId) s.autogoals++;
          if (ev.gkConcededId === playerId) s.gkGoalsConceded++;
        }
      }
      return { pi: computePowerIndex(s), date: played[absIdx].date };
    });

    if (computed.length > 0 && playerPi != null) {
      computed[computed.length - 1] = { ...computed[computed.length - 1], pi: playerPi };
    }

    return computed;
  }, [playerMatches, playerId, playerPi]);

  if (points.length < 2) return null;

  const GREEN = '#68D391', RED = '#FC8181', FLAT = CLR_MUTED;
  const W = 280, H = 80, PAD_T = 14, PAD_B = 20;
  const inner = H - PAD_T - PAD_B;
  const vals = points.map(pt => pt.pi);
  const minV = Math.max(0, Math.min(...vals) - 3);
  const maxV = Math.min(100, Math.max(...vals) + 3);
  const range = maxV - minV || 1;
  const toX = i => (i / (points.length - 1)) * W;
  const toY = v => PAD_T + inner - ((v - minV) / range) * inner;

  const segCols = vals.slice(1).map((v, i) => v > vals[i] ? GREEN : v < vals[i] ? RED : FLAT);

  const hexBlend = (c1, c2) => {
    const p = c => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
    const [r1, g1, b1] = p(c1), [r2, g2, b2] = p(c2);
    const h = n => n.toString(16).padStart(2, '0');
    return `#${h(Math.round((r1 + r2) / 2))}${h(Math.round((g1 + g2) / 2))}${h(Math.round((b1 + b2) / 2))}`;
  };

  const ptCols = vals.map((_, i) => {
    if (i === 0) return segCols[0];
    if (i === vals.length - 1) return segCols[segCols.length - 1];
    const prev = segCols[i - 1], curr = segCols[i];
    return prev === curr ? curr : hexBlend(prev, curr);
  });

  const last = vals[vals.length - 1];
  const prev = vals[vals.length - 2];
  const trendCol = last > prev ? GREEN : last < prev ? RED : FLAT;

  const fmtDate = d => {
    const ms = d?.toMillis ? d.toMillis() : new Date(d).getTime();
    const dt = new Date(ms);
    return `${dt.getDate()}/${dt.getMonth() + 1}`;
  };

  const safeId = playerId.replace(/[^a-z0-9]/gi, '-');

  return (
    <div className="card mb-4">
      <div className="flex items-center justify-between mb-2">
        <h3 style={{ fontSize: '0.95rem', margin: 0 }}>📈 Andamento Power Index</h3>
        <span style={{ fontSize: '0.72rem', color: trendCol, fontWeight: 700 }}>
          {last > prev ? '▲' : last < prev ? '▼' : '—'} {last.toFixed(1)}
        </span>
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', overflow: 'visible' }}>
        <defs>
          {segCols.map((_, i) => (
            <linearGradient key={i} id={`pi-seg-${safeId}-${i}`}
              gradientUnits="userSpaceOnUse"
              x1={toX(i).toFixed(1)} y1={toY(vals[i]).toFixed(1)}
              x2={toX(i + 1).toFixed(1)} y2={toY(vals[i + 1]).toFixed(1)}>
              <stop offset="0%" stopColor={ptCols[i]} />
              <stop offset="100%" stopColor={ptCols[i + 1]} />
            </linearGradient>
          ))}
        </defs>
        {[minV, (minV + maxV) / 2, maxV].map((v, i) => (
          <line key={i} x1={0} y1={toY(v)} x2={W} y2={toY(v)} stroke="#2D3748" strokeWidth="1" />
        ))}
        <text x={2} y={toY(maxV) + 1} fill={FLAT} fontSize="8" dominantBaseline="hanging">{maxV.toFixed(0)}</text>
        <text x={2} y={toY(minV) - 1} fill={FLAT} fontSize="8" dominantBaseline="auto">{minV.toFixed(0)}</text>
        {segCols.map((_, i) => (
          <path key={i}
            d={`M${toX(i).toFixed(1)} ${toY(vals[i]).toFixed(1)} L${toX(i + 1).toFixed(1)} ${toY(vals[i + 1]).toFixed(1)}`}
            fill="none" stroke={`url(#pi-seg-${safeId}-${i})`} strokeWidth="2.5" strokeLinecap="round" />
        ))}
        {vals.map((v, i) => {
          const isLast = i === vals.length - 1;
          return (
            <circle key={i} cx={toX(i).toFixed(1)} cy={toY(v).toFixed(1)}
              r={isLast ? 5 : 3}
              fill={isLast ? ptCols[i] : '#1A202C'}
              stroke={ptCols[i]} strokeWidth={isLast ? 2 : 1.5} />
          );
        })}
        <text x={toX(vals.length - 1)} y={toY(last) - 8}
          fill={ptCols[vals.length - 1]} fontSize="10" fontWeight="700" textAnchor="middle">
          {last.toFixed(1)}
        </text>
        {points.map((pt, i) => (
          <text key={i} x={toX(i)} y={H - 2} fill={FLAT} fontSize="8" textAnchor="middle">
            {fmtDate(pt.date)}
          </text>
        ))}
      </svg>
      <div style={{ fontSize: '0.62rem', color: FLAT, marginTop: '0.25rem' }}>
        Ultime {points.length} partite · PI finale = valore corrente della scheda
      </div>
    </div>
  );
}
