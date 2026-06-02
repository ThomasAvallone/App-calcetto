# App-calcetto — Guida per Claude Code

Questo file evita di ri-esplorare il progetto da zero ad ogni sessione.

## Panoramica

PWA per tracciare partite di calcio a 5 tra amici. UI in italiano, tema dark.

## Stack

- **Frontend**: React 18 + Vite + React Router v6
- **Stato**: Zustand (3 store: `authStore`, `matchStore`, `playersStore`)
- **Backend**: Firebase Firestore + Auth (real-time subscriptions)
- **AI**: Google Gemini API (`src/services/geminiService.js`) — NON usa Anthropic/Claude
- **Build**: Vite + `vite-plugin-pwa` (workbox)
- **UI**: Stili inline + poche classi utility definite in `src/styles/`
- **Date**: `date-fns` con locale italiano
- **Toast**: `react-hot-toast`

## Struttura Cartelle

```
src/
├── App.jsx                   # Router + route protette
├── pages/                    # Una pagina per route
├── components/
│   ├── Confetti.jsx          # Effetto coriandoli post-vittoria
│   ├── ErrorBoundary.jsx     # Catch-all degli errori React
│   ├── FutCard.jsx           # Carta giocatore stile FUT (vista alternativa lista)
│   ├── Layout.jsx            # Shell app: header + bottom nav
│   ├── MatchReplay.jsx       # Riproduzione animata eventi di una partita
│   ├── Spinner.jsx           # Indicatore di loading
│   ├── WhatIfModal.jsx       # Simulatore "What-if" (Dashboard)
│   ├── players/              # Sub-componenti di PlayersPage
│   └── stats/                # Sub-componenti di StatsPage
├── store/                    # Zustand stores
├── firebase/
│   ├── firestore.js          # Tutte le operazioni Firestore
│   └── sanitizePublicName.test.js  # Test invariante privacy (no email nei campi pubblici)
├── services/
│   ├── geminiService.js      # Chiamate Gemini AI; logica pura estratta in utils/aiResolve.js
│   └── reportService.test.js # Test preview/verdetto post-partita
├── data/
│   ├── historicalData.js     # Dati storici stagioni
│   ├── historicalData.test.js # Test computeCumulativeStats + integrità dati
│   └── historicalMatches.js  # Partite storiche
├── utils/                    # ⚠️ Funzioni PURE (no Firestore/DOM) — vedi "Moduli puri & test"
│   ├── badges.js / badges.test.js
│   ├── playerStats.js / playerStats.test.js   # + DEFAULT_PI_CONFIG
│   ├── leaderboards.js / leaderboards.test.js # Classifica/duo/h2h/squadre/GK (estratti da StatsPage)
│   ├── weatherStats.js / weatherStats.test.js
│   ├── nextBadge.js / nextBadge.test.js       # Hint "prossimo badge" Dashboard
│   ├── aiResolve.js / aiResolve.test.js       # Risolve output JSON Gemini → player objects
│   ├── voiceParser.js / voiceParser.test.js
│   ├── dataExport.js / dataExport.test.js     # Export CSV/JSON (anti CSV-injection)
│   ├── matchScore.js / matchScore.test.js     # scoreFromEvents/withProgressiveScore (source of truth punteggio)
│   ├── teamBalance.js / teamBalance.test.js   # balanceTeams (snake) + balanceWithLocks (lock + greedy PI)
│   ├── dateUtils.js          # getMs(), safeDate()
│   └── waitUndo.js           # Toast con countdown per operazioni annullabili
├── constants/
│   └── colors.js             # Costanti colori (CLR_WIN, CLR_LOSS, ecc.)
└── hooks/
    ├── useMatchesSubscription.js  # Real-time subscription alla collezione matches
    └── usePIConfig.js              # Real-time subscription a settings/piConfig (dedup JSON key)
```

## Route

| Path | Pagina |
|------|--------|
| `/` | DashboardPage |
| `/match/setup` | MatchSetupPage |
| `/match/:id` | MatchPage (partita live) |
| `/history` | HistoryPage |
| `/history/:id` | MatchDetailPage |
| `/history/scheduled/:id` | ScheduledMatchDetailPage |
| `/players` | PlayersPage |
| `/stagioni` | StagioniPage |
| `/stats` | StatsPage |
| `/admin` | AdminPage (solo admin) |
| `/admin/badges` | BadgesPage (solo admin) |

## Pagine Principali e Dimensioni

| File | Righe | Note |
|------|-------|------|
| `pages/StatsPage.jsx` | ~1000 | Classifiche + stats; tab AI in `components/stats/`, aggregazioni pure in `utils/leaderboards.js` |
| `pages/MatchDetailPage.jsx` | ~987 | Dettaglio partita storica |
| `pages/AdminPage.jsx` | ~901 | Gestione admin (include CHANGELOG + Editor PI) |
| `pages/PlayersPage.jsx` | ~872 | Scheda giocatore + lista; sub-componenti estratti in `components/players/` |
| `pages/DashboardPage.jsx` | ~785 | Dashboard principale (banner avvio partita imminente) |
| `pages/HistoryPage.jsx` | ~723 | Lista partite |

## Componenti Estratti

### `src/components/players/`
- `HistoricalLinkSection.jsx` — Collega giocatori ai nomi storici
- `PiTrendChart.jsx` — Grafico SVG andamento Power Index (usa `computePowerIndex` con `piConfig` corrente)
- `AiTrendCard.jsx` — Card analisi AI del momento di forma (Gemini)
- `AiNicknameCard.jsx` — Card soprannome AI (Gemini)
- `DuoCompatibility.jsx` — Win rate dei compagni quando giocano insieme vs contro
- `PlayerAchievements.jsx` — 18 traguardi in 5 categorie, on-the-fly
- `PlayerDetailComponents.jsx` — `PiArc`, `PlayerAvatar`, `PlayerMatchHistory`, `PlayerRecords`, `PlayerBadges`, `PowerIndexChart`, `StreakBadge`

### `src/components/dashboard/`
- `MyStatsCard.jsx` — Card "I tuoi numeri" della Dashboard: avatar, stats stagione/all-time, forma, hint prossimo badge
- `CoppaDiLattaCard.jsx` — Card "Coppa di Latta del Mese" con confronto vs mese precedente

### `src/components/stats/`
- `ReportAITab.jsx` — Report AI periodico (Gemini), include `REPORT_PERIODS`
- `HallTab.jsx` — Hall of Fame/Shame AI (Gemini)
- `TrendTab.jsx` — Grafico SVG a linee (gol/assist/vittorie cumulativi nel tempo); top 6 per metrica; partite storiche escluse

### Componenti inline (non estratti)
- `ReactionsSection` — in `MatchDetailPage.jsx`; subscribe a `matches/{matchId}/reactions/{userId}`, emoji picker a 6 reazioni, aggregazione live

## Convenzioni

- **Stili**: inline style objects (no CSS modules, no Tailwind)
- **Colori**: sempre da `src/constants/colors.js`
- **Lingua UI**: italiano
- **AI**: chiamate Gemini solo on-demand (button click), mai automatiche
- **Firestore**: ogni documento ha ID gestito da Firebase; `getMs()` converte Timestamp → ms
- **Power Index**: calcolato con `computePowerIndex()` in `utils/playerStats.js` (re-esportato da `firebase/firestore.js` per retrocompat). Formula: `50 + winRate×20 + attackPerMatch×6 - gkPenalty`. Dopo il blend recent/overall (60/40), si applica un `ratingBonus = (avgRating - 5.5) × 1.5` (solo se ≥3 partite votate), poi l'`activityFactor` (decay da inattività). Il tutto in `recalculatePlayerStats`.
- **Power Index configurabile**: i 17 parametri della formula sono esposti come `DEFAULT_PI_CONFIG` in `playerStats.js`. `computePowerIndex(stats, cfg)` e `computeCombinedPowerIndex(stats, hist, cfg)` accettano un parametro `cfg` opzionale (default = valori storici → retrocompatibile). La config attuale vive su Firestore in `settings/piConfig`; l'editor in AdminPage permette agli admin di modulare i pesi. `recalculatePlayerStats` legge la config a ogni ricalcolo. Il hook `usePIConfig` (in `src/hooks/`) sottoscrive la config in real-time per le viste live (PlayersPage, PiTrendChart) con deduplicazione via JSON key per evitare render spurii.
- **Funzioni pure**: tutti i calcoli (stats, PI, classifiche, badge, meteo, parsing AI, export…) stanno in moduli `utils/*.js` (+ `data/historicalData.js`) senza dipendenze Firestore/DOM, per essere testabili in isolamento. Vedi sezione "Moduli puri & test". Regola: una nuova funzione di calcolo va estratta lì, non lasciata inline in un componente.
- **Logica portiere (GK)**: il portiere NON è fisso — tutti i giocatori ruotano in porta. Ogni giocatore fa **2 turni in porta per partita** (uno per tempo). Di conseguenza `gkMatches` si incrementa di **2** per ogni partita giocata (`s.gkMatches += 2`). Tutti i calcoli GK (Power Index, badge Muro/Colabrodo/Gufo) usano questa unità: `gkGoalsConceded / gkMatches` = media gol subiti per turno. Non correggere questo comportamento: è intenzionale.
- **Tipi di evento**: `goal`, `autogoal` (incidono su punteggio e statistiche), `save` e `injury` (solo cronaca, non incidono su punteggio/PI). I campi differiscono: goal/autogoal usano `scorerId/scorerName`; save/injury usano `playerId/playerName`. Gli **infortuni** si registrano sia post-partita (MatchDetailPage) sia **live** durante la partita (`matchStore.recordInjury`, bottone 🩹 in MatchPage) — l'evento `injury` include `team` (serve a `InjuryHistory`). `deleteGoalEvent` decrementa il punteggio solo per goal/autogoal. `generateMatchCommentary` include save/injury nel prompt AI sotto "ALTRI EVENTI".
- **Reazioni partita**: subcollection `matches/{matchId}/reactions/{userId}`. Ogni documento ha `{ emoji, playerName, updatedAt }`. Il `playerName` viene calcolato a runtime da `linkedPlayerId→player.name || user.displayName` (mai l'email). Gestite da `subscribeToMatchReactions`, `upsertMatchReaction`, `deleteMatchReaction` in `firestore.js`. `deleteMatch` pulisce la subcollection (best-effort).
- **Formazione parziale**: `balanceWithLocks(selectedIds, lockedTeams)` in `playersStore` (delega a `utils/teamBalance.js`) — i giocatori con lock restano fissi, i liberi sono distribuiti con greedy PI-minimization. Ritorna `null` se i lock eccedono la capienza di una squadra. `balanceTeams` (snake draft su PI) sta anch'esso in `teamBalance.js`. Lo store risolve solo `selectedIds → pool` e delega l'algoritmo (puro, testato).
- **Stats di stagione/periodo**: `aggregatePlayerMatchStats(player, matches)` in `playerStats.js` è la **source of truth unica** per aggregare le stats di un giocatore su una lista di partite (usata da `computeStatsFromMatches`, `PlayersPage.playerSeasonStats`, `DashboardPage.myStats`). Include la proration degli assist storici col cap a 1. Non re-implementarla inline nelle pagine. `generateAIBalancedTeams(players, constraints)` accetta `constraints = { slotsRed, slotsBlue, lockedRedNames, lockedBlueNames }` per vincolare il numero di giocatori liberi per squadra.

## Comandi

```bash
npm run dev        # Dev server
npm run build      # Build produzione
npm run preview    # Preview build
npm test           # Run Vitest (headless) — ~190 test, 11 file
npm run test:watch # Vitest watch mode
```

## Moduli puri & test

Vitest gira in ambiente **node (no DOM, no localStorage)**. Tutta la logica
testabile è isolata in moduli puri senza dipendenze da Firestore/DOM/React, così
ogni nuova funzione di calcolo va messa lì (non inline nei componenti) e testata.

| Modulo | Cosa copre |
|--------|-----------|
| `playerStats.js` | stats, Power Index, streak, recentForm, `computeStatsFromMatches` |
| `leaderboards.js` | `computeStandings`, `computeDuoStats`, `computeH2HStats`, `computeSquadreStats`, `rankGoalkeepers`, `getSeasonStartMs` |
| `badges.js` | 40 badge def + `computeBadges` (error-isolation per badge) |
| `weatherStats.js` | aggregati meteo per partita/giocatore |
| `nextBadge.js` | hint prossimo badge |
| `aiResolve.js` | `resolveBalancedTeams`, `resolveVoiceGoal` (output Gemini → player) |
| `voiceParser.js` | parser vocale rule-based |
| `dataExport.js` | `escapeCsv`, `buildMatchesCSV`, `buildPlayersCSV` |
| `historicalData.js` | `computeCumulativeStats` ecc. + integrità dati |
| `reportService.js` | preview/verdetto post-partita + `computeMatchMVP` |
| `matchScore.js` | `scoreFromEvents`, `withProgressiveScore` (punteggio derivato dagli eventi) |
| `teamBalance.js` | `balanceTeams` (snake draft), `balanceWithLocks` (lock + greedy PI, `null` su overflow) |
| `playerStats.js` (+) | `aggregatePlayerMatchStats` (stats di un player su una lista di partite; proration assist storici cap a 1) |
| `firestore.js` | solo `sanitizePublicName` (resto non testato: richiede Firebase) |

⚠️ `geminiService.js` e `firestore.js` **non** sono importabili nei test in blocco
(leggono `localStorage`/Firebase a load-time): estrai la logica pura in `utils/`.

## Audit svolti & invarianti da preservare

Aree già revisionate a fondo (bug + hardening + test). **Non rifare questi check da zero**; rispetta gli invarianti:

- **Privacy email** 🔒: l'email vive SOLO su `users/{uid}` (read self/admin via rules). NON deve mai finire in documenti world-readable. `rateMatch`/`upsertMatchReaction` passano da `sanitizePublicName()` (scarta valori con `@`). I display name pubblici usano `myPlayer?.name || user.displayName || 'Anonimo'`, **mai** `user.email`.
- **CSV export**: `escapeCsv` neutralizza la **CSV formula injection** (prefisso `'` se il campo inizia con `= + - @` tab/CR) e quota anche su `\r`. Non rimuovere.
- **Power Index engine** (`recalculatePlayerStats`): commit in **batch da ≤450** (limite Firestore 500); esclude i doc `isHistorical` e somma `computeCumulativeStats` (no doppio conteggio); skip dei player eliminati.
- **Dati storici** (`historicalData.js`): invarianti garantiti da test → `players.length === totalPlayers` e `vinte+nulle+perse === presenze` per ogni giocatore. La classifica all-time ci si appoggia.
- **Subscription** (`firestore.js`): tutte le `onSnapshot` hanno error callback (`_subError`); le liste preservano l'ultimo dato (no-wipe), le settings resettano a null.
- **Gemini**: `resolveBalancedTeams` garantisce squadre **disgiunte** (nome duplicato da Gemini non finisce in entrambe); `resolveVoiceGoal` scarta gli ID inventati e deduce il team dallo scorer.
- **reportService / MVP**: l'MVP è calcolato da `computeMatchMVP(events)` (gol +3, assist +2, autogol -2; `null` se saldo ≤ 0 → niente MVP a chi ha solo autogol). **Source of truth unica**: la usano sia il verdetto testuale (`generateMatchReport`) sia la card del Report Modal in `MatchPage`. Non re-implementare il calcolo inline.
- **Punteggio partita** 🎯: si **deriva sempre** dagli eventi via `scoreFromEvents()` (goal→squadra marcatore, autogoal→avversaria, save/injury neutri), mai incrementato a mano. `matchStore._appendEvent` fa optimistic update + **rollback uniforme** per gol/autogol/infortuni; `deleteEvent` ri-deriva il punteggio. `withProgressiveScore()` annota il parziale per le cronache (MatchPage log, MatchReplay, reportService).
- **Fine partita** (`MatchPage.handleEndMatch` + `matchStore.endMatch`): lo snapshot (score+tabellino) si cattura **dopo** i 5s di `waitUndo` leggendo `useMatchStore.getState().match` (no stale closure) e con `scoreFromEvents`. `recalculatePlayerStats` è non-critico (try/catch isolato: un suo errore non nasconde il verdetto). `endMatch` rilegge il match dallo store dopo l'await per non sovrascrivere eventi arrivati dalla subscription.
- **StatsPage**: classifica GK = `rankGoalkeepers` (media gol/turno **crescente**, min 6 turni — più basso = migliore; diverso dai badge GK). Cronologie ordinate per data reale (`getMs`/`dateMs`), mai per stringa `GG/MM/AA`. Finestra 30gg legata allo stato `now` (refresh su visibilitychange).
- **Infortuni live**: registrabili durante la partita (`matchStore.recordInjury` → evento `injury` con `team`, optimistic + rollback). Lo storico infortuni (`InjuryHistory`) usa `ev.team`.
- **Flusso match (MatchPage/MatchSetupPage)** — comportamenti da non disfare: (A4) protezione anti-uscita su partita `active` con eventi tramite **`beforeunload`** (refresh/chiusura scheda). ⚠️ **NON usare `useBlocker`/hook da data-router** (`useNavigation`, `useLoaderData`, ecc.): l'app monta `<BrowserRouter>` (vedi `main.jsx`), non un data router. Con `BrowserRouter` quegli hook chiamano `invariant(false)` che **in build di produzione è un `Error` senza messaggio** → crash dell'intera pagina ("Errore inatteso"). È esattamente il bug che ha bloccato la MatchPage live. Se serve il blocco di navigazione in-app, migrare prima a `createBrowserRouter` + `RouterProvider`. (D2) MatchSetupPage avvisa con toast al superamento dei 10 giocatori e chiede conferma su "Pianifica senza giocatori"; (D3) i timer di animazione (goalFlash/scoreShake/scoreBounce) usano ref dedicate e guard `isMountedRef` nei `setTimeout` per evitare set su componente smontato e collisioni su gol ravvicinati.

## Gemini (modelli)

`src/services/geminiService.js` usa due tier con fallback chain:
- `fast`: flash-lite → flash → pro
- `pro`: pro → flash-lite → flash

I modelli "thinking" (`gemini-3.1-pro-preview`) consumano token per il reasoning
interno: in `callGemini` il `maxTokens` viene automaticamente moltiplicato ×4
(min 2000) quando l'iterazione di fallback cade su uno di questi, per evitare
output troncati. Non ridurre questo margine.

## Deploy

Deploy automatico su Firebase su push a `main` o `claude/**` via GitHub Actions.
Il workflow è in `.github/workflows/firebase-deploy.yml` e deploya **sia hosting
che Firestore rules** (`--only hosting,firestore:rules`). Le rules sono in
`firestore.rules` — ogni modifica viene applicata in produzione al prossimo push.

## Firestore Rules

Le regole di sicurezza in `firestore.rules` definiscono:
- `users/{userId}`: read auth users (self) + admin; gerarchia superadmin > admin > viewer per gli update.
  - 🔒 **Self-create vincolato al role**: `allow create` impone `role == 'viewer'` (unica eccezione: l'owner via `isOwnerEmail()`, per il bootstrap del primo superadmin coerente con `auth.js`). Senza questo vincolo un auth user senza doc potrebbe crearsi un profilo `superadmin` via chiamata Firestore diretta → escalation. **Non rilassare questo vincolo.** L'email in `isOwnerEmail()` deve restare allineata a `VITE_ADMIN_EMAIL` (le rules non leggono le env Vite, quindi è hardcoded).
- `players`, `matches`, `matchStates`, `historicalSeasons`: read per ogni auth user, write solo admin.
- `matches/{matchId}/reactions/{userId}`: read per ogni auth user; create/update solo owner (`request.auth.uid == userId`); delete owner o admin.
- `settings/{settingId}`: read per ogni auth user; write solo admin **eccetto** documenti `aiCache_*` (cache effimere) scrivibili da qualunque auth user.

Punti chiave:
- `settings/piConfig` — config Power Index (write admin only)
- `settings/nextMatch` — partita programmata (write admin only)
- `settings/aiCache_*` — cache risposte AI (read+write tutti gli auth user)

Tutti gli accessi a `settings/*` sono difensivi: `.catch(() => {})` sui write non
critici (aiCache), `.catch(() => null)` o `.catch(() => ({ exists: () => false }))`
sui read non critici, `onSnapshot` con error callback. Questo evita che un
fallimento di permessi blocchi flussi user-facing (es. il modal post-partita).

## Variabili d'Ambiente (`.env`)

```
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
VITE_ADMIN_EMAIL
VITE_GEMINI_API_KEY
```
