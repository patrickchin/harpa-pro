/**
 * API base URL resolution with optional runtime override.
 *
 * Why: EXPO_PUBLIC_* vars are inlined at Metro bundle time (Pitfall 5),
 * so re-pointing the app at a different backend would normally require
 * a full rebuild. In non-production builds we allow a runtime override
 * persisted in AsyncStorage so QA can flip between dev / a PR-preview
 * Fly app without a new EAS build.
 *
 * Production (App Store) builds hard-pin the inlined URL — the override
 * setter throws and `isApiOverrideEnabled()` returns false.
 *
 * Changing the base URL implies talking to a different database, so any
 * UI that flips it MUST also clear the auth session. This module is pure
 * storage; the security/session concern lives at the call site.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { env } from '../env';

const OVERRIDE_KEY = 'harpa.apiBaseUrl.override.v1';

/**
 * True for any build that should expose the override UI. Production
 * App Store builds always return false, regardless of __DEV__.
 */
export function isApiOverrideEnabled(): boolean {
  return env.EXPO_PUBLIC_APP_VARIANT !== 'production';
}

/**
 * Resolve the API base URL the next request should use.
 * Override → fallback to compile-time inlined env value.
 * Trailing slashes are stripped so callers can concatenate paths safely.
 */
export async function getApiBaseUrl(): Promise<string> {
  if (isApiOverrideEnabled()) {
    const override = await AsyncStorage.getItem(OVERRIDE_KEY);
    if (override) return stripTrailingSlash(override);
  }
  return stripTrailingSlash(env.EXPO_PUBLIC_API_URL);
}

/** Read just the override (no fallback). UI uses this to populate the form. */
export async function readApiBaseUrlOverride(): Promise<string | null> {
  if (!isApiOverrideEnabled()) return null;
  return AsyncStorage.getItem(OVERRIDE_KEY);
}

/** Persist an override URL, or clear it by passing `null`. */
export async function setApiBaseUrlOverride(url: string | null): Promise<void> {
  if (!isApiOverrideEnabled()) {
    throw new Error('API base URL override is disabled in production builds');
  }
  if (url === null) {
    await AsyncStorage.removeItem(OVERRIDE_KEY);
    return;
  }
  const trimmed = url.trim();
  if (!/^https?:\/\//.test(trimmed)) {
    throw new Error('Override must be an http(s) URL');
  }
  await AsyncStorage.setItem(OVERRIDE_KEY, trimmed);
}

function stripTrailingSlash(s: string): string {
  return s.replace(/\/+$/, '');
}

export const __keys = { OVERRIDE_KEY } as const;
