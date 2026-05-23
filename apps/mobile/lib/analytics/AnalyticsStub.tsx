/**
 * Mobile analytics — PostHog stub.
 *
 * Mirrors lib/telemetry/SentryStub.tsx: ship the provider/hook surface
 * and the consent + identify plumbing now, swap the real
 * `posthog-react-native` client in as a follow-up PR. The native module
 * forces an EAS dev-client rebuild, so the install lands separately
 * once this review is merged.
 *
 * What's wired today:
 *   - Consent toggle persisted in expo-secure-store (default ON).
 *   - AnalyticsProvider gates on consent + !EXPO_PUBLIC_USE_FIXTURES +
 *     EXPO_PUBLIC_POSTHOG_KEY presence.
 *   - useAnalytics() returns { capture, identify, reset } — all no-ops
 *     until the real client is wired, but every call site is in place.
 *   - useFeatureFlag(key) returns the failsafe default from
 *     @harpa/analytics-events. Swapped to real evaluation alongside the
 *     SDK install.
 *
 * Why a stub and not the real SDK: see docs/v4/pitfalls.md Pitfall 18
 * (fixture pollution) and Pitfall 19 (key rotation requires EAS
 * rebuild). The provider boundary here is the contract; swapping
 * implementations later requires no caller changes.
 */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  type EventMap,
  type EventName,
  FLAG_FAILSAFE_DEFAULTS,
  type BooleanFlagKey,
  type VariantFlagKey,
} from '@harpa/analytics-events';
import { env } from '@/lib/env';
import { getConsent, subscribeToConsent } from './consent';

export type AnalyticsClient = {
  capture: <E extends EventName>(event: E, props: EventMap[E]) => void;
  identify: (distinctId: string, traits?: Record<string, unknown>) => void;
  reset: () => void;
  /** Did the provider actually initialize a real SDK? false → no-op stub. */
  readonly enabled: boolean;
};

const noopClient: AnalyticsClient = {
  capture: () => {},
  identify: () => {},
  reset: () => {},
  enabled: false,
};

const AnalyticsContext = createContext<AnalyticsClient>(noopClient);

export function useAnalytics(): AnalyticsClient {
  return useContext(AnalyticsContext);
}

/**
 * Returns `true` if PostHog *would* be initialized given current env.
 * Used in tests + the consent settings screen.
 */
export function analyticsConfigured(): boolean {
  if (env.EXPO_PUBLIC_USE_FIXTURES) return false;
  if (!env.EXPO_PUBLIC_POSTHOG_KEY) return false;
  return true;
}

export function AnalyticsProvider({ children }: { children: ReactNode }) {
  const [consent, setConsent] = useState<boolean>(true);

  useEffect(() => {
    let mounted = true;
    getConsent().then((v) => {
      if (mounted) setConsent(v);
    });
    const unsub = subscribeToConsent((v) => {
      if (mounted) setConsent(v);
    });
    return () => {
      mounted = false;
      unsub();
    };
  }, []);

  const client = useMemo<AnalyticsClient>(() => {
    if (!consent || !analyticsConfigured()) return noopClient;
    // TODO(posthog-react-native): replace with real client once the
    // native module is installed. Keeping the boundary identical means
    // call sites do not change.
    return noopClient;
  }, [consent]);

  return <AnalyticsContext.Provider value={client}>{children}</AnalyticsContext.Provider>;
}

/**
 * Feature-flag hook. Returns the failsafe default until the SDK lands.
 * Generic over boolean | variant flag keys; the caller passes the
 * expected return type as the default.
 */
export function useFeatureFlag(key: BooleanFlagKey): boolean;
export function useFeatureFlag<V extends string>(key: VariantFlagKey, fallback: V): V;
export function useFeatureFlag(key: string, fallback?: string): boolean | string {
  // Stub: always return the static failsafe. The real implementation
  // bootstraps flags at app start and caches in expo-secure-store so
  // cold starts get the last-known value offline.
  const def = (FLAG_FAILSAFE_DEFAULTS as Record<string, boolean | string>)[key];
  if (typeof def === 'boolean') return def;
  if (typeof def === 'string') return def;
  return fallback ?? false;
}
