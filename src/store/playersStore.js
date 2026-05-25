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

  // Balance with pre-assigned (locked) players — locked players stay on their team,
  // free players are distributed greedily to minimize PI gap.
  // Returns null if locked players overflow one side (caller should show error).
  balanceWithLocks(selectedIds, lockedTeams) {
    const { players } = get();
    const pool = players.filter(p => selectedIds.includes(p.id));
    const total = pool.length;
    const targetRed  = Math.ceil(total / 2);
    const targetBlue = Math.floor(total / 2);

    const lockedRed  = pool.filter(p => lockedTeams[p.id] === 'red');
    const lockedBlue = pool.filter(p => lockedTeams[p.id] === 'blue');
    const rSlots = targetRed  - lockedRed.length;
    const bSlots = targetBlue - lockedBlue.length;
    if (rSlots < 0 || bSlots < 0) return null;

    const free = pool
      .filter(p => !lockedTeams[p.id])
      .sort((a, b) => (b.powerIndex || 50) - (a.powerIndex || 50));

    const freeRed = [], freeBlue = [];
    let remR = rSlots, remB = bSlots;
    let piR = lockedRed.reduce((s, p)  => s + (p.powerIndex || 50), 0);
    let piB = lockedBlue.reduce((s, p) => s + (p.powerIndex || 50), 0);

    for (const p of free) {
      const pi = p.powerIndex || 50;
      if (remR === 0) { freeBlue.push(p); remB--; continue; }
      if (remB === 0) { freeRed.push(p);  remR--; continue; }
      if (piR <= piB) { freeRed.push(p);  remR--; piR += pi; }
      else            { freeBlue.push(p); remB--; piB += pi; }
    }

    return { red: [...lockedRed, ...freeRed], blue: [...lockedBlue, ...freeBlue] };
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
