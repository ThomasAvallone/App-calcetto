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
│   ├── players/              # Sub-componenti di PlayersPage
│   └── stats/                # Sub-componenti di StatsPage
├── store/                    # Zustand stores
├── firebase/
│   └── firestore.js          # Tutte le operazioni Firestore (532 righe)
├── services/
│   └── geminiService.js      # Chiamate Gemini AI (360 righe)
├── data/
│   ├── historicalData.js     # Dati storici stagioni (551 righe)
│   └── historicalMatches.js  # Partite storiche (306 righe)
├── utils/
│   ├── badges.js             # Calcolo badge (467 righe)
│   └── dateUtils.js          # getMs() helper
├── constants/
│   └── colors.js             # Costanti colori (CLR_WIN, CLR_LOSS, ecc.)
└── hooks/
    └── useMatchesSubscription.js
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
| `pages/PlayersPage.jsx` | ~400 | Scheda giocatore + lista; sub-componenti estratti in `components/players/` |
| `pages/StatsPage.jsx` | ~970 | Classifiche + stats; tab AI estratti in `components/stats/` |
| `pages/MatchDetailPage.jsx` | 978 | Dettaglio partita storica |
| `pages/AdminPage.jsx` | 707 | Gestione admin |
| `pages/HistoryPage.jsx` | 683 | Lista partite |
| `pages/DashboardPage.jsx` | 682 | Dashboard principale |

## Componenti Estratti

### `src/components/players/`
- `HistoricalLinkSection.jsx` — Collega giocatori ai nomi storici
- `PiTrendChart.jsx` — Grafico SVG andamento Power Index (usa `computePowerIndex`)
- `AiTrendCard.jsx` — Card analisi AI del momento di forma (Gemini)
- `AiNicknameCard.jsx` — Card soprannome AI (Gemini)
- `PlayerDetailComponents.jsx` — `PiArc`, `PlayerAvatar`, `PlayerMatchHistory`, `PlayerRecords`, `PlayerBadges`, `PowerIndexChart`, `StreakBadge`

### `src/components/stats/`
- `ReportAITab.jsx` — Report AI periodico (Gemini), include `REPORT_PERIODS`
- `HallTab.jsx` — Hall of Fame/Shame AI (Gemini)

## Convenzioni

- **Stili**: inline style objects (no CSS modules, no Tailwind)
- **Colori**: sempre da `src/constants/colors.js`
- **Lingua UI**: italiano
- **AI**: chiamate Gemini solo on-demand (button click), mai automatiche
- **Firestore**: ogni documento ha ID gestito da Firebase; `getMs()` converte Timestamp → ms
- **Power Index**: calcolato con `computePowerIndex()` in `firebase/firestore.js`

## Comandi

```bash
npm run dev      # Dev server
npm run build    # Build produzione
npm run preview  # Preview build
```

## Deploy

Deploy automatico su Firebase Hosting su push a `main` o `claude/**` via GitHub Actions.
Il workflow è in `.github/workflows/firebase-deploy.yml`.

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
