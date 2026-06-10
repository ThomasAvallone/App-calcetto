import React from 'react';
import { useNavigate } from 'react-router-dom';
import { BADGE_DEFS } from '../utils/badges';

const CLR_WIN  = '#68D391';
const CLR_LOSS = '#FC8181';
const CLR_MUTED = '#718096';

const CATEGORY_LABELS = {
  positive: { label: 'Positivi / Obiettivi', color: CLR_WIN,  bg: 'rgba(104,211,145,0.06)',  border: 'rgba(104,211,145,0.2)' },
  negative: { label: 'Negativi / Goliardici', color: CLR_LOSS, bg: 'rgba(252,129,129,0.06)', border: 'rgba(252,129,129,0.2)' },
};

const SOURCE_LABELS = {
  season:  { label: 'Stagione', color: '#63B3ED' },
  alltime: { label: 'All-time',  color: '#F6E05E' },
  match:   { label: 'Partita',   color: '#B794F4' },
  admin:   { label: 'Admin',     color: '#FC8181' },
};

// Classify each badge by the data source it depends on
function badgeSource(b) {
  // madonna_seriale deriva dai premi Bestie (assegnati a mano dagli admin)
  if (['bestie', 'madonna_seriale'].includes(b.id)) return 'admin';
  if ([
    'veterano', 'diamante', 'il_prescelto', 'fenomeno', 'on_fire', 'crisi',
    'highlander', 're_infermeria',
    'razzo', 'paracadutista', // trend Power Index (powerHistory)
  ].includes(b.id)) return 'alltime';
  if ([
    'early_bird', 'lone_ranger', 'meteorite', 'rockstar',
    'che_io_tassista', 'chirurgo', 'bulldozer', 'last_minute',
    'pokemon_leggendario', 'mutombo', 'giancarlo', 'miglior_luciano',
    'remuntada', 'crollo_verticale', 'killer_instinct', 'patto_di_sangue',
    'giano_bifronte', 'gatto', 'ritorno_del_re',
  ].includes(b.id)) return 'match';
  return 'season';
}

export default function BadgesPage() {
  const navigate = useNavigate();
  const positive = BADGE_DEFS.filter(b => b.positive);
  const negative = BADGE_DEFS.filter(b => !b.positive);

  return (
    <div className="page-content">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4 stagger-1" style={{ paddingTop: '0.5rem' }}>
        <button className="btn btn-ghost btn-icon" onClick={() => navigate(-1)}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M15 18l-6-6 6-6"/>
          </svg>
        </button>
        <div>
          <h2>🏅 Catalogo Badge</h2>
          <p className="text-xs text-muted">{BADGE_DEFS.length} badge disponibili</p>
        </div>
      </div>

      {/* Legend */}
      <div className="card mb-4 stagger-2" style={{ padding: '0.75rem 1rem' }}>
        <p className="text-xs text-muted mb-2" style={{ fontWeight: 600 }}>Fonte dati</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {Object.entries(SOURCE_LABELS).map(([key, { label, color }]) => (
            <span key={key} style={{
              padding: '0.2rem 0.6rem', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 600,
              background: color + '22', color, border: `1px solid ${color}55`,
            }}>{label}</span>
          ))}
        </div>
        <p className="text-xs text-muted mt-2" style={{ lineHeight: 1.5 }}>
          <strong style={{ color: SOURCE_LABELS.season.color }}>Stagione</strong> = calcolato dalle stats della stagione corrente ·{' '}
          <strong style={{ color: SOURCE_LABELS.alltime.color }}>All-time</strong> = statistiche totali storiche ·{' '}
          <strong style={{ color: SOURCE_LABELS.match.color }}>Partita</strong> = analisi eventi di ogni singola partita ·{' '}
          <strong style={{ color: SOURCE_LABELS.admin.color }}>Admin</strong> = assegnato manualmente dal admin nel dettaglio partita
        </p>
      </div>

      {[{ key: 'positive', list: positive }, { key: 'negative', list: negative }].map(({ key, list }) => {
        const cat = CATEGORY_LABELS[key];
        return (
          <div key={key} className={`card mb-4 stagger-3`} style={{ background: cat.bg, border: `1px solid ${cat.border}` }}>
            <h3 className="mb-3" style={{ fontSize: '0.9rem', color: cat.color }}>
              {cat.label} ({list.length})
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {list.map(b => {
                const src = badgeSource(b);
                const srcInfo = SOURCE_LABELS[src];
                return (
                  <div key={b.id} style={{
                    display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
                    padding: '0.75rem', borderRadius: '10px',
                    background: 'rgba(26,32,44,0.6)',
                    border: '1px solid #2D3748',
                  }}>
                    {/* Icon */}
                    <span style={{ fontSize: '1.6rem', lineHeight: 1, flexShrink: 0, marginTop: '2px' }}>{b.icon}</span>
                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="flex items-center gap-2 mb-1" style={{ flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{b.label}</span>
                        <span style={{
                          padding: '0.1rem 0.45rem', borderRadius: '999px', fontSize: '0.68rem', fontWeight: 600,
                          background: srcInfo.color + '22', color: srcInfo.color, border: `1px solid ${srcInfo.color}44`,
                        }}>{srcInfo.label}</span>
                        <span style={{
                          padding: '0.1rem 0.45rem', borderRadius: '999px', fontSize: '0.68rem', fontWeight: 600,
                          background: cat.color + '22', color: cat.color, border: `1px solid ${cat.color}44`,
                        }}>{b.positive ? '✓ Positivo' : '✗ Goliardico'}</span>
                      </div>
                      <p style={{ fontSize: '0.8rem', color: CLR_MUTED, margin: 0, lineHeight: 1.5 }}>{b.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
