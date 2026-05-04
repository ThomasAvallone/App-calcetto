import { useState, useEffect } from 'react';
import { subscribeToPIConfig } from '../firebase/firestore';
import { DEFAULT_PI_CONFIG } from '../utils/playerStats';

export function usePIConfig() {
  const [config, setConfig] = useState(DEFAULT_PI_CONFIG);
  useEffect(() => {
    const unsub = subscribeToPIConfig(cfg => {
      setConfig(cfg ? { ...DEFAULT_PI_CONFIG, ...cfg } : DEFAULT_PI_CONFIG);
    });
    return unsub;
  }, []);
  return config;
}
