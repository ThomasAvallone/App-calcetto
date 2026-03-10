// ──────────────────────────────────────────────────────────────────────────────
// SCRIPT DI CORREZIONE MINUTI GOL - incolla nella console del browser
// mentre sei loggato nell'app su calcetto-app-336ae.web.app
// ──────────────────────────────────────────────────────────────────────────────
(async () => {
  const { getFirestore, collection, query, orderBy, limit, getDocs, doc, getDoc, updateDoc } =
    await import('https://www.gstatic.com/firebasejs/10.14.0/firebase-firestore.js');

  // Usa il db già inizializzato dall'app
  const db = window.__firestoreDb || (() => {
    console.error('Non trovato window.__firestoreDb. Prova a rieseguire dopo che la pagina è caricata.');
  })();
  if (!db) return;

  // 1. Leggi l'ultima partita
  const snap = await getDocs(query(collection(db, 'matches'), orderBy('date', 'desc'), limit(1)));
  const match = { id: snap.docs[0].id, ...snap.docs[0].data() };
  console.log('Partita trovata:', match.id, new Date(match.date?.toMillis?.() || match.date).toLocaleString('it-IT'));

  // 2. Leggi il matchState (contiene startTimestamp)
  const stateSnap = await getDoc(doc(db, 'matchStates', match.id));
  const matchState = stateSnap.exists() ? stateSnap.data() : null;
  console.log('matchState:', matchState);

  if (!matchState?.startTimestamp) {
    console.error('startTimestamp non trovato nel matchState. Impossibile ricalcolare automaticamente.');
    console.log('Evento per evento (con timestamp assoluto):');
    for (const e of (match.events || [])) {
      console.log(`  ${e.scorerName} | minuto attuale: ${e.minute} | timestamp: ${new Date(e.timestamp).toLocaleTimeString('it-IT')}`);
    }
    return;
  }

  const startTs = matchState.startTimestamp;
  console.log('Timer partito alle:', new Date(startTs).toLocaleTimeString('it-IT'));

  // 3. Ricalcola i minuti corretti
  const fixedEvents = (match.events || []).map(e => {
    const correctMinute = Math.floor((e.timestamp - startTs) / 1000 / 60);
    console.log(`  ${e.scorerName || e.type} | minuto errato: ${e.minute} → minuto corretto: ${correctMinute} | ore: ${new Date(e.timestamp).toLocaleTimeString('it-IT')}`);
    return { ...e, minute: correctMinute };
  });

  // 4. Chiedi conferma prima di salvare
  const ok = confirm(
    `Vuoi aggiornare ${fixedEvents.length} eventi su Firebase?\nControlla i minuti nella console prima di confermare.`
  );
  if (!ok) { console.log('Annullato.'); return; }

  await updateDoc(doc(db, 'matches', match.id), { events: fixedEvents });
  console.log('✅ Minuti aggiornati con successo!');
})();
