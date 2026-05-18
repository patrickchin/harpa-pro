/**
 * TUI-app.9 — persistence default-wiring smoke.
 *
 * Exercises the production wiring for the credentials story:
 *   diskCredentialsStore  →  save  →  bootState(loadCreds + /me) → authed
 *
 * Together with the existing pty.smoke.integration.test (which covers
 * clackPrompter end-to-end against the health leaf), this closes the
 * Pitfall-13 hole — every collaborator in the boot path is exercised
 * with its real implementation here.
 *
 * Non-PTY: a real PTY sign-in walk is possible but slow and brittle;
 * the bits that matter (file on disk, 0600, bootState round-trip) are
 * cleanly checkable from a unit-test process.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  diskCredentialsStore,
  defaultCredentialsPath,
} from '../../tui/credentials.js';
import { bootState } from '../../tui/state.js';

const ENV = {
  HARPA_API_URL: 'http://api.example',
  HARPA_DEBUG: '0' as const,
};

let tmpdir: string;
let prevHome: string | undefined;

beforeEach(async () => {
  tmpdir = await fs.mkdtemp(path.join(os.tmpdir(), 'harpa-cli-persist-'));
  prevHome = process.env.HARPA_CONFIG_HOME;
  process.env.HARPA_CONFIG_HOME = tmpdir;
});

afterEach(async () => {
  if (prevHome === undefined) delete process.env.HARPA_CONFIG_HOME;
  else process.env.HARPA_CONFIG_HOME = prevHome;
  await fs.rm(tmpdir, { recursive: true, force: true });
});

describe('persistence default wiring', () => {
  it('saves with mode 0600 and round-trips through bootState', async () => {
    const store = diskCredentialsStore();
    await store.save({
      version: 1,
      apiUrl: ENV.HARPA_API_URL,
      token: 'tok-persisted',
      userId: 'u-persisted',
      savedAt: new Date().toISOString(),
    });

    const file = defaultCredentialsPath();
    const stat = await fs.stat(file);
    // Lower 9 bits = perm; on Windows chmod is best-effort so we only
    // assert on POSIX platforms.
    if (process.platform !== 'win32') {
      expect(stat.mode & 0o777).toBe(0o600);
    }

    // bootState should pick up the saved creds, call /me (validator),
    // and land in 'authed'.
    const validate = async ({ apiUrl, token }: { apiUrl: string; token: string }) => {
      expect(apiUrl).toBe(ENV.HARPA_API_URL);
      expect(token).toBe('tok-persisted');
      return { kind: 'ok' as const, user: { userId: 'u-persisted' } };
    };
    const booted = await bootState({ env: ENV, credentials: store, validateToken: validate });
    expect(booted.state.kind).toBe('authed');
    expect(booted.apiUrl).toBe(ENV.HARPA_API_URL);
    expect(booted.token).toBe('tok-persisted');
  });

  it('clears file when /me returns 401', async () => {
    const store = diskCredentialsStore();
    await store.save({
      version: 1,
      apiUrl: ENV.HARPA_API_URL,
      token: 'tok-expired',
      savedAt: new Date().toISOString(),
    });

    const booted = await bootState({
      env: ENV,
      credentials: store,
      validateToken: async () => ({ kind: 'unauthorized' as const }),
    });
    expect(booted.state.kind).toBe('auth');

    // File cleared on 401.
    const loaded = await store.load();
    expect(loaded).toBeNull();
  });

  it('keeps file when validate fails on transport (probably offline)', async () => {
    const store = diskCredentialsStore();
    await store.save({
      version: 1,
      apiUrl: ENV.HARPA_API_URL,
      token: 'tok-offline',
      savedAt: new Date().toISOString(),
    });

    const booted = await bootState({
      env: ENV,
      credentials: store,
      validateToken: async () => ({ kind: 'transport' as const, message: 'offline' }),
    });
    expect(booted.state.kind).toBe('auth');

    // File still on disk — user is offline, not signed out.
    const loaded = await store.load();
    expect(loaded?.token).toBe('tok-offline');
  });
});
