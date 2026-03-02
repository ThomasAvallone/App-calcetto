import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  createMatch, updateMatch, getMatch,
  saveMatchTimerState, getMatchTimerState,
  subscribeToMatch
} from '../firebase/firestore';

// ─── GOALKEEPER ROTATION LOGIC ────────────────────────────────────────────────
// Each player gets 2 turns of 6 minutes as GK. Total 60 min / 6 = 10 turns per team (5 players × 2)
export const GK_TURN_DURATION = 6 * 60; // seconds

export function computeGkRotation(teamPlayers) {
  // Returns array of turns: [{ playerId, start, end }]
  // Each player appears exactly twice, interleaved
  const turns = [];
  const players = [...teamPlayers];
  // First round
  players.forEach((p, i) => turns.push({ playerId: p.id, name: p.name, turnIndex: i }));
  // Second round
  players.forEach((p, i) => turns.push({ playerId: p.id, name: p.name, turnIndex: players.length + i }));
  return turns;
}

export function getCurrentGkTurn(rotationTurns, elapsedSeconds) {
  if (!rotationTurns || rotationTurns.length === 0) return null;
  const turnIndex = Math.floor(elapsedSeconds / GK_TURN_DURATION);
  return rotationTurns[Math.min(turnIndex, rotationTurns.length - 1)] || null;
}

// ─── STORE ────────────────────────────────────────────────────────────────────

const useMatchStore = create(
  persist(
    (set, get) => ({
      activeMatchId: null,
      match: null,
      timerState: {
        isRunning: false,
        startTimestamp: null, // Date.now() when last started
        elapsedMs: 0,         // ms accumulated before last start
        totalMs: 60 * 60 * 1000,
      },
      gkRotation: { red: [], blue: [] },
      currentGk: { red: null, blue: null },
      nextGkAlert: false,
      goalModal: null,       // { team, minute } | null
      unsubscribeMatch: null,

      // ── INIT ──────────────────────────────────────────────────────────────
      async loadMatch(matchId) {
        const match = await getMatch(matchId);
        if (!match) return;

        const timerState = await getMatchTimerState(matchId);
        const gkRed = computeGkRotation(match.redTeam || []);
        const gkBlue = computeGkRotation(match.blueTeam || []);

        set({
          activeMatchId: matchId,
          match,
          gkRotation: { red: gkRed, blue: gkBlue },
          timerState: timerState
            ? {
                isRunning: timerState.isRunning || false,
                startTimestamp: timerState.startTimestamp || null,
                elapsedMs: timerState.elapsedMs || 0,
                totalMs: 60 * 60 * 1000,
              }
            : get().timerState,
        });

        // Subscribe to live updates
        const unsub = subscribeToMatch(matchId, (updatedMatch) => {
          if (updatedMatch) set({ match: updatedMatch });
        });
        set({ unsubscribeMatch: unsub });
        get().updateCurrentGks();
      },

      unloadMatch() {
        const { unsubscribeMatch } = get();
        if (unsubscribeMatch) unsubscribeMatch();
        set({
          activeMatchId: null, match: null,
          unsubscribeMatch: null, goalModal: null,
        });
      },

      // ── TIMER ─────────────────────────────────────────────────────────────
      startTimer() {
        const { timerState, activeMatchId } = get();
        if (timerState.isRunning) return;
        const newState = {
          ...timerState,
          isRunning: true,
          startTimestamp: Date.now(),
        };
        set({ timerState: newState });
        get()._syncTimer(newState);
      },

      pauseTimer() {
        const { timerState, activeMatchId } = get();
        if (!timerState.isRunning) return;
        const elapsed = Date.now() - timerState.startTimestamp;
        const newState = {
          ...timerState,
          isRunning: false,
          startTimestamp: null,
          elapsedMs: timerState.elapsedMs + elapsed,
        };
        set({ timerState: newState });
        get()._syncTimer(newState);
      },

      getElapsedMs() {
        const { timerState } = get();
        if (!timerState.isRunning) return timerState.elapsedMs;
        return timerState.elapsedMs + (Date.now() - timerState.startTimestamp);
      },

      getElapsedSeconds() {
        return Math.floor(get().getElapsedMs() / 1000);
      },

      async _syncTimer(state) {
        const { activeMatchId } = get();
        if (!activeMatchId) return;
        await saveMatchTimerState(activeMatchId, {
          isRunning: state.isRunning,
          startTimestamp: state.startTimestamp,
          elapsedMs: state.elapsedMs,
        });
      },

      // ── GOALKEEPER ────────────────────────────────────────────────────────
      updateCurrentGks() {
        const { gkRotation, getElapsedSeconds } = get();
        const elapsed = getElapsedSeconds();
        const redGk = getCurrentGkTurn(gkRotation.red, elapsed);
        const blueGk = getCurrentGkTurn(gkRotation.blue, elapsed);
        set({ currentGk: { red: redGk, blue: blueGk } });
      },

      overrideGk(team, playerId, playerName) {
        const { gkRotation, getElapsedSeconds } = get();
        const elapsed = getElapsedSeconds();
        const turnIndex = Math.floor(elapsed / GK_TURN_DURATION);
        const rotation = [...gkRotation[team]];
        rotation[Math.min(turnIndex, rotation.length - 1)] = { playerId, name: playerName, turnIndex };
        const newRotation = { ...gkRotation, [team]: rotation };
        set({ gkRotation: newRotation });
        get().updateCurrentGks();
      },

      // ── EVENTS ────────────────────────────────────────────────────────────
      openGoalModal(team, minute) {
        set({ goalModal: { team, minute } });
      },

      closeGoalModal() {
        set({ goalModal: null });
      },

      async recordGoal({ team, scorerId, scorerName, assistId, assistName }) {
        const { activeMatchId, match, currentGk, getElapsedSeconds } = get();
        if (!activeMatchId || !match) return;

        const minute = Math.floor(getElapsedSeconds() / 60);
        const gkInfo = team === 'red' ? currentGk.blue : currentGk.red; // GK of defending team

        const goalEvent = {
          id: crypto.randomUUID(),
          type: 'goal',
          team,
          scorerId,
          scorerName,
          assistId: assistId || null,
          assistName: assistName || null,
          gkConcededId: gkInfo?.playerId || null,
          gkConcededName: gkInfo?.name || null,
          minute,
          timestamp: Date.now(),
        };

        const redScore = team === 'red' ? (match.redScore || 0) + 1 : (match.redScore || 0);
        const blueScore = team === 'blue' ? (match.blueScore || 0) + 1 : (match.blueScore || 0);
        const events = [...(match.events || []), goalEvent];

        await updateMatch(activeMatchId, { events, redScore, blueScore });
        set({ match: { ...match, events, redScore, blueScore }, goalModal: null });
      },

      async recordAutogoal({ team, scorerId, scorerName }) {
        const { activeMatchId, match, getElapsedSeconds } = get();
        if (!activeMatchId || !match) return;

        const minute = Math.floor(getElapsedSeconds() / 60);
        const autogoalEvent = {
          id: crypto.randomUUID(),
          type: 'autogoal',
          team,
          scorerId,
          scorerName,
          minute,
          timestamp: Date.now(),
        };

        // Autogoal counts for opponent
        const redScore = team === 'blue' ? (match.redScore || 0) + 1 : (match.redScore || 0);
        const blueScore = team === 'red' ? (match.blueScore || 0) + 1 : (match.blueScore || 0);
        const events = [...(match.events || []), autogoalEvent];

        await updateMatch(activeMatchId, { events, redScore, blueScore });
        set({ match: { ...match, events, redScore, blueScore } });
      },

      async deleteEvent(eventId) {
        const { activeMatchId, match } = get();
        if (!activeMatchId || !match) return;

        const events = (match.events || []).filter(e => e.id !== eventId);

        // Recount score
        let redScore = 0, blueScore = 0;
        for (const ev of events) {
          if (ev.type === 'goal') {
            if (ev.team === 'red') redScore++;
            else blueScore++;
          } else if (ev.type === 'autogoal') {
            if (ev.team === 'red') blueScore++; // red autogoal → blue scores
            else redScore++;
          }
        }

        await updateMatch(activeMatchId, { events, redScore, blueScore });
        set({ match: { ...match, events, redScore, blueScore } });
      },

      async endMatch() {
        const { activeMatchId, match, timerState } = get();
        if (!activeMatchId || !match) return;

        // Pause timer
        if (timerState.isRunning) get().pauseTimer();

        await updateMatch(activeMatchId, { status: 'finished', endedAt: Date.now() });
        set({ match: { ...match, status: 'finished' } });
      },

      async createNewMatch(matchData) {
        const id = await createMatch(matchData);
        return id;
      },

      async startScheduledMatch(matchId) {
        await updateMatch(matchId, { status: 'active' });
        await get().loadMatch(matchId);
        return matchId;
      },
    }),
    {
      name: 'calcetto-match-store',
      partialize: (state) => ({
        activeMatchId: state.activeMatchId,
        timerState: state.timerState,
        gkRotation: state.gkRotation,
      }),
    }
  )
);

export default useMatchStore;
