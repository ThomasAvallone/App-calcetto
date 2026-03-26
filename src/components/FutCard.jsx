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

const MEDAL     = ['🥇', '🥈', '🥉'];
const CLR_UP    = '#68D391';
const CLR_DOWN  = '#FC8181';

function isImageUrl(url) {
  if (!url) return false;
  if (/youtube\.com|youtu\.be/i.test(url)) return false;
  if (/\.(mp4|webm|mov|ogg)(\?|$)/i.test(url)) return false;
  return true;
}

function getInitials(name) {
  return name.split(' ').map(w => w[0]?.toUpperCase() || '').slice(0, 2).join('');
}

// ─── SparkLine ────────────────────────────────────────────────────────────────
// SVG trend chart of power-index history.
// Delta label sits top-LEFT: the last dot is always at the RIGHT edge of the
// chart, so no overlap is geometrically possible regardless of the dot's Y.

function SparkLine({ history, accent, uid }) {
  if (!history || history.length < 2) return null;

  const pts = history.slice(-14);
  if (pts.length < 2) return null;

  const piValues = pts.map(p => p.pi);
  const minV  = Math.min(...piValues);
  const maxV  = Math.max(...piValues);
  const range = maxV - minV;

  // SVG viewport
  const W = 100, H = 24;
  // Horizontal padding keeps the last dot well away from the right edge,
  // avoiding any possibility of overlap with the delta label.
  const PX = 4, PY = 3;

  const toX = i  => PX + (i / (pts.length - 1)) * (W - PX * 2);
  const toY = pi => range < 0.3
    ? H / 2   // perfectly flat → centred horizontal line
    : H - PY - ((pi - minV) / range) * (H - PY * 2);

  const points  = pts.map((p, i) => ({ x: toX(i), y: toY(p.pi) }));
  const lineStr = points.map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');

  const delta      = pts[pts.length - 1].pi - pts[0].pi;
  const trendColor = delta > 1.5 ? CLR_UP : delta < -1.5 ? CLR_DOWN : accent;
  // Avoid "-0.0" for near-zero deltas
  const deltaStr   = Math.abs(delta) < 0.05
    ? '±0'
    : delta > 0 ? `+${delta.toFixed(1)}` : delta.toFixed(1);

  const lastPt = points[points.length - 1];

  const areaD = [
    `M ${points[0].x.toFixed(2)} ${H}`,
    ...points.map(p => `L ${p.x.toFixed(2)} ${p.y.toFixed(2)}`),
    `L ${lastPt.x.toFixed(2)} ${H}`,
    'Z',
  ].join(' ');

  // Unique gradient ID — SVG IDs are document-global, scope by player
  const gId = `sg-${(uid || 'x').replace(/[^a-zA-Z0-9]/g, '').slice(0, 14)}`;

  return (
    <div
      role="img"
      aria-label={`Trend power index: ${deltaStr} negli ultimi ${pts.length} aggiornamenti`}
      style={{ position: 'relative', width: '100%', height: '100%' }}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        style={{ width: '100%', height: '100%', display: 'block' }}
      >
        <defs>
          <linearGradient id={gId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={trendColor} stopOpacity="0.5" />
            <stop offset="100%" stopColor={trendColor} stopOpacity="0.04" />
          </linearGradient>
        </defs>

        {/* Area fill */}
        <path d={areaD} fill={`url(#${gId})`} />

        {/* Trend line */}
        <polyline
          points={lineStr}
          fill="none"
          stroke={trendColor}
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Last-point dot — always at right edge, never near the left-side label */}
        <circle
          cx={lastPt.x.toFixed(2)}
          cy={lastPt.y.toFixed(2)}
          r="2.4"
          fill={trendColor}
          style={{ filter: `drop-shadow(0 0 3px ${trendColor})` }}
        />
      </svg>

      {/* Delta label — TOP-LEFT.
          The dot is always on the RIGHT side of the SVG, so these two
          elements occupy opposite horizontal ends and can never collide. */}
      <div aria-hidden="true" style={{
        position: 'absolute', top: 0, left: 0,
        fontSize: '0.72em', fontWeight: 900,
        color: trendColor,
        textShadow: `0 0 8px ${trendColor}`,
        lineHeight: 1, letterSpacing: '0.02em',
      }}>
        {deltaStr}
      </div>
    </div>
  );
}

// ─── FutCard ──────────────────────────────────────────────────────────────────

export default function FutCard({ player, form, seasonStats, rank, onClick }) {
  const pi    = player.powerIndex ?? 50;
  const tier  = getTier(pi);
  const cfg   = TIER_CONFIG[tier];
  const role  = player.primaryRole || 'Centrocampista';
  const abbr  = ROLE_ABBR[role] || role.slice(0, 3).toUpperCase();
  const photo = isImageUrl(player.photoURL) ? player.photoURL : null;

  const s  = player.stats  || {};
  const ss = seasonStats   || {};
  // Win rate from season stats for consistency with the other season-based figures on the card
  const seasonMatches = ss.matches || 0;
  const winRate = seasonMatches > 0 ? Math.round(((ss.wins || 0) / seasonMatches) * 100) : 0;

  const stats = [
    { key: 'GOL',  value: ss.goals   ?? s.goals   ?? 0 },
    { key: 'ASS',  value: ss.assists ?? s.assists  ?? 0 },
    { key: 'VIN%', value: `${winRate}%` },
    { key: 'PAR',  value: ss.matches ?? 0 },
  ];

  const hasTrend = (player.powerHistory || []).length >= 2;

  return (
    <article
      onClick={onClick}
      onKeyDown={e => e.key === 'Enter' && onClick?.()}
      tabIndex={0}
      role="button"
      aria-label={`Carta di ${player.name}, Power Index ${pi.toFixed(1)}`}
      style={{
        position:     'relative',
        width:        '100%',
        aspectRatio:  '0.72',
        borderRadius: '10px',
        background:   cfg.bg,
        border:       `1.5px solid ${cfg.border}`,
        boxShadow:    cfg.glow,
        cursor:       'pointer',
        overflow:     'hidden',
        userSelect:   'none',
        fontSize:     '10px', // base: all children use em → uniform scaling
        transition:   'transform 0.2s ease, box-shadow 0.2s ease',
        outline:      'none',
      }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-5px) scale(1.03)'; }}
      onMouseLeave={e => { e.currentTarget.style.transform = ''; }}
      onFocus={e => {
        e.currentTarget.style.outline = `2px solid ${cfg.border}`;
        e.currentTarget.style.outlineOffset = '2px';
      }}
      onBlur={e => { e.currentTarget.style.outline = 'none'; }}
    >

      {/* ── Shimmer sweep (inform tier only) ── */}
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

      {/* ── Tier watermark ── */}
      <div aria-hidden="true" style={{
        position: 'absolute', top: '44%', left: '50%',
        transform: 'translate(-50%, -50%) rotate(-30deg)',
        fontSize: '3.4em', fontWeight: 900,
        color: `${cfg.accent}07`,
        pointerEvents: 'none', zIndex: 1,
        letterSpacing: '0.08em', whiteSpace: 'nowrap',
      }}>
        {cfg.watermark}
      </div>

      {/* ── TOP HEADER: PI | name + emoji | medal ──────────────────────────────
          Flex row spanning full width. The name and role emoji live here,
          flanked by the big PI number on the left and the rank badge on the right.
          ── */}
      <div style={{
        position: 'absolute',
        top: 0, left: 0, right: 0,
        padding: '5% 7% 1%',
        zIndex: 3,
        display: 'flex',
        alignItems: 'flex-start',
        gap: '5px',
        // Dark-to-transparent vignette so the header reads over the photo
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.3) 70%, transparent 100%)',
      }}>

        {/* PI number + position abbr */}
        <div style={{ flexShrink: 0, lineHeight: 1 }}>
          <div style={{
            fontSize: '3em', fontWeight: 900,
            color: cfg.accent,
            textShadow: `0 0 16px ${cfg.accent}90`,
            letterSpacing: '-0.02em', lineHeight: 1,
          }}>
            {Math.round(pi)}
          </div>
          <div style={{
            fontSize: '0.82em', fontWeight: 800,
            color: cfg.accent, letterSpacing: '0.12em',
            marginTop: '2px',
            textShadow: `0 0 8px ${cfg.accent}70`,
          }}>
            {abbr}
          </div>
        </div>

        {/* Name + role emoji — fixed 1.6em: uniform across all cards, fits names up to ~9 chars */}
        <div style={{ flex: 1, minWidth: 0, paddingTop: '2px', lineHeight: 1 }}>
          <div style={{
            fontSize: '1.6em', fontWeight: 900,
            color: cfg.accent,
            letterSpacing: '0.03em', textTransform: 'uppercase',
            textShadow: `0 0 14px ${cfg.accent}95, 0 0 28px ${cfg.accent}50`,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {player.name}
          </div>
          <div style={{ fontSize: '1.5em', marginTop: '5px', lineHeight: 1 }}>
            {ROLE_ICON[role]}
          </div>
        </div>

        {/* Rank / medal */}
        <div style={{ flexShrink: 0, textAlign: 'right', lineHeight: 1 }}>
          {rank < 3 ? (
            <div style={{ fontSize: '1.6em' }}>{MEDAL[rank]}</div>
          ) : (
            <div style={{
              fontSize: '0.72em', fontWeight: 800,
              color: cfg.accentDim, letterSpacing: '0.06em',
            }}>
              #{rank + 1}
            </div>
          )}
        </div>
      </div>

      {/* ── PHOTO / AVATAR ─────────────────────────────────────────────────────
          Raised to top:'23%' (header ends ~22%) so it sits immediately below
          the header. Horizontal inset 8% each side.
          objectFit:'contain' prevents any cropping — the full image always shows.
          overflow:hidden + borderRadius + border give it a framed card look
          consistent with the inner decorative frame of the card.
          The dark background fills letterbox areas for non-square images. ── */}
      <div style={{
        position: 'absolute',
        top: '23%', left: '8%', right: '8%', bottom: '42%',
        zIndex: 1,
        overflow:     'hidden',
        borderRadius: '8px',
        border:       `1.5px solid ${cfg.border}`,
        background:   'rgba(0,0,0,0.22)',
        // Subtle inner shadow so the frame feels inset, not pasted on
        boxShadow:    `inset 0 0 12px rgba(0,0,0,0.5), 0 0 8px ${cfg.accent}18`,
      }}>
        {photo ? (
          <img
            src={photo}
            alt={player.name}
            style={{
              width: '100%', height: '100%',
              // contain: shows full image without cropping, letterbox areas
              // show the dark container background
              objectFit: 'contain', objectPosition: 'center top',
              display: 'block',
            }}
            onError={e => { e.currentTarget.style.display = 'none'; }}
          />
        ) : (
          /* Initials avatar — fills the framed container */
          <div style={{
            width: '100%', height: '100%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{
              height: '80%', aspectRatio: '1',
              borderRadius: '50%',
              background: `radial-gradient(circle at 38% 38%, ${cfg.accentDim}, ${cfg.accent}0C)`,
              border: `2px solid ${cfg.border}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '2.2em', fontWeight: 900,
              color: cfg.accent,
              textShadow: `0 0 14px ${cfg.accent}`,
              boxShadow: `0 0 28px ${cfg.accent}22, inset 0 0 14px ${cfg.accent}12`,
            }}>
              {getInitials(player.name)}
            </div>
          </div>
        )}
      </div>

      {/* ── Bottom scrim ───────────────────────────────────────────────────────
          Extended to 48% so it fully covers sparkline + stats sections. ── */}
      <div aria-hidden="true" style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: '48%',
        background: 'linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0.9) 26%, rgba(0,0,0,0.98) 100%)',
        zIndex: 2,
      }} />

      {/* ── SparkLine panel ─────────────────────────────────────────────────────
          22% tall = ~53px at a 243px card: plenty of room for a readable chart.
          hasTrend guard renders a placeholder to preserve layout rhythm. ── */}
      {hasTrend ? (
        <div style={{
          position: 'absolute',
          bottom: '18%', left: '5%', right: '5%', height: '22%',
          zIndex: 3,
          background: 'rgba(0,0,0,0.3)',
          borderRadius: '5px',
          padding: '4px 5px',
          boxSizing: 'border-box',
        }}>
          <SparkLine
            history={player.powerHistory}
            accent={cfg.accent}
            uid={player.id}
          />
        </div>
      ) : (
        <div style={{
          position: 'absolute',
          bottom: '18%', left: '5%', right: '5%', height: '22%',
          zIndex: 3,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.2)',
          borderRadius: '5px',
        }}>
          <div style={{ fontSize: '0.6em', color: cfg.accentDim, letterSpacing: '0.1em' }}>
            — NESSUN TREND —
          </div>
        </div>
      )}

      {/* ── Separator between sparkline and stats ── */}
      <div aria-hidden="true" style={{
        position: 'absolute', bottom: '17%', left: '8%', right: '8%',
        height: '1px',
        background: `linear-gradient(90deg, transparent, ${cfg.border}, transparent)`,
        zIndex: 3,
      }} />

      {/* ── 4 stats — single row, slightly bigger fonts ─────────────────────────
          More horizontal breathing room per stat vs the previous 6-stat grid. ── */}
      <div style={{
        position: 'absolute',
        bottom: '2%', left: '3%', right: '3%', height: '14%',
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        zIndex: 3,
      }}>
        {stats.map(({ key, value }) => (
          <div key={key} style={{
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            lineHeight: 1,
          }}>
            <div style={{
              fontSize: '1.2em', fontWeight: 900,
              color: cfg.accent,
              textShadow: `0 0 6px ${cfg.accent}62`,
              letterSpacing: '-0.01em',
            }}>
              {value}
            </div>
            <div style={{
              fontSize: '0.68em', fontWeight: 700,
              color: cfg.accentDim,
              letterSpacing: '0.05em',
            }}>
              {key}
            </div>
          </div>
        ))}
      </div>

    </article>
  );
}

/*
  Design Notes — layout (bottom-up, % of card height at aspect-ratio 0.72)
  ─────────────────────────────────────────────────────────────────────────
   2–16%   stats row      (4 cols, value 1.2em / label 0.68em)
  17%      separator line
  18–40%   SparkLine panel (22% = ~53px tall)
  42–77%   photo / avatar  (inset 8% each side, framed with borderRadius+border,
                            objectFit:contain — no cropping)

  Top header (0–23%):
    flex row  [PI + abbr]  [name + emoji]  [medal/#rank]
    Dark-to-transparent gradient ensures readability over any photo.
    Name is uppercase, 1.3em, truncated with ellipsis.

  SparkLine delta fix:
    Delta text is at top-LEFT of the sparkline div.
    The last dot is always at the RIGHT edge of the SVG (x ≈ 96/100).
    Opposite corners → collision geometrically impossible regardless of Y.
*/
