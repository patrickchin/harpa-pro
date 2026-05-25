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

const Env = z.object({
  EXPO_PUBLIC_API_URL: z
    .string()
    .url()
    .default('http://localhost:8787'),
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
});

/* eslint-disable no-restricted-syntax */
const rawEnv = {
  EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
  EXPO_PUBLIC_USE_FIXTURES: process.env.EXPO_PUBLIC_USE_FIXTURES,
  EXPO_PUBLIC_APP_VARIANT: process.env.EXPO_PUBLIC_APP_VARIANT,
  EXPO_PUBLIC_LAYOUT_PROBE: process.env.EXPO_PUBLIC_LAYOUT_PROBE,
};
/* eslint-enable no-restricted-syntax */

const parsed = Env.safeParse(rawEnv);
if (!parsed.success) {
  // Fail loud at module load — surfaces missing config before the first screen renders.
  throw new Error(`[env] invalid environment configuration: ${parsed.error.message}`);
}

export const env = parsed.data;
export type AppEnv = typeof env;
