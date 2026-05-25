import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { safeDate } from '../../utils/dateUtils';

export default function InjuryHistory({ playerMatches, playerId }) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);

  const { injuries, totalMatches } = useMemo(() => {
    const list = [];
    let total = 0;
    for (const match of (playerMatches || [])) {
      if (match.isHistorical || match.status !== 'finished') continue;
      total++;
      for (const ev of (match.events || [])) {
        if (ev.type === 'injury' && ev.playerId === playerId) {
          list.push({
            matchId: match.id,
            date: safeDate(match.date),
            minute: ev.minute,
            team: ev.team,
            opponent: ev.team === 'red' ? 'Blu' : 'Rossi',
            redScore: match.redScore ?? 0,
            blueScore: match.blueScore ?? 0,
          });
        }
      }
    }
    list.sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0));
    return { injuries: list, totalMatches: total };
  }, [playerMatches, playerId]);

  if (totalMatches === 0) return null;

  const count = injuries.length;
  const isHealthy = count === 0;
  const frequency = !isHealthy ? Math.round(totalMatches / count) : 0;
  const lastInjury = injuries[0];

  const goTo = (id) => navigate(`/history/${id}`);

  return (
    <div className="card mb-4" style={{
      border: `1px solid ${isHealthy ? 'rgba(104,211,145,0.22)' : 'rgba(252,129,129,0.28)'}`,
      background: isHealthy ? 'rgba(104,211,145,0.04)' : 'rgba(252,129,129,0.04)',
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <h3 style={{ fontSize: '0.92rem', margin: 0, color: isHealthy ? '#68D391' : '#FC8181', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <span style={{ fontSize: '1.05rem' }}>🚑</span>
          Infermeria
        </h3>
        <div style={{
          padding: '0.2rem 0.7rem', borderRadius: '999px',
          background: isHealthy ? 'rgba(104,211,145,0.18)' : 'rgba(252,129,129,0.22)',
          color: isHealthy ? '#68D391' : '#FC8181',
          fontWeight: 800, fontSize: '0.88rem', lineHeight: 1,
          border: `1px solid ${isHealthy ? 'rgba(104,211,145,0.35)' : 'rgba(252,129,129,0.4)'}`,
          minWidth: '32px', textAlign: 'center',
        }}>
          {count}
        </div>
      </div>

      {isHealthy ? (
        <p style={{ fontSize: '0.82rem', color: '#A0AEC0', margin: 0, lineHeight: 1.55 }}>
          ✅ Sempre disponibile, mai uscito per infortunio in {totalMatches} partit{totalMatches === 1 ? 'a' : 'e'}.
        </p>
      ) : (
        <>
          <p style={{ fontSize: '0.82rem', color: '#CBD5E0', margin: 0, lineHeight: 1.55 }}>
            <strong style={{ color: '#FC8181' }}>{count}</strong> infortun{count === 1 ? 'io' : 'i'} su <strong>{totalMatches}</strong> partite
            {frequency > 0 && <span style={{ color: '#718096' }}> · ~1 ogni {frequency}</span>}
            {lastInjury?.date && (
              <span style={{ color: '#718096' }}>
                {' · ultimo il '}{format(lastInjury.date, 'd MMM yyyy', { locale: it })}
              </span>
            )}
          </p>

          <button
            onClick={() => setExpanded(v => !v)}
            style={{
              marginTop: '0.7rem', background: 'none', border: 'none',
              color: '#FC8181', cursor: 'pointer', fontSize: '0.75rem',
              padding: 0, fontWeight: 700, letterSpacing: '0.02em',
            }}
          >
            {expanded ? '▲ Nascondi cronistoria' : '▼ Vedi cronistoria'}
          </button>

          {expanded && (
            <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {injuries.map((inj, i) => (
                <div
                  key={`${inj.matchId}-${i}`}
                  onClick={() => goTo(inj.matchId)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && goTo(inj.matchId)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.65rem',
                    padding: '0.55rem 0.7rem', borderRadius: '8px',
                    background: 'rgba(252,129,129,0.07)',
                    border: '1px solid rgba(252,129,129,0.18)',
                    cursor: 'pointer', transition: 'background 0.15s, transform 0.1s',
                  }}
                >
                  <div style={{
                    padding: '0.22rem 0.55rem', borderRadius: '999px',
                    background: 'rgba(252,129,129,0.25)', color: '#FC8181',
                    fontWeight: 800, fontSize: '0.72rem', minWidth: '40px', textAlign: 'center',
                    lineHeight: 1, flexShrink: 0,
                  }}>
                    {inj.minute != null ? `${inj.minute}'` : '—'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.82rem', color: '#E2E8F0', fontWeight: 500 }}>
                      {inj.date ? format(inj.date, 'd MMM yyyy', { locale: it }) : 'Data sconosciuta'}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: '#718096' }}>
                      {inj.team === 'red' ? '🔴' : '🔵'} vs {inj.opponent} · {inj.redScore}–{inj.blueScore}
                    </div>
                  </div>
                  <span style={{ color: '#4A5568', fontSize: '0.95rem', flexShrink: 0 }}>›</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
