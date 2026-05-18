/**
 * Unit tests for `tui/credentials.ts`.
 *
 * Covers (per arch-tui-app.md §5):
 *   - Path resolution per platform + `HARPA_CONFIG_HOME` override.
 *   - Save → load round-trip with mode 0600.
 *   - Directory mode 0700.
 *   - Corrupt JSON → clear + warn + null.
 *   - Schema mismatch → clear + warn + null.
 *   - World-readable file → re-chmod + warn (still returns the creds).
 *   - Missing file → null (no warn).
 *   - `memoryCredentialsStore` round-trip.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, statSync, writeFileSync, mkdirSync, chmodSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  defaultCredentialsPath,
  diskCredentialsStore,
  memoryCredentialsStore,
  StoredCredentials,
} from '../../tui/credentials.js';

const VALID: StoredCredentials = {
  version: 1,
  apiUrl: 'http://localhost:8787',
  token: 'tok_test_abc',
  userId: 'user_1',
  phone: '+15551234567',
  displayName: 'Alice',
  savedAt: '2025-01-01T00:00:00.000Z',
};

const isPosix = process.platform !== 'win32';

let home: string;
let warnings: string[];
const captureWarn = (m: string) => { warnings.push(m); };

beforeEach(() => {
  home = mkdtempSync(path.join(tmpdir(), 'harpa-creds-'));
  warnings = [];
});
afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

describe('defaultCredentialsPath', () => {
  it('uses macOS Application Support on darwin', () => {
    const p = defaultCredentialsPath({ platform: 'darwin', env: {} });
    expect(p).toContain(path.join('Library', 'Application Support', 'harpa-cli', 'credentials.json'));
  });

  it('uses %APPDATA% on win32', () => {
    const p = defaultCredentialsPath({
      platform: 'win32',
      env: { APPDATA: 'C:\\Users\\u\\AppData\\Roaming' },
    });
    expect(p).toMatch(/Roaming[\\/]harpa-cli[\\/]credentials\.json$/);
  });

  it('honours XDG_CONFIG_HOME on linux', () => {
    const p = defaultCredentialsPath({
      platform: 'linux',
      env: { XDG_CONFIG_HOME: '/x/cfg' },
    });
    expect(p).toBe(path.join('/x/cfg', 'harpa-cli', 'credentials.json'));
  });

  it('falls back to ~/.config on linux without XDG', () => {
    const p = defaultCredentialsPath({ platform: 'linux', env: {} });
    expect(p).toMatch(/[\\/]\.config[\\/]harpa-cli[\\/]credentials\.json$/);
  });

  it('HARPA_CONFIG_HOME overrides on every platform', () => {
    for (const plat of ['darwin', 'linux', 'win32'] as NodeJS.Platform[]) {
      const p = defaultCredentialsPath({
        platform: plat,
        env: { HARPA_CONFIG_HOME: '/tmp/override' },
      });
      expect(p).toBe(path.join('/tmp/override', 'harpa-cli', 'credentials.json'));
    }
  });
});

describe('diskCredentialsStore', () => {
  it('returns null when the file does not exist (no warn)', async () => {
    const store = diskCredentialsStore({ home, warn: captureWarn });
    expect(await store.load()).toBeNull();
    expect(warnings).toEqual([]);
  });

  it('round-trips a valid credential set', async () => {
    const store = diskCredentialsStore({ home, warn: captureWarn });
    await store.save(VALID);
    const loaded = await store.load();
    expect(loaded).toEqual(VALID);
    expect(warnings).toEqual([]);
  });

  it.skipIf(!isPosix)('writes file with mode 0600 and directory with mode 0700', async () => {
    const store = diskCredentialsStore({ home, warn: captureWarn });
    await store.save(VALID);
    const fileMode = statSync(store.path).mode & 0o777;
    const dirMode = statSync(path.dirname(store.path)).mode & 0o777;
    expect(fileMode).toBe(0o600);
    expect(dirMode).toBe(0o700);
  });

  it.skipIf(!isPosix)('re-chmods a world-readable file and warns', async () => {
    const store = diskCredentialsStore({ home, warn: captureWarn });
    await store.save(VALID);
    chmodSync(store.path, 0o644);
    const loaded = await store.load();
    expect(loaded).toEqual(VALID);
    const modeAfter = statSync(store.path).mode & 0o777;
    expect(modeAfter).toBe(0o600);
    expect(warnings.some((w) => w.includes('world-readable'))).toBe(true);
  });

  it('clears + warns + returns null on corrupt JSON', async () => {
    const store = diskCredentialsStore({ home, warn: captureWarn });
    mkdirSync(path.dirname(store.path), { recursive: true });
    writeFileSync(store.path, '{not json');
    expect(await store.load()).toBeNull();
    expect(existsSync(store.path)).toBe(false);
    expect(warnings.some((w) => w.includes('not valid JSON'))).toBe(true);
  });

  it('clears + warns + returns null on schema mismatch', async () => {
    const store = diskCredentialsStore({ home, warn: captureWarn });
    mkdirSync(path.dirname(store.path), { recursive: true });
    writeFileSync(store.path, JSON.stringify({ version: 1, apiUrl: 'not-a-url' }));
    expect(await store.load()).toBeNull();
    expect(existsSync(store.path)).toBe(false);
    expect(warnings.some((w) => w.includes('schema validation'))).toBe(true);
  });

  it('clear() is a no-op when the file does not exist', async () => {
    const store = diskCredentialsStore({ home, warn: captureWarn });
    await expect(store.clear()).resolves.toBeUndefined();
    expect(warnings).toEqual([]);
  });

  it('throws on save() when given an invalid payload (defensive)', async () => {
    const store = diskCredentialsStore({ home, warn: captureWarn });
    await expect(
      // @ts-expect-error — exercising the runtime guard.
      store.save({ ...VALID, apiUrl: 'not-a-url' }),
    ).rejects.toThrow();
  });

  it('uses HARPA_CONFIG_HOME via env when `home` not passed', async () => {
    const previous = process.env.HARPA_CONFIG_HOME;
    process.env.HARPA_CONFIG_HOME = home;
    try {
      const store = diskCredentialsStore({ warn: captureWarn });
      await store.save(VALID);
      expect(store.path.startsWith(home)).toBe(true);
      expect(await store.load()).toEqual(VALID);
    } finally {
      if (previous === undefined) delete process.env.HARPA_CONFIG_HOME;
      else process.env.HARPA_CONFIG_HOME = previous;
    }
  });
});

describe('memoryCredentialsStore', () => {
  it('round-trips and clears', async () => {
    const store = memoryCredentialsStore();
    expect(await store.load()).toBeNull();
    await store.save(VALID);
    expect(await store.load()).toEqual(VALID);
    await store.clear();
    expect(await store.load()).toBeNull();
  });

  it('accepts a seed value', async () => {
    const store = memoryCredentialsStore(VALID);
    expect(await store.load()).toEqual(VALID);
  });
});
