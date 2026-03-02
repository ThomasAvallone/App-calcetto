import { create } from 'zustand';
import { subscribeToPlayers, createPlayer, updatePlayer, deletePlayer } from '../firebase/firestore';

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

  // Balance two teams using Power Index + role spread
  balanceTeams(selectedIds) {
    const { players } = get();
    const pool = players.filter(p => selectedIds.includes(p.id))
      .sort((a, b) => (b.powerIndex || 50) - (a.powerIndex || 50));

    const red = [], blue = [];
    pool.forEach((player, i) => {
      // Snake draft: 0→red, 1→blue, 2→blue, 3→red, 4→red, ...
      if (i % 4 === 0 || i % 4 === 3) red.push(player);
      else blue.push(player);
    });

    // Ensure equal sizes (up to 5v5)
    while (red.length > 5) blue.push(red.pop());
    while (blue.length > 5) red.push(blue.pop());

    return { red, blue };
  },

  getRanking() {
    return [...get().players].sort((a, b) => (b.powerIndex || 50) - (a.powerIndex || 50));
  },
}));

export default usePlayersStore;
