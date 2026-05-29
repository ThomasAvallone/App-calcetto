import React, { useMemo } from 'react';
import { computeBadges } from '../../utils/badges';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { getMs } from '../../utils/dateUtils';
import { AVATAR_COLORS, CLR_WIN, CLR_LOSS, CLR_DRAW, CLR_MUTED } from '../../constants/colors';

export function PiArc({ value, size = 120, glow = false }) {
  const r = size * 0.38;
  const sw = size * 0.068;
  const circ = 2 * Math.PI * r;
  const fill = (Math.max(0, Math.min(100, value)) / 100) * circ;
  const mid = size / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}
      style={{ display: 'block' }}
      className={glow ? 'pi-glow' : undefined}>
      <circle cx={mid} cy={mid} r={r} fill="none" stroke="#2D3748" strokeWidth={sw} />
      <circle cx={mid} cy={mid} r={r} fill="none" stroke="#4FD1C5" strokeWidth={sw}
        strokeDasharray={`${fill} ${circ}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${mid} ${mid})`}
      />
    </svg>
  );
}

export function getRoleIcon(role) {
  const icons = { 'Portiere': '🧤', 'Difensore': '🛡️', 'Centrocampista': '⚙️', 'Attaccante': '⚡' };
  return icons[role] || '⚽';
}

export function PlayerAvatar({ name, size = 36 }) {
  const idx = name ? name.charCodeAt(0) % AVATAR_COLORS.length : 0;
  const color = AVATAR_COLORS[idx];
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: color + '22',
      border: `2px solid ${color}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
      fontWeight: 800, fontSize: size * 0.42,
      color,
    }}>
      {(name || '?')[0].toUpperCase()}
    </div>
  );
}

export function PlayerMatchHistory({ playerMatches: rawPlayerMatches, playerId }) {
  const localGetMs = d => d?.toMillis ? d.toMillis() : d ? new Date(d).getTime() : 0;
  const playerMatches = [...rawPlayerMatches]
    .sort((a, b) => localGetMs(b.date) - localGetMs(a.date))
    .slice(0, 8);

  if (playerMatches.length === 0) return null;

  return (
    <div className="card">
      <h3 className="mb-3" style={{ fontSize: '0.95rem' }}>🕐 Ultime Partite</h3>
      {playerMatches.map(m => {
        const inRed = (m.redTeam || []).some(p => p.id === playerId);
        const myScore = inRed ? m.redScore : m.blueScore;
        const theirScore = inRed ? m.blueScore : m.redScore;
        const result = myScore > theirScore ? 'win' : myScore < theirScore ? 'loss' : 'draw';
        const resultColor = result === 'win' ? CLR_WIN : result === 'loss' ? CLR_LOSS : CLR_DRAW;
        const resultLabel = result === 'win' ? 'V' : result === 'loss' ? 'S' : 'P';
        const myGoals = (m.events || []).filter(e => e.type === 'goal' && e.scorerId === playerId).length;
        const myAssists = (m.events || []).filter(e => e.type === 'goal' && e.assistId === playerId).length;
        const myAutogoals = (m.events || []).filter(e => e.type === 'autogoal' && e.scorerId === playerId).length;
        const d = m.date?.toDate ? m.date.toDate() : new Date(m.date);
        return (
          <div key={m.id} className="flex items-center gap-3"
            style={{ padding: '0.5rem 0', borderBottom: '1px solid rgba(74,85,104,0.4)' }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
              background: resultColor + '22', border: `2px solid ${resultColor}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 800, fontSize: '0.75rem', color: resultColor,
            }}>
              {resultLabel}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>
                🔴 {m.redScore ?? '–'} — {m.blueScore ?? '–'} 🔵
              </div>
              <div className="text-xs text-muted">
                {format(d, 'dd MMM yyyy', { locale: it })}
                {myGoals > 0 && <span style={{ color: '#4FD1C5', marginLeft: '0.4rem' }}>⚽{myGoals}</span>}
                {myAssists > 0 && <span style={{ color: '#63B3ED', marginLeft: '0.3rem' }}>🎯{myAssists}</span>}
                {myAutogoals > 0 && <span style={{ color: CLR_LOSS, marginLeft: '0.3rem' }}>🤦{myAutogoals}</span>}
              </div>
            </div>
            <div style={{ fontSize: '0.75rem', color: '#718096', whiteSpace: 'nowrap' }}>
              {inRed ? '🔴' : '🔵'}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function PlayerRecords({ playerMatches: rawPlayerMatches, player }) {
  const pid = player.id;
  const playerMatches = [...rawPlayerMatches].sort((a, b) => getMs(a.date) - getMs(b.date));

  if (playerMatches.length === 0) return null;

  let maxWinStreak = 0, maxLossStreak = 0, curWin = 0, curLoss = 0;
  let bestGoals = 0, bestGoalsDate = null;

  for (const m of playerMatches) {
    const inRed = (m.redTeam || []).some(p => p.id === pid);
    const my = inRed ? (m.redScore ?? 0) : (m.blueScore ?? 0);
    const their = inRed ? (m.blueScore ?? 0) : (m.redScore ?? 0);
    if (my > their) { curWin++; curLoss = 0; }
    else if (my < their) { curLoss++; curWin = 0; }
    else { curWin = 0; curLoss = 0; }
    maxWinStreak = Math.max(maxWinStreak, curWin);
    maxLossStreak = Math.max(maxLossStreak, curLoss);
    const goals = (m.events || []).filter(e => e.type === 'goal' && e.scorerId === pid).length;
    if (goals > bestGoals) { bestGoals = goals; bestGoalsDate = m.date; }
  }

  const firstDate = (() => {
    const d = playerMatches[0]?.date;
    return d?.toDate ? d.toDate() : d ? new Date(d) : null;
  })();
  const bestGoalMatchDate = (() => {
    if (!bestGoalsDate) return null;
    return bestGoalsDate?.toDate ? bestGoalsDate.toDate() : new Date(bestGoalsDate);
  })();

  const items = [
    { icon: '🏟️', label: 'Partite totali', value: playerMatches.length },
    maxWinStreak >= 2 && { icon: '🔥', label: 'Miglior serie V', value: `${maxWinStreak} di fila` },
    maxLossStreak >= 2 && { icon: '📉', label: 'Peggior serie S', value: `${maxLossStreak} di fila` },
    bestGoals >= 2 && { icon: '🎩', label: 'Record gol in 1 partita', value: `${bestGoals} gol${bestGoalMatchDate ? ` (${format(bestGoalMatchDate, 'dd/MM/yy', { locale: it })})` : ''}` },
    firstDate && { icon: '📅', label: 'Prima partita', value: format(firstDate, 'dd MMM yyyy', { locale: it }) },
  ].filter(Boolean);

  return (
    <div className="card mb-4">
      <h3 className="mb-3" style={{ fontSize: '0.95rem' }}>📊 Record Personali</h3>
      {items.map(item => (
        <div key={item.label} className="flex items-center justify-between"
          style={{ padding: '0.5rem 0', borderBottom: '1px solid #2D3748' }}>
          <span className="text-secondary">{item.icon} {item.label}</span>
          <span style={{ fontWeight: 600 }}>{item.value}</span>
        </div>
      ))}
    </div>
  );
}

export function PlayerBadges({ player, seasonStats, allMatches }) {
  // Memoizzato: computeBadges è O(badge × partite × eventi) e gira ~40 check su
  // tutte le partite. Senza memo si ricalcola a ogni render del dettaglio player.
  const badges = useMemo(
    () => computeBadges(player, seasonStats, allMatches),
    [player, seasonStats, allMatches],
  );
  if (badges.length === 0) return null;
  return (
    <div className="card mb-4">
      <h3 className="mb-3" style={{ fontSize: '0.95rem' }}>🏅 Badge</h3>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        {badges.map(b => (
          <div key={b.id} title={b.desc} style={{
            display: 'flex', alignItems: 'center', gap: '0.35rem',
            padding: '0.3rem 0.7rem', borderRadius: '999px', fontSize: '0.8rem', fontWeight: 600,
            background: b.positive ? 'rgba(104,211,145,0.12)' : 'rgba(252,129,129,0.12)',
            color: b.positive ? CLR_WIN : CLR_LOSS,
            border: `1px solid ${b.positive ? 'rgba(104,211,145,0.35)' : 'rgba(252,129,129,0.35)'}`,
            cursor: 'default',
          }}>
            <span>{b.icon}</span>
            <span>{b.label}</span>
          </div>
        ))}
      </div>
      <div style={{ marginTop: '0.6rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
        {badges.map(b => (
          <div key={b.id} style={{ fontSize: '0.68rem', color: '#718096' }}>
            {b.icon} <strong style={{ color: b.positive ? CLR_WIN : CLR_LOSS }}>{b.label}</strong> — {b.desc}
          </div>
        ))}
      </div>
    </div>
  );
}

export function StreakBadge({ streak }) {
  if (!streak || streak.count < 2) return null;
  const isWin = streak.type === 'win';
  const isLoss = streak.type === 'loss';
  if (!isWin && !isLoss) return null;
  return (
    <span style={{
      fontSize: '0.62rem', fontWeight: 700, padding: '0.1rem 0.35rem',
      borderRadius: '999px',
      background: isWin ? 'rgba(104,211,145,0.15)' : 'rgba(252,129,129,0.15)',
      color: isWin ? CLR_WIN : CLR_LOSS,
      border: `1px solid ${isWin ? 'rgba(104,211,145,0.4)' : 'rgba(252,129,129,0.4)'}`,
      whiteSpace: 'nowrap',
    }}>
      {isWin ? '🔥' : '📉'}{streak.count}
    </span>
  );
}
