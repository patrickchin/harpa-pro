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
});

/* eslint-disable no-restricted-syntax */
const rawEnv = {
  EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
  EXPO_PUBLIC_USE_FIXTURES: process.env.EXPO_PUBLIC_USE_FIXTURES,
};
/* eslint-enable no-restricted-syntax */

const parsed = Env.safeParse(rawEnv);
if (!parsed.success) {
  // Fail loud at module load — surfaces missing config before the first screen renders.
  throw new Error(`[env] invalid environment configuration: ${parsed.error.message}`);
}

export const env = parsed.data;
export type AppEnv = typeof env;
