/**
 * Shared PostHog feature flag keys.
 *
 * Two categories:
 *   1. Boolean kill-switches — replace the `*_LIVE` / `REQUEST_LOG`
 *      env vars currently in Doppler.
 *   2. Multivariate mode flags — replace the `*_FIXTURE_MODE` env
 *      vars in Doppler.
 *
 * See docs/v4/arch-analytics.md for the full classification of what
 * stays in Doppler (real secrets), what stays in env (boot config),
 * and what moves here (runtime-toggleable behavior).
 */

export const BOOLEAN_FLAGS = {
  TWILIO_LIVE: 'twilio-live',
  AI_LIVE: 'ai-live',
  TURNSTILE_LIVE: 'turnstile-live',
  RESEND_LIVE: 'resend-live',
  API_REQUEST_LOG: 'api-request-log',
} as const;

export const VARIANT_FLAGS = {
  AI_FIXTURE_MODE: 'ai-fixture-mode',
  R2_FIXTURE_MODE: 'r2-fixture-mode',
} as const;

export type BooleanFlagKey = (typeof BOOLEAN_FLAGS)[keyof typeof BOOLEAN_FLAGS];
export type VariantFlagKey = (typeof VARIANT_FLAGS)[keyof typeof VARIANT_FLAGS];

export const AI_FIXTURE_VARIANTS = ['replay', 'record', 'live'] as const;
export type AiFixtureVariant = (typeof AI_FIXTURE_VARIANTS)[number];

export const R2_FIXTURE_VARIANTS = ['replay', 'live'] as const;
export type R2FixtureVariant = (typeof R2_FIXTURE_VARIANTS)[number];

/**
 * Fail-safe defaults if PostHog is unreachable on cold boot AND there is
 * no on-disk cache. Chosen to never accidentally bill a paid provider
 * during an outage.
 */
export const FLAG_FAILSAFE_DEFAULTS = {
  [BOOLEAN_FLAGS.TWILIO_LIVE]: false,
  [BOOLEAN_FLAGS.AI_LIVE]: false,
  [BOOLEAN_FLAGS.TURNSTILE_LIVE]: false,
  [BOOLEAN_FLAGS.RESEND_LIVE]: false,
  [BOOLEAN_FLAGS.API_REQUEST_LOG]: false,
  [VARIANT_FLAGS.AI_FIXTURE_MODE]: 'replay' as AiFixtureVariant,
  [VARIANT_FLAGS.R2_FIXTURE_MODE]: 'replay' as R2FixtureVariant,
} as const;
