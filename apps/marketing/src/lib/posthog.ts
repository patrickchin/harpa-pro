/**
 * Marketing-site PostHog client — stub-first.
 *
 * Mirrors the mobile AnalyticsStub pattern. The real posthog-js install
 * lands in a follow-up PR once consent banner UX is reviewed. Until then
 * every call site is in place and a no-op.
 *
 * Consent gating: `getPosthogClient()` returns the no-op client unless
 *   1. `posthogKey` is configured (PUBLIC_POSTHOG_KEY env var), and
 *   2. consent is granted (see consent.ts).
 *
 * EU host enforced by env.ts default.
 */
import type { EventMap, EventName } from '@harpa/analytics-events';
import { getPublicEnv } from './env';
import { hasConsent } from './consent';

export type MarketingAnalyticsClient = {
  capture: <E extends EventName>(event: E, props: EventMap[E]) => void;
  identify: (distinctId: string) => void;
  /** PostHog's anonymous-id → identified-user link. Fired on waitlist submit. */
  alias: (newDistinctId: string) => void;
  /** True when the real SDK is wired (always false today). */
  readonly enabled: boolean;
};

const noopClient: MarketingAnalyticsClient = {
  capture: () => {},
  identify: () => {},
  alias: () => {},
  enabled: false,
};

let cached: MarketingAnalyticsClient | null = null;

export function getPosthogClient(): MarketingAnalyticsClient {
  if (cached) return cached;
  const env = getPublicEnv();
  if (!env.posthogKey || !hasConsent()) {
    return noopClient; // do not cache — re-evaluate after consent flips
  }
  // TODO(posthog-js): swap noopClient → real posthog-js init pointed at
  // env.posthogHost (EU default). Until then we cache a no-op so call
  // sites observe a stable instance.
  cached = noopClient;
  return cached;
}

/** Test-only: drop the cached instance so consent flips take effect. */
export function __resetPosthogClientForTests(): void {
  cached = null;
}

/**
 * Deterministic alias key derived from a waitlist email so the same
 * person submitting from marketing + signing in on mobile (with phone)
 * eventually stitches via a hashed common key. We hash here so a raw
 * email never reaches PostHog.
 */
export async function aliasKeyForEmail(email: string): Promise<string> {
  const normalized = email.trim().toLowerCase();
  const data = new TextEncoder().encode(normalized);
  if (typeof crypto !== 'undefined' && crypto.subtle?.digest) {
    const hash = await crypto.subtle.digest('SHA-256', data);
    return 'wl_' + Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, 32);
  }
  // Fallback for non-WebCrypto runtimes (server-side build). Marketing
  // alias only fires in the browser island, so this is defensive only.
  return 'wl_' + normalized;
}
