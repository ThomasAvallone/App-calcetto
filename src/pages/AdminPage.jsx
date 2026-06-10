import React, { useState, useEffect, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMatches, getPlayers, seedHistoricalSeasons, createPlayer, importHistoricalMatches, recalculatePlayerStats, updateMatch, fixLastMatchGoalMinutes, getPIConfig, setPIConfig as savePIConfig } from '../firebase/firestore';
import { syncAllHistoryToSheets } from '../services/sheetsService';
import { doc, getDocs, collection, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { HISTORICAL_SEASONS, getCurrentRosterPlayers, computeCumulativeStats } from '../data/historicalData';
import useAuthStore, { selectIsAdmin, selectIsSuperAdmin } from '../store/authStore';
import { getAICallCount, onAICallCountChange, resetAICallCount } from '../services/geminiService';
import { exportJSON, exportMatchesCSV, exportPlayersCSV } from '../utils/dataExport';
import { DEFAULT_PI_CONFIG } from '../utils/playerStats';
import toast from 'react-hot-toast';

const CHANGELOG = [
  {
    version: '3.16.0',
    date: 'Giugno 2026',
    entries: [
      { type: 'improve', text: 'Partita live a prova di campo (rete assente o instabile). Prima, con rete giù, diversi flussi restavano bloccati per sempre in attesa della conferma del server: un gol registrato con la voce disabilitava TUTTI i bottoni evento finché non tornava la rete; "Fine partita" non mostrava mai il verdetto; avviare una partita (da setup o da programmata) restava appeso sul salvataggio. Ora gli eventi appaiono subito in cronaca e si sincronizzano da soli in background (con avviso e annullamento automatico solo in caso di errore reale), il verdetto finale appare sempre entro pochi secondi anche offline, e la partita può partire anche senza rete con un avviso "si sincronizza da sola".' },
      { type: 'fix', text: 'Punteggio sempre coerente con la cronaca: il tabellone live ora deriva il punteggio direttamente dagli eventi registrati (come già il verdetto), e a fine partita il punteggio salvato viene normalizzato dagli eventi. Questo previene rari disallineamenti del contatore (es. doppia eliminazione simultanea dello stesso gol da due admin) che avrebbero falsato classifiche e statistiche.' },
      { type: 'fix', text: 'Apertura partita più robusta: se il caricamento fallisce (rete giù e dati non in cache) compare un messaggio con "Riprova" invece dello spinner infinito; una partita eliminata mostra "Partita non trovata". Il ricalcolo statistiche non parte più da offline (avrebbe potuto calcolare su dati incompleti del dispositivo): viene rimandato con un avviso. Corretti anche: timer protetto da stati corrotti (niente più rischio NaN), doppia conferma simultanea del modal assist (tap + scadenza countdown nello stesso istante), e timeout di 8s sulle richieste meteo che su rete lenta potevano restare appese per minuti.' },
    ],
  },
  {
    version: '3.15.4',
    date: 'Giugno 2026',
    entries: [
      { type: 'fix', text: 'Ruolo Super Admin del proprietario ripristinato. Il profilo dell\'owner era rimasto registrato come "Admin" e non veniva più promosso a "Super Admin": la migrazione automatica girava solo al login esplicito (non al ripristino della sessione già attiva) e dipendeva da un parametro di configurazione del build che poteva mancare. Ora l\'identità dell\'owner ha un riconoscimento robusto e indipendente da quel parametro, e la promozione a Super Admin viene applicata automaticamente alla riapertura dell\'app. Di conseguenza la lista Gestione Utenti mostra di nuovo "Super Admin" e tornano disponibili i poteri da superadmin (modifica degli altri admin).' },
    ],
  },
  {
    version: '3.15.3',
    date: 'Giugno 2026',
    entries: [
      { type: 'new', text: 'Partita live: nuovo indicatore di sincronizzazione sempre visibile. Mostra "✅ Tutto sincronizzato" quando gli eventi sono salvati sul server, "🟡 Salvataggio in corso…" mentre un gol viene inviato, e "📡 Offline" quando manca la rete. Importante: anche da offline gli eventi NON si perdono — restano salvati sul dispositivo e si sincronizzano da soli appena torna la connessione (prima il messaggio diceva, erroneamente, che i dati potevano non sincronizzarsi). Per chi guarda in diretta, l\'etichetta "LIVE" viene nascosta quando è offline, così non è fuorviante.' },
    ],
  },
  {
    version: '3.15.2',
    date: 'Giugno 2026',
    entries: [
      { type: 'fix', text: 'Dettaglio partita: aggiungendo, modificando o eliminando un evento, se il ricalcolo statistiche falliva (es. rete instabile) l\'evento — pur essendo già salvato — spariva dalla schermata fino al ricaricamento. Ora salvataggio e ricalcolo sono separati: l\'evento resta visibile e un avviso segnala solo che le statistiche vanno ricalcolate.' },
      { type: 'fix', text: 'Robustezza schermate pre e post partita: aggiunti messaggi d\'errore dove mancavano (copia preview/verdetto negata dal browser, partita programmata che non si carica per problemi di rete — prima restava bloccata su "Caricamento…" all\'infinito).' },
      { type: 'fix', text: 'Riordino interno del codice (nessun cambiamento visibile): i riquadri Reazioni, Voti e Bestie del dettaglio partita e la card "Match Preview" condivisa tra nuova partita e partita programmata sono stati estratti in componenti riutilizzabili, riducendo le duplicazioni.' },
    ],
  },
  {
    version: '3.15.1',
    date: 'Giugno 2026',
    entries: [
      { type: 'fix', text: 'CRITICO — La pagina della partita live andava in crash all\'apertura ("Qualcosa è andato storto / Errore inatteso"), rendendo impossibile tracciare la partita in corso. Causa: la protezione anti-uscita usava un hook (useBlocker) che richiede un tipo di router diverso da quello dell\'app; nella build di produzione lanciava un errore senza messaggio che bloccava l\'intera schermata. Rimosso l\'hook incompatibile. La protezione contro refresh/chiusura scheda resta attiva; uscendo dalla partita con la navigazione interna non si perde nulla (la partita resta in corso e si riapre dal tasto "Partita").' },
      { type: 'fix', text: 'Fine partita: il modale verdetto ora appare sempre, anche in caso di errore di rete momentaneo. Prima, se Firestore non riusciva a salvare il testo del report (un\'operazione non critica), l\'intera sequenza si bloccava e l\'utente non vedeva mai il tabellino finale. Il salvataggio del report e del meteo su Firestore avviene ora in background (fire-and-forget): la partita è già archiviata come "finita", il resto è solo comodità. Fix anche su "Copia": mostra toast di errore se il browser nega l\'accesso agli appunti (es. blocco permessi su alcuni Android).' },
    ],
  },
  {
    version: '3.15.0',
    date: 'Maggio 2026',
    entries: [
      { type: 'fix', text: 'Bilanciamento squadre estratto in modulo puro testato: la logica snake-draft (balanceTeams) e il bilanciamento con giocatori bloccati (balanceWithLocks) vivono ora in utils/teamBalance.js, separati dallo store. Coperti da 10 test che verificano draft order, split dispari, rispetto dei lock, overflow → null e disgiunzione squadre.' },
      { type: 'fix', text: 'Statistiche di stagione: la funzione aggregatePlayerMatchStats è ora la source of truth unica per aggregare le stats di un giocatore su una lista di partite (gol, assist, presenze, GK, autogol, proration assist storici con cap a 1). PlayersPage e DashboardPage usano questa funzione invece di ricalcolare inline, eliminando tre copie del loop con rischio di divergenza.' },
      { type: 'fix', text: 'Punteggio progressivo unificato: eliminata l\'ultima copia inline del loop di scoring in HistoryPage (card autogol con parziale) e in reportService (timeline). Tutti i parziali progressivi si calcolano ora con withProgressiveScore() da utils/matchScore.js, che è già testata.' },
      { type: 'fix', text: 'Copertura test: 223 test, 13 file. Aggiunti test per aggregatePlayerMatchStats (6 casi) e teamBalance (10 casi).' },
      { type: 'fix', text: 'Dettaglio partita: la card "Condividi Risultato" mostrava l\'MVP con un conteggio gol diverso dal verdetto ufficiale. Ora usa lo stesso calcolo pesato (gol +3, assist +2, autogol -2) del resto dell\'app, così MVP della card, del verdetto e della partita live coincidono sempre.' },
      { type: 'fix', text: 'Gestione Utenti (Admin): l\'interfaccia ora rispecchia ciò che le regole di sicurezza consentono davvero. Un admin normale può modificare solo i viewer; i superadmin e gli admin appaiono come etichette di sola lettura invece che con un menu a tendina che avrebbe comunque fallito. La propria riga mostra il ruolo reale (non più "Super Admin" fisso).' },
      { type: 'fix', text: 'Scheda giocatore: "Media Gol/Turno GK" nella vista All-time ora usa i turni effettivi in porta (gkMatches) invece di "partite × 2". Per i giocatori con partite storiche (che non hanno dati GK individuali) il vecchio calcolo gonfiava i turni e abbassava artificialmente la media. Ora è coerente con la classifica portieri e i badge GK.' },
      { type: 'fix', text: 'Nuova partita e partita programmata: copiare o condividere la preview non sovrascrive più il meteo inserito a mano (prima un click su "Copia"/"WhatsApp" sostituiva silenziosamente condizione e temperatura con quelle scaricate, che poi finivano nella partita salvata). Inoltre lo scambio manuale di due giocatori tra le squadre rimuove ora il loro "lucchetto" di blocco, evitando l\'icona 🔒 fuorviante sulla squadra sbagliata.' },
      { type: 'fix', text: 'Sicurezza (difesa in profondità): la pagina di creazione partita è ora accessibile solo agli admin anche via URL diretto (prima un viewer poteva aprirla e arrivare fino in fondo, salvo poi vedere fallire il salvataggio). Nel dettaglio delle partite programmate i viewer hanno ora una vista in sola lettura: i comandi di modifica/avvio/eliminazione sono nascosti. Le regole di sicurezza Firestore restavano comunque la barriera reale: nessun dato è mai stato esposto.' },
      { type: 'fix', text: 'Maggiore stabilità: se una singola pagina va in errore, ora viene mostrato un messaggio contenuto mantenendo la barra di navigazione (prima si bloccava l\'intera app). L\'errore si risolve da solo spostandosi su un\'altra sezione.' },
    ],
  },
  {
    version: '3.14.0',
    date: 'Maggio 2026',
    entries: [
      { type: 'fix', text: 'Sicurezza: chiusa una falla di escalation privilegi. In precedenza un utente autenticato senza profilo poteva, con una chiamata diretta al database, crearsi un profilo da superadmin. Ora le regole impongono che ogni utente possa auto-crearsi solo come "viewer" (l\'owner resta l\'unica eccezione per il primo avvio).' },
      { type: 'fix', text: 'Fine partita più robusta: il risultato finale e il tabellino vengono "fotografati" DOPO i 5 secondi di annullamento, così eventuali gol aggiunti all\'ultimo secondo finiscono comunque nel verdetto. Inoltre un eventuale errore nel ricalcolo statistiche non nasconde più il verdetto finale.' },
      { type: 'fix', text: 'MVP coerente ovunque: la card del verdetto e il verdetto testuale ora usano lo stesso identico calcolo (gol +3, assist +2, autogol -2). Prima la card contava solo i gol e poteva indicare un MVP diverso dal report.' },
      { type: 'fix', text: 'Registrazione gol/eventi durante la partita: in caso di errore di rete la modifica ottimistica viene annullata correttamente (rollback uniforme per gol, autogol, infortuni ed eliminazioni). Il punteggio è sempre derivato dagli eventi, quindi non può divergere dalla cronaca.' },
    ],
  },
  {
    version: '3.13.0',
    date: 'Maggio 2026',
    entries: [
      { type: 'new', text: 'Infortuni registrabili anche DURANTE la partita live: nuovo bottone 🩹 Infortunio nella sezione "Registra evento" di MatchPage, con modale di selezione giocatore (mostra la squadra 🔴/🔵). L\'evento appare subito nella cronaca e nello storico infortuni della scheda giocatore. Non incide su punteggio né Power Index.' },
      { type: 'new', text: 'Protezione anti-uscita durante una partita live: se provi a navigare via (o ricaricare/chiudere la scheda) mentre una partita è in corso e ha già eventi registrati, compare una conferma "Rimani / Esci lo stesso" per non perdere il tracciamento.' },
      { type: 'fix', text: 'Classifica 🧤 GK ora premia il MIGLIOR portiere: ordina per media gol subiti per turno crescente (più bassa = meglio), con minimo 6 turni in porta e tie-break sui clean sheet. Prima ordinava per totale gol subiti, che di fatto premiava solo chi giocava più spesso in porta.' },
      { type: 'fix', text: 'Privacy email blindata: l\'email collegata non può più finire in alcun campo visibile agli altri utenti (voti partita, reazioni). Resta leggibile solo dagli admin.' },
      { type: 'fix', text: 'Verdetto post-partita: l\'MVP non viene più assegnato a chi ha solo un autogol (richiesto un punteggio positivo). Cronologie scontri (Squadre) ordinate correttamente per data. Corrette 3 piccole incongruenze nei dati storici (presenze/risultati).' },
      { type: 'fix', text: 'Robustezza: export CSV protetto dalla formula injection, ricalcolo Power Index a prova di rose numerose (commit a blocchi), e tutte le sottoscrizioni real-time ora gestiscono gli errori senza interrompersi in silenzio. Copertura di test ampliata a ~190 test.' },
    ],
  },
  {
    version: '3.12.2',
    date: 'Maggio 2026',
    entries: [
      { type: 'new', text: '3 nuovi badge legati agli infortuni: 🩹 Vetro di Murano (stagione, negativo) ≥2 infortuni nella stagione corrente; 🛡️ Highlander (all-time, positivo) 30+ partite app giocate senza un solo infortunio (basta una uscita per perderlo); 🚑 Re dell\'Infermeria (all-time, negativo, singleton) chi ha più infortuni in carriera, min 3 — in caso di pareggio premia tutti i co-leader. Le partite storiche sono escluse dal conteggio (non hanno injury events). Catalogo BadgesPage aggiornato per classificare Highlander e Re dell\'Infermeria nella categoria All-time.' },
    ],
  },
  {
    version: '3.12.1',
    date: 'Maggio 2026',
    entries: [
      { type: 'new', text: 'Infortuni nell\'analisi AI giocatore: il prompt di generatePlayerTrendAnalysis ora riceve, oltre a goal/assist/autogol, anche le uscite per infortunio nelle ultime 4 partite e il totale carriera (con data dell\'ultimo). Istruzione esplicita al modello di citarli con umorismo bonario ("vetro di Murano", "l\'infermeria è la sua seconda casa") senza essere cattivo.' },
      { type: 'new', text: 'Infortuni nel Report AI periodico (Classifiche): aggiunte due metriche al prompt di generatePeriodReport — "Più sfortunato" (giocatore con più uscite per infortunio nel periodo, fallback su playerName dell\'evento se il giocatore è stato eliminato) e "bollettino medico" col totale infortuni del periodo. Linea omessa se totalInjuries=0.' },
    ],
  },
  {
    version: '3.12.0',
    date: 'Maggio 2026',
    entries: [
      { type: 'new', text: 'Reazioni emoji alle partite: sezione "💬 Reazioni" visibile a tutti gli utenti loggati nel dettaglio di ogni partita conclusa. Ogni utente può lasciare una reazione tra 6 emoji (👑 MVP, 🔥 In fuoco, 🎯 Precisione, 🧤 Muro, 🤦 Papera, 🎉 Gran partita) — ri-clicca per rimuoverla o cambiarla. Il nome visualizzato usa il giocatore collegato all\'account (linkedPlayerId) o il displayName Google, mai l\'email. Salvate in subcollection Firestore matches/{matchId}/reactions/{userId} con regole proprie: owner può creare/aggiornare/eliminare, admin può eliminare. deleteMatch pulisce la subcollection in automatico.' },
      { type: 'new', text: 'Tab "📈 Trend" nelle Classifiche: grafico SVG a linee con gol/assist/vittorie cumulativi per i top 6 giocatori nel periodo selezionato (30d, stagione, all-time). Toggle tra le 3 metriche; le partite storiche importate sono escluse (mancano di assistId granulare). Legenda interattiva con totale finale per ogni giocatore.' },
      { type: 'new', text: 'Parata e Infortunio nella cronaca: due nuovi tipi di evento (save 🧤 / injury 🚑) aggiungibili solo su partite concluse — non appesantiscono l\'UI live. Campo singolo (giocatore coinvolto), non incidono su punteggio né statistiche. Il commento AI post-partita li cita se pertinenti ("ALTRI EVENTI" nel prompt Gemini). Visibili nella cronaca con stile teal/rosso distinto, cancellabili dall\'admin.' },
      { type: 'new', text: 'Formazione parziale (lock giocatori): nella schermata di setup partita ogni giocatore selezionato mostra due pill 🔴/🔵 per bloccarlo su una squadra. Il resto viene bilanciato automaticamente (algoritmo greedy che minimizza il gap di Power Index). L\'AI Bilancia rispetta i lock passando slot esatti al prompt Gemini. I giocatori bloccati mostrano 🔒 nella preview. Validazione: se i lock saturano una squadra appare un toast d\'errore.' },
      { type: 'fix', text: 'MatchSetupPage: corretto bug HTML — le righe giocatore erano <button> contenenti altri <button> (lock pill), nesting non valido secondo la spec HTML che può causare double-fire degli handler su mobile Safari/Chrome. Rifattorizzato in <div role="button"> con onKeyDown equivalente.' },
    ],
  },
  {
    version: '3.11.0',
    date: 'Maggio 2026',
    entries: [
      { type: 'new', text: '"I tuoi numeri" sulla dashboard: card personale collegata all\'account Google — mostra partite stagione, gol, assist, autogol, V/P/S, forma recente (5 puntini W/D/L), Power Index attuale e posizione nel ranking globale. Per gli admin include anche il voto medio dalle votazioni. Se il profilo non è ancora collegato, mostra messaggio per chiedere all\'admin.' },
      { type: 'new', text: 'Collegamento account Google → scheda giocatore: nella form di modifica giocatore (solo admin) nuova sezione "🔗 Collegamento Account Google". Dropdown con tutti gli utenti che hanno già fatto login (con indicazione "già collegato ad altro giocatore"), più inserimento manuale per email. Il link è memorizzato su users/{uid}.linkedPlayerId — l\'email non compare mai nei documenti players (invisibile ai viewer anche con dev tools). Admin può scollegare con ✕. Al salvataggio: valida l\'email prima di scollegare il vecchio link (previene perdite su typo), avverte se la mail era già usata da un altro giocatore.' },
      { type: 'fix', text: 'Eliminazione giocatore: rimosso link orfano — quando un player viene eliminato, il campo linkedPlayerId sull\'utente collegato viene resettato a null automaticamente.' },
    ],
  },
  {
    version: '3.10.0',
    date: 'Maggio 2026',
    entries: [
      { type: 'new', text: 'Registrazione gol con voce: bottone "🎙️ Registra con voce" nella card evento live — parla "gol Marco assist Luca portiere Gianni" in italiano, il parser trova i giocatori nel team attivo e registra direttamente senza toccare i modal. Se il portiere non viene detto apre solo il modal GK; se il nome è ambiguo mostra un toast con il testo trascritto. Fallback Gemini automatico se il parser locale non identifica il marcatore — gestisce frasi creative ("doppietta di Marco con palla di Luca") o errori di trascrizione ("col marco"). Toast "🤔 Chiedo a Gemini…" durante il delay del fallback, bottone "⏳ Elaboro con Gemini..." disabilitato per tutta la chain async' },
      { type: 'new', text: 'Voice parser estratto in src/utils/voiceParser.js come modulo puro + 23 test unitari Vitest (findPlayer, extractAfter, parseVoiceGoal): copre match esatto, prefisso, prefisso reverse, stopwords, punteggiatura, autogoal nelle varianti scritte, normalizzazione case, transcript null/vuoto, frasi con preposizioni multiple — 40/40 test totali passano' },
      { type: 'new', text: 'Distribuzione gol per minuto nella scheda giocatore: istogramma ⏱️ con fasce da 10 minuti (0-9\', 10-19\', …, 60\'+) che mostra gol (verde), assist (blu) e autogol (rosso) — visibile solo se esistono eventi con dato minuto' },
      { type: 'new', text: 'Badge meteo in "Rendimento stagionale": 5 nuovi badge — ☀️ Re del Sole (≥70% vittorie col sole, min 3 partite), 🌧️ Re del Fango (pioggia), 🥶 Inossidabile (freddo+vento combinati), 🌈 All Weather (almeno 1 vittoria in 4+ condizioni diverse), ⛈️ Meteoropatico (≤30% vittorie in qualche condizione con min 4 partite)' },
      { type: 'new', text: 'Vibrazione haptic sul gol: navigator.vibrate([100,50,100]) dopo gol regolare, vibrate([80]) dopo autogol — feedback fisico immediato su mobile senza nessuna configurazione' },
      { type: 'new', text: 'Warning limite eventi nel doc partita: banner arancione a ≥50 eventi, rosso a ≥100 — ricorda all\'admin che il documento Firestore cresce linearmente e suggerisce di terminare la partita' },
      { type: 'new', text: 'E2E Playwright: suite in e2e/golden-path.spec.ts con smoke test (carica senza errori JS), test autenticati (dashboard, giocatori, storico) e golden path completo (setup→gol→fine→modal). Richede npx playwright install chromium + E2E_EMAIL/E2E_PASSWORD env. Comandi: npm run test:e2e, npm run test:e2e:ui' },
      { type: 'perf', text: 'Lazy-load xlsx: il chunk vendor-xlsx (282KB gzip 95KB) viene ora caricato solo al click di "Download Excel" in Admin invece di essere nel bundle iniziale — first paint su mobile sensibilmente più veloce' },
      { type: 'fix', text: 'Voice input — concorrenza Gemini fallback: rec.onend partiva al primo await in rec.onresult, riabilitando il bottone mic mentre la call a Gemini era ancora in corso (doppio-tap permesso, sessioni sovrapposte). Nuovo state voiceProcessing tiene il bottone disabilitato per tutta la chain (rule-based → Gemini → applyParsedGoal). isMountedRef previene setState su componente smontato se l\'utente naviga via durante il fallback' },
      { type: 'fix', text: 'Voice input — parsing italiano: stopwords (di, da, il, la, del, …) saltate nel matching, quindi "gol di marco" funziona; normalizzazione "auto gol" / "auto-gol" / "auto goal" → "autogol" (prima venivano registrati come gol regolari); voiceTranscript ripulito automaticamente dopo 6s; onerror filtra "no-speech" e "aborted" senza toast spurii; SpeechRecognition abort() su unmount; goalFlash/scoreShake overlay scattano anche per voice goals (prima solo via modal manuale)' },
      { type: 'fix', text: 'Aria-label su bottoni icona-only in MatchPage: bottone chiudi verdetto ("Chiudi verdetto"), conferma/annulla eliminazione evento ("Conferma eliminazione", "Annulla eliminazione"), bottone elimina ("Elimina evento") — accessibilità screen reader' },
    ],
  },
  {
    version: '3.9.0',
    date: 'Maggio 2026',
    entries: [
      { type: 'new', text: 'Rendimento per meteo nella scheda giocatore: nuova sezione "🌤️ Meteo & Rendimento" che mostra — per ogni condizione atmosferica in cui il giocatore ha giocato — vittorie/pareggi/sconfitte, percentuale vittoria colorata (verde ≥60%, giallo ≥40%, rosso <40%), barra W/D/L e gol+assist in quelle partite. Sono mostrate solo condizioni con ≥2 partite per evitare statistiche fuorvianti su singolo campione' },
      { type: 'new', text: 'Modal post-partita: bottoni Condividi (WhatsApp/native share) e Copia ora visibili sempre subito sotto il tabellino in una riga, prima del verdetto testuale collassabile — non più scrollati fuori vista su schermi piccoli con molti gol nel tabellino' },
      { type: 'new', text: 'Share recovery sulla MatchPage di una partita conclusa: card "📤 Condividi Risultato" con Condividi/Copia/Torna alla Home — recupera la condivisione anche se l\'utente ha chiuso il modal o ha refresh\'ato la pagina dopo il termine' },
      { type: 'new', text: 'Meteo passato all\'analisi AI del singolo giocatore: il prompt di generatePlayerTrendAnalysis ora riceve il rendimento per condizione meteo (filtrato a ≥2 partite) e il modello può commentare pattern marcati ("disastro sotto la pioggia", ecc.) — prima il dato meteo era usato solo nei report aggregati' },
      { type: 'new', text: 'Modelli Gemini: gemini-3.1-flash-lite-preview promosso a gemini-3.1-flash-lite (versione stabile) in tutte le chain di fallback (fast e pro) e nel set THINKING_MODELS che applica il ×4 sul maxTokens' },
      { type: 'fix', text: 'deleteEvent: aggiunto try/catch con rollback dell\'aggiornamento ottimistico — se Firestore lancia un\'eccezione (es. permesso revocato), l\'evento torna visibile nell\'UI e viene mostrato un toast d\'errore. Rollback ora legge lo stato corrente da get() per non sovrascrivere update arrivati dalla subscription Firestore tra l\'optimistic set e l\'errore' },
      { type: 'fix', text: 'Delete button nella cronaca partita live: aggiunto .catch() al call site — in caso di errore viene ora mostrato un toast "Errore eliminazione: …" invece di un unhandled promise rejection silenzioso' },
      { type: 'fix', text: 'handleEndMatch: dopo gli await (waitUndo, endMatch, recalculatePlayerStats) il match del closure è potenzialmente stale. Sia exportMatchToSheets, sia generateMatchReport, sia la verifica weather usano ora useMatchStore.getState().match (fresh read) — niente più report o export con dati di una partita "vecchia di 5 secondi"' },
    ],
  },
  {
    version: '3.8.0',
    date: 'Maggio 2026',
    entries: [
      { type: 'new', text: 'Export calendario .ics per partite programmate: bottone "📅 Aggiungi al calendario" nella scheda della singola partita scarica un file iCalendar standard (compatibile iOS, Google Calendar, Outlook); nello Storico, nell\'intestazione DA GIOCARE, bottone "📅 Esporta tutte" che scarica un singolo file con tutte le partite future' },
      { type: 'new', text: 'Tab Meteo nelle Classifiche: per ogni condizione (Soleggiato/Nuvoloso/Pioggia/Freddo/Caldo/Vento) mostra n. partite, media gol/partita, barra colorata con win rate Rossi/Pareggi/Blu, e MVP (giocatore con più gol+assist in quelle condizioni)' },
      { type: 'new', text: 'Meteo reale al primo Avvia: al primo tap su ▶ Avvia di una partita il sistema fetcha il meteo corrente da Open-Meteo e sovrascrive la previsione salvata al setup — la partita registra il meteo che si è effettivamente verificato, non solo il forecast. Idempotente via match.startedAt: pause/resume e refresh non ri-fetchano' },
      { type: 'new', text: 'Meteo passato all\'AI: il report periodico Gemini include una sezione "METEO & RENDIMENTO" con stats per condizione (≥2 partite); il pronostico pre-partita riceve la condizione meteo corrente e il modello la commenta con ironia' },
      { type: 'new', text: 'Coriandoli colorati post-partita: a fine match i confetti usano i colori della squadra vincente (rosso o blu) invece di palette neutra — niente coriandoli in caso di pareggio' },
      { type: 'new', text: 'Indicatore offline durante la partita live: se la connessione si interrompe compare un banner rosso che avvisa l\'admin che gli eventi potrebbero non sincronizzarsi con Firestore' },
      { type: 'fix', text: 'matchStore.loadMatch: aggiunto try/catch + cancellation token per impedire subscription leak quando si naviga rapidamente tra partite diverse — chiamate concorrenti non sovrappongono più subscription a Firestore' },
      { type: 'fix', text: 'Falso bounce/coriandoli al refresh: prevRedScore/prevBlueScore inizializzati a null invece di 0 — riaprendo una partita con punteggio già 3-2 l\'animazione non si attiva spuriamente' },
      { type: 'fix', text: 'handleGkConcededSelected: wrap in try/catch con toast d\'errore — se Firestore fallisce durante recordGoal/recordAutogoal lo stato dei modal viene resettato comunque e l\'utente vede un messaggio chiaro' },
      { type: 'fix', text: 'deleteEvent atomico: usa arrayRemove + increment(-1) invece di sovrascrivere l\'intero array events — elimina race condition con recordGoalEvent (arrayUnion) se due admin registrano eventi contemporaneamente' },
      { type: 'fix', text: 'ScheduledMatchDetailPage: loadedRef resettato quando cambia il param id — navigando da una partita programmata a un\'altra non si vedono più i dati della precedente' },
      { type: 'fix', text: 'MatchSetupPage.handleStartMatch: fetchWeatherForDate ora usa la data della partita (selezionata dall\'utente), non più new Date() al momento dell\'avvio — il meteo registrato corrisponde davvero alla partita' },
      { type: 'fix', text: 'Bottoni gol nascosti durante il countdown "Fine partita": prima era possibile registrare un gol durante i 5 secondi di annullamento, lasciando lo store in stato inconsistente' },
      { type: 'fix', text: 'setTimeout del report modal salvato in ref con clearTimeout su unmount — eliminato warning React per setState su componente smontato' },
      { type: 'fix', text: 'DashboardPage AVVIA: stato loading sul bottone durante l\'attesa della transizione status→active + loadMatch + navigate — niente doppio click accidentale' },
      { type: 'fix', text: 'Validazione data in MatchSetupPage.handlePlanEmpty: se l\'utente non sceglie una data, errore esplicito invece di salvare la partita con la data corrente' },
      { type: 'fix', text: 'Temperatura meteo normalizzata sempre a stringa nello state (incluso dopo fetchWeatherForDate) + inputMode="numeric" — previene problemi di input di cifre sequenziali su alcuni browser' },
      { type: 'fix', text: 'ICS line folding RFC 5545: linee >75 byte (es. DESCRIPTION con 10 nomi giocatori) ripiegate con CRLF + spazio, gestendo correttamente i confini delle sequenze UTF-8 (emoji multi-byte)' },
      { type: 'fix', text: 'generatePeriodReport: header "METEO & RENDIMENTO" emesso solo se ci sono condizioni con ≥2 partite — niente più sezione vuota nel prompt AI' },
    ],
  },
  {
    version: '3.7.0',
    date: 'Maggio 2026',
    entries: [
      { type: 'new', text: 'Editor Power Index nell\'Admin: 16 parametri configurabili raggruppati per area (formula base, attacco, portiere, blend recente/storico, rating peer, decay inattività) — il pannello mostra in tempo reale la formula risultante con i valori correnti e calcola automaticamente quando viene effettivamente raggiunto il fattore minimo di decay' },
      { type: 'new', text: 'Salva e Ricalcola: il pulsante salva la configurazione su Firestore e rilancia immediatamente recalculatePlayerStats per tutti i giocatori — le schede giocatore si aggiornano via real-time subscription' },
      { type: 'new', text: 'DEFAULT_PI_CONFIG esportata da playerStats.js: computePowerIndex e computeCombinedPowerIndex accettano un parametro opzionale cfg (default = valori storici) — retrocompatibile con tutti i test esistenti (17/17 pass)' },
      { type: 'new', text: 'Hook usePIConfig: sottoscrizione real-time a settings/piConfig con deduplicazione via JSON key — PlayersPage e PiTrendChart usano automaticamente la configurazione corrente senza render spurii' },
      { type: 'new', text: 'Banner "AVVIA PARTITA" prominente sulla Home: da -5min prima dell\'orario della prossima partita programmata (e fino a 2h dopo) compare un riquadro in primo piano per admin con un grosso pulsante che con un click cambia lo stato della partita ad active e apre la pagina live — teal-green prima dell\'orario, arancione se in ritardo, animate-pulse per attirare l\'occhio' },
      { type: 'new', text: 'Pulsante 📋 Copia nel modal What-if: dopo aver generato il pronostico AI si può copiarlo negli appunti con un tap, comodo per condividerlo subito su WhatsApp' },
      { type: 'fix', text: 'Stripping di updatedAt (Timestamp Firestore) dalla config prima del merge in recalculatePlayerStats e nel caricamento dell\'editor Admin — evita che il campo metadata inquini l\'oggetto cfg e venga riscritto su Firestore ad ogni salvataggio' },
      { type: 'fix', text: 'Descrizione campo "Velocità decay" corretta: il valore non è i giorni per raggiungere il minimo (dipende anche dal fattore minimo stesso) — ora la formula summary mostra il giorno effettivo calcolato come startDays + duration×(1−floor)' },
      { type: 'fix', text: 'Firestore rules: aggiunta regola per la collezione settings (mancava completamente!) — read per ogni auth user, write solo admin, eccetto aiCache_* scrivibili da tutti (cache effimere). Risolve il toast "Missing or insufficient permissions" comparso dopo l\'aggiunta dell\'Editor PI' },
      { type: 'fix', text: 'CI: il workflow Firebase deployava solo --only hosting, le modifiche a firestore.rules rimanevano locali e non venivano mai applicate. Aggiunto firestore:rules al comando di deploy' },
      { type: 'fix', text: 'recalculatePlayerStats: .catch(() => ({ exists: () => false })) sul getDoc di settings/piConfig — se la lettura fallisce (regole non ancora deployate, sessione scaduta, ecc.) si usa DEFAULT_PI_CONFIG invece di rigettare l\'intera Promise.all. Sintomi prima del fix: dopo Fine partita la partita si salvava ma il modal post-partita con verdetto e condivisione non compariva mai' },
      { type: 'fix', text: 'setAICache: aggiunto .catch(() => {}) sui 3 call site (ReportAITab, HallTab, StatsPage) — la chiamata non era awaited e il try/catch circostante non la proteggeva, producendo unhandled promise rejection per gli utenti non-admin' },
      { type: 'fix', text: 'subscribeToPIConfig: aggiunto error callback all\'onSnapshot — su errore di permessi il hook usePIConfig resta su DEFAULT_PI_CONFIG senza side effect visibili invece di scrivere in console e uccidere silenziosamente la subscription' },
    ],
  },
  {
    version: '3.6.0',
    date: 'Aprile 2026',
    entries: [
      { type: 'new', text: 'Partita programmata: nel picker "Aggiungi giocatore" la lista è ora divisa in ⭐ Suggeriti (presenti nelle ultime 3 partite finite, evidenziati in giallo) e Altri — più rapido confermare la rosa abituale' },
      { type: 'fix', text: 'Analisi AI scheda giocatore, commento post-partita, pronostico pre-partita e rivalità H2H: aumentato maxTokens (400→1000, 500→900, 550→1000) — i testi non vengono più troncati a metà frase' },
    ],
  },
  {
    version: '3.5.0',
    date: 'Aprile 2026',
    entries: [
      { type: 'new', text: 'Simulatore What-if (Dashboard): scegli due formazioni, bilancia manualmente o via AI e ottieni il pronostico Gemini senza creare una partita reale' },
      { type: 'new', text: 'Cronologia scontri diretti nella tab H2H (Classifiche): sezione collassabile con data, punteggio, gol dei due giocatori ed esito di ogni sfida tra i due selezionati' },
      { type: 'new', text: 'Match Replay nel dettaglio partita: riproduzione animata degli eventi uno alla volta (1,2s ciascuno) con punteggio che sale in diretta — ricrea la partita vista dallo spogliatoio' },
      { type: 'new', text: 'Compatibilità duo nella scheda giocatore: win rate di ogni compagno quando gioca insieme vs quando avversario (min 2 partite), ordinabile per performance insieme o contro' },
      { type: 'new', text: 'Achievement personali: 18 traguardi in 5 categorie (attacco, presenze, vittorie, portiere, infamia) calcolati on-the-fly — quelli sbloccati come badge, quelli in corso con progress bar' },
      { type: 'fix', text: 'Risolto crash della tab H2H (useState dentro IIFE violava le Rules of Hooks)' },
      { type: 'fix', text: 'Match Replay: riscritto il reveal per mostrare solo gli eventi già rivelati (prima erano tutti pre-renderizzati al 30% di opacità) + contatore di avanzamento' },
      { type: 'fix', text: 'DuoCompatibility e Achievement: default props su allMatches/allPlayers per evitare crash se i dati non sono ancora caricati' },
    ],
  },
  {
    version: '3.4.0',
    date: 'Aprile 2026',
    entries: [
      { type: 'new', text: 'Gerarchia modelli Gemini con fallback automatico: chain fast (lite → flash → pro) per chiamate brevi, chain pro (pro → lite → flash) per task reasoning; 2 retry con backoff esponenziale (1s, 2s) su 503/429 prima di scalare al modello successivo' },
      { type: 'new', text: 'Filtro intervallo date nello Storico: seleziona "da/a" per visualizzare solo le partite in un periodo' },
      { type: 'new', text: 'Backup locale nell\'Admin: scarica CSV partite, CSV giocatori o JSON completo direttamente sul dispositivo — nessun server intermedio' },
      { type: 'new', text: 'Annulla "Termina partita": toast con countdown di 5s prima del salvataggio definitivo — recupero rapido se la chiusura è accidentale' },
      { type: 'perf', text: 'Refactor utils/playerStats.js: calcStatsForPlayer, computePowerIndex, computeStreak, computeRecentForm estratte come funzioni pure, testabili in isolamento senza Firestore' },
      { type: 'perf', text: 'Suite Vitest con 17 test su playerStats — comandi npm test e npm run test:watch' },
      { type: 'fix', text: 'maxTokens ×4 per i modelli thinking nel fallback chain (evita output troncati quando il tier fast rimbalza su gemini-3.1-pro)' },
    ],
  },
  {
    version: '3.3.0',
    date: 'Aprile 2026',
    entries: [
      { type: 'new', text: 'Rating peer integrato nel Power Index: ratingBonus = (avgRating - 5.5) × 1.5, attivo dopo ≥3 partite con voti ricevuti — il giudizio dei compagni pesa nel PI finale' },
      { type: 'new', text: 'Classifica autogol (tab 🤦 Autogol in Classifiche): ranking con percentuale partite con autogol' },
      { type: 'new', text: 'Freccia trend PI (↑↓→) nel Power Ranking della Dashboard — calcolata sugli ultimi 2 valori di powerHistory' },
      { type: 'new', text: 'Tracciamento portiere per squadra a livello di partita (clean sheet inclusi): ogni partita salva i turni GK effettivi' },
      { type: 'fix', text: 'Logica portiere a rotazione: gkMatches = presenze × 2 (ogni giocatore fa 2 turni in porta per partita, uno per tempo) — tutte le medie GK (Power Index, badge Muro/Colabrodo, leaderboard) ora coerenti' },
      { type: 'fix', text: 'Clean sheet calcolato individualmente per turno di porta, non più per squadra intera' },
      { type: 'fix', text: 'Stats GK in StatsPage rispettano il filtro periodo (stagione / 30 giorni)' },
      { type: 'fix', text: 'Partite storiche escluse da streak e recentForm (contavano impropriamente nel momento di forma attuale)' },
      { type: 'fix', text: 'MatchPage: conferma inline prima di eliminare un evento (doppio tap: ✕ apre conferma → ✓ conferma o ✕ annulla)' },
    ],
  },
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

function PISection({ label, children }) {
  return (
    <div style={{ marginBottom: '1rem' }}>
      <div style={{ fontSize: '0.7rem', color: '#718096', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '0.5rem', paddingBottom: '0.25rem', borderBottom: '1px solid #2D3748' }}>
        {label}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        {children}
      </div>
    </div>
  );
}

function PIField({ label, desc, value, min, max, step, onChange, unit = '' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#E2E8F0' }}>{label}</div>
        <div style={{ fontSize: '0.68rem', color: '#4A5568', lineHeight: 1.3 }}>{desc}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
        <button
          style={{ background: 'none', border: '1px solid #4A5568', color: '#A0AEC0', borderRadius: '4px', width: '28px', height: '28px', cursor: 'pointer', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => onChange(Math.max(min, Math.round((value - step) * 100) / 100))}
        >−</button>
        <div style={{ width: '52px', textAlign: 'center', fontSize: '0.85rem', fontWeight: 700, color: '#F6E05E' }}>
          {value}{unit}
        </div>
        <button
          style={{ background: 'none', border: '1px solid #4A5568', color: '#A0AEC0', borderRadius: '4px', width: '28px', height: '28px', cursor: 'pointer', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => onChange(Math.min(max, Math.round((value + step) * 100) / 100))}
        >+</button>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const navigate = useNavigate();
  const currentIsAdmin = useAuthStore(selectIsAdmin);
  const currentIsSuperAdmin = useAuthStore(selectIsSuperAdmin);
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
  const [showPIEditor, setShowPIEditor] = useState(false);
  const [healthIssues, setHealthIssues] = useState(null);
  const [expandedHealthGroups, setExpandedHealthGroups] = useState({});
  const [piCfg, setPICfg] = useState(DEFAULT_PI_CONFIG);
  const [piSaving, setPISaving] = useState(false);

  useEffect(() => {
    Promise.all([getPlayers(), getMatches(), loadUsers(), getPIConfig().catch(() => null)]).then(([p, m, u, piCfgSaved]) => {
      setPlayers(p); setMatches(m); setUsers(u);
      if (piCfgSaved) {
        const { updatedAt: _u, ...cleanCfg } = piCfgSaved;
        setPICfg({ ...DEFAULT_PI_CONFIG, ...cleanCfg });
      }
      setLoading(false);
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
      const { downloadExcel } = await import('../services/excelService');
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

  const handleHealthCheck = () => {
    const issues = [];
    const toDateStr = d => {
      try { return (d?.toDate ? d.toDate() : new Date(d)).toISOString().slice(0, 10); } catch { return '?'; }
    };
    const finished = matches.filter(m => m.status === 'finished');

    // Check 1: score/events mismatch (non-historical only, where events are authoritative)
    for (const m of finished.filter(m => !m.isHistorical)) {
      if (!m.events?.length && (m.redScore || m.blueScore)) {
        issues.push({ sev: 'warn', label: 'Partita senza eventi', detail: `${toDateStr(m.date)} — score ${m.redScore}-${m.blueScore} ma nessun evento registrato`, matchId: m.id });
        continue;
      }
      const ev = m.events || [];
      const redFromEv  = ev.filter(e => (e.type === 'goal' && e.team === 'red')  || (e.type === 'autogoal' && e.team === 'blue')).length;
      const blueFromEv = ev.filter(e => (e.type === 'goal' && e.team === 'blue') || (e.type === 'autogoal' && e.team === 'red')).length;
      if (redFromEv !== (m.redScore ?? 0) || blueFromEv !== (m.blueScore ?? 0)) {
        issues.push({ sev: 'error', label: 'Score ≠ eventi', detail: `${toDateStr(m.date)} — tabellino ${m.redScore}-${m.blueScore}, eventi ${redFromEv}-${blueFromEv}`, matchId: m.id });
      }
    }

    // Check 2: unlinked players (player slot has name but no id) — aggregato per nome
    const unlinkedByName = new Map(); // name → Set di date partite
    for (const m of finished) {
      const all = [...(m.redTeam || []), ...(m.blueTeam || [])];
      for (const p of all.filter(p => !p.id)) {
        const nm = p.name || '(senza nome)';
        if (!unlinkedByName.has(nm)) unlinkedByName.set(nm, new Set());
        unlinkedByName.get(nm).add(toDateStr(m.date));
      }
    }
    for (const [nm, dates] of unlinkedByName) {
      issues.push({ sev: 'warn', label: 'Giocatore non linkato', detail: `"${nm}" — ${dates.size} partit${dates.size === 1 ? 'a' : 'e'}` });
    }

    // Check 3: duplicate matches (same day + same teams + same score).
    // Lo score nella chiave evita falsi positivi: in una serata si giocano
    // più partite con le stesse squadre ma esiti diversi.
    const seen = new Map();
    for (const m of finished) {
      const ds = toDateStr(m.date);
      const key = [
        ds,
        m.redScore ?? 0, m.blueScore ?? 0,
        (m.redTeam || []).map(p => p.id || p.name).sort().join(','),
        (m.blueTeam || []).map(p => p.id || p.name).sort().join(','),
      ].join('|');
      if (seen.has(key)) {
        issues.push({ sev: 'warn', label: 'Possibile duplicato', detail: `Stesse squadre e score (${m.redScore}-${m.blueScore}) il ${ds}`, matchId: m.id });
      } else {
        seen.set(key, m.id);
      }
    }

    setHealthIssues(issues);
    setExpandedHealthGroups({});
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
    if (!currentIsAdmin) return;
    try {
      await updateDoc(doc(db, 'users', uid), { role: newRole });
      setUsers(u => u.map(user => user.id === uid ? { ...user, role: newRole } : user));
      toast.success(`Ruolo aggiornato: ${newRole}`);
    } catch (e) {
      toast.error('Errore aggiornamento ruolo: ' + e.message);
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
    } catch (e) {
      toast.error('Errore: ' + e.message);
    } finally {
      setFixingMinutes(false);
    }
  };

  const handlePISave = async () => {
    setPISaving(true);
    try {
      await savePIConfig(piCfg);
      const allIds = players.map(p => p.id);
      await recalculatePlayerStats(allIds);
      toast.success('PI aggiornato e ricalcolato per tutti i giocatori!');
    } catch (e) {
      toast.error('Errore: ' + e.message);
    } finally {
      setPISaving(false);
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

      {/* CSV / JSON export (backup locale) */}
      <div className="card mb-4 stagger-4">
        <h3 className="mb-1">💾 Backup locale</h3>
        <p className="text-sm text-muted mb-3">
          Scarica i dati sul dispositivo in formato CSV o JSON.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <button
            className="btn btn-full"
            style={{ background: 'rgba(79,209,197,0.12)', color: '#4FD1C5', border: '1px solid rgba(79,209,197,0.4)' }}
            onClick={() => { exportMatchesCSV(matches); toast.success('CSV partite scaricato'); }}
          >
            📄 CSV Partite
          </button>
          <button
            className="btn btn-full"
            style={{ background: 'rgba(79,209,197,0.12)', color: '#4FD1C5', border: '1px solid rgba(79,209,197,0.4)' }}
            onClick={() => { exportPlayersCSV(players); toast.success('CSV giocatori scaricato'); }}
          >
            👥 CSV Giocatori
          </button>
          <button
            className="btn btn-full"
            style={{ background: 'rgba(104,211,145,0.12)', color: '#68D391', border: '1px solid rgba(104,211,145,0.4)' }}
            onClick={() => { exportJSON({ players, matches }); toast.success('JSON backup scaricato'); }}
          >
            🗄️ JSON Backup Completo
          </button>
        </div>
      </div>

      {/* PI Formula Editor */}
      <div className="card mb-4 stagger-5" style={{ border: '1px solid rgba(246,224,94,0.2)', background: 'rgba(246,224,94,0.02)' }}>
        <button
          onClick={() => setShowPIEditor(v => !v)}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'inherit' }}
        >
          <h3 style={{ margin: 0, fontSize: '0.95rem', color: '#F6E05E' }}>⚡ Editor Power Index</h3>
          <span style={{ color: '#718096', fontSize: '0.85rem', transition: 'transform 0.2s', display: 'inline-block', transform: showPIEditor ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
        </button>
        <p className="text-xs text-muted" style={{ marginTop: '0.35rem', marginBottom: 0 }}>
          Modula i pesi della formula e ricalcola tutti i PI con un click.
        </p>

        {showPIEditor && (
          <div style={{ marginTop: '1.25rem' }}>

            {/* Formula summary */}
            <div style={{ background: '#1A202C', border: '1px solid #2D3748', borderRadius: '8px', padding: '0.85rem 1rem', marginBottom: '1.25rem', fontFamily: 'monospace' }}>
              <div style={{ fontSize: '0.7rem', color: '#F6E05E', fontWeight: 700, marginBottom: '0.4rem', letterSpacing: '0.06em' }}>FORMULA ATTUALE</div>
              <div style={{ fontSize: '0.72rem', color: '#A0AEC0', lineHeight: 1.7 }}>
                <span style={{ color: '#4FD1C5' }}>PI</span> = <span style={{ color: '#F6E05E' }}>{piCfg.base}</span>
                {' '}+ WinRate × <span style={{ color: '#F6E05E' }}>{piCfg.winRateMultiplier}</span>
                {' '}+ AttaccoPerMatch × <span style={{ color: '#F6E05E' }}>{piCfg.attackMultiplier}</span>
                {' '}− GKPenalty
              </div>
              <div style={{ fontSize: '0.68rem', color: '#718096', lineHeight: 1.7 }}>
                AttaccoPerMatch = (Gol×<span style={{ color: '#A0AEC0' }}>{piCfg.goalWeight}</span> + Assist×<span style={{ color: '#A0AEC0' }}>{piCfg.assistWeight}</span> − Autogol×<span style={{ color: '#A0AEC0' }}>{piCfg.autogoalPenalty}</span>) / Partite<br />
                GKPenalty = GolSubiti/TurniPortiere × <span style={{ color: '#A0AEC0' }}>{piCfg.gkPenaltyMultiplier}</span><br />
                WinRate = (Vittorie + Pari×<span style={{ color: '#A0AEC0' }}>{piCfg.drawValue}</span>) / Partite
              </div>
              <div style={{ marginTop: '0.5rem', fontSize: '0.68rem', color: '#718096', lineHeight: 1.7 }}>
                Blend: <span style={{ color: '#A0AEC0' }}>{Math.round(piCfg.recentWeight * 100)}%</span> ultimi <span style={{ color: '#A0AEC0' }}>{piCfg.recentMatchesWindow}</span> match + <span style={{ color: '#A0AEC0' }}>{Math.round((1 - piCfg.recentWeight) * 100)}%</span> storico (min <span style={{ color: '#A0AEC0' }}>{piCfg.minRecentMatchesForBlend}</span> recenti)<br />
                Rating bonus: (Voto − <span style={{ color: '#A0AEC0' }}>{piCfg.ratingNeutral}</span>) × <span style={{ color: '#A0AEC0' }}>{piCfg.ratingBonusMultiplier}</span> (min <span style={{ color: '#A0AEC0' }}>{piCfg.minRatedMatchesForBonus}</span> partite votate)<br />
                Decay: da <span style={{ color: '#A0AEC0' }}>{piCfg.activityDecayStartDays}</span>gg inattivo → fattore min <span style={{ color: '#A0AEC0' }}>{piCfg.activityDecayFloor}×</span> raggiunto in ~<span style={{ color: '#A0AEC0' }}>{Math.round(piCfg.activityDecayStartDays + piCfg.activityDecayDuration * (1 - piCfg.activityDecayFloor))}</span>gg totali
              </div>
            </div>

            {/* ── Sezione: Formula base ── */}
            <PISection label="Formula Base">
              <PIField label="Valore base" desc="PI di partenza (giocatore neutro)" value={piCfg.base} min={20} max={80} step={1} onChange={v => setPICfg(c => ({ ...c, base: v }))} />
              <PIField label="× Win rate" desc="Punti aggiunti a win rate 100%" value={piCfg.winRateMultiplier} min={5} max={50} step={1} onChange={v => setPICfg(c => ({ ...c, winRateMultiplier: v }))} />
              <PIField label="Valore pari" desc="Un pari vale X di una vittoria" value={piCfg.drawValue} min={0} max={1} step={0.1} onChange={v => setPICfg(c => ({ ...c, drawValue: v }))} />
            </PISection>

            {/* ── Sezione: Attacco ── */}
            <PISection label="Componente Attacco">
              <PIField label="× Attacco/match" desc="Scala l'intero contributo offensivo" value={piCfg.attackMultiplier} min={1} max={20} step={0.5} onChange={v => setPICfg(c => ({ ...c, attackMultiplier: v }))} />
              <PIField label="Peso gol" desc="Un gol vale X in AttaccoPerMatch" value={piCfg.goalWeight} min={0} max={10} step={0.5} onChange={v => setPICfg(c => ({ ...c, goalWeight: v }))} />
              <PIField label="Peso assist" desc="Un assist vale X in AttaccoPerMatch" value={piCfg.assistWeight} min={0} max={10} step={0.5} onChange={v => setPICfg(c => ({ ...c, assistWeight: v }))} />
              <PIField label="Penalità autogol" desc="Un autogol detrae X in AttaccoPerMatch" value={piCfg.autogoalPenalty} min={0} max={10} step={0.5} onChange={v => setPICfg(c => ({ ...c, autogoalPenalty: v }))} />
            </PISection>

            {/* ── Sezione: Portiere ── */}
            <PISection label="Componente Portiere">
              <PIField label="× Penalità GK" desc="Gol subiti/turno × questo valore" value={piCfg.gkPenaltyMultiplier} min={0} max={10} step={0.5} onChange={v => setPICfg(c => ({ ...c, gkPenaltyMultiplier: v }))} />
            </PISection>

            {/* ── Sezione: Blend ── */}
            <PISection label="Blend Recente / Storico">
              <PIField label="Finestra recente (match)" desc="Quante ultime partite definiscono la forma recente" value={piCfg.recentMatchesWindow} min={3} max={50} step={1} onChange={v => setPICfg(c => ({ ...c, recentMatchesWindow: v }))} />
              <PIField label="Peso forma recente %" desc="% del PI recente nel blend (il resto è storico)" value={Math.round(piCfg.recentWeight * 100)} min={10} max={100} step={5} onChange={v => setPICfg(c => ({ ...c, recentWeight: v / 100 }))} unit="%" />
              <PIField label="Min match per blend" desc="Minimo match recenti per attivare il blend" value={piCfg.minRecentMatchesForBlend} min={1} max={15} step={1} onChange={v => setPICfg(c => ({ ...c, minRecentMatchesForBlend: v }))} />
            </PISection>

            {/* ── Sezione: Rating bonus ── */}
            <PISection label="Bonus Rating Peer">
              <PIField label="× Bonus rating" desc="Ogni punto sopra/sotto la media scala il PI di X" value={piCfg.ratingBonusMultiplier} min={0} max={5} step={0.25} onChange={v => setPICfg(c => ({ ...c, ratingBonusMultiplier: v }))} />
              <PIField label="Min partite votate" desc="Minimo partite con voto per applicare il bonus" value={piCfg.minRatedMatchesForBonus} min={1} max={15} step={1} onChange={v => setPICfg(c => ({ ...c, minRatedMatchesForBonus: v }))} />
            </PISection>

            {/* ── Sezione: Decay ── */}
            <PISection label="Decay Inattività">
              <PIField label="Giorni prima del decay" desc="Dopo X giorni senza giocare inizia il decadimento" value={piCfg.activityDecayStartDays} min={7} max={180} step={1} onChange={v => setPICfg(c => ({ ...c, activityDecayStartDays: v }))} />
              <PIField label="Fattore minimo" desc="Moltiplicatore minimo per inattività totale" value={piCfg.activityDecayFloor} min={0.1} max={0.95} step={0.05} onChange={v => setPICfg(c => ({ ...c, activityDecayFloor: v }))} />
              <PIField label="Velocità decay" desc="Più alto = decay più lento. Il fattore minimo è raggiunto dopo circa startDays + duration×(1-floor) giorni" value={piCfg.activityDecayDuration} min={90} max={1095} step={30} onChange={v => setPICfg(c => ({ ...c, activityDecayDuration: v }))} />
            </PISection>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
              <button
                className="btn btn-ghost"
                style={{ flex: 1 }}
                onClick={() => setPICfg(DEFAULT_PI_CONFIG)}
                disabled={piSaving}
              >
                ↩ Reset default
              </button>
              <button
                className="btn"
                style={{ flex: 2, background: 'rgba(246,224,94,0.15)', color: '#F6E05E', border: '1px solid rgba(246,224,94,0.4)', fontWeight: 700 }}
                onClick={handlePISave}
                disabled={piSaving}
              >
                {piSaving ? '⏳ Salvataggio e ricalcolo...' : '💾 Salva e Ricalcola Tutti'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Recalculate Power Index (quick button) */}
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

      {/* Data Health */}
      <div className="card mb-4 stagger-6" style={{ border: '1px solid rgba(104,211,145,0.2)', background: 'rgba(104,211,145,0.02)' }}>
        <h3 className="mb-1" style={{ fontSize: '0.95rem', color: '#68D391' }}>🩺 Salute dei Dati</h3>
        <p className="text-sm text-muted mb-3">
          Controlla score vs eventi, giocatori non linkati e partite duplicate.
        </p>
        <button className="btn btn-ghost btn-full" onClick={handleHealthCheck}>
          🔍 Esegui Controlli
        </button>
        {healthIssues !== null && (
          <div style={{ marginTop: '1rem' }}>
            {healthIssues.length === 0 ? (
              <div style={{ color: '#68D391', fontSize: '0.85rem', textAlign: 'center', padding: '0.5rem 0' }}>
                ✅ Tutto OK — nessun problema trovato su {matches.filter(m => m.status === 'finished').length} partite
              </div>
            ) : (
              Object.entries(
                healthIssues.reduce((acc, iss) => {
                  (acc[iss.label] ??= []).push(iss);
                  return acc;
                }, {})
              ).map(([label, group]) => {
                const isOpen = !!expandedHealthGroups[label];
                const sev = group.some(g => g.sev === 'error') ? 'error' : 'warn';
                return (
                  <div key={label} style={{ borderBottom: '1px solid #2D3748' }}>
                    <button
                      onClick={() => setExpandedHealthGroups(g => ({ ...g, [label]: !g[label] }))}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%',
                        background: 'none', border: 'none', cursor: 'pointer', padding: '0.5rem 0', textAlign: 'left',
                      }}>
                      <span style={{ fontSize: '0.75rem', flexShrink: 0 }}>{sev === 'error' ? '🔴' : '⚠️'}</span>
                      <span style={{ fontSize: '0.78rem', fontWeight: 700, color: sev === 'error' ? '#FC8181' : '#F6AD55', flex: 1 }}>
                        {label}
                      </span>
                      <span style={{ fontSize: '0.72rem', color: '#718096', fontWeight: 600 }}>{group.length}</span>
                      <span style={{ fontSize: '0.7rem', color: '#718096', flexShrink: 0 }}>{isOpen ? '▲' : '▼'}</span>
                    </button>
                    {isOpen && (
                      <div style={{ paddingBottom: '0.5rem' }}>
                        {group.map((iss, i) => (
                          <div key={i} style={{ fontSize: '0.72rem', color: '#718096', padding: '0.2rem 0 0.2rem 1.6rem' }}>
                            {iss.detail}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Badge Catalog */}
      <div className="card mb-4 stagger-7" style={{ border: '1px solid rgba(183,148,244,0.25)', background: 'rgba(183,148,244,0.03)' }}>
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
            const isMe = u.id === currentUser?.uid || u.email === currentUser?.email;
            const role = u.role || 'viewer';
            // Cosa è realmente modificabile via UI (allineato a firestore.rules):
            // - il superadmin può modificare admin/viewer (non i superadmin, peer);
            // - un admin normale può modificare solo i viewer;
            // - mai sé stessi (evita auto-lockout) né i superadmin.
            const canEdit = !isMe && role !== 'superadmin' &&
              (currentIsSuperAdmin || (currentIsAdmin && role === 'viewer'));
            const roleLabel = (role === 'superadmin' || (isMe && currentIsSuperAdmin)) ? 'Super Admin' : role === 'admin' ? 'Admin' : 'Viewer';
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
                {canEdit ? (
                  <select
                    className="input"
                    style={{ width: 'auto', padding: '0.3rem 0.5rem', minHeight: 'auto', fontSize: '0.8rem' }}
                    value={role}
                    onChange={e => handleSetRole(u.id, e.target.value)}
                  >
                    <option value="viewer">Viewer</option>
                    <option value="admin">Admin</option>
                  </select>
                ) : (
                  <span style={{
                    padding: '0.2rem 0.6rem', borderRadius: '0.4rem',
                    fontSize: '0.78rem', fontWeight: 600,
                    background: 'rgba(246,173,85,0.15)', color: '#F6AD55',
                    border: '1px solid rgba(246,173,85,0.35)', userSelect: 'none',
                  }}>
                    {roleLabel}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Changelog */}
      <div className="card mb-4 stagger-8">
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
