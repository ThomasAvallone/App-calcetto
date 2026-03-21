import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  createMatch, updateMatch, getMatch,
  saveMatchTimerState, getMatchTimerState,
  subscribeToMatch, subscribeToMatchState
} from '../firebase/firestore';

// ─── STORE ────────────────────────────────────────────────────────────────────

const DEFAULT_TIMER_STATE = {
  isRunning: false,
  startTimestamp: null,
  elapsedMs: 0,
};

const useMatchStore = create(
  persist(
    (set, get) => ({
      activeMatchId: null,
      match: null,
      timerState: DEFAULT_TIMER_STATE,
      goalModal: null,
      unsubscribeMatch: null,
      unsubscribeState: null,

      async loadMatch(matchId) {
        const { unsubscribeMatch } = get();
        if (unsubscribeMatch) unsubscribeMatch();
        const [match, timerState] = await Promise.all([
          getMatch(matchId),
          getMatchTimerState(matchId),
        ]);
        if (!match) return;
        set({
          activeMatchId: matchId,
          match,
          timerState: {
            ...DEFAULT_TIMER_STATE,
            isRunning: timerState?.isRunning || false,
            startTimestamp: timerState?.startTimestamp || null,
            elapsedMs: timerState?.elapsedMs || 0,
          },
        });
        const unsub = subscribeToMatch(matchId, (updatedMatch) => {
          if (updatedMatch) set({ match: updatedMatch });
        });
        const unsubState = subscribeToMatchState(matchId, (state) => {
          if (state) {
            set({
              timerState: {
                isRunning: state.isRunning || false,
                startTimestamp: state.startTimestamp || null,
                elapsedMs: state.elapsedMs || 0,
              }
            });
          }
        });
        set({ unsubscribeMatch: unsub, unsubscribeState: unsubState });
      },

      unloadMatch() {
        const { unsubscribeMatch, unsubscribeState } = get();
        if (unsubscribeMatch) unsubscribeMatch();
        if (unsubscribeState) unsubscribeState();
        set({
          activeMatchId: null,
          match: null,
          unsubscribeMatch: null,
          unsubscribeState: null,
          goalModal: null,
          timerState: DEFAULT_TIMER_STATE,
        });
      },

      startTimer() {
        const { timerState } = get();
        if (timerState.isRunning) return;
        const newState = { ...timerState, isRunning: true, startTimestamp: Date.now() };
        set({ timerState: newState });
        get()._syncTimer(newState);
      },

      pauseTimer() {
        const { timerState } = get();
        if (!timerState.isRunning) return;
        const elapsed = Date.now() - timerState.startTimestamp;
        const newState = { ...timerState, isRunning: false, startTimestamp: null, elapsedMs: timerState.elapsedMs + elapsed };
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

      openGoalModal(team, minute) { set({ goalModal: { team, minute } }); },
      closeGoalModal() { set({ goalModal: null }); },

      async recordGoal({ team, scorerId, scorerName, assistId, assistName, gkConcededId, gkConcededName }) {
        const { activeMatchId, match, getElapsedSeconds } = get();
        if (!activeMatchId || !match) return;
        const minute = Math.floor(getElapsedSeconds() / 60);
        const goalEvent = {
          id: crypto.randomUUID(),
          type: 'goal',
          team, scorerId, scorerName,
          assistId: assistId || null,
          assistName: assistName || null,
          gkConcededId: gkConcededId || null,
          gkConcededName: gkConcededName || null,
          minute,
          timestamp: Date.now(),
        };
        const redScore = team === 'red' ? (match.redScore || 0) + 1 : (match.redScore || 0);
        const blueScore = team === 'blue' ? (match.blueScore || 0) + 1 : (match.blueScore || 0);
        const events = [...(match.events || []), goalEvent];
        await updateMatch(activeMatchId, { events, redScore, blueScore });
        set({ match: { ...match, events, redScore, blueScore }, goalModal: null });
      },

      async recordAutogoal({ team, scorerId, scorerName, gkConcededId, gkConcededName }) {
        const { activeMatchId, match, getElapsedSeconds } = get();
        if (!activeMatchId || !match) return;
        const minute = Math.floor(getElapsedSeconds() / 60);
        const autogoalEvent = {
          id: crypto.randomUUID(),
          type: 'autogoal',
          team, scorerId, scorerName,
          gkConcededId: gkConcededId || null,
          gkConcededName: gkConcededName || null,
          minute, timestamp: Date.now(),
        };
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
        let redScore = 0, blueScore = 0;
        for (const ev of events) {
          if (ev.type === 'goal') { if (ev.team === 'red') redScore++; else blueScore++; }
          else if (ev.type === 'autogoal') { if (ev.team === 'red') blueScore++; else redScore++; }
        }
        await updateMatch(activeMatchId, { events, redScore, blueScore });
        set({ match: { ...match, events, redScore, blueScore } });
      },

      async endMatch() {
        const { activeMatchId, match, timerState } = get();
        if (!activeMatchId || !match) return;
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
      }),
    }
  )
);

export default useMatchStore;
