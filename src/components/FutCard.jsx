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

// Trend palette — shared with global app result colors
const CLR_UP   = '#68D391';
const CLR_DOWN = '#FC8181';

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
// Renders an inline SVG power-index trend chart.
// Uses the last 14 powerHistory snapshots; returns null if < 2 points.

function SparkLine({ history, accent, uid }) {
  if (!history || history.length < 2) return null;

  const pts = history.slice(-14);
  if (pts.length < 2) return null;

  const piValues = pts.map(p => p.pi);
  const minV = Math.min(...piValues);
  const maxV = Math.max(...piValues);
  const range = maxV - minV;

  // SVG coordinate space
  const W = 100, H = 24, PX = 3, PY = 3;

  const toX = i  => PX + (i / (pts.length - 1)) * (W - PX * 2);
  // Invert Y: higher pi = top of chart. Clamp to a flat center if perfectly flat.
  const toY = pi => range < 0.3
    ? H / 2
    : H - PY - ((pi - minV) / range) * (H - PY * 2);

  const points  = pts.map((p, i) => ({ x: toX(i), y: toY(p.pi) }));
  const lineStr = points.map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');

  const firstPi = pts[0].pi;
  const lastPi  = pts[pts.length - 1].pi;
  const delta   = lastPi - firstPi;

  // Color: green if clearly rising, red if falling, accent if flat
  const trendColor = delta > 1.5 ? CLR_UP : delta < -1.5 ? CLR_DOWN : accent;
  const deltaStr   = `${delta > 0.05 ? '+' : ''}${delta.toFixed(1)}`;

  const lastPt = points[points.length - 1];

  // Area fill from line to bottom of SVG viewport
  const areaD = [
    `M ${points[0].x.toFixed(2)} ${H}`,
    ...points.map(p => `L ${p.x.toFixed(2)} ${p.y.toFixed(2)}`),
    `L ${lastPt.x.toFixed(2)} ${H}`,
    'Z',
  ].join(' ');

  // Unique gradient ID per card instance (SVG IDs are document-global)
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

        {/* Gradient area fill under the line */}
        <path d={areaD} fill={`url(#${gId})`} />

        {/* The trend line itself */}
        <polyline
          points={lineStr}
          fill="none"
          stroke={trendColor}
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Glowing dot on the most recent data point */}
        <circle
          cx={lastPt.x.toFixed(2)}
          cy={lastPt.y.toFixed(2)}
          r="2.4"
          fill={trendColor}
          style={{ filter: `drop-shadow(0 0 3px ${trendColor})` }}
        />
      </svg>

      {/* "TREND" micro-label top-left */}
      <div aria-hidden="true" style={{
        position: 'absolute', top: 0, left: 0,
        fontSize: '0.58em', fontWeight: 700,
        color: `${trendColor}88`,
        letterSpacing: '0.06em', lineHeight: 1,
      }}>
        TREND
      </div>

      {/* Delta value top-right — primary data callout */}
      <div aria-hidden="true" style={{
        position: 'absolute', top: 0, right: 0,
        fontSize: '0.7em', fontWeight: 900,
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

  const s  = player.stats   || {};
  const ss = seasonStats    || {};
  const totalMatches = s.matches || 0;
  const winRate = totalMatches > 0 ? Math.round(((s.wins || 0) / totalMatches) * 100) : 0;

  // 4 core stats — cleaner with the sparkline occupying the form slot
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
        // Base font-size: all children scale uniformly with this card root
        fontSize:     '10px',
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
        position: 'absolute', top: '42%', left: '50%',
        transform: 'translate(-50%, -50%) rotate(-30deg)',
        fontSize: '3.6em', fontWeight: 900,
        color: `${cfg.accent}07`,
        pointerEvents: 'none', zIndex: 1,
        letterSpacing: '0.08em', whiteSpace: 'nowrap',
      }}>
        {cfg.watermark}
      </div>

      {/* ── TOP-LEFT: rating + position abbr + role icon ── */}
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
          <div style={{ fontSize: '0.72em', fontWeight: 800, color: cfg.accentDim, letterSpacing: '0.06em' }}>
            #{rank + 1}
          </div>
        )}
      </div>

      {/* ── PHOTO / AVATAR ──
          Extends down to bottom 40% to leave room for the expanded bottom panel.
          The scrim (below) will fade the photo out naturally. ── */}
      <div style={{
        position: 'absolute',
        top: '8%', left: '24%', right: '4%', bottom: '40%',
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

      {/* ── Bottom dark gradient scrim ──
          Extended to 50% to cover the taller bottom panel (was 40%). ── */}
      <div aria-hidden="true" style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: '50%',
        background: 'linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0.88) 28%, rgba(0,0,0,0.97) 100%)',
        zIndex: 2,
      }} />

      {/* ── Player name ── bigger than before (1.2em vs old 0.95em) ── */}
      <div style={{
        position: 'absolute',
        bottom: '36%', left: 0, right: 0, zIndex: 3,
        textAlign: 'center', padding: '0 8px',
      }}>
        <div style={{
          fontSize: '1.2em', fontWeight: 900,
          color: cfg.accent,
          letterSpacing: '0.07em', textTransform: 'uppercase',
          textShadow: `0 0 12px ${cfg.accent}90, 0 0 24px ${cfg.accent}40`,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {player.name}
        </div>
      </div>

      {/* ── Separator above sparkline ── */}
      <div aria-hidden="true" style={{
        position: 'absolute', bottom: '34%', left: '8%', right: '8%',
        height: '1px',
        background: `linear-gradient(90deg, transparent, ${cfg.border}, transparent)`,
        zIndex: 3,
      }} />

      {/* ── SparkLine zone ──
          Subtle dark inset panel so the chart reads as its own section.
          Only rendered when powerHistory has enough data. ── */}
      {hasTrend ? (
        <div style={{
          position: 'absolute',
          bottom: '17%', left: '5%', right: '5%', height: '15%',
          zIndex: 3,
          // Very subtle background so the chart floats on a defined surface
          background: 'rgba(0,0,0,0.28)',
          borderRadius: '4px',
          padding: '3px 4px',
          boxSizing: 'border-box',
        }}>
          <SparkLine
            history={player.powerHistory}
            accent={cfg.accent}
            uid={player.id}
          />
        </div>
      ) : (
        // Placeholder when no history: show dashes to preserve layout rhythm
        <div style={{
          position: 'absolute',
          bottom: '17%', left: '5%', right: '5%', height: '15%',
          zIndex: 3,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.18)',
          borderRadius: '4px',
        }}>
          <div style={{ fontSize: '0.62em', color: `${cfg.accentDim}`, letterSpacing: '0.1em' }}>
            — NESSUN TREND —
          </div>
        </div>
      )}

      {/* ── Separator below sparkline ── */}
      <div aria-hidden="true" style={{
        position: 'absolute', bottom: '16%', left: '8%', right: '8%',
        height: '1px',
        background: `linear-gradient(90deg, transparent, ${cfg.border}, transparent)`,
        zIndex: 3,
      }} />

      {/* ── 4 stats in a single row ──
          Reduced from 6 to 4: the sparkline now carries the form information.
          Single row is cleaner and gives each stat more breathing room. ── */}
      <div style={{
        position: 'absolute',
        bottom: '2%', left: '3%', right: '3%', height: '13%',
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
              fontSize: '1.05em', fontWeight: 900,
              color: cfg.accent,
              textShadow: `0 0 6px ${cfg.accent}62`,
              letterSpacing: '-0.01em',
            }}>
              {value}
            </div>
            <div style={{
              fontSize: '0.6em', fontWeight: 700,
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

/*
  Design Notes
  ────────────
  Layout (bottom-up, % of card height):
    2–15%   → 4-stat row (single row, 4 cols)
    16%     → separator line
    17–32%  → SparkLine panel (power-index trend SVG, ~36px at a 243px-tall card)
    34%     → separator line
    36%     → player name (1.2em, up from 0.95em — more visual weight)
    40–100% → photo / avatar area + scrim overlay (scrim extended to 50% for taller panel)

  SparkLine colors:
    delta > +1.5 → green  (#68D391) — clearly improving
    delta < −1.5 → red    (#FC8181) — declining
    otherwise    → card accent       — stable

  Gradient IDs are scoped with the player.id to avoid SVG namespace collisions
  when multiple cards render simultaneously.
*/
