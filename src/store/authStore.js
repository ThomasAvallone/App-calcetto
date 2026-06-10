import { create } from 'zustand';
import { subscribeToAuth, getUserDoc, loginWithGoogle, logout, promoteOwnerToSuperAdmin } from '../firebase/auth';
import { isOwnerEmail } from '../constants/owner';

const useAuthStore = create((set, get) => ({
  user: null,
  role: null,
  linkedPlayerId: null,
  loading: true,
  error: null,

  init() {
    const GIF_DURATION_MS = 3600;
    const startTime = Date.now();

    subscribeToAuth(async (firebaseUser) => {
      let newState;
      if (firebaseUser) {
        // Una sola read del doc utente per ricavare role + linkedPlayerId
        const userDoc = await getUserDoc(firebaseUser.uid).catch(() => null);
        let role = userDoc?.role || null;
        // Self-heal owner: la migrazione admin→superadmin in loginWithGoogle gira
        // SOLO al login esplicito. Con una sessione persistita un owner rimasto
        // 'admin' non verrebbe mai promosso. Fire-and-forget, MAI await: offline la
        // write resta in coda e la sua promise non risolverebbe mai → l'app si
        // bloccherebbe sulla splash. Il role locale si promuove comunque: le rules
        // permettono questa write e selectIsSuperAdmin riconosce l'owner anche
        // con role='admin' (fallback email), quindi non c'è rischio di incoerenza.
        if (role === 'admin' && isOwnerEmail(firebaseUser.email)) {
          promoteOwnerToSuperAdmin(firebaseUser.uid).catch(() => {});
          role = 'superadmin';
        }
        newState = {
          user: firebaseUser,
          role,
          linkedPlayerId: userDoc?.linkedPlayerId || null,
          loading: false,
          error: null,
        };
      } else {
        newState = { user: null, role: null, linkedPlayerId: null, loading: false };
      }
      const elapsed = Date.now() - startTime;
      const remaining = GIF_DURATION_MS - elapsed;
      if (remaining > 0) {
        await new Promise(r => setTimeout(r, remaining));
      }
      set(newState);
    });
  },

  async login() {
    set({ error: null });
    try {
      await loginWithGoogle();
      // Il ruolo viene impostato dal callback subscribeToAuth in init(),
      // che si attiva automaticamente al cambio di stato auth di Firebase.
    } catch (e) {
      set({ error: e.message });
    }
  },

  async logout() {
    await logout();
    set({ user: null, role: null, linkedPlayerId: null });
  },
}));

// Selectors — funzionano sempre, perché leggono dallo state corrente
export const selectIsAdmin = (s) => s.role === 'admin' || s.role === 'superadmin';
// Usa il ruolo Firestore come fonte di verità, con fallback all'email owner per la
// migrazione iniziale (quando il documento utente non ha ancora role='superadmin',
// es. self-heal non ancora completato o write offline in coda). `isOwnerEmail` è
// robusto rispetto al secret VITE_ADMIN_EMAIL mancante (fallback hardcoded).
export const selectIsSuperAdmin = (s) =>
  s.role === 'superadmin' ||
  (s.role === 'admin' && isOwnerEmail(s.user?.email));

export default useAuthStore;
