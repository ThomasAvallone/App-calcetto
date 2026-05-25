import React from 'react';

/**
 * Card "Coppa di Latta del Mese" della Dashboard.
 * Mostra 4 award (bomber, assistman, peggior portiere, re degli autogol) per gli
 * ultimi 30 giorni, con confronto rispetto al mese precedente (prevHint).
 */
export default function CoppaDiLattaCard({ coppaDiLatta }) {
  if (!coppaDiLatta) return null;
  const awards = buildAwards(coppaDiLatta);
  return (
    <div className="card mb-4 stagger-7" style={{
      background: 'rgba(246,224,94,0.03)',
      border: '1px solid rgba(246,224,94,0.18)',
    }}>
      <div className="flex items-center justify-between mb-3">
        <h3 style={{ color: 'var(--gold)' }}>🏅 Coppa di Latta del Mese</h3>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          {coppaDiLatta.matchCount} partite
        </span>
      </div>
      {awards.map((award, idx) => (
        <div
          key={award.label}
          /* Left border differentiates positive (achievement) vs negative (ironic) awards */
          className={award.positive ? 'award-positive' : 'award-negative'}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '0.5rem 0',
            borderBottom: idx < awards.length - 1 ? '1px solid rgba(74,85,104,0.3)' : 'none',
          }}
        >
          <span style={{ fontSize: '1.1rem', minWidth: '24px' }}>{award.icon}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="section-label" style={{ marginBottom: '0.1rem' }}>{award.label}</div>
            <div style={{
              fontWeight: 700,
              fontSize: '0.92rem',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}>
              {award.name}
            </div>
            {award.prevHint && (
              <div style={{
                fontSize: '0.66rem',
                color: 'var(--text-muted)',
                marginTop: '0.1rem',
                fontStyle: 'italic',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>
                {award.prevHint}
              </div>
            )}
          </div>
          <div style={{ fontWeight: 700, color: award.color, fontSize: '0.88rem', whiteSpace: 'nowrap' }}>
            {award.val}
          </div>
        </div>
      ))}
    </div>
  );
}

function prevHintText(current, previous) {
  if (!previous) return null;
  if (previous.name === current.name) return 'anche il mese scorso';
  return `prima: ${previous.name}`;
}

function buildAwards(c) {
  const prev = c.previous;
  return [
    c.topScorer && {
      icon: '⚽', label: 'Bomber del Mese',
      name: c.topScorer.name,
      val: `${c.topScorer.goals} gol`,
      color: 'var(--teal)', positive: true,
      prevHint: prevHintText(c.topScorer, prev?.topScorer),
    },
    c.topAssist && {
      icon: '🎯', label: 'Assistman del Mese',
      name: c.topAssist.name,
      val: `${c.topAssist.assists} assist`,
      color: 'var(--blue-team)', positive: true,
      prevHint: prevHintText(c.topAssist, prev?.topAssist),
    },
    c.worstGk && {
      icon: '🧤', label: 'Peggior Portiere',
      name: c.worstGk.name,
      val: `${c.worstGk.gkGoalsConceded} gol subiti`,
      color: 'var(--red)', positive: false,
      prevHint: prevHintText(c.worstGk, prev?.worstGk),
    },
    c.topAutogoal && {
      icon: '🤦', label: 'Re degli Autogol',
      name: c.topAutogoal.name,
      val: `${c.topAutogoal.autogoals} autogol`,
      color: '#B794F4', positive: false,
      prevHint: prevHintText(c.topAutogoal, prev?.topAutogoal),
    },
  ].filter(Boolean);
}
