import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      // `inline`: variante contenuta nell'area contenuto (usata dal boundary
      // per-route nel Layout) — NON copre la bottom-nav, così l'utente può
      // navigare altrove e resettare l'errore. Default: full-page (last resort).
      const { inline } = this.props;
      const containerStyle = inline
        ? {
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            minHeight: '60vh', padding: '2rem', textAlign: 'center',
          }
        : {
            position: 'fixed', inset: 0,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            background: '#1A202C', padding: '2rem', textAlign: 'center',
          };
      return (
        <div style={containerStyle}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
          <h2 style={{ color: '#F7FAFC', marginBottom: '0.5rem' }}>Qualcosa è andato storto</h2>
          <p style={{ color: '#718096', fontSize: '0.9rem', marginBottom: '2rem' }}>
            {this.state.error?.message || 'Errore inatteso'}
          </p>
          <button
            onClick={() => window.location.href = '/'}
            style={{
              padding: '0.75rem 1.5rem', borderRadius: '8px',
              background: '#4FD1C5', color: '#1A202C',
              fontWeight: 700, fontSize: '0.95rem', border: 'none', cursor: 'pointer',
            }}
          >
            Torna alla home
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
