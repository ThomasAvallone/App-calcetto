// ─── Identità del proprietario dell'app (primo superadmin) ───────────────────
// L'owner è riconosciuto per email. Riconosciamo come owner SIA il valore di
// VITE_ADMIN_EMAIL (se presente) SIA il valore canonico hardcoded. Usare entrambi
// (non un fallback `env || canonico`) è deliberato: se il secret VITE_ADMIN_EMAIL
// fosse assente *oppure* impostato a un valore errato nel build, un semplice
// fallback `||` non scatterebbe (una stringa errata ma non vuota è truthy) e
// l'owner resterebbe non riconosciuto → niente self-promotion, niente poteri
// superadmin. Mettendo il canonico SEMPRE nell'insieme, il riconoscimento
// dell'owner non dipende affatto dalla correttezza del secret.
//
// ⚠️ Il valore canonico deve restare allineato a isOwnerEmail() in firestore.rules
// (le rules non possono leggere le env Vite, quindi anche lì l'email è hardcoded).
// Non è un dato sensibile: è già in chiaro nelle rules versionate e nel bundle.
const CANONICAL_OWNER_EMAIL = 'thomasavallone45@gmail.com';
const ENV_OWNER_EMAIL = (import.meta.env.VITE_ADMIN_EMAIL || '').toLowerCase().trim();

const OWNER_EMAILS = new Set(
  [CANONICAL_OWNER_EMAIL, ENV_OWNER_EMAIL].filter(Boolean).map((e) => e.toLowerCase().trim()),
);

// Email primaria dell'owner (per le scritture / display dove serve un singolo valore).
export const OWNER_EMAIL = ENV_OWNER_EMAIL || CANONICAL_OWNER_EMAIL;

// Confronto case-insensitive contro l'insieme degli alias owner riconosciuti.
export function isOwnerEmail(email) {
  return !!email && OWNER_EMAILS.has(email.toLowerCase().trim());
}
