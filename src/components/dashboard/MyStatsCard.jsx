import React from 'react';
import { CLR_WIN, CLR_LOSS, RESULT_COLORS, AVATAR_COLORS } from '../../constants/colors';

const ROLE_ICONS = { 'Portiere': '🧤', 'Difensore': '🛡️', 'Centrocampista': '⚙️', 'Attaccante': '⚡' };

/**
 * Card "I tuoi numeri" della Dashboard.
 * Mostra avatar, stats stagione/all-time, forma, e hint prossimo badge per il player
 * collegato all'utente. Gestisce 3 stati: nessun user, user senza linked player,
 * player senza partite.
 */
export default function MyStatsCard({ user, myPlayer, myStats, myRank, nextBadge, isAdmin, seasonStartMs }) {
  if (!user) return null;
  return (
    <div className="card mb-4 stagger-2" style={{
      background: myPlayer
        ? 'linear-gradient(135deg, rgba(79,209,197,0.08) 0%, rgba(99,179,237,0.04) 100%)'
        : 'rgba(74,85,104,0.08)',
      border: `1px solid ${myPlayer ? 'rgba(79,209,197,0.25)' : 'rgba(74,85,104,0.3)'}`,
    }}>
      <div className="flex items-center justify-between mb-2">
        <h3 style={{ fontSize: '0.92rem', margin: 0, color: myPlayer ? 'var(--teal)' : 'var(--text-muted)' }}>
          👤 I tuoi numeri
        </h3>
        {myPlayer && myRank && (
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>
            #{myRank} nel ranking
          </span>
        )}
      </div>
      {!myPlayer ? (
        <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
          Il tuo profilo non è ancora collegato a una scheda giocatore.
          Chiedi all'admin di collegare il tuo account Google nella tua scheda.
        </p>
      ) : myStats.total.matches === 0 && myStats.season.matches === 0 ? (
        <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: 0 }}>
          <strong style={{ color: 'var(--text-primary)' }}>{myPlayer.name}</strong> · ancora nessuna partita giocata
        </p>
      ) : (
        <>
          <PlayerHeader myPlayer={myPlayer} />
          <SeasonGrid myStats={myStats} seasonStartMs={seasonStartMs} />
          <SeasonRecord myStats={myStats} />
          <AllTimeBand myStats={myStats} />
          {myStats.last5.length > 0 && (
            <FormRow myStats={myStats} myPlayer={myPlayer} isAdmin={isAdmin} />
          )}
          {nextBadge && <NextBadgeHint nextBadge={nextBadge} />}
        </>
      )}
    </div>
  );
}

function PlayerHeader({ myPlayer }) {
  const photo = myPlayer.photoURL || '';
  const isImage = photo && !/(youtube\.com|youtu\.be)/.test(photo) && !/\.(mp4|webm|mov|ogg)(\?|$)/i.test(photo);
  const avatarColor = AVATAR_COLORS[(myPlayer.name || '?').charCodeAt(0) % AVATAR_COLORS.length];
  const pi = (myPlayer.powerIndex || 50).toFixed(1);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', marginBottom: '0.7rem' }}>
      <div style={{ position: 'relative', width: 64, height: 64, flexShrink: 0 }}>
        {isImage ? (
          <img
            src={photo}
            alt={myPlayer.name}
            style={{
              width: 64, height: 64, borderRadius: '50%',
              objectFit: 'cover', objectPosition: 'top center',
              border: '2px solid rgba(79,209,197,0.6)',
              boxShadow: '0 0 14px rgba(79,209,197,0.25)',
              background: '#1A202C',
              display: 'block',
            }}
            onError={e => { e.currentTarget.style.display = 'none'; }}
          />
        ) : (
          <div style={{
            width: 64, height: 64, borderRadius: '50%',
            background: avatarColor + '22',
            border: `2px solid ${avatarColor}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 800, fontSize: '1.7rem',
            color: avatarColor,
            boxShadow: '0 0 14px rgba(79,209,197,0.15)',
          }}>
            {(myPlayer.name || '?')[0].toUpperCase()}
          </div>
        )}
        <div style={{
          position: 'absolute', bottom: -4, right: -6,
          background: 'linear-gradient(135deg, #2D3748, #1A202C)',
          color: 'var(--teal)',
          fontSize: '0.7rem', fontWeight: 800,
          padding: '2px 6px',
          borderRadius: '8px',
          border: '1px solid rgba(79,209,197,0.5)',
          boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
          letterSpacing: '-0.3px',
          lineHeight: 1.1,
        }}>
          {pi}
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.95rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: '0.15rem' }}>
          {myPlayer.name}
        </div>
        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', letterSpacing: '0.02em' }}>
          {`${ROLE_ICONS[myPlayer.primaryRole] || '⚽'} ${myPlayer.primaryRole || 'Giocatore'}`}
        </div>
      </div>
    </div>
  );
}

function SeasonGrid({ myStats, seasonStartMs }) {
  const startY = new Date(seasonStartMs).getFullYear();
  const seasonRange = `set ${String(startY).slice(-2)} → ago ${String(startY + 1).slice(-2)}`;
  const winRateColor = myStats.seasonWinRate >= 60 ? CLR_WIN : myStats.seasonWinRate >= 40 ? '#F6E05E' : CLR_LOSS;
  const stats = [
    { val: myStats.season.matches,         lbl: 'PARTITE',  color: 'var(--text-primary)' },
    { val: myStats.season.goals,           lbl: 'GOL',      color: '#4FD1C5' },
    { val: myStats.season.assists,         lbl: 'ASSIST',   color: '#63B3ED' },
    { val: `${myStats.seasonWinRate}%`,    lbl: 'WIN RATE', color: winRateColor },
  ];
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginBottom: '0.4rem' }}>
        <span style={{ fontSize: '0.62rem', color: 'var(--teal)', letterSpacing: '0.08em', fontWeight: 800 }}>
          📅 STAGIONE
        </span>
        <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>{seasonRange}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.4rem', marginBottom: '0.6rem' }}>
        {stats.map((s, i) => (
          <div key={i} style={{
            background: 'rgba(79,209,197,0.08)',
            borderRadius: '8px',
            padding: '0.5rem 0.3rem',
            textAlign: 'center',
            border: '1px solid rgba(79,209,197,0.2)',
          }}>
            <div style={{ fontSize: '1.15rem', fontWeight: 800, color: s.color, lineHeight: 1.1, letterSpacing: '-0.3px' }}>
              {s.val}
            </div>
            <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)', letterSpacing: '0.05em', marginTop: '0.2rem' }}>
              {s.lbl}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function SeasonRecord({ myStats }) {
  return (
    <div style={{
      fontSize: '0.72rem',
      color: 'var(--text-secondary)',
      marginBottom: '0.55rem',
      display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem',
    }}>
      <span>
        <span style={{ color: CLR_WIN, fontWeight: 700 }}>{myStats.season.wins}V</span>
        {' '}<span style={{ color: '#F6E05E', fontWeight: 700 }}>{myStats.season.draws}P</span>
        {' '}<span style={{ color: CLR_LOSS, fontWeight: 700 }}>{myStats.season.losses}S</span>
        {' '}<span style={{ color: 'var(--text-muted)', fontSize: '0.68rem' }}>in stagione</span>
      </span>
      {myStats.season.autogoals > 0 && (
        <span style={{ marginLeft: 'auto', color: '#FC8181', fontSize: '0.68rem' }}>
          {myStats.season.autogoals}🤦
        </span>
      )}
    </div>
  );
}

function AllTimeBand({ myStats }) {
  const winRateColor = myStats.totalWinRate >= 60 ? CLR_WIN : myStats.totalWinRate >= 40 ? '#F6E05E' : CLR_LOSS;
  return (
    <div style={{
      fontSize: '0.7rem',
      color: 'var(--text-muted)',
      background: 'rgba(26,32,44,0.4)',
      borderRadius: '6px',
      padding: '0.4rem 0.6rem',
      marginBottom: myStats.last5.length > 0 ? '0.55rem' : 0,
      display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.55rem',
    }}>
      <span style={{ fontSize: '0.58rem', color: 'var(--text-muted)', letterSpacing: '0.06em', fontWeight: 700, opacity: 0.85 }}>
        📊 ALL-TIME
      </span>
      <span>
        <strong style={{ color: 'var(--text-secondary)' }}>{myStats.total.matches}</strong>P ·
        {' '}<span style={{ color: '#4FD1C5' }}>{myStats.total.goals}⚽</span>
        {' '}<span style={{ color: '#63B3ED' }}>{myStats.total.assists}🎯</span>
        {' · '}
        <span style={{ color: CLR_WIN }}>{myStats.total.wins}V</span>
        {' '}<span style={{ color: '#F6E05E' }}>{myStats.total.draws}P</span>
        {' '}<span style={{ color: CLR_LOSS }}>{myStats.total.losses}S</span>
      </span>
      <span style={{ marginLeft: 'auto', fontWeight: 700, color: winRateColor }}>
        {myStats.totalWinRate}%
      </span>
    </div>
  );
}

function FormRow({ myStats, myPlayer, isAdmin }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', letterSpacing: '0.06em', fontWeight: 700 }}>FORMA</span>
      <div
        style={{ display: 'flex', gap: '4px' }}
        role="img"
        aria-label={`Forma ultime ${myStats.last5.length} partite: ${myStats.last5.map(r => r === 'W' ? 'V' : r === 'D' ? 'P' : 'S').join(' ')}`}
      >
        {myStats.last5.map((r, i) => (
          <div key={i} title={r === 'W' ? 'Vittoria' : r === 'D' ? 'Pareggio' : 'Sconfitta'} style={{
            width: 9, height: 9, borderRadius: '50%',
            background: RESULT_COLORS[r],
            opacity: 0.4 + (i / Math.max(myStats.last5.length - 1, 1)) * 0.6,
          }} />
        ))}
      </div>
      <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>
        {myStats.goalsPerMatch} gol/partita
      </span>
      {isAdmin && myPlayer.recentForm && (
        <span style={{
          fontSize: '0.72rem',
          fontWeight: 700,
          color: myPlayer.recentForm.avg >= 7 ? CLR_WIN : myPlayer.recentForm.avg >= 5 ? '#F6E05E' : CLR_LOSS,
        }}>
          ⭐ {myPlayer.recentForm.avg.toFixed(1)}
        </span>
      )}
    </div>
  );
}

function NextBadgeHint({ nextBadge }) {
  const isDecimal = nextBadge.remaining < 10 && nextBadge.remaining % 1 !== 0;
  const remainingStr = isDecimal ? nextBadge.remaining.toFixed(1) : Math.ceil(nextBadge.remaining);
  const currentStr = nextBadge.target > 50 && nextBadge.target < 100
    ? nextBadge.current.toFixed(1)
    : Math.floor(nextBadge.current);
  const targetStr = Number.isInteger(nextBadge.target) ? nextBadge.target : nextBadge.target.toFixed(0);
  const pct = Math.round(nextBadge.progress * 100);
  return (
    <div
      role="img"
      aria-label={`Prossimo badge ${nextBadge.label}: ${currentStr} su ${targetStr} ${nextBadge.unit}, ${pct} percento completato`}
      style={{
        marginTop: '0.6rem',
        padding: '0.55rem 0.7rem',
        borderRadius: '8px',
        background: 'rgba(159,122,234,0.08)',
        border: '1px solid rgba(159,122,234,0.22)',
        display: 'flex', alignItems: 'center', gap: '0.6rem',
      }}
    >
      <span style={{ fontSize: '1.3rem', flexShrink: 0 }} aria-hidden="true">{nextBadge.icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.58rem', color: '#B794F4', letterSpacing: '0.08em', fontWeight: 800, marginBottom: '2px' }}>
          🎯 PROSSIMO BADGE
        </div>
        <div style={{ fontSize: '0.78rem', color: 'var(--text-primary)', fontWeight: 600, marginBottom: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {nextBadge.label}
          <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>
            {' · '}{currentStr}/{targetStr} {nextBadge.unit}
          </span>
        </div>
        <div style={{ height: 4, borderRadius: 2, background: 'rgba(74,85,104,0.4)', overflow: 'hidden' }}>
          <div style={{
            width: `${pct}%`,
            height: '100%',
            background: 'linear-gradient(90deg, #9F7AEA, #B794F4)',
            transition: 'width 0.3s',
          }} />
        </div>
      </div>
      <span style={{
        fontSize: '0.78rem',
        fontWeight: 800,
        color: '#B794F4',
        whiteSpace: 'nowrap',
        minWidth: '32px',
        textAlign: 'right',
      }}>
        -{remainingStr}
      </span>
    </div>
  );
}
