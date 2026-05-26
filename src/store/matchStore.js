import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import toast from 'react-hot-toast';
import {
  createMatch, updateMatch, getMatch,
  saveMatchTimerState, getMatchTimerState,
  subscribeToMatch, subscribeToMatchState,
  recordGoalEvent, deleteGoalEvent, recordChronicleEvent,
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
      _loadToken: 0,

      async loadMatch(matchId) {
        const { unsubscribeMatch, unsubscribeState } = get();
        if (unsubscribeMatch) unsubscribeMatch();
        if (unsubscribeState) unsubscribeState();
        // Cancellation token: stale loads/subscriptions are silently ignored
        const token = Date.now() + Math.random();
        set({ _loadToken: token, unsubscribeMatch: null, unsubscribeState: null });
        try {
          const [match, timerState] = await Promise.all([
            getMatch(matchId),
            getMatchTimerState(matchId),
          ]);
          if (get()._loadToken !== token) return; // superseded by a newer loadMatch call
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
            if (get()._loadToken !== token) return;
            if (updatedMatch) set({ match: updatedMatch });
          });
          const unsubState = subscribeToMatchState(matchId, (state) => {
            if (get()._loadToken !== token) return;
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
        } catch (e) {
          if (get()._loadToken !== token) return;
          toast.error('Impossibile caricare la partita');
        }
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
        get()._syncTimer(newState).catch(e => console.warn('[timer-sync]', e?.code || e?.message || e));
      },

      pauseTimer() {
        const { timerState } = get();
        if (!timerState.isRunning) return;
        const elapsed = Date.now() - timerState.startTimestamp;
        const newState = { ...timerState, isRunning: false, startTimestamp: null, elapsedMs: timerState.elapsedMs + elapsed };
        set({ timerState: newState });
        get()._syncTimer(newState).catch(e => console.warn('[timer-sync]', e?.code || e?.message || e));
      },

      getElapsedMs() {
        const { timerState } = get();
        if (!timerState.isRunning) return timerState.elapsedMs;
        // Guard: stato corrotto (isRunning=true ma startTimestamp=null) farebbe
        // tornare NaN, che a sua volta produrrebbe `minute: NaN` negli eventi
        // → Firestore rifiuta NaN nei campi number.
        if (!timerState.startTimestamp) return timerState.elapsedMs;
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
        // Optimistic update immediato — la subscription Firestore confermerà la verità
        const redScore = team === 'red' ? (match.redScore || 0) + 1 : (match.redScore || 0);
        const blueScore = team === 'blue' ? (match.blueScore || 0) + 1 : (match.blueScore || 0);
        set({ match: { ...match, events: [...(match.events || []), goalEvent], redScore, blueScore } });
        // Scrittura atomica: arrayUnion + increment prevengono race condition
        await recordGoalEvent(activeMatchId, goalEvent);
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
        // Autogoal: la squadra avversaria segna
        const redScore = team === 'blue' ? (match.redScore || 0) + 1 : (match.redScore || 0);
        const blueScore = team === 'red' ? (match.blueScore || 0) + 1 : (match.blueScore || 0);
        set({ match: { ...match, events: [...(match.events || []), autogoalEvent], redScore, blueScore } });
        await recordGoalEvent(activeMatchId, autogoalEvent);
      },

      async recordInjury({ playerId, playerName, team }) {
        const { activeMatchId, match, getElapsedSeconds } = get();
        if (!activeMatchId || !match) return;
        const minute = Math.floor(getElapsedSeconds() / 60);
        const injuryEvent = {
          id: crypto.randomUUID(),
          type: 'injury',
          team,
          playerId, playerName,
          minute, timestamp: Date.now(),
        };
        set({ match: { ...match, events: [...(match.events || []), injuryEvent] } });
        try {
          await recordChronicleEvent(activeMatchId, injuryEvent);
        } catch (e) {
          // Rollback letto dallo stato corrente per evitare di sovrascrivere
          // update arrivati dalla subscription tra l'optimistic set e l'errore.
          const cur = get().match;
          if (cur && (cur.events || []).some(ev => ev.id === injuryEvent.id)) {
            set({ match: { ...cur, events: (cur.events || []).filter(ev => ev.id !== injuryEvent.id) } });
          }
          throw e;
        }
      },

      async deleteEvent(eventId) {
        const { activeMatchId, match } = get();
        if (!activeMatchId || !match) return;
        const event = (match.events || []).find(e => e.id === eventId);
        if (!event) return;
        // Optimistic update
        const events = (match.events || []).filter(e => e.id !== eventId);
        let redScore = 0, blueScore = 0;
        for (const ev of events) {
          if (ev.type === 'goal') { if (ev.team === 'red') redScore++; else blueScore++; }
          else if (ev.type === 'autogoal') { if (ev.team === 'red') blueScore++; else redScore++; }
        }
        set({ match: { ...match, events, redScore, blueScore } });
        try {
          // Atomic removal via arrayRemove + decrement (no race with concurrent recordGoalEvent)
          await deleteGoalEvent(activeMatchId, event);
        } catch (e) {
          // Rollback letto dallo stato corrente (evita di sovrascrivere update arrivati
          // dalla subscription Firestore tra l'optimistic set e l'errore).
          const cur = get().match;
          if (cur && !(cur.events || []).some(ev => ev.id === eventId)) {
            const restoredEvents = [...(cur.events || []), event];
            let r = 0, b = 0;
            for (const ev of restoredEvents) {
              if (ev.type === 'goal') { if (ev.team === 'red') r++; else b++; }
              else if (ev.type === 'autogoal') { if (ev.team === 'red') b++; else r++; }
            }
            set({ match: { ...cur, events: restoredEvents, redScore: r, blueScore: b } });
          }
          throw e;
        }
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
