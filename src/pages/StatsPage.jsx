import React, { useState } from 'react';
import usePlayersStore from '../store/playersStore';

const TABS = [
  { key: 'goals',    label: '⚽ Gol' },
  { key: 'assists',  label: '🎯 Assist' },
  { key: 'winrate',  label: '🏆 Win %' },
  { key: 'matches',  label: '🏟️ Presenze' },
  { key: 'gk',       label: '🧤 GK' },
];

const AVATAR_COLORS = ['#4FD1C5', '#63B3ED', '#F6E05E', '#FC8181', '#68D391', '#B794F4', '#F6AD55'];

function Avatar({ name, size = 32 }) {
  const idx = name ? name.charCodeAt(0) % AVATAR_COLORS.length : 0;
  const color = AVATAR_COLORS[idx];
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: color + '22', border: `2px solid ${color}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0, fontWeight: 800, fontSize: size * 0.42, color,
    }}>
      {(name || '?')[0].toUpperCase()}
    </div>
  );
}

function MedalIcon({ rank }) {
  if (rank === 0) return <span style={{ fontSize: '1.1rem' }}>🥇</span>;
  if (rank === 1) return <span style={{ fontSize: '1.1rem' }}>🥈</span>;
  if (rank === 2) return <span style={{ fontSize: '1.1rem' }}>🥉</span>;
  return (
    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#718096', minWidth: '22px', textAlign: 'center' }}>
      {rank + 1}.
    </span>
  );
}

function LeaderboardRow({ rank, player, primary, secondary, primaryLabel, accentColor }) {
  return (
    <div className="flex items-center gap-3"
      style={{ padding: '0.6rem 0', borderBottom: '1px solid rgba(74,85,104,0.4)' }}>
      <div style={{ minWidth: '28px', display: 'flex', justifyContent: 'center' }}>
        <MedalIcon rank={rank} />
      </div>
      <Avatar name={player.name} size={32} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: '0.92rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {player.name}
        </div>
        {secondary != null && (
          <div className="text-xs text-muted">{secondary}</div>
        )}
      </div>
      <div style={{ fontWeight: 800, fontSize: '1.15rem', color: accentColor || '#4FD1C5' }}>
        {primary}
        {primaryLabel && <span style={{ fontSize: '0.7rem', color: '#718096', marginLeft: '2px' }}>{primaryLabel}</span>}
      </div>
    </div>
  );
}

export default function StatsPage() {
  const { players } = usePlayersStore();
  const [tab, setTab] = useState('goals');

  const withStats = players.map(p => {
    const hs = p.historicalStats || {};
    const as = p.stats || {};
    return {
      ...p,
      totalGoals:   (as.goals   || 0) + (hs.goals   || 0),
      totalAssists: (as.assists || 0) + (hs.assists || 0),
      totalMatches: (as.matches || 0) + (hs.matches || 0),
      totalWins:    (as.wins    || 0) + (hs.wins    || 0),
      totalDraws:   (as.draws   || 0) + (hs.draws   || 0),
      appMatches:   as.matches  || 0,
      appWins:      as.wins     || 0,
      gkMatches:    as.gkMatches || 0,
      gkGoalsConceded: as.gkGoalsConceded || 0,
    };
  });

  const getRanked = (sortFn, filterFn) =>
    [...withStats].filter(filterFn || (() => true)).sort(sortFn).slice(0, 10);

  const rankings = {
    goals: getRanked((a, b) => b.totalGoals - a.totalGoals, p => p.totalGoals > 0),
    assists: getRanked((a, b) => b.totalAssists - a.totalAssists, p => p.totalAssists > 0),
    winrate: getRanked(
      (a, b) => {
        const ra = a.totalMatches >= 3 ? (a.totalWins + a.totalDraws * 0.5) / a.totalMatches : -1;
        const rb = b.totalMatches >= 3 ? (b.totalWins + b.totalDraws * 0.5) / b.totalMatches : -1;
        return rb - ra;
      },
      p => p.totalMatches >= 3
    ),
    matches: getRanked((a, b) => b.totalMatches - a.totalMatches, p => p.totalMatches > 0),
    gk: getRanked(
      (a, b) => {
        const ra = a.gkMatches >= 2 ? a.gkGoalsConceded / a.gkMatches : 999;
        const rb = b.gkMatches >= 2 ? b.gkGoalsConceded / b.gkMatches : 999;
        return ra - rb;
      },
      p => p.gkMatches >= 2
    ),
  };

  const tabConfig = {
    goals:   { accent: '#4FD1C5', getVal: p => p.totalGoals, getLabel: () => 'gol', getSub: p => `${p.totalMatches} partite · ${(p.totalGoals / Math.max(1, p.totalMatches)).toFixed(2)} gol/match` },
    assists: { accent: '#63B3ED', getVal: p => p.totalAssists, getLabel: () => 'assist', getSub: p => `${p.totalMatches} partite` },
    winrate: { accent: '#F6E05E', getVal: p => `${Math.round((p.totalWins + p.totalDraws * 0.5) / p.totalMatches * 100)}`, getLabel: () => '%', getSub: p => `${p.totalWins}V · ${p.totalDraws}P · ${p.totalMatches - p.totalWins - p.totalDraws}S su ${p.totalMatches} partite` },
    matches: { accent: '#A0AEC0', getVal: p => p.totalMatches, getLabel: () => 'pt', getSub: p => `${p.totalWins}V · ${p.totalDraws}P · ${p.totalMatches - p.totalWins - p.totalDraws}S` },
    gk:      { accent: '#68D391', getVal: p => (p.gkGoalsConceded / p.gkMatches).toFixed(1), getLabel: () => 'gol/match', getSub: p => `${p.gkGoalsConceded} gol subiti in ${p.gkMatches} turni da GK` },
  };

  const cfg = tabConfig[tab];
  const list = rankings[tab] || [];

  return (
    <div className="page-content">
      <h2 style={{ paddingTop: '0.5rem', marginBottom: '1.25rem' }}>📊 Classifiche</h2>

      {/* Tab bar */}
      <div style={{
        display: 'flex', gap: '0.4rem', marginBottom: '1.25rem',
        overflowX: 'auto', paddingBottom: '0.25rem',
      }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '0.4rem 0.75rem', borderRadius: '999px', border: 'none',
              cursor: 'pointer', whiteSpace: 'nowrap', fontSize: '0.82rem', fontWeight: 600,
              background: tab === t.key ? cfg?.accent || '#4FD1C5' : 'rgba(74,85,104,0.5)',
              color: tab === t.key ? '#1A202C' : '#A0AEC0',
              transition: 'all 0.15s',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#718096' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>📭</div>
          <p>Nessun dato sufficiente</p>
          {tab === 'winrate' && <p className="text-xs" style={{ marginTop: '0.5rem' }}>Minimo 3 partite richieste</p>}
          {tab === 'gk' && <p className="text-xs" style={{ marginTop: '0.5rem' }}>Minimo 2 turni da portiere richiesti</p>}
        </div>
      ) : (
        <div className="card">
          {list.map((p, i) => (
            <LeaderboardRow
              key={p.id}
              rank={i}
              player={p}
              primary={cfg.getVal(p)}
              primaryLabel={cfg.getLabel(p)}
              secondary={cfg.getSub(p)}
              accentColor={cfg.accent}
            />
          ))}
        </div>
      )}
    </div>
  );
}
