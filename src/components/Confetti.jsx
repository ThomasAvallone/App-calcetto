import React, { useMemo } from 'react';

const RED_COLORS   = ['#FC8181', '#FEB2B2', '#FED7D7', '#E53E3E', '#C53030', '#FFFFFF'];
const BLUE_COLORS  = ['#63B3ED', '#90CDF4', '#BEE3F8', '#3182CE', '#2B6CB0', '#FFFFFF'];
const COUNT = 60;

export default function Confetti({ winner }) {
  const COLORS = winner === 'red' ? RED_COLORS : BLUE_COLORS;
  const pieces = useMemo(() => Array.from({ length: COUNT }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 1.2,
    duration: 1.8 + Math.random() * 1.4,
    size: 6 + Math.random() * 8,
    color: COLORS[i % COLORS.length],
    isCircle: Math.random() > 0.5,
  })), [winner]);

  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 1000, overflow: 'hidden' }}>
      {pieces.map(p => (
        <div key={p.id} style={{
          position: 'absolute',
          left: `${p.left}%`,
          top: '-20px',
          width: p.size,
          height: p.isCircle ? p.size : p.size * 0.5,
          borderRadius: p.isCircle ? '50%' : '2px',
          background: p.color,
          animation: `confettiFall ${p.duration}s ${p.delay}s ease-in forwards`,
        }} />
      ))}
    </div>
  );
}
