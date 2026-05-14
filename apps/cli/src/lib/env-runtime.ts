/**
 * Lazy env access. Parsing happens on first call so `--help` / `--version`
 * never require env vars to be set.
 */
import { z } from 'zod';
import { parseEnv, formatEnvError, type CliEnv } from './env.js';

let cached: CliEnv | undefined;

export function getEnv(): CliEnv {
  if (cached) return cached;
  try {
    cached = parseEnv();
    return cached;
  } catch (err) {
    if (err instanceof z.ZodError) {
      process.stderr.write(formatEnvError(err) + '\n');
      process.exit(1);
    }
    throw err;
  }
}

export function resetEnvCacheForTests(): void {
  cached = undefined;
}
