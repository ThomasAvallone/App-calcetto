# Calcetto Analytics — Setup Guide

## Prerequisiti
- Node.js >= 18
- Un account Firebase (gratuito)
- (opzionale) Account Google per Sheets integration

---

## 1. Setup Firebase

1. Vai su [firebase.google.com](https://firebase.google.com) e crea un nuovo progetto
2. Abilita **Firestore Database** (modalità Production)
3. Abilita **Authentication** → Aggiungi provider **Google**
4. Crea una **Web App** e copia le credenziali
5. Copia il file `.env.example` come `.env` e incolla le credenziali
6. Deploy delle regole Firestore:
   ```bash
   npm install -g firebase-tools
   firebase login
   firebase init firestore
   firebase deploy --only firestore:rules
   ```

---

## 2. Imposta il primo Admin

1. Accedi all'app con il tuo account Google
2. Vai su Firebase Console → Firestore → `users`
3. Trova il tuo documento e cambia `role` da `"viewer"` a `"admin"`
4. Ricarica l'app — ora hai accesso admin!

---

## 3. Google Sheets (opzionale)

1. Crea un nuovo Google Spreadsheet
2. Copia l'ID dall'URL: `https://docs.google.com/spreadsheets/d/QUESTO_È_L_ID/edit`
3. Vai su [script.google.com](https://script.google.com) → Nuovo progetto
4. Incolla il codice da `docs/google-apps-script.js`
5. Sostituisci `YOUR_GOOGLE_SPREADSHEET_ID_HERE` con il tuo ID
6. Deploy → New Deployment → Web App (Execute as: Me, Access: Anyone)
7. Copia l'URL e incollalo in `VITE_SHEETS_WEBHOOK_URL` nel `.env`

---

## 4. Avvio sviluppo

```bash
npm install
npm run dev
```

## 5. Build per produzione

```bash
npm run build
# Poi deploya la cartella dist/ su Firebase Hosting, Netlify, Vercel, ecc.
```

## 6. Deploy su Firebase Hosting

```bash
firebase init hosting
# Public dir: dist
# SPA: yes
npm run build
firebase deploy --only hosting
```

---

## Struttura Cartelle

```
src/
├── firebase/       # Config, auth, Firestore queries
├── store/          # Zustand state management
├── services/       # Sheets, Excel, Report generators
├── pages/          # Pagine React
├── components/     # Componenti riutilizzabili
└── styles/         # CSS globale
```

---

## Note sulla Sicurezza

- Le **Firestore Security Rules** garantiscono che solo utenti autenticati possano leggere
- Solo gli **admin** possono scrivere su match e giocatori
- La gestione ruoli avviene tramite il campo `role` nella collection `users`
- **NON committare mai il file `.env`** su git
