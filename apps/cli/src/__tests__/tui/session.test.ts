/**
 * Unit tests for `tui/session.ts` (TUI-app.1).
 *
 * Covers the state-machine bookkeeping that the boot routine and the
 * flow driver will rely on. Disk I/O is exercised through
 * `memoryCredentialsStore` (`diskCredentialsStore` has its own
 * dedicated suite in `credentials.test.ts`).
 */
import { describe, it, expect } from 'vitest';
import { createSession } from '../../tui/session.js';
import { memoryCredentialsStore, type StoredCredentials } from '../../tui/credentials.js';

const ENV = { HARPA_API_URL: 'http://api-a.example', HARPA_DEBUG: '0' as const };

const CREDS_A: StoredCredentials = {
  version: 1,
  apiUrl: 'http://api-a.example',
  token: 'tok_a',
  userId: 'u1',
  savedAt: '2025-01-01T00:00:00.000Z',
};
const USER = { userId: 'u1', displayName: 'Alice' };

describe('createSession — legacy single-arg form', () => {
  it('starts in auth(never) when HARPA_API_URL is set', () => {
    const s = createSession(ENV);
    expect(s.state).toEqual({ kind: 'auth', reason: 'never' });
    expect(s.effectiveEnv().HARPA_API_URL).toBe('http://api-a.example');
  });

  it('starts in config when HARPA_API_URL is missing', () => {
    const s = createSession({ HARPA_DEBUG: '0' } as unknown as typeof ENV);
    expect(s.state).toEqual({ kind: 'config' });
  });
});

describe('setAuth / clearAuth', () => {
  it('setAuth writes to the store and transitions to authed', async () => {
    const store = memoryCredentialsStore();
    const s = createSession({
      env: ENV,
      credentials: store,
      initialState: { kind: 'auth', reason: 'never' },
    });
    await s.setAuth(CREDS_A, USER);
    expect(s.state).toEqual({ kind: 'authed', user: USER });
    expect(await store.load()).toEqual(CREDS_A);
    expect(s.effectiveEnv().HARPA_TOKEN).toBe('tok_a');
  });

  it('clearAuth deletes the file and transitions to auth(reason)', async () => {
    const store = memoryCredentialsStore(CREDS_A);
    const s = createSession({
      env: ENV,
      credentials: store,
      initialState: { kind: 'authed', user: USER },
      token: 'tok_a',
    });
    await s.clearAuth('logged-out');
    expect(s.state).toEqual({ kind: 'auth', reason: 'logged-out' });
    expect(await store.load()).toBeNull();
    expect(s.effectiveEnv().HARPA_TOKEN).toBeUndefined();
  });
});

describe('setApiUrl', () => {
  it('clears creds + transitions to auth(never) when URL changes', async () => {
    const store = memoryCredentialsStore(CREDS_A);
    const s = createSession({
      env: ENV,
      credentials: store,
      initialState: { kind: 'authed', user: USER },
      token: 'tok_a',
    });
    await s.setApiUrl('http://api-b.example');
    expect(s.state).toEqual({ kind: 'auth', reason: 'never' });
    expect(await store.load()).toBeNull();
    expect(s.effectiveEnv().HARPA_API_URL).toBe('http://api-b.example');
    expect(s.effectiveEnv().HARPA_TOKEN).toBeUndefined();
  });

  it('transitions from config → auth(never) when URL is first supplied', async () => {
    const s = createSession({
      env: { HARPA_DEBUG: '0' } as unknown as typeof ENV,
      credentials: memoryCredentialsStore(),
      initialState: { kind: 'config' },
    });
    await s.setApiUrl('http://api-a.example');
    expect(s.state).toEqual({ kind: 'auth', reason: 'never' });
  });

  it('is a no-op (other than URL field) when URL is unchanged', async () => {
    const store = memoryCredentialsStore(CREDS_A);
    const s = createSession({
      env: ENV,
      credentials: store,
      initialState: { kind: 'authed', user: USER },
      token: 'tok_a',
    });
    await s.setApiUrl('http://api-a.example');
    expect(s.state).toEqual({ kind: 'authed', user: USER });
    expect(await store.load()).toEqual(CREDS_A);
  });
});

describe('setCurrentProject', () => {
  it('attaches the project ref while authed', () => {
    const s = createSession({
      env: ENV,
      credentials: memoryCredentialsStore(),
      initialState: { kind: 'authed', user: USER },
    });
    s.setCurrentProject({ id: 'p1', slug: 'demo' });
    expect(s.state).toEqual({
      kind: 'authed',
      user: USER,
      currentProject: { id: 'p1', slug: 'demo' },
    });
    s.setCurrentProject(undefined);
    expect(s.state).toEqual({ kind: 'authed', user: USER });
  });

  it('is a no-op when not authed', () => {
    const s = createSession({
      env: ENV,
      credentials: memoryCredentialsStore(),
      initialState: { kind: 'auth', reason: 'never' },
    });
    s.setCurrentProject({ id: 'p1' });
    expect(s.state).toEqual({ kind: 'auth', reason: 'never' });
  });
});
