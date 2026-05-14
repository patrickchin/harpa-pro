/**
 * Centralised env access for @harpa/cli.
 *
 * Pattern mirrors packages/api/src/env.ts and apps/mobile/lib/env.ts.
 * Parsed at module load so missing required vars fail fast before
 * any command runs. AGENTS.md hard rule #1 — no `process.env.X!`
 * anywhere else in the CLI.
 */
import { z } from 'zod';

const CliEnv = z.object({
  HARPA_API_URL: z.string().url(),
  // Optional at parse time so `auth otp start/verify` can run without a
  // token. Commands that need it must check `env.HARPA_TOKEN` and
  // exit with code 3 themselves (see `requireToken` in lib/client.ts).
  HARPA_TOKEN: z.string().min(1).optional(),
  HARPA_DEBUG: z.enum(['0', '1']).default('0'),
  HARPA_IDEMPOTENCY_KEY: z.string().min(1).optional(),
});

export type CliEnv = z.infer<typeof CliEnv>;

export function parseEnv(source: NodeJS.ProcessEnv = process.env): CliEnv {
  return CliEnv.parse(source);
}

/**
 * Pretty-print a ZodError from env parsing so users get a useful message
 * instead of a stacktrace. Returns the formatted string; the caller is
 * responsible for writing it to stderr + setting an exit code.
 */
export function formatEnvError(err: z.ZodError): string {
  const lines = err.issues.map((issue) => {
    const path = issue.path.join('.') || '(env)';
    return `  - ${path}: ${issue.message}`;
  });
  return [
    'Invalid CLI environment configuration:',
    ...lines,
    '',
    'Required: HARPA_API_URL (e.g. http://localhost:8787)',
    'Optional: HARPA_TOKEN, HARPA_DEBUG=0|1, HARPA_IDEMPOTENCY_KEY',
  ].join('\n');
}
