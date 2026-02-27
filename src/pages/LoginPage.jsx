import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../store/authStore';

export default function LoginPage() {
  const { user, login, loading, error } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) navigate('/', { replace: true });
  }, [user]);

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #1A202C 0%, #2D3748 100%)',
      padding: '2rem',
    }}>
      {/* Logo / Hero */}
      <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
        <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>⚽</div>
        <h1 style={{
          fontSize: '2.5rem', fontWeight: 900,
          background: 'linear-gradient(135deg, #4FD1C5, #81E6D9)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          marginBottom: '0.5rem',
        }}>
          Calcetto Analytics
        </h1>
        <p style={{ color: '#A0AEC0', fontSize: '1.05rem' }}>
          Gestione partite 5v5 · Statistiche avanzate
        </p>
      </div>

      {/* Features */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem',
        marginBottom: '3rem', maxWidth: '360px', width: '100%',
      }}>
        {[
          { icon: '⏱️', label: 'Timer di gara' },
          { icon: '🔄', label: 'Rotazione portieri' },
          { icon: '📊', label: 'Power Index' },
          { icon: '🏆', label: 'MVP & Premi' },
        ].map(f => (
          <div key={f.label} className="card" style={{ textAlign: 'center', padding: '1rem' }}>
            <div style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>{f.icon}</div>
            <div style={{ fontSize: '0.8rem', color: '#A0AEC0', fontWeight: 500 }}>{f.label}</div>
          </div>
        ))}
      </div>

      {/* Login button */}
      <div style={{ width: '100%', maxWidth: '360px' }}>
        {error && (
          <div style={{
            background: 'rgba(252,129,129,0.1)', border: '1px solid #FC8181',
            borderRadius: '8px', padding: '0.75rem 1rem',
            color: '#FC8181', fontSize: '0.875rem', marginBottom: '1rem', textAlign: 'center',
          }}>
            {error}
          </div>
        )}

        <button
          className="btn btn-teal btn-lg btn-full"
          onClick={login}
          disabled={loading}
          style={{ borderRadius: '12px', fontSize: '1.1rem', gap: '0.75rem' }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          {loading ? 'Accesso in corso...' : 'Accedi con Google'}
        </button>

        <p style={{
          textAlign: 'center', marginTop: '1.5rem',
          color: '#718096', fontSize: '0.8rem', lineHeight: 1.6,
        }}>
          Accedendo, accetti i termini di utilizzo.<br />
          Solo gli admin possono gestire partite e statistiche.
        </p>
      </div>
    </div>
  );
}
