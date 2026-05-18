/**
 * Boot-time state computation for `harpa tui`.
 *
 * Given the parsed env + persisted credentials, decides which screen
 * to show first:
 *
 *   no URL                                   → config
 *   URL, no token in file/env                → auth(never)
 *   URL + token, /me returns 200             → authed
 *   URL + token, /me returns 401             → auth(expired) + clear file
 *   URL + token, /me transport error         → auth(never) (file kept;
 *                                              probably offline / wrong URL)
 *
 * No `setTimeout`, no background work — the function is awaited from
 * the TUI entrypoint and returns once `/me` resolves or fails.
 *
 * The `validateToken` collaborator is the integration seam: by default
 * it issues a real `GET /me` via `createApiClient` + `performRequest`,
 * which is what the existing leaves do. Tests inject a stub. The
 * default wiring is exercised by the in-process Hono behaviour test
 * + the PTY smoke test (Pitfall 13).
 *
 * See docs/v4/arch-tui-app.md §3.1, §3.4, §6 step 3.
 */
import type { CliEnvLoose, CliEnv } from '../lib/env.js';
import { createApiClient } from '../lib/client.js';
import { performRequest } from '../lib/run.js';
import type { CredentialsStore, StoredCredentials } from './credentials.js';
import type { AppState, SessionUser } from './session.js';

export type ValidateTokenOutcome =
  | { kind: 'ok'; user: SessionUser }
  | { kind: 'unauthorized' }
  | { kind: 'transport'; message: string };

export interface ValidateTokenInput {
  apiUrl: string;
  token: string;
}

export type ValidateTokenFn = (input: ValidateTokenInput) => Promise<ValidateTokenOutcome>;

/**
 * Default `/me` validator. Builds a real api client, calls `GET /me`,
 * and maps the `performRequest` outcome onto our three-way enum.
 */
export const defaultValidateToken: ValidateTokenFn = async ({ apiUrl, token }) => {
  const env: CliEnv = {
    HARPA_API_URL: apiUrl,
    HARPA_TOKEN: token,
    HARPA_DEBUG: '0',
  };
  const client = createApiClient(env);
  const outcome = await performRequest(() => client.GET('/me', {}));
  if (outcome.kind === 'ok') {
    const u = (outcome.data as { user?: { id?: string; phone?: string; displayName?: string | null } } | undefined)?.user;
    if (!u || typeof u.id !== 'string') {
      return { kind: 'transport', message: '/me response missing user.id' };
    }
    return {
      kind: 'ok',
      user: {
        userId: u.id,
        ...(u.phone ? { phone: u.phone } : {}),
        ...(u.displayName ? { displayName: u.displayName } : {}),
      },
    };
  }
  if (outcome.kind === 'apiError' && outcome.status === 401) {
    return { kind: 'unauthorized' };
  }
  if (outcome.kind === 'apiError') {
    return { kind: 'transport', message: `GET /me → ${outcome.status}` };
  }
  if (outcome.kind === 'missingToken') {
    return { kind: 'unauthorized' };
  }
  // transport
  return { kind: 'transport', message: (outcome.error as Error)?.message ?? 'transport error' };
};

export interface BootStateInput {
  env: CliEnvLoose;
  credentials: CredentialsStore;
  validateToken?: ValidateTokenFn;
}

export interface BootStateResult {
  state: AppState;
  /** The URL the session should adopt (may have come from creds, not env). */
  apiUrl: string | undefined;
  /** The token the session should adopt (none when state ≠ authed). */
  token: string | undefined;
  /** Validated credentials, if any — useful for the caller to ignore. */
  credentials?: StoredCredentials;
}

/**
 * Compute the initial `AppState` plus the URL/token the session
 * should be constructed with. Caller is `tui/index.ts`.
 */
export async function bootState(input: BootStateInput): Promise<BootStateResult> {
  const validate = input.validateToken ?? defaultValidateToken;
  const stored = await input.credentials.load();

  // URL precedence: env > creds. If neither, we're in config.
  const apiUrl = input.env.HARPA_API_URL ?? stored?.apiUrl;
  if (!apiUrl) {
    // Discard any stored creds with no usable URL.
    return { state: { kind: 'config' }, apiUrl: undefined, token: undefined };
  }

  // Token precedence: env (explicit override) > creds.
  const token = input.env.HARPA_TOKEN ?? stored?.token;
  if (!token) {
    return { state: { kind: 'auth', reason: 'never' }, apiUrl, token: undefined };
  }

  const outcome = await validate({ apiUrl, token });
  if (outcome.kind === 'ok') {
    return {
      state: { kind: 'authed', user: outcome.user },
      apiUrl,
      token,
      ...(stored ? { credentials: stored } : {}),
    };
  }
  if (outcome.kind === 'unauthorized') {
    // Stale token — clear so we don't keep failing on relaunch.
    await input.credentials.clear();
    return { state: { kind: 'auth', reason: 'expired' }, apiUrl, token: undefined };
  }
  // Transport: keep the file (might just be offline) but force auth.
  return { state: { kind: 'auth', reason: 'never' }, apiUrl, token: undefined };
}
