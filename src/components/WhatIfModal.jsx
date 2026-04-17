import React, { useState } from 'react';
import usePlayersStore from '../store/playersStore';
import { generateAIBalancedTeams, generateMatchPrediction } from '../services/geminiService';
import toast from 'react-hot-toast';

export default function WhatIfModal({ onClose }) {
  const { players, balanceTeams } = usePlayersStore();
  const [selectedIds, setSelectedIds] = useState([]);
  const [teams, setTeams] = useState(null);
  const [aiReasoning, setAiReasoning] = useState('');
  const [prediction, setPrediction] = useState('');
  const [predictionLoading, setPredictionLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [step, setStep] = useState('select');
  const [search, setSearch] = useState('');

  const toggle = id => setSelectedIds(prev =>
    prev.includes(id) ? prev.filter(x => x !== id) : prev.length < 10 ? [...prev, id] : prev
  );

  const handleBalance = () => {
    if (selectedIds.length < 2) { toast.error('Seleziona almeno 2 giocatori'); return; }
    const balanced = balanceTeams(selectedIds);
    setTeams(balanced);
    setAiReasoning('');
    setPrediction('');
    setStep('preview');
  };

  const handleAIBalance = async () => {
    if (selectedIds.length < 2) { toast.error('Seleziona almeno 2 giocatori'); return; }
    setAiLoading(true);
    try {
      const pool = players.filter(p => selectedIds.includes(p.id));
      const { red, blue, reasoning } = await generateAIBalancedTeams(pool);
      setTeams({ red, blue });
      setAiReasoning(reasoning);
      setPrediction('');
      setStep('preview');
    } catch (e) {
      toast.error('AI non disponibile, uso bilanciamento standard');
      setTeams(balanceTeams(selectedIds));
      setAiReasoning('');
      setPrediction('');
      setStep('preview');
    } finally {
      setAiLoading(false);
    }
  };

  const handlePredict = async () => {
    if (!teams) return;
    setPredictionLoading(true);
    try {
      const pool = players.filter(p => [...teams.red, ...teams.blue].some(t => t.id === p.id));
      const redFull  = teams.red.map(t  => pool.find(p => p.id === t.id) || t);
      const blueFull = teams.blue.map(t => pool.find(p => p.id === t.id) || t);
      const text = await generateMatchPrediction(redFull, blueFull);
      setPrediction(text);
    } catch (e) {
      toast.error('Pronostico AI non disponibile: ' + e.message);
    } finally {
      setPredictionLoading(false);
    }
  };

  const redPI  = teams ? teams.red.reduce((s, p)  => s + (p.powerIndex || 50), 0).toFixed(0) : null;
  const bluePI = teams ? teams.blue.reduce((s, p) => s + (p.powerIndex || 50), 0).toFixed(0) : null;

  const filtered = search
    ? players.filter(p => p.name.toLowerCase().includes(search.toLowerCase()))
    : players;

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal animate-slide-up" style={{ maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="modal-title" style={{ margin: 0 }}>🎲 Simulatore What-if</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#718096', cursor: 'pointer', fontSize: '1.2rem', lineHeight: 1 }}>✕</button>
        </div>

        {step === 'select' ? (
          <>
            <p style={{ fontSize: '0.78rem', color: '#718096', marginBottom: '0.75rem' }}>
              Scegli fino a 10 giocatori e vedi come potrebbero giocare — senza creare partita.
            </p>
            <input
              className="input"
              placeholder="Cerca giocatore..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ fontSize: '0.82rem', padding: '0.4rem 0.65rem', minHeight: 'auto', marginBottom: '0.5rem' }}
            />
            <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '0.3rem', paddingRight: '2px', marginBottom: '0.75rem' }}>
              {filtered.map(p => {
                const sel = selectedIds.includes(p.id);
                return (
                  <button
                    key={p.id}
                    onClick={() => toggle(p.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.65rem',
                      padding: '0.55rem 0.75rem', borderRadius: '8px',
                      background: sel ? 'rgba(79,209,197,0.1)' : 'transparent',
                      border: `1px solid ${sel ? '#4FD1C5' : '#2D3748'}`,
                      cursor: 'pointer', textAlign: 'left', flexShrink: 0,
                    }}
                  >
                    <div style={{
                      width: 17, height: 17, borderRadius: '50%',
                      border: `2px solid ${sel ? '#4FD1C5' : '#4A5568'}`,
                      background: sel ? '#4FD1C5' : 'transparent',
                      flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {sel && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#1A202C" strokeWidth={3.5}><polyline points="20 6 9 17 4 12"/></svg>}
                    </div>
                    <span style={{ fontWeight: 500, color: sel ? '#F7FAFC' : '#A0AEC0', flex: 1, fontSize: '0.88rem' }}>{p.name}</span>
                    <span style={{ fontSize: '0.75rem', color: '#718096' }}>PI {p.powerIndex?.toFixed(0) || 50}</span>
                  </button>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
              <button
                onClick={handleBalance}
                disabled={selectedIds.length < 2 || aiLoading}
                style={{ flex: 1, padding: '0.65rem', borderRadius: '8px', border: '1px solid rgba(79,209,197,0.4)', background: 'rgba(79,209,197,0.08)', color: '#4FD1C5', fontWeight: 700, cursor: 'pointer', fontSize: '0.88rem' }}
              >
                ⚖️ Bilancia
              </button>
              <button
                onClick={handleAIBalance}
                disabled={selectedIds.length < 2 || aiLoading}
                style={{ flex: 1, padding: '0.65rem', borderRadius: '8px', border: '1px solid rgba(104,211,145,0.4)', background: 'rgba(104,211,145,0.08)', color: '#68D391', fontWeight: 700, cursor: 'pointer', fontSize: '0.88rem' }}
              >
                {aiLoading ? '⏳ AI...' : '🤖 AI Bilancia'}
              </button>
            </div>
          </>
        ) : (
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {/* Teams */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem', marginBottom: '0.75rem' }}>
              {[
                { team: teams.red, label: '🔴 Rossi', color: '#FC8181', bg: 'rgba(252,129,129,0.07)', border: 'rgba(252,129,129,0.25)', pi: redPI },
                { team: teams.blue, label: '🔵 Blu', color: '#63B3ED', bg: 'rgba(99,179,237,0.07)', border: 'rgba(99,179,237,0.25)', pi: bluePI },
              ].map(({ team, label, color, bg, border, pi }) => (
                <div key={label} style={{ background: bg, border: `1px solid ${border}`, borderRadius: '10px', padding: '0.65rem' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color, marginBottom: '0.4rem' }}>
                    {label} <span style={{ fontWeight: 400, color: '#718096' }}>PI {pi}</span>
                  </div>
                  {team.map(p => (
                    <div key={p.id} style={{ fontSize: '0.82rem', color: '#E2E8F0', padding: '0.15rem 0' }}>{p.name}</div>
                  ))}
                </div>
              ))}
            </div>

            {aiReasoning && (
              <div style={{ background: 'rgba(104,211,145,0.05)', border: '1px solid rgba(104,211,145,0.2)', borderRadius: '8px', padding: '0.65rem', marginBottom: '0.65rem' }}>
                <div style={{ fontSize: '0.68rem', color: '#68D391', fontWeight: 700, marginBottom: '0.3rem' }}>🤖 AI — ragionamento formazione</div>
                <p style={{ fontSize: '0.78rem', color: '#A0AEC0', margin: 0, lineHeight: 1.5 }}>{aiReasoning}</p>
              </div>
            )}

            {!prediction ? (
              <button
                onClick={handlePredict}
                disabled={predictionLoading}
                style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: '1px dashed rgba(246,173,85,0.4)', background: 'rgba(246,173,85,0.04)', color: '#F6AD55', fontWeight: 700, cursor: predictionLoading ? 'default' : 'pointer', fontSize: '0.88rem', marginBottom: '0.65rem' }}
              >
                {predictionLoading ? '⏳ Pronostico in corso...' : '🔮 Pronostico AI'}
              </button>
            ) : (
              <div style={{ background: 'rgba(246,173,85,0.04)', border: '1px solid rgba(246,173,85,0.35)', borderRadius: '8px', padding: '0.75rem', marginBottom: '0.65rem' }}>
                <div className="flex items-center justify-between mb-2">
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#F6AD55' }}>🔮 Pronostico AI</span>
                  <button onClick={() => setPrediction('')} style={{ fontSize: '0.7rem', color: '#718096', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
                </div>
                <p style={{ fontSize: '0.82rem', color: '#CBD5E0', lineHeight: 1.75, margin: 0, whiteSpace: 'pre-wrap' }}>{prediction}</p>
              </div>
            )}

            <button
              onClick={() => { setStep('select'); setTeams(null); setAiReasoning(''); setPrediction(''); }}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid #4A5568', background: 'transparent', color: '#A0AEC0', cursor: 'pointer', fontSize: '0.82rem' }}
            >
              ← Cambia giocatori
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
