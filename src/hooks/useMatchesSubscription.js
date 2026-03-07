import { useEffect, useState } from 'react';
import { subscribeToMatches } from '../firebase/firestore';

/**
 * Subscribes to the Firestore matches collection and returns the live array.
 * Automatically unsubscribes on unmount.
 */
export function useMatchesSubscription(initialState = []) {
  const [matches, setMatches] = useState(initialState);
  useEffect(() => subscribeToMatches(setMatches), []);
  return matches;
}
