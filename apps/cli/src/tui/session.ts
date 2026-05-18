/**
 * In-memory session state for `harpa tui`.
 *
 * Holds in-memory overrides for the parsed env so the user can:
 *   - launch `harpa tui` without HARPA_API_URL set and enter the URL
 *     interactively (we still validate it via the same Zod schema);
 *   - capture a token during an in-TUI auth flow without restarting.
 *
 * Overrides live in memory only — never written to disk (matches
 * arch-cli.md's "no config file / no keychain" non-goal).
 *
 * See docs/v4/arch-tui.md §3.5.
 */
import type { CliEnv } from '../lib/env.js';

export interface Session {
  readonly env: CliEnv;
  setToken(token: string): void;
  setApiUrl(url: string): void;
  /** Returns the env with any in-memory overrides applied. */
  effectiveEnv(): CliEnv;
}

export function createSession(env: CliEnv): Session {
  let token: string | undefined = env.HARPA_TOKEN;
  let apiUrl: string = env.HARPA_API_URL;
  return {
    env,
    setToken(t) {
      token = t;
    },
    setApiUrl(u) {
      apiUrl = u;
    },
    effectiveEnv() {
      return {
        ...env,
        HARPA_API_URL: apiUrl,
        ...(token ? { HARPA_TOKEN: token } : {}),
      };
    },
  };
}
