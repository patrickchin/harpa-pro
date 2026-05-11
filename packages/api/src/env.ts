/**
 * Centralised env access for @harpa/api.
 * Mirrors apps/mobile/lib/env.ts pattern. Pitfall 5.
 */
import { z } from 'zod';

const Env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8787),
  DATABASE_URL: z.string().url().or(z.string().startsWith('postgres://')).optional(),
  BETTER_AUTH_SECRET: z.string().min(16).default('dev-only-secret-do-not-use-in-prod'),
  BETTER_AUTH_URL: z.string().url().default('http://localhost:8787'),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_VERIFY_SID: z.string().optional(),
  TWILIO_LIVE: z.enum(['0', '1']).default('0'),
  TWILIO_VERIFY_FAKE_CODE: z.string().default('000000'),
  AI_FIXTURE_MODE: z.enum(['replay', 'record', 'live']).default('replay'),
  AI_LIVE: z.enum(['0', '1']).default('0'),
  R2_FIXTURE_MODE: z.enum(['replay', 'live']).default('replay'),
  REQUEST_LOG: z.enum(['true', 'false']).default('false'),
});

export const env = Env.parse(process.env);
export type Env = z.infer<typeof Env>;
