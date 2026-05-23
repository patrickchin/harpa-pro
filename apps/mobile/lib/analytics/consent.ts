/**
 * Analytics consent — persistent toggle.
 *
 * Default: ON. A one-time onboarding prompt + Settings entry let the
 * user opt out at any time. Persisted via expo-secure-store (same
 * primitive as the auth session — Pitfall 18 explicitly calls out that
 * AsyncStorage is wiped on iOS reinstall and we want consent to
 * survive that).
 *
 * Listeners are notified synchronously when the value changes so the
 * AnalyticsProvider can flip clients without a remount.
 */
import * as SecureStore from 'expo-secure-store';

const KEY = 'harpa.analytics.consent.v1';
type Listener = (granted: boolean) => void;
const listeners = new Set<Listener>();
let cached: boolean | null = null;

export async function getConsent(): Promise<boolean> {
  if (cached !== null) return cached;
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    cached = raw === null ? true : raw === '1';
  } catch {
    // SecureStore can fail in early bootstrap on some devices; default ON
    // matches our published privacy policy.
    cached = true;
  }
  return cached;
}

export async function setConsent(granted: boolean): Promise<void> {
  cached = granted;
  try {
    await SecureStore.setItemAsync(KEY, granted ? '1' : '0');
  } catch {
    // Best-effort persistence; the in-memory cache still drives the UI
    // for the current session.
  }
  for (const l of listeners) l(granted);
}

export function subscribeToConsent(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test-only helper — resets the cache + clears stored value. */
export async function __resetConsentForTests(): Promise<void> {
  cached = null;
  try {
    await SecureStore.deleteItemAsync(KEY);
  } catch {
    // ignore
  }
  listeners.clear();
}
