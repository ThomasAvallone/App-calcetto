import React, { useState, useEffect } from 'react';
import { updatePlayer } from '../../firebase/firestore';
import { generatePlayerNickname } from '../../services/geminiService';
import toast from 'react-hot-toast';

export default function AiNicknameCard({ player }) {
  const [loading, setLoading] = useState(false);
  const [pendingNickname, setPendingNickname] = useState(null);

  const cached = player.aiNickname;
  useEffect(() => { if (cached) setPendingNickname(null); }, [cached]);
  const displayCached = pendingNickname || cached;

  const generate = async () => {
    setLoading(true);
    try {
      const as = player.stats || {};
      const stats = {
        goals:       as.goals     || 0,
        assists:     as.assists   || 0,
        autogoals:   as.autogoals || 0,
        matches:     as.matches   || 0,
        wins:        as.wins      || 0,
        losses:      as.losses    || 0,
        primaryRole: player.primaryRole || '',
        powerIndex:  player.powerIndex  || 50,
        streak:      player.streak      || null,
      };
      const raw = await generatePlayerNickname(player, stats);
      const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
      const soprannome = lines.find(l => l.toLowerCase().startsWith('soprannome:'))?.replace(/^soprannome:\s*/i, '') || raw;
      const motivazione = lines.find(l => l.toLowerCase().startsWith('motivazione:'))?.replace(/^motivazione:\s*/i, '') || '';
      setPendingNickname({ soprannome, motivazione });
      await updatePlayer(player.id, {
        aiNickname: { soprannome, motivazione, generatedAt: new Date().toISOString() },
      });
    } catch (e) {
      toast.error('Soprannome AI: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  if (!displayCached) {
    return (
      <div className="card mb-4" style={{ textAlign: 'center', border: '1px dashed rgba(246,173,85,0.35)', background: 'rgba(246,173,85,0.03)' }}>
        <button onClick={generate} disabled={loading}
          style={{ background: 'none', border: 'none', cursor: loading ? 'default' : 'pointer', color: '#F6AD55', fontSize: '0.88rem', padding: '0.6rem 0', width: '100%' }}>
          {loading ? '⏳ Generando soprannome...' : '🏷️ Genera soprannome AI'}
        </button>
      </div>
    );
  }

  return (
    <div className="card mb-4" style={{ border: '1px solid rgba(246,173,85,0.4)', background: 'rgba(246,173,85,0.05)', textAlign: 'center' }}>
      <div className="flex items-center justify-between mb-2">
        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#F6AD55' }}>🏷️ Soprannome AI</span>
        <button onClick={generate} disabled={loading}
          style={{ fontSize: '0.7rem', color: '#718096', background: 'none', border: 'none', cursor: loading ? 'default' : 'pointer' }}>
          {loading ? '⏳' : '↺ Rigenera'}
        </button>
      </div>
      <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#F6AD55', marginBottom: '0.4rem', letterSpacing: '0.02em' }}>
        "{displayCached.soprannome}"
      </div>
      {displayCached.motivazione && (
        <div style={{ fontSize: '0.78rem', color: '#A0AEC0', fontStyle: 'italic' }}>{displayCached.motivazione}</div>
      )}
    </div>
  );
}
