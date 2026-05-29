import { create } from 'zustand';
import { subscribeToPlayers, createPlayer, updatePlayer, deletePlayer } from '../firebase/firestore';
import { balanceTeams as balanceTeamsPure, balanceWithLocks as balanceWithLocksPure } from '../utils/teamBalance';

const usePlayersStore = create((set, get) => ({
  players: [],
  loading: false,
  unsubscribe: null,

  init() {
    const unsub = subscribeToPlayers((players) => {
      set({ players });
    });
    set({ unsubscribe: unsub });
  },

  cleanup() {
    const { unsubscribe } = get();
    if (unsubscribe) unsubscribe();
  },

  async addPlayer(data) {
    return await createPlayer(data);
  },

  async updatePlayer(id, data) {
    await updatePlayer(id, data);
  },

  async removePlayer(id) {
    await deletePlayer(id);
  },

  getPlayerById(id) {
    return get().players.find(p => p.id === id) || null;
  },

  // Balance with pre-assigned (locked) players — delega a utils/teamBalance.
  // Returns null if locked players overflow one side (caller should show error).
  balanceWithLocks(selectedIds, lockedTeams) {
    const pool = get().players.filter(p => selectedIds.includes(p.id));
    return balanceWithLocksPure(pool, lockedTeams);
  },

  // Balance two teams using Power Index (snake draft) — delega a utils/teamBalance.
  balanceTeams(selectedIds) {
    const pool = get().players.filter(p => selectedIds.includes(p.id));
    return balanceTeamsPure(pool);
  },

  getRanking() {
    return [...get().players].sort((a, b) => (b.powerIndex || 50) - (a.powerIndex || 50));
  },
}));

export default usePlayersStore;
