/**
 * Developer-only UI flags — persisted in AsyncStorage so toggling
 * survives an app reload.
 *
 * Currently controls visibility of the Debug and Manual-Edit tabs on
 * the Generate Report screen. Both default to OFF — the tabs are
 * developer-facing surfaces that we don't want shipped to end users
 * until they explicitly opt in via the Developer screen.
 */
import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DEBUG_TAB_KEY = 'harpa.dev_flags.generate_debug_tab.v1';
const EDIT_TAB_KEY = 'harpa.dev_flags.generate_edit_tab.v1';

export interface UseDeveloperFlagsApi {
  showGenerateDebugTab: boolean;
  setShowGenerateDebugTab: (next: boolean) => void;
  showGenerateEditTab: boolean;
  setShowGenerateEditTab: (next: boolean) => void;
  /** True once the AsyncStorage round-trip completes. */
  isLoaded: boolean;
}

function parseBool(value: string | null, fallback: boolean): boolean {
  if (value === null) return fallback;
  return value === '1';
}

export function useDeveloperFlags(): UseDeveloperFlagsApi {
  const [showGenerateDebugTab, setDebug] = useState(false);
  const [showGenerateEditTab, setEdit] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      AsyncStorage.getItem(DEBUG_TAB_KEY),
      AsyncStorage.getItem(EDIT_TAB_KEY),
    ]).then(([debugVal, editVal]) => {
      if (cancelled) return;
      setDebug(parseBool(debugVal, false));
      setEdit(parseBool(editVal, false));
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

  const setShowGenerateEditTab = useCallback((next: boolean) => {
    setEdit(next);
    void AsyncStorage.setItem(EDIT_TAB_KEY, next ? '1' : '0');
  }, []);

  return {
    showGenerateDebugTab,
    setShowGenerateDebugTab,
    showGenerateEditTab,
    setShowGenerateEditTab,
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
  editTab: EDIT_TAB_KEY,
} as const;
