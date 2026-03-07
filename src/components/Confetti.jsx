import React, { useMemo } from 'react';

const COLORS = ['#4FD1C5', '#F6E05E', '#68D391', '#FC8181', '#63B3ED', '#B794F4', '#F6AD55'];
const COUNT = 60;

export default function Confetti() {
  const pieces = useMemo(() => Array.from({ length: COUNT }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 1.2,
    duration: 1.8 + Math.random() * 1.4,
    size: 6 + Math.random() * 8,
    color: COLORS[i % COLORS.length],
    isCircle: Math.random() > 0.5,
  })), []);

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
