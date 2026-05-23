/**
 * Marketing-site analytics consent.
 *
 * The site already runs Cloudflare Web Analytics (cookieless, no banner
 * required). PostHog adds first-party cookies → we need explicit consent.
 *
 * Storage: localStorage key `harpa.analytics.consent.v1`. SSR-safe
 * (returns false on the server). Three states encoded as the raw value:
 *   - missing key → 'unknown' (show banner)
 *   - '1' → 'granted'
 *   - '0' → 'declined'
 *
 * Listeners fire synchronously so the client-island PostHog init can
 * react to a granted decision without a page reload.
 */
export type ConsentState = 'unknown' | 'granted' | 'declined';

const KEY = 'harpa.analytics.consent.v1';
const listeners = new Set<(s: ConsentState) => void>();

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function getConsent(): ConsentState {
  if (!isBrowser()) return 'unknown';
  const raw = window.localStorage.getItem(KEY);
  if (raw === '1') return 'granted';
  if (raw === '0') return 'declined';
  return 'unknown';
}

export function hasConsent(): boolean {
  return getConsent() === 'granted';
}

export function setConsent(s: Exclude<ConsentState, 'unknown'>): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(KEY, s === 'granted' ? '1' : '0');
  for (const l of listeners) l(s);
}

export function subscribeToConsent(l: (s: ConsentState) => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function __resetConsentForTests(): void {
  if (isBrowser()) window.localStorage.removeItem(KEY);
  listeners.clear();
}
