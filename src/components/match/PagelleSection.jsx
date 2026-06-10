import React, { useEffect, useState } from 'react';
import { generateMatchPagelle } from '../../services/geminiService';
import { getAICache, setAICache } from '../../firebase/firestore';
import { eventsSignature } from '../../utils/eventsSignature';
import toast from 'react-hot-toast';

// Pagelle AI post-partita. Generazione admin-only (una chiamata Gemini), risultato
// in cache condivisa su settings/aiCache_pagelle_{matchId} così tutti gli utenti
// vedono lo stesso testo senza costi extra. La firma eventi invalida la cache se
// la cronaca viene modificata in post: compare il badge "eventi modificati" e
// l'admin può rigenerare.
export default function PagelleSection({ match, isAdmin }) {
  const [text, setText] = useState('');
  const [stale, setStale] = useState(false);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const currentSig = eventsSignature(match.events);

  useEffect(() => {
    let cancelled = false;
    getAICache(`pagelle_${match.id}`).then(data => {
      if (cancelled || !data?.text) return;
      setText(data.text);
      setStale(data.sig !== currentSig);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [match.id, currentSig]);

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const t = await generateMatchPagelle(match);
      setText(t);
      setStale(false);
      setExpanded(true);
      setAICache(`pagelle_${match.id}`, { text: t, sig: currentSig }).catch(() => {});
      toast.success('📝 Pagelle generate!');
    } catch (e) {
      toast.error('Pagelle AI: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  // Senza testo in cache e senza poteri admin non c'è nulla da mostrare
  if (!text && !isAdmin) return null;

  return (
    <div className="card mb-4" style={{ border: '1px solid rgba(246,173,85,0.3)', background: 'rgba(246,173,85,0.03)' }}>
      <div className="flex items-center gap-2 mb-2">
        <h3 style={{ fontSize: '0.95rem', margin: 0, color: '#F6AD55' }}>📝 Pagelle AI</h3>
        {stale && (
          <span style={{ fontSize: '0.66rem', color: '#F6AD55', background: 'rgba(246,173,85,0.15)', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
            ⚠️ Eventi modificati
          </span>
        )}
      </div>

      {text && (
        <>
          <div style={{ maxHeight: expanded ? 'none' : '9rem', overflow: 'hidden', position: 'relative' }}>
            <pre style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.82rem', color: '#CBD5E0', whiteSpace: 'pre-wrap', lineHeight: 1.7, margin: 0 }}>
              {text}
            </pre>
            {!expanded && (
              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '3rem', background: 'linear-gradient(transparent, #1A202C)' }} />
            )}
          </div>
          <button
            onClick={() => setExpanded(v => !v)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#F6AD55', fontSize: '0.78rem', fontWeight: 600, padding: '0.4rem 0', width: '100%' }}>
            {expanded ? '▲ Comprimi' : '▼ Leggi tutte'}
          </button>
          <div className="flex gap-2">
            <button className="btn" style={{ flex: 1, fontSize: '0.8rem' }}
              onClick={() => navigator.clipboard.writeText(text).then(() => toast.success('Copiato!')).catch(() => toast.error('Copia non riuscita'))}>
              📋 Copia
            </button>
            <button className="btn" style={{ flex: 1, fontSize: '0.8rem', background: '#25D366', color: '#fff', border: 'none' }}
              onClick={() => window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank')}>
              📲 WhatsApp
            </button>
          </div>
        </>
      )}

      {isAdmin && (
        <button
          onClick={handleGenerate}
          disabled={loading}
          className="btn btn-full"
          style={{
            marginTop: text ? '0.5rem' : 0,
            border: '1px solid rgba(246,173,85,0.5)', background: 'rgba(246,173,85,0.08)',
            color: '#F6AD55', fontWeight: 700, fontSize: '0.85rem',
          }}>
          {loading ? '⏳ Il giornalista sta scrivendo...' : text ? '↺ Rigenera Pagelle' : '✨ Genera Pagelle AI'}
        </button>
      )}
    </div>
  );
}
