import React, { useMemo, useState } from 'react';
import { getMs } from '../../utils/dateUtils';

const LINE_COLORS = ['#F6AD55', '#63B3ED', '#68D391', '#FC8181', '#B794F4', '#4FD1C5'];

const VW = 400, VH = 200;
const MARGIN = { top: 10, right: 68, bottom: 22, left: 30 };
const CW = VW - MARGIN.left - MARGIN.right;
const CH = VH - MARGIN.top - MARGIN.bottom;

function LineChart({ series, xLabels }) {
  if (!series.length || !series[0].values.length) return null;

  const N = series[0].values.length;
  const maxVal = Math.max(...series.flatMap(s => s.values), 1);

  const xScale = i => MARGIN.left + (N <= 1 ? CW / 2 : (i / (N - 1)) * CW);
  const yScale = v => MARGIN.top + CH - (v / maxVal) * CH;

  const yStep = Math.ceil(maxVal / 4) || 1;
  const yTicks = [];
  for (let v = 0; v <= maxVal; v += yStep) yTicks.push(v);

  const xStep = N <= 10 ? 1 : N <= 25 ? 5 : 10;
  const xTicks = [];
  for (let i = 0; i < N; i += xStep) xTicks.push(i);
  if (xTicks[xTicks.length - 1] !== N - 1) xTicks.push(N - 1);

  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} width="100%" height={VH} style={{ display: 'block', overflow: 'visible' }}>
      {yTicks.map(v => (
        <g key={v}>
          <line
            x1={MARGIN.left} y1={yScale(v)}
            x2={MARGIN.left + CW} y2={yScale(v)}
            stroke="rgba(74,85,104,0.3)" strokeWidth={0.5}
          />
          <text x={MARGIN.left - 4} y={yScale(v) + 4} textAnchor="end" fill="#718096" fontSize={9}>{v}</text>
        </g>
      ))}

      {xTicks.map(i => (
        <text key={i} x={xScale(i)} y={VH - 4} textAnchor="middle" fill="#718096" fontSize={8}>
          {xLabels?.[i] ?? i + 1}
        </text>
      ))}

      {series.map((s, idx) => {
        const color = LINE_COLORS[idx % LINE_COLORS.length];
        const pts = s.values.map((v, i) => `${xScale(i)},${yScale(v)}`).join(' ');
        const lx = xScale(N - 1);
        const ly = yScale(s.values[N - 1]);
        return (
          <g key={s.id}>
            <polyline points={pts} fill="none" stroke={color} strokeWidth={2}
              strokeLinejoin="round" strokeLinecap="round" />
            <circle cx={lx} cy={ly} r={3.5} fill={color} />
            <text x={lx + 6} y={ly + 4} fill={color} fontSize={9} fontWeight={700}>
              {s.name.split(' ')[0]}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default function TrendTab({ finishedMatches, players }) {
  const [metric, setMetric] = useState('goals');

  const { series, xLabels } = useMemo(() => {
    const sorted = [...finishedMatches]
      .filter(m => !m.isHistorical)
      .sort((a, b) => getMs(a.date) - getMs(b.date));

    if (!sorted.length || !players.length) return { series: [], xLabels: [] };

    const pidSet = new Set(players.map(p => p.id));
    const cumulative = {};
    pidSet.forEach(pid => { cumulative[pid] = []; });

    for (const m of sorted) {
      const events = m.events || [];
      const matchGoals = {}, matchAssists = {}, matchWins = {};

      for (const e of events) {
        if (e.type === 'goal' && e.scorerId) matchGoals[e.scorerId] = (matchGoals[e.scorerId] || 0) + 1;
        if (e.type === 'goal' && e.assistId) matchAssists[e.assistId] = (matchAssists[e.assistId] || 0) + 1;
      }
      for (const [team, my, their] of [
        [m.redTeam || [], m.redScore ?? 0, m.blueScore ?? 0],
        [m.blueTeam || [], m.blueScore ?? 0, m.redScore ?? 0],
      ]) {
        if (my > their) for (const p of team) matchWins[p.id] = (matchWins[p.id] || 0) + 1;
      }

      const src = metric === 'goals' ? matchGoals : metric === 'assists' ? matchAssists : matchWins;
      for (const pid of pidSet) {
        const prev = cumulative[pid].length ? cumulative[pid][cumulative[pid].length - 1] : 0;
        cumulative[pid].push(prev + (src[pid] || 0));
      }
    }

    const totals = players
      .filter(p => cumulative[p.id])
      .map(p => ({ p, total: cumulative[p.id][sorted.length - 1] || 0 }))
      .filter(x => x.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 6);

    if (!totals.length) return { series: [], xLabels: [] };

    return {
      series: totals.map(({ p }) => ({ id: p.id, name: p.name, values: cumulative[p.id] })),
      xLabels: sorted.map((_, i) => String(i + 1)),
    };
  }, [finishedMatches, players, metric]);

  const metricLabel = metric === 'goals' ? 'Gol' : metric === 'assists' ? 'Assist' : 'Vittorie';

  return (
    <div>
      <div className="flex gap-2 mb-4" style={{ justifyContent: 'center' }}>
        {[
          { key: 'goals', label: '⚽ Gol' },
          { key: 'assists', label: '🎯 Assist' },
          { key: 'wins', label: '🏆 Vittorie' },
        ].map(({ key, label }) => (
          <button key={key} onClick={() => setMetric(key)} className="btn"
            style={{
              padding: '0.35rem 0.85rem', fontSize: '0.82rem',
              background: metric === key ? 'rgba(79,209,197,0.18)' : 'transparent',
              border: `1px solid ${metric === key ? '#4FD1C5' : 'rgba(74,85,104,0.5)'}`,
              color: metric === key ? '#4FD1C5' : '#718096',
            }}>
            {label}
          </button>
        ))}
      </div>

      {series.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#718096' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📈</div>
          <p className="text-sm">Nessun dato disponibile per questo periodo</p>
        </div>
      ) : (
        <>
          <div className="card mb-3">
            <h3 className="mb-1" style={{ fontSize: '0.88rem' }}>
              📈 {metricLabel} cumulativi — top {series.length} giocatori
            </h3>
            <p className="text-xs text-muted mb-3">Solo partite registrate nell'app · gli storici non sono inclusi</p>
            <LineChart series={series} xLabels={xLabels} />
          </div>

          <div className="card">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.55rem' }}>
              {series.map((s, idx) => {
                const color = LINE_COLORS[idx % LINE_COLORS.length];
                return (
                  <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
                    <span style={{ fontSize: '0.82rem', color: '#CBD5E0' }}>
                      {s.name}{' '}
                      <span style={{ color, fontWeight: 700 }}>({s.values[s.values.length - 1]})</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
