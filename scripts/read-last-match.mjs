import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, orderBy, limit, getDocs } from 'firebase/firestore';

const firebaseConfig = {
  apiKey:            'AIzaSyD5q52GCxKZ_s5LP_-Lc0fyOHhxSrQroz0',
  authDomain:        'calcetto-app-336ae.firebaseapp.com',
  projectId:         'calcetto-app-336ae',
  storageBucket:     'calcetto-app-336ae.firebasestorage.app',
  messagingSenderId: '761549580927',
  appId:             '1:761549580927:web:2d1773c8917a0b37576d4a',
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const snap = await getDocs(query(collection(db, 'matches'), orderBy('date', 'desc'), limit(1)));
if (snap.empty) { console.log('Nessuna partita trovata'); process.exit(1); }

const match = { id: snap.docs[0].id, ...snap.docs[0].data() };
console.log('ID:', match.id);
console.log('Data:', new Date(match.date).toLocaleString('it-IT'));
console.log('Status:', match.status);
console.log('Score: Rosso', match.redScore, '- Blu', match.blueScore);
console.log('\nEventi:');
for (const e of (match.events || [])) {
  console.log(`  [${e.type}] ${e.scorerName || e.name} - minuto: ${e.minute} - timestamp: ${e.timestamp} (${new Date(e.timestamp).toLocaleTimeString('it-IT')})`);
}

process.exit(0);
