import React from 'react';

// Card "Match Preview" condivisa: titolo + bottoni Copia/WhatsApp + testo.
// Usata da MatchSetupPage e ScheduledMatchDetailPage.
export default function MatchPreviewCard({ preview, onCopy, onShare, title = '📋 Match Preview' }) {
  return (
    <div className="card mb-4">
      <div className="flex items-center justify-between mb-3">
        <h3>{title}</h3>
        <div className="flex gap-2">
          <button className="btn btn-ghost text-sm" style={{ padding: '0.3rem 0.75rem', minHeight: 'auto' }} onClick={onCopy}>
            📋 Copia
          </button>
          <button className="btn btn-ghost text-sm" style={{ padding: '0.3rem 0.75rem', minHeight: 'auto', color: '#25D366' }} onClick={onShare}>
            💬 WhatsApp
          </button>
        </div>
      </div>
      <pre style={{
        fontFamily: 'Inter, monospace', fontSize: '0.78rem',
        color: '#A0AEC0', whiteSpace: 'pre-wrap', lineHeight: 1.6,
      }}>
        {preview}
      </pre>
    </div>
  );
}
