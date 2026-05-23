/**
 * withAnalytics: attaches the analytics client and flag source to the
 * request context. Routes capture events via `c.var.analytics` and
 * read flags via `c.var.flags`. Both are guaranteed non-null and
 * safe to call — the stubs are no-ops when PostHog is unconfigured.
 *
 * `distinctId` is derived from the authed JWT when present; falls
 * back to the `X-Device-Id` request header for pre-auth routes; falls
 * back to `anonymous` as a last resort. Captures with `anonymous` are
 * dropped by the no-op stub anyway.
 */
import type { MiddlewareHandler } from 'hono';
import type { Context } from 'hono';
import type { AppEnv } from '../app.js';
import { getAnalyticsClient, type AnalyticsClient } from '../lib/posthog.js';
import { getFlagSource, type FlagSource } from '../lib/flags.js';
import type { BooleanFlagKey, VariantFlagKey } from '@harpa/analytics-events';

export function withAnalytics(opts?: {
  analytics?: AnalyticsClient;
  flags?: FlagSource;
}): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const analytics = opts?.analytics ?? getAnalyticsClient();
    const flags = opts?.flags ?? getFlagSource();

    const userId = c.get('userId');
    const deviceId = c.req.header('x-device-id');
    const distinctId = userId ?? deviceId ?? 'anonymous';

    c.set('analytics', analytics);
    c.set('flags', flags);
    c.set('distinctId', distinctId);

    await next();
  };
}

/**
 * Route helper — read a boolean kill-switch flag for the current request.
 * Always returns a value; never throws. Uses the failsafe default when
 * the FlagSource has nothing cached.
 */
export function isFeatureEnabled(
  c: Context<AppEnv>,
  key: BooleanFlagKey,
  defaultValue?: boolean,
): boolean {
  const flags = c.get('flags');
  if (!flags) return defaultValue ?? false;
  return flags.getBooleanFlag(key, defaultValue);
}

/**
 * Route helper — read a multivariate flag (e.g. `ai-fixture-mode`).
 * `defaultVariant` MUST be a valid variant for the flag.
 */
export function getFeatureVariant<V extends string>(
  c: Context<AppEnv>,
  key: VariantFlagKey,
  defaultVariant: V,
): V {
  const flags = c.get('flags');
  if (!flags) return defaultVariant;
  return flags.getVariantFlag(key, defaultVariant);
}
