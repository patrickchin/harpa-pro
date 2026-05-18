/**
 * In-memory session state for `harpa tui`.
 *
 * In v1 (arch-tui.md) the session held only `apiUrl` + `token` and
 * everything else came from env. v2 (arch-tui-app.md §3.1, §3.6) makes
 * the session the home of the *app state machine* and the bridge to
 * the persisted-credentials store:
 *
 *   AppState = { kind: 'config' }                   — no API URL yet
 *             | { kind: 'auth'; reason }            — URL set, no/expired token
 *             | { kind: 'authed'; user; currentProject? }
 *
 * Mutations go through `setApiUrl` / `setAuth` / `clearAuth` /
 * `setCurrentProject` so the menu driver can observe a single source
 * of truth and the disk store gets written exactly once per state
 * transition. None of these methods throw — disk failures surface via
 * the `warn` sink wired into `diskCredentialsStore`.
 *
 * The `effectiveEnv()` getter remains the single point of contact with
 * `lib/client.ts` (existing leaves call it unchanged); under the hood
 * it merges the persisted token + current API URL onto the env.
 *
 * See docs/v4/arch-tui-app.md §3.1, §3.6.
 */
import type { CliEnv } from '../lib/env.js';
import type { CredentialsStore, StoredCredentials } from './credentials.js';
import { memoryCredentialsStore } from './credentials.js';

/* -------------------------------------------------------------------------- */
/*  State + value types                                                        */
/* -------------------------------------------------------------------------- */

/** Cached identity captured from `/me` at sign-in. */
export interface SessionUser {
  readonly userId: string;
  readonly phone?: string;
  readonly displayName?: string;
}

/** Identifies the project the user has "opened" in a projects flow. */
export interface ProjectRef {
  readonly id: string;
  readonly slug?: string;
  readonly name?: string;
}

/** Identifies the report the user has drilled into from a project. */
export interface ReportRef {
  /** Slug of the parent project — matches `currentProject.slug`. */
  readonly projectSlug: string;
  /** Per-project monotonic report number. */
  readonly number: number;
  readonly status?: 'draft' | 'final';
  readonly title?: string;
  readonly noteCount?: number;
  readonly hasGenerated?: boolean;
}

export type AuthReason = 'never' | 'expired' | 'logged-out';

export type AppState =
  | { kind: 'config' }
  | { kind: 'auth'; reason: AuthReason }
  | {
      kind: 'authed';
      user: SessionUser;
      currentProject?: ProjectRef;
      currentReport?: ReportRef;
    };

/* -------------------------------------------------------------------------- */
/*  Session contract                                                           */
/* -------------------------------------------------------------------------- */

export interface Session {
  readonly env: CliEnv;
  readonly credentials: CredentialsStore;
  /** Mutable — read by the menu driver after each transition. */
  state: AppState;

  /**
   * Set the API URL for this session. If it differs from the one in
   * the persisted credentials file the file is cleared (a token
   * issued by API A is meaningless against API B) and the state
   * transitions to `auth(never)`.
   */
  setApiUrl(url: string): Promise<void>;

  /**
   * Persist `creds` to the credentials store and transition to
   * `authed`. Caller is responsible for having just verified the
   * token via `/me`. The `user` is cached in-memory for the menu.
   */
  setAuth(creds: StoredCredentials, user: SessionUser): Promise<void>;

  /**
   * Delete the persisted credentials and transition to `auth(reason)`.
   * Disk-delete errors are non-fatal — the in-memory state still
   * moves to `auth` because that's the user's intent.
   */
  clearAuth(reason: AuthReason): Promise<void>;

  /**
   * Update the "currently open" project (only valid while authed).
   * Setting to `undefined` also clears `currentReport` (cascading).
   */
  setCurrentProject(p: ProjectRef | undefined): void;

  /**
   * Update the "currently open" report (only valid while authed AND
   * `currentProject` is set — otherwise the call is a no-op).
   */
  setCurrentReport(r: ReportRef | undefined): void;

  /**
   * Read the env with the active API URL + token merged in. Existing
   * leaf execution (`tui/execute.ts`) calls this unchanged.
   */
  effectiveEnv(): CliEnv;
}

/* -------------------------------------------------------------------------- */
/*  Factory                                                                    */
/* -------------------------------------------------------------------------- */

export interface CreateSessionOptions {
  env: CliEnv;
  credentials: CredentialsStore;
  /** Initial state — typically computed by `bootState` (TUI-app.2). */
  initialState: AppState;
  /**
   * Initial API URL. Defaults to `env.HARPA_API_URL`; the boot flow
   * may pass a value loaded from the credentials file when the env
   * is empty.
   */
  apiUrl?: string;
  /** Initial token. Same rationale as `apiUrl`. */
  token?: string;
}

export function createSession(opts: CreateSessionOptions): Session;
/**
 * Legacy single-arg form used by v1 tests and code paths that don't
 * yet care about the state machine. Wraps the env in a session backed
 * by `memoryCredentialsStore` and starts in `auth(never)` (or `config`
 * when the env has no URL). The bootstrap path (TUI-app.2) uses the
 * full `CreateSessionOptions` form.
 */
export function createSession(env: CliEnv): Session;
export function createSession(arg: CreateSessionOptions | CliEnv): Session {
  if ('env' in arg && 'credentials' in arg) {
    return createSessionInner(arg);
  }
  const env = arg as CliEnv;
  const initialState: AppState = env.HARPA_API_URL
    ? { kind: 'auth', reason: 'never' }
    : { kind: 'config' };
  return createSessionInner({
    env,
    credentials: memoryCredentialsStore(),
    initialState,
  });
}

function createSessionInner(opts: CreateSessionOptions): Session {
  let apiUrl: string = opts.apiUrl ?? opts.env.HARPA_API_URL;
  let token: string | undefined = opts.token ?? opts.env.HARPA_TOKEN;
  const state: { current: AppState } = { current: opts.initialState };

  const self: Session = {
    env: opts.env,
    credentials: opts.credentials,
    get state() { return state.current; },
    set state(v: AppState) { state.current = v; },

    async setApiUrl(url) {
      const changed = url !== apiUrl;
      apiUrl = url;
      if (changed) {
        // A token issued by API A is meaningless against API B.
        await self.credentials.clear();
        token = undefined;
        self.state = { kind: 'auth', reason: 'never' };
      } else if (self.state.kind === 'config') {
        // First time the URL is set this session.
        self.state = { kind: 'auth', reason: 'never' };
      }
    },

    async setAuth(creds, user) {
      apiUrl = creds.apiUrl;
      token = creds.token;
      await self.credentials.save(creds);
      self.state = { kind: 'authed', user };
    },

    async clearAuth(reason) {
      token = undefined;
      await self.credentials.clear();
      self.state = { kind: 'auth', reason };
    },

    setCurrentProject(p) {
      if (self.state.kind !== 'authed') return;
      self.state = {
        kind: 'authed',
        user: self.state.user,
        ...(p ? { currentProject: p } : {}),
        // Setting/clearing project cascades to report.
      };
    },

    setCurrentReport(r) {
      if (self.state.kind !== 'authed') return;
      if (!self.state.currentProject) return; // invariant: report needs a project
      self.state = {
        kind: 'authed',
        user: self.state.user,
        currentProject: self.state.currentProject,
        ...(r ? { currentReport: r } : {}),
      };
    },

    effectiveEnv() {
      return {
        ...opts.env,
        HARPA_API_URL: apiUrl,
        ...(token ? { HARPA_TOKEN: token } : {}),
      };
    },
  } as Session;

  return self;
}
