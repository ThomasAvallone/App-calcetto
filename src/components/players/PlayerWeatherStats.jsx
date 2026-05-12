import React, { useMemo } from 'react';
import { computePlayerWeatherStats } from '../../utils/weatherStats';

export default function PlayerWeatherStats({ playerMatches, playerId }) {
  const stats = useMemo(
    () => computePlayerWeatherStats(playerMatches, playerId),
    [playerMatches, playerId],
  );

  if (stats.length === 0) return null;

  return (
    <div className="card mb-4">
      <h3 className="mb-3" style={{ fontSize: '0.9rem', color: '#A0AEC0' }}>🌤️ METEO &amp; RENDIMENTO</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {stats.map(s => {
          const total = s.wins + s.draws + s.losses;
          const winPct  = total ? (s.wins  / total) * 100 : 0;
          const drawPct = total ? (s.draws / total) * 100 : 0;
          const lossPct = total ? (s.losses / total) * 100 : 0;
          const winRate = total ? Math.round((s.wins / total) * 100) : 0;
          return (
            <div key={s.key}>
              {/* Header row */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                  <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#E2E8F0' }}>{s.label}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  {/* Goals & assists */}
                  {(s.goals > 0 || s.assists > 0) && (
                    <span style={{ fontSize: '0.72rem', color: '#718096' }}>
                      {s.goals > 0 && `${s.goals}⚽`}
                      {s.goals > 0 && s.assists > 0 && ' '}
                      {s.assists > 0 && `${s.assists}🎯`}
                    </span>
                  )}
                  {/* W/D/L summary */}
                  <span style={{ fontSize: '0.72rem', color: '#A0AEC0', whiteSpace: 'nowrap' }}>
                    <span style={{ color: '#68D391' }}>{s.wins}V</span>
                    {' '}<span style={{ color: '#F6E05E' }}>{s.draws}P</span>
                    {' '}<span style={{ color: '#FC8181' }}>{s.losses}S</span>
                  </span>
                  {/* Win % */}
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: winRate >= 60 ? '#68D391' : winRate >= 40 ? '#F6E05E' : '#FC8181', minWidth: '30px', textAlign: 'right' }}>
                    {winRate}%
                  </span>
                </div>
              </div>
              {/* W/D/L bar */}
              <div style={{ display: 'flex', height: 5, borderRadius: 3, overflow: 'hidden', background: '#2D3748' }}>
                {winPct  > 0 && <div style={{ width: `${winPct}%`,  background: '#68D391' }} />}
                {drawPct > 0 && <div style={{ width: `${drawPct}%`, background: '#F6E05E' }} />}
                {lossPct > 0 && <div style={{ width: `${lossPct}%`, background: '#FC8181' }} />}
              </div>
              {/* Match count */}
              <div style={{ fontSize: '0.68rem', color: '#4A5568', marginTop: '0.2rem' }}>
                {s.matches} {s.matches === 1 ? 'partita' : 'partite'}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
