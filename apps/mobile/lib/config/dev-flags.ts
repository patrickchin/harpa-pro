/**
 * Developer-only UI flags — persisted in AsyncStorage so toggling
 * survives an app reload.
 *
 * Currently controls visibility of the Debug tab on the Generate Report
 * screen. It defaults to OFF because it is a developer-facing surface.
 */
import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DEBUG_TAB_KEY = 'harpa.dev_flags.generate_debug_tab.v1';

export interface UseDeveloperFlagsApi {
  showGenerateDebugTab: boolean;
  setShowGenerateDebugTab: (next: boolean) => void;
  /** True once the AsyncStorage round-trip completes. */
  isLoaded: boolean;
}

function parseBool(value: string | null, fallback: boolean): boolean {
  if (value === null) return fallback;
  return value === '1';
}

export function useDeveloperFlags(): UseDeveloperFlagsApi {
  const [showGenerateDebugTab, setDebug] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void AsyncStorage.getItem(DEBUG_TAB_KEY).then((debugVal) => {
      if (cancelled) return;
      setDebug(parseBool(debugVal, false));
      setIsLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setShowGenerateDebugTab = useCallback((next: boolean) => {
    setDebug(next);
    void AsyncStorage.setItem(DEBUG_TAB_KEY, next ? '1' : '0');
  }, []);

  return {
    showGenerateDebugTab,
    setShowGenerateDebugTab,
    isLoaded,
  };
}

/**
 * Snapshot-only accessor for components that need the flags without
 * subscribing to re-renders from the hook. Kept narrow on purpose —
 * the canonical source of truth is `useDeveloperFlags`.
 */
export const DEV_FLAG_STORAGE_KEYS = {
  debugTab: DEBUG_TAB_KEY,
} as const;
