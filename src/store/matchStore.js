import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import toast from 'react-hot-toast';
import {
  createMatch, updateMatch, getMatch,
  saveMatchTimerState, getMatchTimerState,
  subscribeToMatch, subscribeToMatchState,
  recordGoalEvent, deleteGoalEvent, recordChronicleEvent,
} from '../firebase/firestore';
import { scoreFromEvents } from '../utils/matchScore';

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

      // Aggiunge un evento con optimistic update + rollback in caso di errore.
      // Il punteggio è SEMPRE derivato dagli eventi (scoreFromEvents) — niente
      // increment manuale, così local state ed eventi non possono divergere.
      async _appendEvent(event, persist) {
        const { activeMatchId, match } = get();
        if (!activeMatchId || !match) return;
        const events = [...(match.events || []), event];
        set({ match: { ...match, events, ...scoreFromEvents(events) } });
        try {
          await persist(activeMatchId, event);
        } catch (e) {
          // Rollback dallo stato CORRENTE (non dal closure): evita di sovrascrivere
          // update arrivati dalla subscription Firestore tra l'optimistic set e l'errore.
          const cur = get().match;
          if (cur && (cur.events || []).some(ev => ev.id === event.id)) {
            const rolled = (cur.events || []).filter(ev => ev.id !== event.id);
            set({ match: { ...cur, events: rolled, ...scoreFromEvents(rolled) } });
          }
          throw e;
        }
      },

      async recordGoal({ team, scorerId, scorerName, assistId, assistName, gkConcededId, gkConcededName }) {
        const minute = Math.floor(get().getElapsedSeconds() / 60);
        await get()._appendEvent({
          id: crypto.randomUUID(),
          type: 'goal',
          team, scorerId, scorerName,
          assistId: assistId || null,
          assistName: assistName || null,
          gkConcededId: gkConcededId || null,
          gkConcededName: gkConcededName || null,
          minute,
          timestamp: Date.now(),
        }, recordGoalEvent);
      },

      async recordAutogoal({ team, scorerId, scorerName, gkConcededId, gkConcededName }) {
        const minute = Math.floor(get().getElapsedSeconds() / 60);
        await get()._appendEvent({
          id: crypto.randomUUID(),
          type: 'autogoal',
          team, scorerId, scorerName,
          gkConcededId: gkConcededId || null,
          gkConcededName: gkConcededName || null,
          minute, timestamp: Date.now(),
        }, recordGoalEvent);
      },

      async recordInjury({ playerId, playerName, team }) {
        const minute = Math.floor(get().getElapsedSeconds() / 60);
        await get()._appendEvent({
          id: crypto.randomUUID(),
          type: 'injury',
          team,
          playerId, playerName,
          minute, timestamp: Date.now(),
        }, recordChronicleEvent);
      },

      async deleteEvent(eventId) {
        const { activeMatchId, match } = get();
        if (!activeMatchId || !match) return;
        const event = (match.events || []).find(e => e.id === eventId);
        if (!event) return;
        // Optimistic removal — punteggio ri-derivato dagli eventi rimasti
        const events = (match.events || []).filter(e => e.id !== eventId);
        set({ match: { ...match, events, ...scoreFromEvents(events) } });
        try {
          // Atomic removal via arrayRemove + decrement (no race with concurrent recordGoalEvent)
          await deleteGoalEvent(activeMatchId, event);
        } catch (e) {
          // Rollback dallo stato corrente (evita di sovrascrivere update arrivati
          // dalla subscription Firestore tra l'optimistic set e l'errore).
          const cur = get().match;
          if (cur && !(cur.events || []).some(ev => ev.id === eventId)) {
            const restoredEvents = [...(cur.events || []), event];
            set({ match: { ...cur, events: restoredEvents, ...scoreFromEvents(restoredEvents) } });
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
