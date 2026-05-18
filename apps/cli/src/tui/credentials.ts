/**
 * Persisted credentials store for `harpa tui`.
 *
 * Unlike the flag CLI (which reads `HARPA_TOKEN` from env on every
 * invocation), the TUI is interactive and signs the user in once per
 * machine. Stashing the token to disk lets us re-launch the TUI
 * without re-running the OTP flow — the standard pattern for `gh`,
 * `aws`, `npm`, etc.
 *
 * Layout per OS (see `defaultCredentialsPath`):
 *   macOS    ~/Library/Application Support/harpa-cli/credentials.json
 *   Linux    $XDG_CONFIG_HOME/harpa-cli/credentials.json   (default $HOME/.config)
 *   Windows  %APPDATA%\harpa-cli\credentials.json
 *
 * `HARPA_CONFIG_HOME=<dir>` overrides the parent directory on every
 * platform (used by tests and by users who want XDG on macOS). The
 * `<dir>/credentials.json` layout stays the same.
 *
 * Permissions: directory `0700`, file `0600`, enforced on every save
 * and re-applied on read if the file is world-readable. On Windows
 * permission flags are best-effort (NTFS ACLs aren't expressible via
 * `chmod`) — the path lives under `%APPDATA%` which is user-scoped
 * by default.
 *
 * Schema is versioned (currently `1`); a future migration only needs
 * to add a new literal and a step. Invalid JSON / failed schema is
 * treated as "no credentials" and the file is cleared — never throw
 * during boot for a corrupt file.
 *
 * See `docs/v4/arch-tui-app.md` §3.3.
 */
import { homedir, platform } from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { z } from 'zod';

export const StoredCredentials = z.object({
  version: z.literal(1),
  apiUrl: z.string().url(),
  token: z.string().min(1),
  /** Cached identity (populated from `/me` at sign-in). */
  userId: z.string().optional(),
  phone: z.string().optional(),
  displayName: z.string().optional(),
  /** ISO 8601 timestamp of the last write — for telemetry / debug. */
  savedAt: z.string().datetime(),
});
export type StoredCredentials = z.infer<typeof StoredCredentials>;

export interface CredentialsStore {
  /**
   * Read and validate the credentials file. Returns `null` if the
   * file is missing, unreadable, or fails Zod parsing. Side effect:
   * on corrupt-file the store calls `clear()` and logs a warning via
   * `warn(...)`; on world-readable file (POSIX) the mode is reset to
   * 0600.
   */
  load(): Promise<StoredCredentials | null>;
  save(c: StoredCredentials): Promise<void>;
  clear(): Promise<void>;
  /** Resolved absolute path, exposed for logging + tests. */
  readonly path: string;
}

export interface DiskStoreOptions {
  /**
   * Overrides the OS-default config directory. The credentials file
   * lives at `<home>/harpa-cli/credentials.json`. Tests pass a
   * tmpdir; production reads `env.HARPA_CONFIG_HOME` when set.
   */
  home?: string;
  /**
   * Warning sink — defaults to `console.warn`. Tests inject a
   * spy; the TUI bootstrapper wires it to `prompter.log.warn`.
   */
  warn?: (message: string) => void;
  /** Process platform — injected for cross-platform unit tests. */
  platform?: NodeJS.Platform;
}

/* -------------------------------------------------------------------------- */
/*  Path resolution                                                            */
/* -------------------------------------------------------------------------- */

const APP_DIR = 'harpa-cli';
const FILE_NAME = 'credentials.json';

/** Compute the default credentials path for the given platform. */
export function defaultCredentialsPath(opts: {
  home?: string;
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
} = {}): string {
  const env = opts.env ?? process.env;
  if (opts.home) return path.join(opts.home, APP_DIR, FILE_NAME);
  if (env.HARPA_CONFIG_HOME) {
    return path.join(env.HARPA_CONFIG_HOME, APP_DIR, FILE_NAME);
  }
  const plat = opts.platform ?? platform();
  if (plat === 'darwin') {
    return path.join(homedir(), 'Library', 'Application Support', APP_DIR, FILE_NAME);
  }
  if (plat === 'win32') {
    const appdata = env.APPDATA ?? path.join(homedir(), 'AppData', 'Roaming');
    return path.join(appdata, APP_DIR, FILE_NAME);
  }
  // Linux + any other POSIX → XDG.
  const xdg = env.XDG_CONFIG_HOME ?? path.join(homedir(), '.config');
  return path.join(xdg, APP_DIR, FILE_NAME);
}

/* -------------------------------------------------------------------------- */
/*  Disk implementation                                                        */
/* -------------------------------------------------------------------------- */

export function diskCredentialsStore(opts: DiskStoreOptions = {}): CredentialsStore {
  const warn = opts.warn ?? ((m: string) => process.stderr.write(`${m}\n`));
  const plat = opts.platform ?? platform();
  const isPosix = plat !== 'win32';
  const filePath = defaultCredentialsPath({
    ...(opts.home !== undefined ? { home: opts.home } : {}),
    platform: plat,
  });
  const dirPath = path.dirname(filePath);

  async function load(): Promise<StoredCredentials | null> {
    let raw: string;
    try {
      const stats = await fs.stat(filePath);
      if (isPosix && (stats.mode & 0o077) !== 0) {
        warn(`harpa tui: credentials file ${filePath} is world-readable; resetting to 0600.`);
        try { await fs.chmod(filePath, 0o600); } catch { /* best-effort */ }
      }
      raw = await fs.readFile(filePath, 'utf8');
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') return null;
      warn(`harpa tui: could not read credentials file ${filePath}: ${(e as Error).message}`);
      return null;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      warn(`harpa tui: credentials file ${filePath} is not valid JSON; clearing. (${(e as Error).message})`);
      await clear();
      return null;
    }
    const result = StoredCredentials.safeParse(parsed);
    if (!result.success) {
      warn(`harpa tui: credentials file ${filePath} failed schema validation; clearing.`);
      await clear();
      return null;
    }
    return result.data;
  }

  async function save(c: StoredCredentials): Promise<void> {
    // Validate before writing — never persist garbage.
    const validated = StoredCredentials.parse(c);
    await fs.mkdir(dirPath, { recursive: true, mode: isPosix ? 0o700 : undefined });
    if (isPosix) {
      // mkdir's `mode` is masked by the umask; chmod ensures 0700 even
      // when the directory pre-existed.
      try { await fs.chmod(dirPath, 0o700); } catch { /* best-effort */ }
    }
    const json = JSON.stringify(validated, null, 2);
    await fs.writeFile(filePath, json, { mode: isPosix ? 0o600 : undefined });
    if (isPosix) {
      try { await fs.chmod(filePath, 0o600); } catch { /* best-effort */ }
    }
  }

  async function clear(): Promise<void> {
    try {
      await fs.unlink(filePath);
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        warn(`harpa tui: could not delete credentials file ${filePath}: ${(e as Error).message}`);
      }
    }
  }

  return { load, save, clear, path: filePath };
}

/* -------------------------------------------------------------------------- */
/*  In-memory implementation (tests only)                                      */
/* -------------------------------------------------------------------------- */

export function memoryCredentialsStore(seed?: StoredCredentials): CredentialsStore {
  let current: StoredCredentials | null = seed ?? null;
  return {
    path: '<memory>',
    async load() { return current; },
    async save(c) { current = StoredCredentials.parse(c); },
    async clear() { current = null; },
  };
}
