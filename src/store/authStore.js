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
      const user = await loginWithGoogle();
      const role = await getUserRole(user.uid);
      set(s => ({ ...s, role }));
    } catch (e) {
      set({ error: e.message });
    }
  },

  async logout() {
    await logout();
    set({ user: null, role: null });
  },

  get isAdmin() {
    const role = get().role;
    return role === 'admin' || role === 'superadmin';
  },

  get isSuperAdmin() {
    const superAdminEmail = import.meta.env.VITE_ADMIN_EMAIL || '';
    return superAdminEmail !== '' && get().user?.email === superAdminEmail;
  },
}));

export default useAuthStore;
