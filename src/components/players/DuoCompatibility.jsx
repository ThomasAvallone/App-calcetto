import React, { useMemo, useState } from 'react';
import { getMs } from '../../utils/dateUtils';
import { CLR_WIN, CLR_LOSS, CLR_MUTED } from '../../constants/colors';

// Calcola win-rate quando insieme e quando avversari, per ogni altro giocatore.
export default function DuoCompatibility({ player, allMatches = [], allPlayers = [] }) {
  const [expanded, setExpanded] = useState(false);
  const [sortBy, setSortBy] = useState('together'); // 'together' | 'against'

  const stats = useMemo(() => {
    const finished = allMatches.filter(m => m.status === 'finished' && !m.isHistorical);
    const result = [];

    for (const other of allPlayers) {
      if (other.id === player.id) continue;
      let together = { wins: 0, draws: 0, losses: 0, matches: 0 };
      let against  = { myWins: 0, theirWins: 0, draws: 0, matches: 0 };

      for (const m of finished) {
        const meInRed    = (m.redTeam  || []).some(p => p.id === player.id);
        const meInBlue   = (m.blueTeam || []).some(p => p.id === player.id);
        const themInRed  = (m.redTeam  || []).some(p => p.id === other.id);
        const themInBlue = (m.blueTeam || []).some(p => p.id === other.id);
        const meIn = meInRed || meInBlue;
        const themIn = themInRed || themInBlue;
        if (!meIn || !themIn) continue;

        const sameTeam = (meInRed && themInRed) || (meInBlue && themInBlue);
        const myScore    = meInRed ? (m.redScore ?? 0) : (m.blueScore ?? 0);
        const theirScore = meInRed ? (m.blueScore ?? 0) : (m.redScore ?? 0);

        if (sameTeam) {
          together.matches++;
          if (myScore > theirScore) together.wins++;
          else if (myScore < theirScore) together.losses++;
          else together.draws++;
        } else {
          against.matches++;
          const theirActual = themInRed ? (m.redScore ?? 0) : (m.blueScore ?? 0);
          if (myScore > theirActual) against.myWins++;
          else if (myScore < theirActual) against.theirWins++;
          else against.draws++;
        }
      }

      const minMatches = 2;
      if (together.matches < minMatches && against.matches < minMatches) continue;

      const togetherWR = together.matches > 0
        ? Math.round((together.wins + together.draws * 0.5) / together.matches * 100)
        : null;
      const againstWR = against.matches > 0
        ? Math.round((against.myWins + against.draws * 0.5) / against.matches * 100)
        : null;

      result.push({ other, together, against, togetherWR, againstWR });
    }

    return result;
  }, [allMatches, allPlayers, player.id]);

  if (stats.length === 0) return null;

  const sorted = [...stats].sort((a, b) => {
    if (sortBy === 'together') {
      return (b.togetherWR ?? -1) - (a.togetherWR ?? -1);
    }
    return (b.againstWR ?? -1) - (a.againstWR ?? -1);
  });

  const wrColor = wr => wr == null ? CLR_MUTED : wr >= 60 ? CLR_WIN : wr <= 40 ? CLR_LOSS : '#F6E05E';

  return (
    <div className="card mb-4" style={{ border: '1px solid rgba(183,148,246,0.25)' }}>
      <button
        onClick={() => setExpanded(v => !v)}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
      >
        <h3 style={{ fontSize: '0.95rem', margin: 0, color: '#B794F4' }}>🤝 Compatibilità Duo</h3>
        <span style={{ fontSize: '0.72rem', color: CLR_MUTED }}>{stats.length} giocatori {expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <>
          <div style={{ display: 'flex', gap: '0.35rem', marginTop: '0.75rem', marginBottom: '0.65rem' }}>
            {[
              { key: 'together', label: '🤝 Insieme' },
              { key: 'against', label: '⚔️ Avversari' },
            ].map(o => (
              <button
                key={o.key}
                onClick={() => setSortBy(o.key)}
                style={{
                  padding: '0.25rem 0.65rem', borderRadius: '999px', border: 'none', cursor: 'pointer',
                  fontWeight: 600, fontSize: '0.75rem',
                  background: sortBy === o.key ? 'rgba(183,148,246,0.2)' : 'rgba(74,85,104,0.35)',
                  color: sortBy === o.key ? '#B794F4' : '#A0AEC0',
                }}
              >
                {o.label}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {sorted.map(({ other, together, against, togetherWR, againstWR }) => (
              <div
                key={other.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto auto',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.45rem 0.55rem',
                  borderRadius: '7px',
                  background: 'rgba(74,85,104,0.18)',
                }}
              >
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#E2E8F0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {other.name}
                </span>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '0.65rem', color: CLR_MUTED, marginBottom: '1px' }}>🤝 {together.matches}pt</div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 700, color: wrColor(togetherWR) }}>
                    {togetherWR != null ? `${togetherWR}%` : '–'}
                  </div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '0.65rem', color: CLR_MUTED, marginBottom: '1px' }}>⚔️ {against.matches}pt</div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 700, color: wrColor(againstWR) }}>
                    {againstWR != null ? `${againstWR}%` : '–'}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p style={{ fontSize: '0.65rem', color: CLR_MUTED, marginTop: '0.5rem', textAlign: 'right' }}>
            Solo partite non storiche · min 2 partite
          </p>
        </>
      )}
    </div>
  );
}
