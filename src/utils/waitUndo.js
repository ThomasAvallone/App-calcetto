import React from 'react';
import toast from 'react-hot-toast';

// Mostra un toast con pulsante "Annulla" e countdown; risolve:
// - true  → l'utente ha annullato
// - false → il countdown è scaduto (procedi con l'azione)
export function waitUndo(label, durationMs = 5000) {
  return new Promise(resolve => {
    let remaining = Math.ceil(durationMs / 1000);
    let settled = false;

    const settle = val => {
      if (settled) return;
      settled = true;
      clearInterval(tickId);
      clearTimeout(timeoutId);
      toast.dismiss(toastId);
      resolve(val);
    };

    const toastId = toast.custom(
      t => React.createElement(
        'div',
        {
          style: {
            background: '#2D3748',
            color: '#E2E8F0',
            padding: '0.85rem 1rem',
            borderRadius: '10px',
            border: '1px solid #4A5568',
            display: 'flex',
            alignItems: 'center',
            gap: '0.9rem',
            boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
            minWidth: '260px',
          },
        },
        React.createElement('span', { style: { fontSize: '0.88rem', fontWeight: 600 } },
          `${label} · annulla entro ${remaining}s`
        ),
        React.createElement('button', {
          onClick: () => settle(true),
          style: {
            marginLeft: 'auto',
            background: 'rgba(252,129,129,0.15)',
            border: '1px solid rgba(252,129,129,0.5)',
            color: '#FC8181',
            padding: '0.35rem 0.75rem',
            borderRadius: '6px',
            fontWeight: 700,
            fontSize: '0.78rem',
            cursor: 'pointer',
          },
        }, '↺ Annulla'),
      ),
      { duration: durationMs + 500 },
    );

    const tickId = setInterval(() => {
      remaining--;
      if (remaining <= 0) return;
      toast.custom(
        t => React.createElement(
          'div',
          {
            style: {
              background: '#2D3748',
              color: '#E2E8F0',
              padding: '0.85rem 1rem',
              borderRadius: '10px',
              border: '1px solid #4A5568',
              display: 'flex',
              alignItems: 'center',
              gap: '0.9rem',
              boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
              minWidth: '260px',
            },
          },
          React.createElement('span', { style: { fontSize: '0.88rem', fontWeight: 600 } },
            `${label} · annulla entro ${remaining}s`
          ),
          React.createElement('button', {
            onClick: () => settle(true),
            style: {
              marginLeft: 'auto',
              background: 'rgba(252,129,129,0.15)',
              border: '1px solid rgba(252,129,129,0.5)',
              color: '#FC8181',
              padding: '0.35rem 0.75rem',
              borderRadius: '6px',
              fontWeight: 700,
              fontSize: '0.78rem',
              cursor: 'pointer',
            },
          }, '↺ Annulla'),
        ),
        { id: toastId, duration: durationMs + 500 },
      );
    }, 1000);

    const timeoutId = setTimeout(() => settle(false), durationMs);
  });
}
