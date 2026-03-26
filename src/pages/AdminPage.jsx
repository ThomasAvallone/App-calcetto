import React, { useState, useEffect, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMatches, getPlayers, seedHistoricalSeasons, createPlayer, importHistoricalMatches, recalculatePlayerStats, updateMatch, fixLastMatchGoalMinutes } from '../firebase/firestore';
import { syncAllHistoryToSheets } from '../services/sheetsService';
import { downloadExcel } from '../services/excelService';
import { doc, getDocs, collection, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { HISTORICAL_SEASONS, getCurrentRosterPlayers, computeCumulativeStats } from '../data/historicalData';
import useAuthStore, { selectIsAdmin } from '../store/authStore';
import { getAICallCount, onAICallCountChange, resetAICallCount } from '../services/geminiService';
import toast from 'react-hot-toast';

const CHANGELOG = [
  {
    version: '3.2.0',
    date: 'Marzo 2026',
    entries: [
      { type: 'new', text: 'Logo app: icona personalizzata su tutte le superfici PWA (favicon, apple-touch-icon, icone 72×72…512×512) — sostituisce il placeholder precedente' },
      { type: 'new', text: 'Vista Carte FUT (PlayersPage): visualizzazione alternativa alla lista con card ispirate alle FUT di EA Sports — 4 tier metallici (Bronzo, Argento, Oro, In Forma) con gradienti, glow, watermark e shimmer animato per i top player' },
      { type: 'new', text: 'Trend Forma nella card FUT: sparkline SVG con gli ultimi 14 aggiornamenti del Power Index — area gradient, linea colorata (verde/rosso/neutro secondo il delta), dot glow sull\'ultimo punto e label delta top-left' },
    ],
  },
  {
    version: '3.1.1',
    date: 'Marzo 2026',
    entries: [
      { type: 'new', text: 'Animazioni staggered fadeSlideUp estese a tutte le pagine (Storico, Giocatori, Classifiche, Annali, Admin, Badge) — ogni sezione entra in sequenza al caricamento, coerente con la Dashboard' },
    ],
  },
  {
    version: '3.1.0',
    date: 'Marzo 2026',
    entries: [
      { type: 'new', text: 'Dashboard: redesign futuristico — overlay griglia circuito stampato sul background, glassmorphism sulle card con backdrop-filter blur' },
      { type: 'new', text: 'Dashboard: animazioni staggered fadeSlideUp (stagger-1…stagger-8) — ogni sezione entra in sequenza al caricamento della pagina' },
      { type: 'new', text: 'Dashboard: indicatore LIVE sostituito con animazione radar CSS (ring pulsante) invece dell\'emoji statica' },
      { type: 'new', text: 'Dashboard: badge score prominente sulla live banner — punteggio visibile a colpo d\'occhio senza navigare nella partita' },
      { type: 'new', text: 'Dashboard: progress bar Power Ranking neon (5px, gradiente con box-shadow glow) — più leggibile e coerente con l\'estetica' },
      { type: 'new', text: 'Dashboard: indicatore vincitore nelle ultime partite — border-left rosso/blu/giallo identifica il team vincente senza leggere il punteggio' },
      { type: 'new', text: 'Dashboard: badge iniziali giocatore nelle streak attive per differenziare visivamente i giocatori nella lista' },
      { type: 'new', text: 'Dashboard: premi Coppa di Latta differenziati — border-left verde per premi positivi (bomber, assistman), rosso per premi ironici (peggior portiere, re autogol)' },
      { type: 'new', text: 'Dashboard: corner bracket HUD sulle stat card (effetto olografico angolare top-left / bottom-right)' },
      { type: 'fix', text: 'Hover state aggiunto su tutte le righe cliccabili di lista (partite recenti, scheduled picker, streak) — feedback visivo mancante' },
      { type: 'fix', text: 'Font size sotto soglia accessibilità corretti: label meteo (0.55rem → 0.65rem), nomi squadra countdown (< 12px → 0.78rem), label premi (0.72rem → section-label)' },
      { type: 'fix', text: 'Tutti i valori hex hardcoded nel JSX sostituiti con CSS custom properties (var(--teal), var(--text-muted), ecc.) per manutenibilità' },
      { type: 'fix', text: 'Aggiunto aria-label="Logout" al pulsante logout — prima accessibile solo via title (insufficiente per screen reader)' },
      { type: 'improve', text: 'Commento AI post-partita: ogni generazione pesca casualmente uno tra 10 stili narrativi diversi (cronista radiofonico anni \'70, giornalista investigativo, telecronista straniero, romanziere, filosofo greco, critico cinematografico, cantastorie meridionale, stile Biagi, poetico, cinico disilluso) — aggiunto divieto esplicito dei cliché più abusati e spunti narrativi automatici su doppiette, autogol e 0-0' },
    ],
  },
  {
    version: '3.0.0',
    date: 'Marzo 2026',
    entries: [
      { type: 'new', text: 'Visione live condivisa: tutti gli utenti possono guardare la partita in tempo reale navigando su /match/:id — timer, punteggio ed eventi si sincronizzano via Firestore su tutti i dispositivi' },
      { type: 'new', text: 'Dashboard: banner LIVE visibile a tutti gli utenti quando c\'è una partita in corso, con punteggio parziale e nomi delle squadre aggiornati in tempo reale' },
      { type: 'new', text: 'MatchPage: indicatore "LIVE — Stai guardando in diretta" per gli spettatori non-admin durante la partita' },
      { type: 'new', text: 'Storico meteo: il meteo viene salvato automaticamente per ogni partita — al momento dell\'avvio (MatchSetupPage) e al termine (endMatch), senza intervento manuale' },
      { type: 'new', text: 'Dettaglio partita: il meteo salvato (icona + descrizione + temperatura) è ora visibile nel card del punteggio per ogni partita completata' },
    ],
  },
  {
    version: '2.9.1',
    date: 'Marzo 2026',
    entries: [
      { type: 'fix', text: 'Verdetto Finale: parziale progressivo [X–Y] aggiunto dopo ogni gol/autogol nella cronaca testuale (era già presente nella card visiva ma mancava nel testo condivisibile)' },
      { type: 'fix', text: 'Contatore AI Calls: ora persistito in localStorage — non si azzera più al refresh della pagina' },
    ],
  },
  {
    version: '2.9.0',
    date: 'Marzo 2026',
    entries: [
      { type: 'new', text: 'Timer partita: conta in avanti da 00:00 (con supporto supplementari) invece che in conto alla rovescia' },
      { type: 'new', text: 'Cronaca in-match: parziale progressivo e autogol evidenziati con stile dedicato per una lettura più immediata' },
      { type: 'fix', text: 'Label stato timer corretta durante la pausa nei supplementari' },
    ],
  },
  {
    version: '2.8.1',
    date: 'Marzo 2026',
    entries: [
      { type: 'new', text: 'Contatore sessione chiamate AI nel pannello admin — mostra quante chiamate Gemini sono state fatte dalla sessione corrente' },
      { type: 'perf', text: 'StatsPage: memoizzazione pre-computata delle statistiche per periodo (stagione/30d) — il cambio tab non ricalcola più le stats, seleziona solo i dati già pronti' },
      { type: 'perf', text: 'PlayersPage: mappa pre-computata partite per giocatore — i 6+ sottocomponenti del dettaglio giocatore non filtrano più indipendentemente tutti i match' },
    ],
  },
  {
    version: '2.8.0',
    date: 'Marzo 2026',
    entries: [
      { type: 'new', text: 'Soprannome AI: persistito in Firestore sul profilo giocatore — non viene più rigenerato ad ogni visita, rimane salvato fino alla prossima rigenerazione manuale' },
      { type: 'new', text: 'Soprannome AI: spostato in cima alla scheda giocatore, sopra foto e Power Index, per dare subito identità al giocatore' },
      { type: 'new', text: 'Analisi AI momento di forma: cachata in Firestore con il riferimento all\'ultima partita — mostra badge ⚠️ "Nuova partita" quando il giocatore ha giocato dopo l\'ultima generazione' },
      { type: 'new', text: 'Report AI stagionale/mensile: cachato in Firestore per periodo — si carica automaticamente al cambio tab senza chiamate API, con badge ⚠️ quando ci sono nuove partite' },
      { type: 'new', text: 'Hall of Fame/Shame: cerimonia AI cachata in Firestore — visibile subito con pulsante ↺ Rigenera e badge ⚠️ "Nuova partita"' },
      { type: 'new', text: 'Rivalità H2H: narrazione AI cachata per coppia di giocatori — si carica in automatico selezionando due giocatori, senza dover rigenerare ogni volta' },
      { type: 'fix', text: 'Report AI: corretta anomalia per cui un giocatore assente dalla stagione corrente poteva essere citato come miglior/peggior streak (le streak venivano lette da tutti i giocatori invece che solo da quelli con partite nel periodo selezionato)' },
      { type: 'fix', text: 'Corretti flash UI dopo generazione AI (soprannome e analisi): aggiunto stato ottimistico locale per evitare il flickering del pulsante "Genera" tra la fine della chiamata e l\'aggiornamento Firestore' },
      { type: 'fix', text: 'Corretta race condition nel caricamento cache Report AI e rivalità H2H: risposte fuori ordine ignorate quando l\'utente cambia selezione velocemente' },
    ],
  },
  {
    version: '2.7.0',
    date: 'Marzo 2026',
    entries: [
      { type: 'new', text: 'AI Gemini: formazione squadre equilibrate — il pulsante "🤖 AI Bilancia" usa Gemini per assegnare i giocatori tenendo conto di PI, ruoli, portieri e streak attive' },
      { type: 'new', text: 'AI Gemini: commento narrativo post-partita in stile giornalistico (Caressa/Bizzotto), generato automaticamente al termine della partita' },
      { type: 'new', text: 'AI Gemini: analisi trend giocatore — commento sarcastico e divertente sulla forma recente, visibile nel profilo' },
      { type: 'new', text: 'Grafico andamento Power Index: rolling window sulle ultime 4 partite, gradiente verde/rosso per indicare trend positivo/negativo' },
      { type: 'new', text: 'Card condivisibile: al termine della partita è possibile generare e condividere una card visiva con il risultato' },
      { type: 'new', text: 'Pulsante Condividi disponibile anche nello storico partite (non solo durante la partita live)' },
      { type: 'new', text: 'Video YouTube nel dettaglio partita: possibilità di allegare e riprodurre un video highlights direttamente dalla pagina' },
      { type: 'new', text: 'Badge visibili per ogni partita nello storico: mostra i badge assegnati ai giocatori nel riepilogo' },
      { type: 'new', text: 'Badge "Re in carica" (Giancarlo): riassegnato automaticamente dopo ogni partita al giocatore con più gol all-time' },
      { type: 'new', text: 'Pianificazione partita senza giocatori: crea una partita programmata vuota e aggiungi i giocatori successivamente dallo storico' },
    ],
  },
  {
    version: '2.6.0',
    date: 'Marzo 2026',
    entries: [
      { type: 'new', text: 'Tab GK (Classifiche): clean sheet nel leaderboard portieri con conteggio stagione e all-time' },
      { type: 'new', text: 'Profilo giocatore: clean sheet in Record Stagione e All-time' },
      { type: 'new', text: 'Tab "Squadre" (Classifiche): seleziona due gruppi di giocatori e vedi lo storico delle sfide tra quelle formazioni' },
      { type: 'new', text: 'GK stats avanzate: clean sheet, win rate in porta (vittorie/partite da GK)' },
      { type: 'new', text: 'Statistiche relazionali nel profilo giocatore: Spalla (più vittorie insieme), Nemesi, Vittima GK, Chi ti assiste' },
      { type: 'new', text: 'Widget meteo nella Dashboard: previsioni live per la prossima partita programmata (Open-Meteo API)' },
      { type: 'new', text: 'Banner "Prossima partita" cliccabile: porta direttamente alla pagina dettaglio della partita programmata' },
      { type: 'fix', text: 'Clean sheet e gkMatches ora corretti nella vista Stagione (le partite fuori dal cutoff di data non escludevano più dati GK)' },
    ],
  },
  {
    version: '2.5.0',
    date: 'Marzo 2026',
    entries: [
      { type: 'new', text: 'Pannello Admin: log operazioni di sessione' },
      { type: 'new', text: 'Pannello Admin: changelog aggiornamenti espandibile' },
      { type: 'new', text: 'Pannello Admin: sezioni one-time nascoste in blocco collassabile' },
    ],
  },
  {
    version: '2.4.0',
    date: 'Febbraio 2026',
    entries: [
      { type: 'new', text: 'Sistema badge con 4 tipologie: Stagione, All-time, Partita, Admin' },
      { type: 'new', text: 'Catalogo badge con descrizioni e condizioni di sblocco' },
      { type: 'fix', text: 'Corretto calcolo minuti gol usando timestamp assoluti' },
    ],
  },
  {
    version: '2.3.0',
    date: 'Gennaio 2026',
    entries: [
      { type: 'new', text: 'Power Index: formula aggiornata (forma recente 60% + storico 40%)' },
      { type: 'new', text: 'Streak tracking: vittorie/sconfitte/pareggi consecutivi' },
      { type: 'new', text: 'Decay factor per giocatori inattivi da più di 30 giorni' },
      { type: 'fix', text: 'Ricalcolo statistiche storiche corretto per alias multipli' },
    ],
  },
  {
    version: '2.2.0',
    date: 'Dicembre 2025',
    entries: [
      { type: 'new', text: 'Export Excel multi-foglio (Giocatori, Partite, Eventi)' },
      { type: 'new', text: 'Sincronizzazione Google Sheets tramite Apps Script webhook' },
      { type: 'new', text: 'Import 300 partite storiche (2018/19 → 2025/26)' },
    ],
  },
  {
    version: '2.1.0',
    date: 'Novembre 2025',
    entries: [
      { type: 'new', text: 'Gestione ruoli utenti: viewer, admin, superadmin' },
      { type: 'new', text: 'Pagina Annali con storico stagioni dal 2018' },
      { type: 'fix', text: 'Protezione route admin con verifica ruolo su Firestore' },
    ],
  },
  {
    version: '2.0.0',
    date: 'Ottobre 2025',
    entries: [
      { type: 'new', text: 'Riscrittura completa in React + Firebase' },
      { type: 'new', text: 'Autenticazione Google OAuth' },
      { type: 'new', text: 'Live match con timer e registrazione eventi in tempo reale' },
      { type: 'new', text: 'Progressive Web App (PWA) installabile' },
    ],
  },
];

const TYPE_STYLE = {
  new:     { label: 'NEW',     color: '#4FD1C5', bg: 'rgba(79,209,197,0.12)' },
  fix:     { label: 'FIX',     color: '#FC814A', bg: 'rgba(252,129,74,0.12)' },
  perf:    { label: 'PERF',    color: '#F6E05E', bg: 'rgba(246,224,94,0.12)' },
  improve: { label: 'IMPROVE', color: '#B794F4', bg: 'rgba(183,148,244,0.12)' },
};

export default function AdminPage() {
  const navigate = useNavigate();
  const currentIsAdmin = useAuthStore(selectIsAdmin);
  const currentUser = useAuthStore(s => s.user);
  const [players, setPlayers] = useState([]);
  const [matches, setMatches] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [fixingMinutes, setFixingMinutes] = useState(false);
  const [importProgress, setImportProgress] = useState(null);

  // AI call counter (session-level, resets on reload)
  const aiCallCount = useSyncExternalStore(onAICallCountChange, getAICallCount);
  const [importingMatches, setImportingMatches] = useState(false);
  const [importMatchProgress, setImportMatchProgress] = useState(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showChangelog, setShowChangelog] = useState(false);
  const [opLog, setOpLog] = useState([]);

  useEffect(() => {
    Promise.all([getPlayers(), getMatches(), loadUsers()]).then(([p, m, u]) => {
      setPlayers(p); setMatches(m); setUsers(u); setLoading(false);
    }).catch(e => { toast.error('Errore caricamento: ' + e.message); setLoading(false); });
  }, []);

  async function loadUsers() {
    const snap = await getDocs(collection(db, 'users'));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  function addLog(action, status = 'ok', detail = '') {
    const entry = {
      id: Date.now(),
      time: new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      user: currentUser?.displayName || currentUser?.email || 'Admin',
      action,
      status,
      detail,
    };
    setOpLog(prev => [entry, ...prev]);
  }

  const handleSyncSheets = async () => {
    setSyncing(true);
    try {
      await syncAllHistoryToSheets(matches, players);
      toast.success('Sincronizzazione completata!');
      addLog('Sync Google Sheets', 'ok', `${matches.length} partite sincronizzate`);
    } catch (e) {
      toast.error('Errore sync: ' + e.message);
      addLog('Sync Google Sheets', 'err', e.message);
    } finally {
      setSyncing(false);
    }
  };

  const handleExcelDownload = async () => {
    setExporting(true);
    try {
      downloadExcel(players, matches);
      toast.success('Download avviato!');
      addLog('Export Excel', 'ok', `${players.length} giocatori, ${matches.length} partite`);
    } catch (e) {
      toast.error('Errore export: ' + e.message);
      addLog('Export Excel', 'err', e.message);
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
      addLog('Import Giocatori', 'ok', `${done} giocatori importati`);
      const updated = await getPlayers();
      setPlayers(updated);
    } catch (e) {
      toast.error('Errore importazione: ' + e.message);
      addLog('Import Giocatori', 'err', e.message);
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
      addLog('Import Stagioni Storiche', 'ok', `${HISTORICAL_SEASONS.length} stagioni`);
    } catch (e) {
      toast.error('Errore import: ' + e.message);
      addLog('Import Stagioni Storiche', 'err', e.message);
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
      addLog('Ricalcolo Power Index', 'ok', `${allIds.length} giocatori aggiornati`);
    } catch (e) {
      toast.error('Errore: ' + e.message);
      addLog('Ricalcolo Power Index', 'err', e.message);
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
      addLog('Import Partite Storiche', 'ok', `${done} partite importate`);
      const updated = await getMatches();
      setMatches(updated);
    } catch (e) {
      toast.error('Errore importazione partite: ' + e.message);
      addLog('Import Partite Storiche', 'err', e.message);
    } finally {
      setImportingMatches(false);
      setImportMatchProgress(null);
    }
  };

  const handleSetRole = async (uid, newRole) => {
    if (!currentIsAdmin) return;
    const targetUser = users.find(u => u.id === uid);
    try {
      await updateDoc(doc(db, 'users', uid), { role: newRole });
      setUsers(u => u.map(user => user.id === uid ? { ...user, role: newRole } : user));
      toast.success(`Ruolo aggiornato: ${newRole}`);
      addLog('Cambio Ruolo Utente', 'ok', `${targetUser?.email} → ${newRole}`);
    } catch (e) {
      toast.error('Errore aggiornamento ruolo: ' + e.message);
      addLog('Cambio Ruolo Utente', 'err', e.message);
    }
  };

  const handleFixGoalMinutes = async () => {
    setFixingMinutes(true);
    try {
      const { matchId, fixedEvents, preview, startTimestamp } = await fixLastMatchGoalMinutes();
      const msg = `Partita: ${matchId}\nTimer partito: ${new Date(startTimestamp).toLocaleTimeString('it-IT')}\n\nCorrezioni:\n${preview.join('\n')}\n\nConfermi?`;
      if (!window.confirm(msg)) return;
      await updateMatch(matchId, { events: fixedEvents });
      toast.success('Minuti gol corretti!');
      addLog('Correggi Minuti Gol', 'ok', `Partita ${matchId}`);
    } catch (e) {
      toast.error('Errore: ' + e.message);
      addLog('Correggi Minuti Gol', 'err', e.message);
    } finally {
      setFixingMinutes(false);
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
      <div className="stagger-1">
        <h2 style={{ paddingTop: '0.5rem', marginBottom: '0.25rem' }}>⚙️ Pannello Admin</h2>
        <p className="text-sm text-muted mb-4">Gestione avanzata e dati</p>
      </div>

      {/* Stats overview */}
      <div className="stagger-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem', marginBottom: '1rem' }}>
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
        <div className="card" style={{ textAlign: 'center', padding: '1rem', cursor: 'pointer', position: 'relative' }}
          title="Click per azzerare" onClick={() => { if (window.confirm('Azzerare il contatore AI Calls?')) resetAICallCount(); }}>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: aiCallCount > 0 ? '#F6AD55' : '#4FD1C5' }}>{aiCallCount}</div>
          <div style={{ fontSize: '0.7rem', color: '#718096' }}>AI Calls</div>
        </div>
      </div>

      {/* Google Sheets */}
      <div className="card mb-4 stagger-3">
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
      <div className="card mb-4 stagger-4">
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
      <div className="card mb-4 stagger-5">
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

      {/* Badge Catalog */}
      <div className="card mb-4 stagger-6" style={{ border: '1px solid rgba(183,148,244,0.25)', background: 'rgba(183,148,244,0.03)' }}>
        <h3 className="mb-1" style={{ fontSize: '0.95rem' }}>🏅 Catalogo Badge</h3>
        <p className="text-xs text-muted mb-3" style={{ lineHeight: 1.5 }}>
          Tutti i badge disponibili con descrizione, fonte dati e condizioni di sblocco.
        </p>
        <button className="btn" style={{ background: 'rgba(183,148,244,0.15)', color: '#B794F4', border: '1px solid rgba(183,148,244,0.4)' }}
          onClick={() => navigate('/admin/badges')}>
          🏅 Vedi Catalogo Badge
        </button>
      </div>

      {/* User Management */}
      {currentIsAdmin && (
        <div className="card mb-4 stagger-7">
          <h3 className="mb-3">👥 Gestione Utenti</h3>
          {users.length === 0 ? (
            <p className="text-sm text-muted">Nessun utente registrato</p>
          ) : users.map(u => {
            const isMe = u.email === currentUser?.email;
            return (
              <div key={u.id} style={{
                display: 'flex', alignItems: 'center', gap: '0.75rem',
                padding: '0.6rem 0', borderBottom: '1px solid #2D3748',
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>
                    {u.displayName || u.email} {isMe && '(tu)'}
                  </div>
                  <div className="text-xs text-muted">{u.email}</div>
                </div>
                {isMe ? (
                  <span style={{
                    padding: '0.2rem 0.6rem', borderRadius: '0.4rem',
                    fontSize: '0.78rem', fontWeight: 600,
                    background: 'rgba(246,173,85,0.15)', color: '#F6AD55',
                    border: '1px solid rgba(246,173,85,0.35)', userSelect: 'none',
                  }}>
                    Super Admin
                  </span>
                ) : (
                  <select
                    className="input"
                    style={{ width: 'auto', padding: '0.3rem 0.5rem', minHeight: 'auto', fontSize: '0.8rem' }}
                    value={u.role || 'viewer'}
                    onChange={e => handleSetRole(u.id, e.target.value)}
                  >
                    <option value="viewer">Viewer</option>
                    <option value="admin">Admin</option>
                  </select>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Operations Log */}
      <div className="card mb-4 stagger-8">
        <h3 className="mb-1" style={{ fontSize: '0.95rem' }}>📋 Log Operazioni</h3>
        <p className="text-xs text-muted mb-3">Azioni eseguite in questa sessione.</p>
        {opLog.length === 0 ? (
          <p className="text-xs text-muted" style={{ fontStyle: 'italic' }}>Nessuna operazione eseguita.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {opLog.map(entry => (
              <div key={entry.id} style={{
                display: 'flex', alignItems: 'flex-start', gap: '0.6rem',
                padding: '0.5rem 0.6rem', borderRadius: '0.4rem',
                background: entry.status === 'ok' ? 'rgba(79,209,197,0.06)' : 'rgba(252,129,74,0.06)',
                border: `1px solid ${entry.status === 'ok' ? 'rgba(79,209,197,0.2)' : 'rgba(252,129,74,0.2)'}`,
                fontSize: '0.78rem',
              }}>
                <span style={{ color: entry.status === 'ok' ? '#4FD1C5' : '#FC814A', flexShrink: 0 }}>
                  {entry.status === 'ok' ? '✓' : '✗'}
                </span>
                <div style={{ flex: 1 }}>
                  <span style={{ fontWeight: 600, color: '#E2E8F0' }}>{entry.action}</span>
                  {entry.detail && <span style={{ color: '#718096' }}> — {entry.detail}</span>}
                  <div style={{ color: '#4A5568', marginTop: '0.1rem' }}>{entry.time} · {entry.user}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Changelog */}
      <div className="card mb-4">
        <button
          onClick={() => setShowChangelog(v => !v)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            width: '100%', background: 'none', border: 'none', cursor: 'pointer',
            padding: 0, color: 'inherit',
          }}
        >
          <h3 style={{ margin: 0, fontSize: '0.95rem' }}>📝 Aggiornamenti & Changelog</h3>
          <span style={{ color: '#718096', fontSize: '0.85rem', transition: 'transform 0.2s', display: 'inline-block', transform: showChangelog ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
        </button>
        {showChangelog && (
          <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {CHANGELOG.map(release => (
              <div key={release.version}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#4FD1C5' }}>v{release.version}</span>
                  <span style={{ fontSize: '0.75rem', color: '#4A5568' }}>{release.date}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  {release.entries.map((e, i) => {
                    const s = TYPE_STYLE[e.type] || TYPE_STYLE.new;
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', fontSize: '0.8rem' }}>
                        <span style={{
                          padding: '0.05rem 0.35rem', borderRadius: '0.25rem',
                          fontSize: '0.65rem', fontWeight: 700, flexShrink: 0,
                          color: s.color, background: s.bg, letterSpacing: '0.04em',
                        }}>
                          {s.label}
                        </span>
                        <span style={{ color: '#A0AEC0', lineHeight: 1.4 }}>{e.text}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Advanced / One-time tools */}
      <div className="card mb-4" style={{ border: '1px solid rgba(113,128,150,0.25)', background: 'rgba(113,128,150,0.03)' }}>
        <button
          onClick={() => setShowAdvanced(v => !v)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            width: '100%', background: 'none', border: 'none', cursor: 'pointer',
            padding: 0, color: 'inherit',
          }}
        >
          <h3 style={{ margin: 0, fontSize: '0.95rem', color: '#718096' }}>🔧 Strumenti Avanzati</h3>
          <span style={{ color: '#4A5568', fontSize: '0.85rem', transition: 'transform 0.2s', display: 'inline-block', transform: showAdvanced ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
        </button>
        <p className="text-xs text-muted" style={{ marginTop: '0.35rem', marginBottom: 0 }}>
          Operazioni di migrazione e correzione dati — da usare con cautela.
        </p>

        {showAdvanced && (
          <div style={{ marginTop: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Import Current Players */}
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.25rem' }}>👥 Importa Rosa Corrente</div>
              <p className="text-xs text-muted mb-2">
                Importa automaticamente la rosa (ultimi 3 stagioni, min 5 presenze) con le statistiche storiche già collegate.
              </p>
              {importProgress && (
                <p className="text-xs text-muted mb-1">
                  ⏳ {importProgress.current} ({importProgress.done}/{importProgress.total})
                </p>
              )}
              <button className="btn btn-ghost btn-full" onClick={handleImportCurrentPlayers} disabled={importing}>
                {importing ? '⏳ Importazione...' : '👥 Importa Giocatori'}
              </button>
            </div>

            <div style={{ height: '1px', background: '#2D3748' }} />

            {/* Import Historical Matches */}
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.25rem' }}>⚽ Importa Partite Storiche</div>
              <p className="text-xs text-muted mb-2">
                Importa le 300 partite storiche (2018/19 → 2025/26) con gol e autorete.
              </p>
              {importMatchProgress && (
                <p className="text-xs text-muted mb-1">
                  ⏳ Partita #{importMatchProgress.matchNum} ({importMatchProgress.done}/{importMatchProgress.total})
                </p>
              )}
              <button className="btn btn-ghost btn-full" onClick={handleImportHistoricalMatchesData} disabled={importingMatches}>
                {importingMatches ? '⏳ Importazione partite...' : '⚽ Importa Partite Storiche (300)'}
              </button>
            </div>

            <div style={{ height: '1px', background: '#2D3748' }} />

            {/* Import Historical Seasons */}
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.25rem' }}>📚 Importa Annali Storici</div>
              <p className="text-xs text-muted mb-2">
                Carica su Firestore tutte le {HISTORICAL_SEASONS.length} stagioni storiche. Serve per la pagina Annali.
              </p>
              <button className="btn btn-ghost btn-full" onClick={handleSeedHistory} disabled={seeding}>
                {seeding ? '⏳ Importazione...' : '📥 Importa Stagioni Storiche'}
              </button>
            </div>

            <div style={{ height: '1px', background: '#2D3748' }} />

            {/* Fix Goal Minutes */}
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.25rem', color: '#FC814A' }}>🛠️ Correggi Minuti Gol</div>
              <p className="text-xs text-muted mb-2">
                Ricalcola i minuti dei gol usando i timestamp assoluti degli eventi e l'ora di avvio del timer.
              </p>
              <button
                className="btn btn-full"
                style={{ background: 'rgba(252,129,74,0.1)', color: '#FC814A', border: '1px solid rgba(252,129,74,0.3)' }}
                onClick={handleFixGoalMinutes}
                disabled={fixingMinutes}
              >
                {fixingMinutes ? '⏳ Correzione...' : '🛠️ Correggi Minuti Gol'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
