import React, { useMemo, useState } from 'react';
import { CLR_MUTED } from '../../constants/colors';

// Achievement: { id, icon, label, desc, target, getValue(stats, matches, playerId) }
const ACHIEVEMENTS = [
  // --- Gol ---
  { id: 'goals_10',  icon: '⚽', label: 'Bomber',       desc: '10 gol segnati',    cat: 'attack',  target: 10,  getValue: s => s.goals },
  { id: 'goals_25',  icon: '🥇', label: 'Cecchino',     desc: '25 gol segnati',    cat: 'attack',  target: 25,  getValue: s => s.goals },
  { id: 'goals_50',  icon: '💥', label: 'Macchina da guerra', desc: '50 gol segnati', cat: 'attack', target: 50, getValue: s => s.goals },
  { id: 'goals_100', icon: '🌋', label: 'Leggenda offensiva', desc: '100 gol segnati', cat: 'attack', target: 100, getValue: s => s.goals },

  // --- Assist ---
  { id: 'assists_10', icon: '🎯', label: 'Regista',      desc: '10 assist',         cat: 'attack',  target: 10,  getValue: s => s.assists },
  { id: 'assists_25', icon: '🧠', label: 'Geometra',     desc: '25 assist',         cat: 'attack',  target: 25,  getValue: s => s.assists },
  { id: 'assists_50', icon: '🔮', label: 'Mago del passaggio', desc: '50 assist',   cat: 'attack',  target: 50,  getValue: s => s.assists },

  // --- Partite ---
  { id: 'matches_10',  icon: '🏟️', label: 'Veterano',    desc: '10 partite giocate', cat: 'presence', target: 10,  getValue: s => s.matches },
  { id: 'matches_30',  icon: '📅',  label: 'Habitué',     desc: '30 partite giocate', cat: 'presence', target: 30,  getValue: s => s.matches },
  { id: 'matches_50',  icon: '🎖️',  label: 'Pilastro',    desc: '50 partite giocate', cat: 'presence', target: 50,  getValue: s => s.matches },
  { id: 'matches_100', icon: '🏆',  label: 'Monumento',   desc: '100 partite giocate', cat: 'presence', target: 100, getValue: s => s.matches },

  // --- Vittorie ---
  { id: 'wins_10',  icon: '✌️', label: 'Vincente',    desc: '10 vittorie',        cat: 'wins',    target: 10,  getValue: s => s.wins },
  { id: 'wins_25',  icon: '🏅', label: 'Campione',    desc: '25 vittorie',        cat: 'wins',    target: 25,  getValue: s => s.wins },
  { id: 'wins_50',  icon: '👑', label: 'Dominatore',  desc: '50 vittorie',        cat: 'wins',    target: 50,  getValue: s => s.wins },

  // --- GK ---
  { id: 'gk_clean10', icon: '🧤', label: 'Muro',        desc: '10 clean sheet',    cat: 'gk',      target: 10,  getValue: (s, m, pid) => {
    let cs = 0;
    for (const match of (m || [])) {
      if (match.isHistorical || match.status !== 'finished') continue;
      if (![...(match.redTeam||[]),...(match.blueTeam||[])].some(p => p.id === pid)) continue;
      const conceded = (match.events||[]).filter(e => e.gkConcededId === pid).length;
      if (conceded === 0) cs++;
    }
    return cs;
  }},

  // --- Autogol ---
  { id: 'autogoal_5', icon: '😬', label: 'Sfortuna nera', desc: '5 autogol',        cat: 'shame',   target: 5,   getValue: s => s.autogoals },

  // --- Hat-trick (3+ gol in una partita) ---
  { id: 'hattrick_1', icon: '☄️', label: 'Primo Hat-trick', desc: '3 gol in una partita', cat: 'attack', target: 1, getValue: (s, m, pid) => {
    let count = 0;
    for (const match of (m || [])) {
      if (match.status !== 'finished') continue;
      const goals = (match.events||[]).filter(e => e.type === 'goal' && e.scorerId === pid).length;
      if (goals >= 3) count++;
    }
    return count;
  }},
  { id: 'hattrick_3', icon: '🌠', label: 'Seriale', desc: '3 hat-trick in carriera', cat: 'attack', target: 3, getValue: (s, m, pid) => {
    let count = 0;
    for (const match of (m || [])) {
      if (match.status !== 'finished') continue;
      const goals = (match.events||[]).filter(e => e.type === 'goal' && e.scorerId === pid).length;
      if (goals >= 3) count++;
    }
    return count;
  }},

  // --- Combo gol+assist in una stessa partita ---
  { id: 'combo_5', icon: '🔥', label: 'Tuttocampista', desc: '5 partite con gol+assist', cat: 'attack', target: 5, getValue: (s, m, pid) => {
    let count = 0;
    for (const match of (m || [])) {
      if (match.status !== 'finished') continue;
      const hasGoal = (match.events||[]).some(e => e.type === 'goal' && e.scorerId === pid);
      const hasAssist = (match.events||[]).some(e => e.type === 'goal' && e.assistId === pid);
      if (hasGoal && hasAssist) count++;
    }
    return count;
  }},
];

const CAT_LABEL = {
  attack: '⚽ Attacco',
  presence: '🏟️ Presenze',
  wins: '🏆 Vittorie',
  gk: '🧤 Portiere',
  shame: '😬 Infamia',
};

export default function PlayerAchievements({ player, allMatches }) {
  const [showAll, setShowAll] = useState(false);

  const evaluated = useMemo(() => {
    const stats = player.stats || {};
    const finished = allMatches.filter(m => m.status === 'finished');
    return ACHIEVEMENTS.map(a => {
      const current = Math.min(a.getValue(stats, finished, player.id) || 0, a.target);
      const unlocked = current >= a.target;
      return { ...a, current, unlocked };
    });
  }, [player, allMatches]);

  const unlocked = evaluated.filter(a => a.unlocked);
  const inProgress = evaluated.filter(a => !a.unlocked).sort((a, b) =>
    (b.current / b.target) - (a.current / a.target)
  );

  const shown = showAll ? inProgress : inProgress.slice(0, 4);

  if (evaluated.length === 0) return null;

  const byCategory = unlocked.reduce((acc, a) => {
    if (!acc[a.cat]) acc[a.cat] = [];
    acc[a.cat].push(a);
    return acc;
  }, {});

  return (
    <div className="card mb-4" style={{ border: '1px solid rgba(246,224,94,0.25)' }}>
      <div className="flex items-center justify-between mb-3">
        <h3 style={{ fontSize: '0.95rem', margin: 0, color: '#F6E05E' }}>🏅 Traguardi</h3>
        <span style={{ fontSize: '0.72rem', color: CLR_MUTED }}>
          {unlocked.length}/{ACHIEVEMENTS.length}
        </span>
      </div>

      {/* Sbloccati raggruppati per categoria */}
      {unlocked.length > 0 && (
        <div style={{ marginBottom: '0.75rem' }}>
          {Object.entries(byCategory).map(([cat, items]) => (
            <div key={cat} style={{ marginBottom: '0.4rem' }}>
              <div style={{ fontSize: '0.65rem', color: CLR_MUTED, fontWeight: 600, marginBottom: '0.3rem', letterSpacing: '0.04em' }}>
                {CAT_LABEL[cat] || cat}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                {items.map(a => (
                  <div
                    key={a.id}
                    title={a.desc}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.3rem',
                      padding: '0.25rem 0.55rem',
                      borderRadius: '999px',
                      background: 'rgba(246,224,94,0.12)',
                      border: '1px solid rgba(246,224,94,0.35)',
                      fontSize: '0.75rem', fontWeight: 600, color: '#F6E05E',
                    }}
                  >
                    <span>{a.icon}</span>
                    <span>{a.label}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* In corso */}
      {inProgress.length > 0 && (
        <>
          <div style={{ fontSize: '0.65rem', color: CLR_MUTED, fontWeight: 600, marginBottom: '0.4rem', letterSpacing: '0.04em' }}>
            IN CORSO
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {shown.map(a => {
              const pct = Math.round((a.current / a.target) * 100);
              return (
                <div key={a.id} style={{ padding: '0.4rem 0.5rem', borderRadius: '7px', background: 'rgba(74,85,104,0.2)' }}>
                  <div className="flex items-center justify-between" style={{ marginBottom: '0.3rem' }}>
                    <span style={{ fontSize: '0.8rem' }}>
                      <span style={{ marginRight: '0.3rem' }}>{a.icon}</span>
                      <span style={{ fontWeight: 600, color: '#E2E8F0' }}>{a.label}</span>
                      <span style={{ fontSize: '0.7rem', color: CLR_MUTED, marginLeft: '0.3rem' }}>{a.desc}</span>
                    </span>
                    <span style={{ fontSize: '0.72rem', color: '#A0AEC0', flexShrink: 0 }}>
                      {a.current}/{a.target}
                    </span>
                  </div>
                  <div style={{ height: 4, borderRadius: 2, background: 'rgba(74,85,104,0.5)' }}>
                    <div style={{
                      height: '100%', borderRadius: 2,
                      width: `${pct}%`,
                      background: pct >= 75 ? '#68D391' : pct >= 40 ? '#F6E05E' : '#4FD1C5',
                      transition: 'width 0.4s ease',
                    }} />
                  </div>
                </div>
              );
            })}
          </div>
          {inProgress.length > 4 && (
            <button
              onClick={() => setShowAll(v => !v)}
              style={{ marginTop: '0.5rem', background: 'none', border: 'none', cursor: 'pointer', color: CLR_MUTED, fontSize: '0.75rem', padding: 0 }}
            >
              {showAll ? '▲ Mostra meno' : `▼ Mostra tutti (${inProgress.length})`}
            </button>
          )}
        </>
      )}
    </div>
  );
}
