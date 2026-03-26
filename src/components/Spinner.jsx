import React from 'react';

export default function Spinner({ fullPage, size = 32 }) {
  const spinner = (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="#4FD1C5"
      strokeWidth="2.5"
      className="spinner"
    >
      <circle cx="12" cy="12" r="10" strokeOpacity="0.2" />
      <path d="M12 2a10 10 0 0110 10" />
    </svg>
  );

  if (fullPage) {
    return (
      <div style={{
        position: 'fixed', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#1A202C', zIndex: 999,
      }}>
        <img
          src="/loading.gif"
          alt="Caricamento..."
          style={{ width: 180, height: 180, objectFit: 'contain' }}
          onError={e => { e.currentTarget.style.display = 'none'; e.currentTarget.nextSibling.style.display = 'block'; }}
        />
        <span style={{ display: 'none' }}>{spinner}</span>
      </div>
    );
  }

  return spinner;
}
