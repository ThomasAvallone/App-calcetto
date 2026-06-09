import React, { useEffect, useState } from 'react';
import { subscribeToMatchReactions, upsertMatchReaction, deleteMatchReaction } from '../../firebase/firestore';
import toast from 'react-hot-toast';

const REACTION_EMOJIS = [
  { emoji: '👑', label: 'MVP' },
  { emoji: '🔥', label: 'In fuoco' },
  { emoji: '🎯', label: 'Precisione' },
  { emoji: '🧤', label: 'Muro' },
  { emoji: '🤦', label: 'Papera' },
  { emoji: '🎉', label: 'Gran partita' },
];

export default function ReactionsSection({ matchId, userId, displayName }) {
  const [reactions, setReactions] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!matchId) return;
    return subscribeToMatchReactions(matchId, setReactions);
  }, [matchId]);

  const myReaction = reactions.find(r => r.id === userId);

  const handlePick = async (emoji) => {
    if (!userId) return;
    setSaving(true);
    try {
      if (myReaction?.emoji === emoji) {
        await deleteMatchReaction(matchId, userId);
      } else {
        await upsertMatchReaction(matchId, userId, { emoji, playerName: displayName });
      }
    } catch (e) {
      toast.error('Errore: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card mb-4" style={{ border: '1px solid rgba(79,209,197,0.18)' }}>
      <h3 className="mb-3" style={{ fontSize: '0.92rem' }}>💬 Reazioni</h3>

      {userId && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: reactions.length ? '0.85rem' : 0 }}>
          {REACTION_EMOJIS.map(({ emoji, label }) => {
            const isMine = myReaction?.emoji === emoji;
            return (
              <button
                key={emoji}
                onClick={() => handlePick(emoji)}
                disabled={saving}
                title={label}
                style={{
                  padding: '0.35rem 0.65rem',
                  borderRadius: '999px',
                  border: `1px solid ${isMine ? '#4FD1C5' : 'rgba(74,85,104,0.5)'}`,
                  background: isMine ? 'rgba(79,209,197,0.2)' : 'rgba(74,85,104,0.15)',
                  cursor: 'pointer',
                  fontSize: '1.1rem',
                  lineHeight: 1,
                  outline: 'none',
                  transition: 'all 0.12s',
                }}
              >
                {emoji}
              </button>
            );
          })}
        </div>
      )}

      {reactions.length > 0 ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
          {REACTION_EMOJIS.map(({ emoji }) => {
            const group = reactions.filter(r => r.emoji === emoji);
            if (!group.length) return null;
            const names = group.map(r => r.playerName || 'Anonimo').join(', ');
            return (
              <div key={emoji} title={names}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.3rem',
                  padding: '0.2rem 0.55rem', borderRadius: '999px',
                  background: 'rgba(74,85,104,0.25)', cursor: 'default',
                }}>
                <span style={{ fontSize: '1rem' }}>{emoji}</span>
                <span style={{ fontWeight: 700, fontSize: '0.82rem', color: '#CBD5E0' }}>{group.length}</span>
              </div>
            );
          })}
        </div>
      ) : userId ? (
        <p className="text-xs text-muted">Sii il primo a reagire!</p>
      ) : (
        <p className="text-xs text-muted">Accedi per lasciare una reazione.</p>
      )}
    </div>
  );
}
