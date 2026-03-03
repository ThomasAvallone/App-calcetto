import React, { useState, useEffect } from 'react';
import { getMatches, getPlayers, seedHistoricalSeasons, createPlayer, importHistoricalMatches, recalculatePlayerStats } from '../firebase/firestore';
import { syncAllHistoryToSheets } from '../services/sheetsService';
import { downloadExcel } from '../services/excelService';
import { doc, getDocs, collection, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { HISTORICAL_SEASONS, getCurrentRosterPlayers, computeCumulativeStats } from '../data/historicalData';
import useAuthStore from '../store/authStore';
import toast from 'react-hot-toast';

export default function AdminPage() {
  const { user: currentUser } = useAuthStore();
  const currentIsSuperAdmin = useAuthStore(s => s.isSuperAdmin);

  const [players, setPlayers] = useState([]);
  const [matches, setMatches] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(null);
  const [importingMatches, setImportingMatches] = useState(false);
  const [importMatchProgress, setImportMatchProgress] = useState(null);

  useEffect(() => {
    Promise.all([getPlayers(), getMatches(), loadUsers()]).then(([p, m, u]) => {
      setPlayers(p); setMatches(m); setUsers(u); setLoading(false);
    }).catch(e => { toast.error('Errore caricamento: ' + e.message); setLoading(false); });
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

  const handleImportCurrentPlayers = async () => {
    const roster = getCurrentRosterPlayers();
    const existingNames = new Set(players.map(p => p.name.toLowerCase()));
    const toImport = roster.filter(p => !existingNames.has(p.displayName.toLowerCase()));

    if (toImport.length === 0) {
      toast('Tutti i giocatori sono già presenti!');
      return;
    }
    if (!window.confirm(`Importare ${toImport.length} giocatori con le loro statistiche storiche?`)) return;

    setImporting(true);
    setImportProgress({ done: 0, total: toImport.length, current: '' });
    let done = 0;
    try {
      for (const p of toImport) {
        setImportProgress({ done, total: toImport.length, current: p.displayName });
        const historicalStats = computeCumulativeStats(p.historicalNames);
        await createPlayer({
          name: p.displayName,
          primaryRole: 'Centrocampista',
          secondaryRole: '',
          historicalNames: p.historicalNames,
          historicalStats,
        });
        done++;
      }
      toast.success(`${done} giocatori importati con storico!`);
      const updated = await getPlayers();
      setPlayers(updated);
    } catch (e) {
      toast.error('Errore importazione: ' + e.message);
    } finally {
      setImporting(false);
      setImportProgress(null);
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

  const handleImportHistoricalMatchesData = async () => {
    const existingHistorical = matches.filter(m => m.isHistorical);
    if (existingHistorical.length > 0) {
      if (!window.confirm(`Attenzione: ci sono già ${existingHistorical.length} partite storiche importate. Vuoi importare di nuovo (verranno create copie duplicate)?`)) return;
    } else {
      if (!window.confirm('Importare 300 partite storiche (2018-2026) su Firestore? L\'operazione può richiedere qualche minuto.')) return;
    }

    setImportingMatches(true);
    setImportMatchProgress({ done: 0, total: 300, matchNum: '' });
    try {
      const { HISTORICAL_MATCHES } = await import('../data/historicalMatches.js');
      const done = await importHistoricalMatches(
        HISTORICAL_MATCHES,
        players,
        (done, total, matchNum) => setImportMatchProgress({ done, total, matchNum })
      );
      toast.success(`${done} partite storiche importate!`);
      // Reload matches
      const updated = await getMatches();
      setMatches(updated);
    } catch (e) {
      toast.error('Errore importazione partite: ' + e.message);
    } finally {
      setImportingMatches(false);
      setImportMatchProgress(null);
    }
  };

  const handleSetRole = async (uid, newRole) => {
    const target = users.find(u => u.id === uid);
    if (target?.role === 'superadmin') return; // nessuno può toccare il superadmin
    if (newRole === 'superadmin') return;       // nessuno può promuovere a superadmin via UI
    if (!currentIsSuperAdmin && target?.role === 'admin') return; // solo superadmin può toccare altri admin
    try {
      await updateDoc(doc(db, 'users', uid), { role: newRole });
      setUsers(u => u.map(user => user.id === uid ? { ...user, role: newRole } : user));
      toast.success(`Ruolo aggiornato: ${newRole}`);
    } catch (e) {
      toast.error('Errore aggiornamento ruolo: ' + e.message);
    }
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

      {/* Import Current Players */}
      <div className="card mb-4">
        <h3 className="mb-1">👥 Importa Giocatori</h3>
        <p className="text-sm text-muted mb-3">
          Importa automaticamente la rosa corrente (ultimi 3 stagioni, min 5 presenze)
          con le statistiche storiche già collegate.
        </p>
        {importProgress && (
          <p className="text-sm text-muted mb-2">
            ⏳ {importProgress.current} ({importProgress.done}/{importProgress.total})
          </p>
        )}
        <button
          className="btn btn-teal btn-full"
          onClick={handleImportCurrentPlayers}
          disabled={importing}
        >
          {importing ? '⏳ Importazione...' : '👥 Importa Rosa Corrente'}
        </button>
      </div>

      {/* Import Historical Matches */}
      <div className="card mb-4">
        <h3 className="mb-1">⚽ Importa Partite Storiche</h3>
        <p className="text-sm text-muted mb-3">
          Importa le 300 partite storiche (2018/19 → 2025/26) con gol e autorete.
          Le statistiche dei giocatori verranno collegate automaticamente tramite i nomi storici.
        </p>
        {importMatchProgress && (
          <p className="text-sm text-muted mb-2">
            ⏳ Partita #{importMatchProgress.matchNum} ({importMatchProgress.done}/{importMatchProgress.total})
          </p>
        )}
        <button
          className="btn btn-teal btn-full"
          onClick={handleImportHistoricalMatchesData}
          disabled={importingMatches}
        >
          {importingMatches ? '⏳ Importazione partite...' : '⚽ Importa Partite Storiche (300)'}
        </button>
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
        ) : users.map(u => {
          const isSuperAdminRow = u.role === 'superadmin';
          const isAdminRow = u.role === 'admin';
          // Un admin normale non può toccare altri admin; solo superadmin può
          const canEdit = isSuperAdminRow
            ? false
            : isAdminRow
              ? currentIsSuperAdmin
              : true; // viewer: chiunque abbia accesso admin può modificarlo

          return (
            <div key={u.id} style={{
              display: 'flex', alignItems: 'center', gap: '0.75rem',
              padding: '0.6rem 0', borderBottom: '1px solid #2D3748',
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>{u.displayName || u.email}</div>
                <div className="text-xs text-muted">{u.email}</div>
              </div>
              {canEdit ? (
                <select
                  className="input"
                  style={{ width: 'auto', padding: '0.3rem 0.5rem', minHeight: 'auto', fontSize: '0.8rem' }}
                  value={u.role || 'viewer'}
                  onChange={e => handleSetRole(u.id, e.target.value)}
                >
                  <option value="viewer">👁️ Viewer</option>
                  <option value="admin">⚙️ Admin</option>
                </select>
              ) : (
                <span style={{
                  padding: '0.2rem 0.6rem',
                  borderRadius: '0.4rem',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  background: isSuperAdminRow ? 'rgba(246,173,85,0.15)' : 'rgba(99,179,237,0.12)',
                  color: isSuperAdminRow ? '#F6AD55' : '#63B3ED',
                  border: `1px solid ${isSuperAdminRow ? 'rgba(246,173,85,0.35)' : 'rgba(99,179,237,0.25)'}`,
                  userSelect: 'none',
                }}>
                  {isSuperAdminRow ? '👑 SuperAdmin' : '⚙️ Admin'}
                </span>
              )}
            </div>
          );
        })}
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
