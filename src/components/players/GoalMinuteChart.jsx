import React, { useMemo } from 'react';

const BUCKETS = [
  { label: "0'", range: [0, 9] },
  { label: "10'", range: [10, 19] },
  { label: "20'", range: [20, 29] },
  { label: "30'", range: [30, 39] },
  { label: "40'", range: [40, 49] },
  { label: "50'", range: [50, 59] },
  { label: "60'+", range: [60, Infinity] },
];

export default function GoalMinuteChart({ playerMatches, playerId }) {
  const data = useMemo(() => {
    const buckets = BUCKETS.map(b => ({ ...b, goals: 0, assists: 0, autogoals: 0 }));
    let hasMinuteData = false;

    for (const match of (playerMatches || [])) {
      if (match.isHistorical || match.status !== 'finished') continue;
      for (const ev of (match.events || [])) {
        if (ev.minute == null) continue;
        const bucket = buckets.find(b => ev.minute >= b.range[0] && ev.minute <= b.range[1]);
        if (!bucket) continue;
        if (ev.type === 'goal' && ev.scorerId === playerId)   { bucket.goals++;     hasMinuteData = true; }
        if (ev.type === 'goal' && ev.assistId === playerId)   { bucket.assists++;   hasMinuteData = true; }
        if (ev.type === 'autogoal' && ev.scorerId === playerId) { bucket.autogoals++; hasMinuteData = true; }
      }
    }

    return hasMinuteData ? buckets : null;
  }, [playerMatches, playerId]);

  if (!data) return null;

  const maxTotal = Math.max(...data.map(b => b.goals + b.assists + b.autogoals), 1);

  return (
    <div className="card mb-4">
      <h3 className="mb-3" style={{ fontSize: '0.9rem', color: '#A0AEC0' }}>⏱️ DISTRIBUZIONE PER MINUTO</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
        {data.map(b => {
          const total = b.goals + b.assists + b.autogoals;
          const pctGoals    = maxTotal ? (b.goals    / maxTotal) * 100 : 0;
          const pctAssists  = maxTotal ? (b.assists  / maxTotal) * 100 : 0;
          const pctAutogoals = maxTotal ? (b.autogoals / maxTotal) * 100 : 0;
          return (
            <div key={b.label} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.68rem', color: '#4A5568', minWidth: '28px', textAlign: 'right', flexShrink: 0 }}>
                {b.label}
              </span>
              <div style={{ flex: 1, display: 'flex', height: 12, borderRadius: 4, overflow: 'hidden', background: '#2D3748' }}>
                {pctGoals    > 0 && <div style={{ width: `${pctGoals}%`,     background: '#68D391', transition: 'width 0.4s' }} />}
                {pctAssists  > 0 && <div style={{ width: `${pctAssists}%`,   background: '#63B3ED', transition: 'width 0.4s' }} />}
                {pctAutogoals > 0 && <div style={{ width: `${pctAutogoals}%`, background: '#FC8181', transition: 'width 0.4s' }} />}
              </div>
              {total > 0 && (
                <span style={{ fontSize: '0.68rem', color: '#718096', minWidth: '60px', flexShrink: 0 }}>
                  {b.goals    > 0 && <span style={{ color: '#68D391' }}>{b.goals}⚽ </span>}
                  {b.assists  > 0 && <span style={{ color: '#63B3ED' }}>{b.assists}🎯 </span>}
                  {b.autogoals > 0 && <span style={{ color: '#FC8181' }}>{b.autogoals}🤦</span>}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.6rem' }}>
        <span style={{ fontSize: '0.65rem', color: '#68D391' }}>⚽ Gol</span>
        <span style={{ fontSize: '0.65rem', color: '#63B3ED' }}>🎯 Assist</span>
        <span style={{ fontSize: '0.65rem', color: '#FC8181' }}>🤦 Autogol</span>
      </div>
    </div>
  );
}
