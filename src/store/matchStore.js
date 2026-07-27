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
import { getMs } from '../utils/dateUtils';
import { deriveEventMinute, maxEventMinute } from '../utils/eventMinute';

// ─── STORE ────────────────────────────────────────────────────────────────────

const DEFAULT_TIMER_STATE = {
  isRunning: false,
  startTimestamp: null,
  elapsedMs: 0,
};

// Minuto dell'evento: cronometro manuale se usato, altrimenti fallback sul
// tempo reale da match.date (validato). `lastEventMinute` garantisce la
// monotonicità della cronaca anche se il cronometro viene avviato DOPO gol
// registrati col fallback (logica pura in utils/eventMinute.js).
function _minuteFromTimer(get) {
  const { timerState, match } = get();
  return deriveEventMinute({
    elapsedSeconds: get().getElapsedSeconds(),
    isRunning: timerState.isRunning,
    matchDateMs: getMs(match?.date),
    nowMs: Date.now(),
    lastEventMinute: maxEventMinute(match?.events),
  });
}

// Il punteggio live si deriva SEMPRE dagli eventi (source of truth, vedi
// scoreFromEvents): i campi redScore/blueScore del doc sono mantenuti via
// increment() e in rari casi concorrenti possono driftare (es. due admin che
// eliminano lo stesso evento → doppio decrement). Per i doc senza eventi e non
// attivi (legacy/storici) si rispettano i campi del doc.
function withDerivedScore(m) {
  if (!m) return m;
  if (m.status === 'active' || (Array.isArray(m.events) && m.events.length > 0)) {
    return { ...m, ...scoreFromEvents(m.events || []) };
  }
  return m;
}

const useMatchStore = create(
  persist(
    (set, get) => ({
      activeMatchId: null,
      match: null,
      timerState: DEFAULT_TIMER_STATE,
      goalModal: null,
      unsubscribeMatch: null,
      unsubscribeState: null,
      // null | 'not-found' | 'load-failed' — permette alla MatchPage di mostrare
      // un errore con "Riprova" invece di uno spinner infinito.
      loadError: null,
      _loadToken: 0,

      async loadMatch(matchId) {
        const { unsubscribeMatch, unsubscribeState } = get();
        if (unsubscribeMatch) unsubscribeMatch();
        if (unsubscribeState) unsubscribeState();
        // Cancellation token: stale loads/subscriptions are silently ignored
        const token = Date.now() + Math.random();
        // Refresh della stessa partita già in store (es. ritorno in foreground):
        // niente overwrite di match/timerState dal getDoc — i dati arrivano dalle
        // nuove subscription (latency-compensated: non perdono gli optimistic
        // update né resettano il cronometro se una read fallisce).
        const isRefresh = get().activeMatchId === matchId && !!get().match;
        set({ _loadToken: token, loadError: null, unsubscribeMatch: null, unsubscribeState: null });

        const subscribe = () => {
          const unsub = subscribeToMatch(matchId, (updatedMatch) => {
            if (get()._loadToken !== token) return;
            if (updatedMatch) set({ match: withDerivedScore(updatedMatch) });
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
        };

        if (isRefresh) {
          subscribe();
          // Il getDoc serve solo a riattivare il transport dopo un background
          // prolungato (il WebChannel sospeso può impiegare 30-60s a riprendersi
          // da solo): l'esito non tocca lo stato, mai errori all'utente qui.
          getMatch(matchId).catch(() => {});
          return;
        }

        try {
          const [match, timerState] = await Promise.all([
            getMatch(matchId),
            // Non-fatale: offline con cache miss (es. partita appena creata il cui
            // matchStates non esiste ancora) getDoc rigetta — senza questo catch
            // l'intero load fallirebbe pur avendo il match disponibile in cache.
            getMatchTimerState(matchId).catch(() => null),
          ]);
          if (get()._loadToken !== token) return; // superseded by a newer loadMatch call
          if (!match) { set({ loadError: 'not-found' }); return; }
          set({
            activeMatchId: matchId,
            match: withDerivedScore(match),
            timerState: {
              ...DEFAULT_TIMER_STATE,
              isRunning: timerState?.isRunning || false,
              startTimestamp: timerState?.startTimestamp || null,
              elapsedMs: timerState?.elapsedMs || 0,
            },
          });
          subscribe();
        } catch (e) {
          if (get()._loadToken !== token) return;
          set({ loadError: 'load-failed' });
          toast.error('Impossibile caricare la partita');
        }
      },

      unloadMatch() {
        const { unsubscribeMatch, unsubscribeState } = get();
        if (unsubscribeMatch) unsubscribeMatch();
        if (unsubscribeState) unsubscribeState();
        set({
          // Invalida anche i loadMatch ancora in volo: senza questo, un load
          // partito prima dell'unmount (es. da visibilitychange) completerebbe
          // DOPO l'unload risuscitando match/activeMatchId e creando subscription
          // orfane che nessuna pagina possiede più.
          _loadToken: Date.now() + Math.random(),
          activeMatchId: null,
          match: null,
          unsubscribeMatch: null,
          unsubscribeState: null,
          goalModal: null,
          loadError: null,
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
        // getElapsedMs è già protetto contro startTimestamp null/futuro: evita
        // di scrivere NaN o valori negativi in elapsedMs (Firestore rifiuta NaN
        // e un valore corrotto persisterebbe via localStorage + matchStates).
        const newState = { ...timerState, isRunning: false, startTimestamp: null, elapsedMs: get().getElapsedMs() };
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
        // Math.max: startTimestamp nel futuro (clock skew tra device che condividono
        // matchStates, o regressione dell'orologio) non deve produrre tempi negativi.
        return timerState.elapsedMs + Math.max(0, Date.now() - timerState.startTimestamp);
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
        const minute = _minuteFromTimer(get);
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
        const minute = _minuteFromTimer(get);
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
        const minute = _minuteFromTimer(get);
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
        const { activeMatchId, timerState } = get();
        const m = get().match;
        if (!activeMatchId || !m) return;
        if (timerState.isRunning) get().pauseTimer();
        // Punteggio finale normalizzato dagli eventi (source of truth): self-heal
        // di eventuali drift dei campi increment del doc — classifiche e stats
        // leggono redScore/blueScore dal documento. Gli eventi NON si riscrivono
        // mai in blocco qui: un evento concorrente non ancora visto localmente
        // verrebbe cancellato (arrayUnion resta l'unica via di scrittura eventi).
        const finalScore = scoreFromEvents(m.events || []);
        const written = updateMatch(activeMatchId, { status: 'finished', endedAt: Date.now(), ...finalScore });
        // Optimistic: lo stato locale è subito 'finished'. Offline la write resta
        // in coda (persistenza IndexedDB) e si sincronizza da sola; se il server
        // la rifiutasse, la subscription riconsegna il doc reale e si ricorregge.
        const cur = get().match;
        if (cur) set({ match: { ...cur, status: 'finished', ...finalScore } });
        await written;
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
