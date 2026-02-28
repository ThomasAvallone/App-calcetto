import React, { useState, useEffect } from 'react';
import { getMatches, getPlayers, seedHistoricalSeasons } from '../firebase/firestore';
import { syncAllHistoryToSheets } from '../services/sheetsService';
import { downloadExcel } from '../services/excelService';
import { recalculatePlayerStats } from '../firebase/firestore';
import { doc, getDocs, collection, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { HISTORICAL_SEASONS } from '../data/historicalData';
import toast from 'react-hot-toast';

export default function AdminPage() {
  const [players, setPlayers] = useState([]);
  const [matches, setMatches] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [seeding, setSeeding] = useState(false);

  useEffect(() => {
    Promise.all([getPlayers(), getMatches(), loadUsers()]).then(([p, m, u]) => {
      setPlayers(p); setMatches(m); setUsers(u); setLoading(false);
    });
  }, []);

  async function loadUsers() {
    const snap = await getDocs(collection(db, 'users'));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  const handleSyncSheets = async () => {
    setSyncing(true);
    try {
      await syncAllHistoryToSheets(matches, players);
      toast.success('Sincronizzazione completata!');
    } catch (e) {
      toast.error('Errore sync: ' + e.message);
    } finally {
      setSyncing(false);
    }
  };

  const handleExcelDownload = async () => {
    setExporting(true);
    try {
      downloadExcel(players, matches);
      toast.success('Download avviato!');
    } catch (e) {
      toast.error('Errore export: ' + e.message);
    } finally {
      setExporting(false);
    }
  };

  const handleSeedHistory = async () => {
    if (!window.confirm(`Importare ${HISTORICAL_SEASONS.length} stagioni storiche su Firestore? I dati esistenti verranno sovrascritti.`)) return;
    setSeeding(true);
    try {
      await seedHistoricalSeasons(HISTORICAL_SEASONS);
      toast.success(`${HISTORICAL_SEASONS.length} stagioni importate su Firestore!`);
    } catch (e) {
      toast.error('Errore import: ' + e.message);
    } finally {
      setSeeding(false);
    }
  };

  const handleRecalculateAll = async () => {
    setRecalculating(true);
    try {
      const allIds = players.map(p => p.id);
      await recalculatePlayerStats(allIds);
      toast.success('Power Index ricalcolati per tutti i giocatori!');
    } catch (e) {
      toast.error('Errore: ' + e.message);
    } finally {
      setRecalculating(false);
    }
  };

  const handleSetRole = async (uid, newRole) => {
    await updateDoc(doc(db, 'users', uid), { role: newRole });
    setUsers(u => u.map(user => user.id === uid ? { ...user, role: newRole } : user));
    toast.success(`Ruolo aggiornato: ${newRole}`);
  };

  if (loading) return (
    <div className="page-content" style={{ textAlign: 'center', paddingTop: '3rem', color: '#718096' }}>
      Caricamento pannello admin...
    </div>
  );

  const finishedMatches = matches.filter(m => m.status === 'finished');
  const totalGoals = finishedMatches.reduce((s, m) => s + (m.redScore || 0) + (m.blueScore || 0), 0);

  return (
    <div className="page-content">
      <h2 style={{ paddingTop: '0.5rem', marginBottom: '0.25rem' }}>⚙️ Pannello Admin</h2>
      <p className="text-sm text-muted mb-4">Gestione avanzata e dati</p>

      {/* Stats overview */}
      <div className="grid-3 mb-4">
        <div className="card" style={{ textAlign: 'center', padding: '1rem' }}>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#4FD1C5' }}>{players.length}</div>
          <div style={{ fontSize: '0.7rem', color: '#718096' }}>Giocatori</div>
        </div>
        <div className="card" style={{ textAlign: 'center', padding: '1rem' }}>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#4FD1C5' }}>{finishedMatches.length}</div>
          <div style={{ fontSize: '0.7rem', color: '#718096' }}>Partite</div>
        </div>
        <div className="card" style={{ textAlign: 'center', padding: '1rem' }}>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#4FD1C5' }}>{totalGoals}</div>
          <div style={{ fontSize: '0.7rem', color: '#718096' }}>Gol Totali</div>
        </div>
      </div>

      {/* Import Historical Seasons */}
      <div className="card mb-4">
        <h3 className="mb-1">📚 Importa Annali Storici</h3>
        <p className="text-sm text-muted mb-3">
          Carica su Firestore tutte le {HISTORICAL_SEASONS.length} stagioni storiche (2018/19 → oggi).
          Serve per la pagina Annali e per il collegamento giocatori ↔ storico.
        </p>
        <button
          className="btn btn-teal btn-full"
          onClick={handleSeedHistory}
          disabled={seeding}
        >
          {seeding ? '⏳ Importazione...' : '📥 Importa Stagioni Storiche'}
        </button>
      </div>

      {/* Google Sheets */}
      <div className="card mb-4">
        <h3 className="mb-1">📊 Google Sheets</h3>
        <p className="text-sm text-muted mb-3">
          Backup dati su foglio Google configurato tramite Apps Script webhook.
        </p>
        <button
          className="btn btn-teal btn-full mb-2"
          onClick={handleSyncSheets}
          disabled={syncing}
        >
          {syncing ? '⏳ Sincronizzazione...' : '🔄 Sincronizza Tutto lo Storico'}
        </button>
        <p className="text-xs text-muted">
          Configura VITE_SHEETS_WEBHOOK_URL nel file .env con l'URL del tuo Apps Script.
        </p>
      </div>

      {/* Excel Export */}
      <div className="card mb-4">
        <h3 className="mb-1">📥 Export Excel</h3>
        <p className="text-sm text-muted mb-3">
          Scarica un file .xlsx con giocatori, partite ed eventi completi.
        </p>
        <button
          className="btn btn-gold btn-full"
          onClick={handleExcelDownload}
          disabled={exporting}
        >
          {exporting ? '⏳ Preparazione...' : '⬇️ Download Excel (.xlsx)'}
        </button>
      </div>

      {/* Recalculate Power Index */}
      <div className="card mb-4">
        <h3 className="mb-1">⚡ Ricalcola Power Index</h3>
        <p className="text-sm text-muted mb-3">
          Ricalcola le statistiche di tutti i giocatori partendo dallo storico partite.
        </p>
        <button
          className="btn btn-ghost btn-full"
          onClick={handleRecalculateAll}
          disabled={recalculating}
        >
          {recalculating ? '⏳ Ricalcolo in corso...' : '🔄 Ricalcola Tutto'}
        </button>
      </div>

      {/* User Management */}
      <div className="card mb-4">
        <h3 className="mb-3">👥 Gestione Utenti</h3>
        {users.length === 0 ? (
          <p className="text-sm text-muted">Nessun utente registrato</p>
        ) : users.map(u => (
          <div key={u.id} style={{
            display: 'flex', alignItems: 'center', gap: '0.75rem',
            padding: '0.6rem 0', borderBottom: '1px solid #2D3748',
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>{u.displayName || u.email}</div>
              <div className="text-xs text-muted">{u.email}</div>
            </div>
            <select
              className="input"
              style={{ width: 'auto', padding: '0.3rem 0.5rem', minHeight: 'auto', fontSize: '0.8rem' }}
              value={u.role || 'viewer'}
              onChange={e => handleSetRole(u.id, e.target.value)}
            >
              <option value="viewer">👁️ Viewer</option>
              <option value="admin">⚙️ Admin</option>
            </select>
          </div>
        ))}
      </div>

      {/* Firebase Rules reminder */}
      <div className="card" style={{ background: 'rgba(246,224,94,0.05)', border: '1px solid rgba(246,224,94,0.2)' }}>
        <h3 className="text-gold mb-2">⚠️ Sicurezza Firebase</h3>
        <p className="text-sm text-secondary" style={{ lineHeight: 1.7 }}>
          Assicurati che le Firestore Security Rules siano configurate correttamente.
          Solo gli utenti autenticati devono poter leggere i dati, solo gli admin possono scrivere.
          Consulta il file <code style={{ color: '#4FD1C5' }}>firestore.rules</code> incluso nel progetto.
        </p>
      </div>
    </div>
  );
}
