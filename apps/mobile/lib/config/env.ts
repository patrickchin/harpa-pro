/**
 * Centralised env access for the mobile app. Resolves Pitfall 5:
 * every screen used `process.env.EXPO_PUBLIC_*!` non-null assertions in v3,
 * which crashed at runtime when a var was missing.
 *
 * Rules (enforced by ESLint, see .eslintrc.cjs):
 *   - This file is the ONLY place that reads `process.env.EXPO_PUBLIC_*`.
 *   - All consumers import `env` from here.
 *   - EXPO_PUBLIC_* values are inlined at bundle time by Metro — changing
 *     them requires a full rebuild, not just a JS reload.
 */
import { z } from 'zod';

const optionalUrl = z.preprocess(
  (v) => (v === '' ? undefined : v),
  z.string().url().optional(),
);

const Env = z.object({
  EXPO_PUBLIC_API_URL: z
    .string()
    .url()
    .default('http://localhost:8787'),
  /**
   * Optional shell-level override for `EXPO_PUBLIC_API_URL`. Exists so
   * the PR-OTA workflow (`mobile-ota-pr.yml`) can keep using
   * `eas update --environment development` — which is needed to pull
   * EAS-managed Sentry vars for source-map upload — while still
   * pointing each PR's bundle at its own per-PR Fly preview app
   * (`harpa-pro-api-pr-<n>.fly.dev`). EAS-managed vars override the
   * workflow's shell vars when `--environment` is passed, but only
   * keys EAS *knows* about; this key is intentionally absent from
   * the EAS development environment so the shell value always wins.
   * Empty string is treated as unset.
   */
  EXPO_PUBLIC_API_URL_OVERRIDE: optionalUrl,
  EXPO_PUBLIC_USE_FIXTURES: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  /**
   * Build variant — drives bundle id + display name (app.config.ts) and
   * gates dev-only UI such as the API base URL override
   * (lib/api/base-url.ts). Set per-profile in eas.json. Falls back to
   * 'development' for local Metro / tests.
   */
  EXPO_PUBLIC_APP_VARIANT: z
    .enum(['production', 'preview', 'development'])
    .default('development'),
  /**
   * Dev-only flag that enables the layout-shift probe
   * (`lib/layout-shift-probe.ts`). When `true`, probes log Δy/Δheight
   * deltas to the Metro console. Ignored outside `__DEV__`. Off by
   * default so normal dev sessions stay quiet.
   */
  EXPO_PUBLIC_LAYOUT_PROBE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  /**
   * Store screenshot capture mode. Hides OS chrome such as notification,
   * clock, and battery icons, and uses deterministic screenshot-only
   * fixture paths where native device input would make capture flaky.
   * Intended for local Maestro screenshot runs only.
   */
  EXPO_PUBLIC_SCREENSHOT_MODE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  EXPO_PUBLIC_SENTRY_DSN: optionalUrl,
  /**
   * Set by `mobile-ota-pr.yml` when publishing a PR OTA bundle.
   * Absent (undefined) in dev, preview, and production builds.
   * Used by `buildInfo.prNumber` to label the BuildBadge without
   * parsing the API URL.
   */
  EXPO_PUBLIC_PR_NUMBER: z.coerce
    .number()
    .int()
    .positive()
    .optional(),
});

/* eslint-disable no-restricted-syntax */
const rawEnv = {
  EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
  EXPO_PUBLIC_API_URL_OVERRIDE: process.env.EXPO_PUBLIC_API_URL_OVERRIDE,
  EXPO_PUBLIC_USE_FIXTURES: process.env.EXPO_PUBLIC_USE_FIXTURES,
  EXPO_PUBLIC_APP_VARIANT: process.env.EXPO_PUBLIC_APP_VARIANT,
  EXPO_PUBLIC_LAYOUT_PROBE: process.env.EXPO_PUBLIC_LAYOUT_PROBE,
  EXPO_PUBLIC_SCREENSHOT_MODE: process.env.EXPO_PUBLIC_SCREENSHOT_MODE,
  EXPO_PUBLIC_SENTRY_DSN: process.env.EXPO_PUBLIC_SENTRY_DSN,
  EXPO_PUBLIC_PR_NUMBER: process.env.EXPO_PUBLIC_PR_NUMBER,
};
/* eslint-enable no-restricted-syntax */

const parsed = Env.safeParse(rawEnv);
if (!parsed.success) {
  // Fail loud at module load — surfaces missing config before the first screen renders.
  throw new Error(`[env] invalid environment configuration: ${parsed.error.message}`);
}

const data = parsed.data;
if (data.EXPO_PUBLIC_API_URL_OVERRIDE) {
  data.EXPO_PUBLIC_API_URL = data.EXPO_PUBLIC_API_URL_OVERRIDE;
}

export const env = data;
export type AppEnv = typeof env;
