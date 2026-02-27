import { create } from 'zustand';
import { subscribeToAuth, getUserRole, loginWithGoogle, logout } from '../firebase/auth';

const useAuthStore = create((set, get) => ({
  user: null,
  role: null,
  loading: true,
  error: null,

  init() {
    subscribeToAuth(async (firebaseUser) => {
      if (firebaseUser) {
        const role = await getUserRole(firebaseUser.uid);
        set({ user: firebaseUser, role, loading: false, error: null });
      } else {
        set({ user: null, role: null, loading: false });
      }
    });
  },

  async login() {
    set({ error: null });
    try {
      await loginWithGoogle();
    } catch (e) {
      set({ error: e.message });
    }
  },

  async logout() {
    await logout();
    set({ user: null, role: null });
  },

  get isAdmin() {
    return get().role === 'admin';
  },
}));

export default useAuthStore;
