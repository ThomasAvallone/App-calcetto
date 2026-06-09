import React, { useState } from 'react';
import { updateMatch, recalculatePlayerStats } from '../../firebase/firestore';
import toast from 'react-hot-toast';

export default function BestieSection({ match, onUpdate }) {
  const allPlayers = [...(match.redTeam || []), ...(match.blueTeam || [])];
  const [saving, setSaving] = useState(false);
  const current = match.bestieId || '';

  const assign = async (playerId, playerName) => {
    setSaving(true);
    try {
      const isClear = playerId === current;
      const newId = isClear ? null : playerId;
      const newName = isClear ? null : playerName;
      await updateMatch(match.id, { bestieId: newId, bestiePlayerName: newName });
      // recalc old and new bestie holder
      const toRecalc = [...new Set([match.bestieId, newId].filter(Boolean))];
      if (toRecalc.length) await recalculatePlayerStats(toRecalc);
      onUpdate({ ...match, bestieId: newId, bestiePlayerName: newName });
      toast.success(newId ? `🙏 Bestie assegnato a ${newName}` : '🙏 Bestie rimosso');
    } catch (e) {
      toast.error('Errore: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card mb-4" style={{ border: '1px solid rgba(252,129,129,0.25)', background: 'rgba(252,129,129,0.03)' }}>
      <h3 className="mb-1" style={{ fontSize: '0.95rem' }}>🙏 Premio Bestie</h3>
      <p className="text-xs text-muted mb-3" style={{ lineHeight: 1.5 }}>
        La "Madonna" più sincera e sentita della partita. Seleziona il giocatore, ri-clicca per rimuovere.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        {allPlayers.map(p => {
          const isSelected = current === p.id;
          return (
            <button
              key={p.id}
              disabled={saving}
              onClick={() => assign(p.id, p.name)}
              style={{
                padding: '0.4rem 0.9rem', borderRadius: '999px', fontSize: '0.82rem', fontWeight: 600,
                cursor: 'pointer', border: `1px solid ${isSelected ? '#FC8181' : '#4A5568'}`,
                background: isSelected ? 'rgba(252,129,129,0.18)' : 'rgba(74,85,104,0.25)',
                color: isSelected ? '#FC8181' : '#A0AEC0',
                transition: 'all 0.15s',
              }}
            >
              {isSelected ? '🙏 ' : ''}{p.name}
            </button>
          );
        })}
      </div>
      {current && (
        <p className="text-xs mt-2" style={{ color: '#FC8181' }}>
          Assegnato a <strong>{match.bestiePlayerName}</strong>
        </p>
      )}
    </div>
  );
}
