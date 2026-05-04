import { useState, useEffect, useRef } from 'react';
import { subscribeToPIConfig } from '../firebase/firestore';
import { DEFAULT_PI_CONFIG } from '../utils/playerStats';

export function usePIConfig() {
  const [config, setConfig] = useState(DEFAULT_PI_CONFIG);
  const lastKeyRef = useRef(null);
  useEffect(() => {
    const unsub = subscribeToPIConfig(cfg => {
      const { updatedAt: _u, ...data } = cfg || {};
      const merged = cfg ? { ...DEFAULT_PI_CONFIG, ...data } : DEFAULT_PI_CONFIG;
      const key = JSON.stringify(merged);
      if (key !== lastKeyRef.current) {
        lastKeyRef.current = key;
        setConfig(merged);
      }
    });
    return unsub;
  }, []);
  return config;
}
