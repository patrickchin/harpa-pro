/**
 * In-memory session state for `harpa tui`.
 *
 * Holds an override token captured during an in-TUI auth flow so the
 * user doesn't have to restart with HARPA_TOKEN= prefixed. The token
 * lives in memory only — never written to disk (matches arch-cli.md's
 * "no config file / no keychain" non-goal).
 *
 * See docs/v4/arch-tui.md §3.5.
 */
import type { CliEnv } from '../lib/env.js';

export interface Session {
  readonly env: CliEnv;
  setToken(token: string): void;
  /** Returns the env with the in-memory token override applied (if any). */
  effectiveEnv(): CliEnv;
}

export function createSession(env: CliEnv): Session {
  let token: string | undefined = env.HARPA_TOKEN;
  return {
    env,
    setToken(t) {
      token = t;
    },
    effectiveEnv() {
      return token ? { ...env, HARPA_TOKEN: token } : env;
    },
  };
}
