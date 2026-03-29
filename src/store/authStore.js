import { create } from 'zustand';
import { subscribeToAuth, getUserRole, loginWithGoogle, logout } from '../firebase/auth';

const SUPER_ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL || '';

const useAuthStore = create((set, get) => ({
  user: null,
  role: null,
  loading: true,
  error: null,

  init() {
    const GIF_DURATION_MS = 3600;
    const startTime = Date.now();

    subscribeToAuth(async (firebaseUser) => {
      let newState;
      if (firebaseUser) {
        const role = await getUserRole(firebaseUser.uid);
        newState = { user: firebaseUser, role, loading: false, error: null };
      } else {
        newState = { user: null, role: null, loading: false };
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
    set({ user: null, role: null });
  },
}));

// Selectors — funzionano sempre, perché leggono dallo state corrente
export const selectIsAdmin = (s) => s.role === 'admin' || s.role === 'superadmin';
// Usa il ruolo Firestore come fonte di verità, con fallback all'email env per la
// migrazione iniziale (quando il documento utente non ha ancora role='superadmin').
export const selectIsSuperAdmin = (s) =>
  s.role === 'superadmin' ||
  (SUPER_ADMIN_EMAIL !== '' && s.user?.email === SUPER_ADMIN_EMAIL && s.role === 'admin');

export default useAuthStore;
