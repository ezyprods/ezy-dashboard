'use client';

import { useSyncExternalStore } from 'react';
import { getEqSettings, getServerEqSettings, subscribeEq } from '@/lib/audio/equalizer';

/** Live equalizer settings (persisted per device in localStorage). */
export function useEqualizer() {
  return useSyncExternalStore(subscribeEq, getEqSettings, getServerEqSettings);
}
