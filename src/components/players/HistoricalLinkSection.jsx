import React from 'react';

export default function HistoricalLinkSection({ linkedNames, suggestions, showAll, allNames, historicalSearch, onToggle, onShowAll, onSearchChange }) {
  const hasSuggestions = suggestions.length > 0;

  return (
    <div style={{
      borderRadius: '8px',
      border: '1px solid #4A5568',
      padding: '0.75rem',
      background: 'rgba(26,32,44,0.5)',
    }}>
      <div className="flex items-center justify-between mb-2">
        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#A0AEC0' }}>
          📚 Collega allo Storico
        </span>
        <button
          type="button"
          onClick={onShowAll}
          style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: '0.2rem 0.4rem',
            color: '#4FD1C5', fontSize: '0.7rem', fontWeight: 600,
          }}
        >
          {showAll ? 'Riduci' : 'Tutti i nomi'}
        </button>
      </div>

      {linkedNames.length > 0 && (
        <div className="flex gap-2 mb-2" style={{ flexWrap: 'wrap' }}>
          {linkedNames.map(n => (
            <button
              key={n}
              type="button"
              onClick={() => onToggle(n)}
              style={{
                padding: '0.2rem 0.6rem', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 600,
                background: 'rgba(79,209,197,0.15)', color: '#4FD1C5',
                border: '1px solid rgba(79,209,197,0.5)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '0.25rem',
              }}
            >
              {n} <span style={{ fontSize: '0.8rem' }}>×</span>
            </button>
          ))}
        </div>
      )}

      {!showAll && hasSuggestions && (
        <>
          <p style={{ fontSize: '0.68rem', color: '#718096', marginBottom: '0.4rem' }}>Suggeriti:</p>
          <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
            {suggestions.map(({ name }) => {
              const isLinked = linkedNames.includes(name);
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => onToggle(name)}
                  style={{
                    padding: '0.2rem 0.6rem', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 600,
                    background: isLinked ? 'rgba(79,209,197,0.15)' : 'rgba(74,85,104,0.4)',
                    color: isLinked ? '#4FD1C5' : '#A0AEC0',
                    border: isLinked ? '1px solid rgba(79,209,197,0.5)' : '1px solid #4A5568',
                    cursor: 'pointer',
                  }}
                >
                  {name}
                </button>
              );
            })}
          </div>
        </>
      )}

      {showAll && (
        <>
          <input
            className="input"
            placeholder="Cerca nome storico..."
            value={historicalSearch}
            onChange={e => onSearchChange(e.target.value)}
            style={{ marginBottom: '0.5rem', fontSize: '0.8rem', padding: '0.4rem 0.6rem', minHeight: 'auto' }}
          />
          <div style={{ maxHeight: '140px', overflowY: 'auto', display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
            {allNames.map(name => {
              const isLinked = linkedNames.includes(name);
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => onToggle(name)}
                  style={{
                    padding: '0.2rem 0.5rem', borderRadius: '999px', fontSize: '0.7rem', fontWeight: 600,
                    background: isLinked ? 'rgba(79,209,197,0.15)' : 'rgba(74,85,104,0.4)',
                    color: isLinked ? '#4FD1C5' : '#A0AEC0',
                    border: isLinked ? '1px solid rgba(79,209,197,0.5)' : '1px solid #4A5568',
                    cursor: 'pointer',
                  }}
                >
                  {name}
                </button>
              );
            })}
            {allNames.length === 0 && (
              <span style={{ fontSize: '0.75rem', color: '#718096' }}>Nessun nome disponibile</span>
            )}
          </div>
        </>
      )}

      {!showAll && !hasSuggestions && linkedNames.length === 0 && (
        <p style={{ fontSize: '0.72rem', color: '#718096', textAlign: 'center', padding: '0.25rem 0' }}>
          Digita il nome per vedere i suggerimenti
        </p>
      )}
    </div>
  );
}
