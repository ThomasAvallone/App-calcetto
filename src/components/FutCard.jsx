import React from 'react';

// ─── Tier system ──────────────────────────────────────────────────────────────

function getTier(pi) {
  if (pi >= 85) return 'inform';
  if (pi >= 75) return 'gold';
  if (pi >= 65) return 'silver';
  return 'bronze';
}

const TIER_CONFIG = {
  inform: {
    bg: 'linear-gradient(155deg, #100600 0%, #3D2200 18%, #7A5010 40%, #D4A030 50%, #7A5010 68%, #3D2200 86%, #100600 100%)',
    accent:    '#FFE87C',
    accentDim: 'rgba(255,232,124,0.5)',
    border:    'rgba(247,201,72,0.88)',
    glow:      '0 0 28px rgba(247,201,72,0.52), 0 0 56px rgba(247,201,72,0.18), 0 12px 40px rgba(0,0,0,0.9)',
    shimmer:   true,
    watermark: 'IN FORMA',
  },
  gold: {
    bg: 'linear-gradient(155deg, #120900 0%, #4A2C06 26%, #9A7020 50%, #4A2C06 78%, #120900 100%)',
    accent:    '#EDB840',
    accentDim: 'rgba(237,184,64,0.48)',
    border:    'rgba(160,112,32,0.78)',
    glow:      '0 0 16px rgba(160,112,32,0.42), 0 8px 28px rgba(0,0,0,0.78)',
    shimmer:   false,
    watermark: 'ORO',
  },
  silver: {
    bg: 'linear-gradient(155deg, #0E0E1A 0%, #2A2A40 26%, #7070A0 50%, #2A2A40 78%, #0E0E1A 100%)',
    accent:    '#C0C0DC',
    accentDim: 'rgba(192,192,220,0.48)',
    border:    'rgba(100,100,150,0.65)',
    glow:      '0 0 12px rgba(100,100,150,0.3), 0 8px 24px rgba(0,0,0,0.72)',
    shimmer:   false,
    watermark: 'ARGENTO',
  },
  bronze: {
    bg: 'linear-gradient(155deg, #080400 0%, #3A1A08 26%, #885020 50%, #3A1A08 78%, #080400 100%)',
    accent:    '#C07840',
    accentDim: 'rgba(192,120,64,0.44)',
    border:    'rgba(136,80,32,0.65)',
    glow:      '0 0 10px rgba(136,80,32,0.24), 0 8px 24px rgba(0,0,0,0.72)',
    shimmer:   false,
    watermark: 'BRONZO',
  },
};

const ROLE_ABBR = {
  'Portiere':       'POR',
  'Difensore':      'DIF',
  'Centrocampista': 'CEN',
  'Attaccante':     'ATT',
};

const ROLE_ICON = {
  'Portiere':       '🧤',
  'Difensore':      '🛡️',
  'Centrocampista': '⚡',
  'Attaccante':     '⚽',
};

const MEDAL = ['🥇', '🥈', '🥉'];

function isImageUrl(url) {
  if (!url) return false;
  if (/youtube\.com|youtu\.be/i.test(url)) return false;
  if (/\.(mp4|webm|mov|ogg)(\?|$)/i.test(url)) return false;
  return true;
}

function getInitials(name) {
  return name.split(' ').map(w => w[0]?.toUpperCase() || '').slice(0, 2).join('');
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function FutCard({ player, form, seasonStats, rank, onClick }) {
  const pi    = player.powerIndex ?? 50;
  const tier  = getTier(pi);
  const cfg   = TIER_CONFIG[tier];
  const role  = player.primaryRole || 'Centrocampista';
  const abbr  = ROLE_ABBR[role] || role.slice(0, 3).toUpperCase();
  const photo = isImageUrl(player.photoURL) ? player.photoURL : null;

  const s  = player.stats || {};
  const ss = seasonStats  || {};
  const totalMatches = s.matches || 0;
  const winRate = totalMatches > 0 ? Math.round(((s.wins || 0) / totalMatches) * 100) : 0;

  const lastFive   = form?.lastFive || [];
  const recentWins = lastFive.filter(r => r === 'W').length;

  const stats = [
    { key: 'GOL',  value: ss.goals    ?? s.goals   ?? 0 },
    { key: 'ASS',  value: ss.assists  ?? s.assists  ?? 0 },
    { key: 'PAR',  value: ss.matches  ?? 0 },
    { key: 'VIN%', value: `${winRate}%` },
    { key: 'AUTO', value: s.autogoals || 0, danger: (s.autogoals || 0) > 0 },
    { key: 'ULT5', value: lastFive.length > 0 ? `${recentWins}/${lastFive.length}V` : '—' },
  ];

  return (
    <article
      onClick={onClick}
      onKeyDown={e => e.key === 'Enter' && onClick?.()}
      tabIndex={0}
      role="button"
      aria-label={`Carta di ${player.name}, Power Index ${pi.toFixed(1)}`}
      style={{
        /* Card is sized by its grid cell; aspect-ratio keeps it portrait */
        position:    'relative',
        width:       '100%',
        aspectRatio: '0.72',
        borderRadius: '10px',
        background:  cfg.bg,
        border:      `1.5px solid ${cfg.border}`,
        boxShadow:   cfg.glow,
        cursor:      'pointer',
        overflow:    'hidden',
        userSelect:  'none',
        /* Base font-size: all children use em → scales uniformly with card */
        fontSize:    '10px',
        transition:  'transform 0.2s ease, box-shadow 0.2s ease',
        outline:     'none',
      }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-5px) scale(1.03)'; }}
      onMouseLeave={e => { e.currentTarget.style.transform = ''; }}
      onFocus={e => { e.currentTarget.style.outline = `2px solid ${cfg.border}`; e.currentTarget.style.outlineOffset = '2px'; }}
      onBlur={e => { e.currentTarget.style.outline = 'none'; }}
    >

      {/* ── Shimmer (inform only) ── */}
      {cfg.shimmer && (
        <div aria-hidden="true" style={{
          position: 'absolute', inset: 0, zIndex: 5,
          pointerEvents: 'none', overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute',
            top: '-60%', left: '-40%',
            width: '50%', height: '220%',
            background: 'linear-gradient(90deg, transparent 0%, rgba(255,232,124,0.24) 50%, transparent 100%)',
            transform: 'rotate(25deg)',
            animation: 'fut-shimmer 3s ease-in-out infinite',
          }} />
        </div>
      )}

      {/* ── Inner decorative frame ── */}
      <div aria-hidden="true" style={{
        position: 'absolute', inset: '5px',
        borderRadius: '7px',
        border: `1px solid ${cfg.accentDim}`,
        pointerEvents: 'none', zIndex: 2,
      }} />

      {/* ── Watermark tier label ── */}
      <div aria-hidden="true" style={{
        position: 'absolute', top: '42%', left: '50%',
        transform: 'translate(-50%, -50%) rotate(-30deg)',
        fontSize: '3.6em', fontWeight: 900,
        color: `${cfg.accent}07`,
        pointerEvents: 'none', zIndex: 1,
        letterSpacing: '0.08em', whiteSpace: 'nowrap',
      }}>
        {cfg.watermark}
      </div>

      {/* ── TOP-LEFT: big rating + position abbr + role icon ── */}
      <div style={{ position: 'absolute', top: '7%', left: '8%', zIndex: 3, lineHeight: 1 }}>
        <div style={{
          fontSize: '2.9em', fontWeight: 900,
          color: cfg.accent,
          textShadow: `0 0 16px ${cfg.accent}90`,
          letterSpacing: '-0.02em', lineHeight: 1,
        }}>
          {Math.round(pi)}
        </div>
        <div style={{
          fontSize: '0.85em', fontWeight: 800,
          color: cfg.accent, letterSpacing: '0.12em',
          marginTop: '2px',
          textShadow: `0 0 8px ${cfg.accent}70`,
        }}>
          {abbr}
        </div>
        <div style={{ fontSize: '1.4em', marginTop: '4px', lineHeight: 1 }}>
          {ROLE_ICON[role]}
        </div>
      </div>

      {/* ── TOP-RIGHT: medal or rank ── */}
      <div style={{ position: 'absolute', top: '7%', right: '8%', zIndex: 3, textAlign: 'right', lineHeight: 1 }}>
        {rank < 3 ? (
          <div style={{ fontSize: '1.7em' }}>{MEDAL[rank]}</div>
        ) : (
          <div style={{
            fontSize: '0.72em', fontWeight: 800,
            color: cfg.accentDim, letterSpacing: '0.06em',
          }}>
            #{rank + 1}
          </div>
        )}
      </div>

      {/* ── PHOTO / AVATAR ── */}
      <div style={{
        position: 'absolute',
        top: '8%', left: '24%', right: '4%', bottom: '36%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1,
      }}>
        {photo ? (
          <img
            src={photo}
            alt={player.name}
            style={{
              width: '100%', height: '100%',
              objectFit: 'contain', objectPosition: 'center bottom',
              filter: 'drop-shadow(0 4px 18px rgba(0,0,0,0.95))',
            }}
            onError={e => { e.currentTarget.style.display = 'none'; }}
          />
        ) : (
          /* Initials avatar with metallic ring */
          <div style={{
            width: '60%', aspectRatio: '1',
            borderRadius: '50%',
            background: `radial-gradient(circle at 38% 38%, ${cfg.accentDim}, ${cfg.accent}0C)`,
            border: `2px solid ${cfg.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.9em', fontWeight: 900,
            color: cfg.accent,
            textShadow: `0 0 14px ${cfg.accent}`,
            boxShadow: `0 0 24px ${cfg.accent}22, inset 0 0 14px ${cfg.accent}12`,
          }}>
            {getInitials(player.name)}
          </div>
        )}
      </div>

      {/* ── Bottom dark gradient scrim ── */}
      <div aria-hidden="true" style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: '40%',
        background: 'linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0.88) 32%, rgba(0,0,0,0.97) 100%)',
        zIndex: 2,
      }} />

      {/* ── Player name ── */}
      <div style={{
        position: 'absolute',
        bottom: '23%', left: 0, right: 0, zIndex: 3,
        textAlign: 'center', padding: '0 6px',
      }}>
        <div style={{
          fontSize: '0.95em', fontWeight: 800,
          color: cfg.accent,
          letterSpacing: '0.06em', textTransform: 'uppercase',
          textShadow: `0 0 10px ${cfg.accent}90`,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {player.name}
        </div>
      </div>

      {/* ── Separator line ── */}
      <div aria-hidden="true" style={{
        position: 'absolute', bottom: '21%', left: '8%', right: '8%',
        height: '1px',
        background: `linear-gradient(90deg, transparent, ${cfg.border}, transparent)`,
        zIndex: 3,
      }} />

      {/* ── 6 stats (2 rows × 3 cols) ── */}
      <div style={{
        position: 'absolute',
        bottom: '2%', left: '3%', right: '3%', height: '18%',
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gridTemplateRows: '1fr 1fr',
        zIndex: 3, gap: '0 2px',
      }}>
        {stats.map(({ key, value, danger }) => (
          <div key={key} style={{
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            lineHeight: 1,
          }}>
            <div style={{
              fontSize: '1.08em', fontWeight: 900,
              color: danger ? '#FC8181' : cfg.accent,
              textShadow: danger
                ? '0 0 8px rgba(252,129,129,0.75)'
                : `0 0 6px ${cfg.accent}62`,
              letterSpacing: '-0.01em',
            }}>
              {value}
            </div>
            <div style={{
              fontSize: '0.62em', fontWeight: 700,
              color: cfg.accentDim,
              letterSpacing: '0.04em',
            }}>
              {key}
            </div>
          </div>
        ))}
      </div>

    </article>
  );
}
