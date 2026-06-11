import { useEffect, useState } from 'react';
import { subscribeToMatches } from '../firebase/firestore';

/**
 * Subscribes to the Firestore matches collection and returns the live array.
 * Re-subscribes when the app returns to foreground to recover from dropped
 * WebSocket connections (common on mobile PWAs).
 */
export function useMatchesSubscription(initialState = []) {
  const [matches, setMatches] = useState(initialState);
  const [subVersion, setSubVersion] = useState(0);
  useEffect(() => subscribeToMatches(setMatches), [subVersion]);
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') setSubVersion(v => v + 1);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);
  return matches;
}
