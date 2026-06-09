// ─── Identità del proprietario dell'app (primo superadmin) ───────────────────
// L'owner è riconosciuto per email. Il valore preferito viene da VITE_ADMIN_EMAIL,
// ma con un fallback HARDCODED al valore canonico: il bootstrap del superadmin NON
// deve dipendere unicamente dalla presenza del secret nel build. Se il secret manca
// (o non viene iniettato nella GitHub Action), senza questo fallback l'owner
// resterebbe bloccato come 'admin' (niente self-promotion, niente poteri superadmin).
//
// ⚠️ Deve restare allineato a isOwnerEmail() in firestore.rules (le rules non
// possono leggere le env Vite, quindi anche lì l'email è hardcoded). Non è un dato
// sensibile: è già presente in chiaro nelle rules versionate e nel bundle (via env).
export const OWNER_EMAIL = (import.meta.env.VITE_ADMIN_EMAIL || 'thomasavallone45@gmail.com')
  .toLowerCase()
  .trim();

// Confronto case-insensitive: l'email Google può arrivare con casing variabile.
export function isOwnerEmail(email) {
  return !!email && email.toLowerCase().trim() === OWNER_EMAIL;
}
