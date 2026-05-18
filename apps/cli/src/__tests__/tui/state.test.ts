/**
 * Unit tests for `tui/state.ts` (TUI-app.2).
 *
 * Covers the five boot decisions enumerated in arch-tui-app.md §5
 * using `memoryCredentialsStore` + a stub validator. The default
 * `/me` validator gets its own behaviour test in the sign-in flow
 * suite (TUI-app.4); here we focus on the dispatch.
 */
import { describe, it, expect, vi } from 'vitest';
import { bootState, type ValidateTokenFn } from '../../tui/state.js';
import { memoryCredentialsStore, type StoredCredentials } from '../../tui/credentials.js';

const CREDS: StoredCredentials = {
  version: 1,
  apiUrl: 'http://api.example',
  token: 'tok',
  userId: 'u1',
  displayName: 'Alice',
  savedAt: '2025-01-01T00:00:00.000Z',
};

const okValidator: ValidateTokenFn = async () => ({
  kind: 'ok',
  user: { userId: 'u1', displayName: 'Alice' },
});
const unauthValidator: ValidateTokenFn = async () => ({ kind: 'unauthorized' });
const transportValidator: ValidateTokenFn = async () => ({
  kind: 'transport',
  message: 'connect ECONNREFUSED',
});

const baseEnv = { HARPA_DEBUG: '0' as const };

describe('bootState', () => {
  it('returns config when no URL is available anywhere', async () => {
    const credentials = memoryCredentialsStore();
    const result = await bootState({
      env: baseEnv,
      credentials,
      validateToken: vi.fn(),
    });
    expect(result.state).toEqual({ kind: 'config' });
    expect(result.apiUrl).toBeUndefined();
    expect(result.token).toBeUndefined();
  });

  it('uses creds URL when env URL is missing', async () => {
    const credentials = memoryCredentialsStore(CREDS);
    const result = await bootState({
      env: baseEnv,
      credentials,
      validateToken: okValidator,
    });
    expect(result.apiUrl).toBe('http://api.example');
    expect(result.state.kind).toBe('authed');
  });

  it('returns auth(never) when URL is set but no token anywhere', async () => {
    const credentials = memoryCredentialsStore();
    const result = await bootState({
      env: { ...baseEnv, HARPA_API_URL: 'http://api.example' },
      credentials,
      validateToken: vi.fn(),
    });
    expect(result.state).toEqual({ kind: 'auth', reason: 'never' });
    expect(result.apiUrl).toBe('http://api.example');
  });

  it('returns authed when token validates (creds remain in store)', async () => {
    const credentials = memoryCredentialsStore(CREDS);
    const result = await bootState({
      env: baseEnv,
      credentials,
      validateToken: okValidator,
    });
    expect(result.state).toEqual({
      kind: 'authed',
      user: { userId: 'u1', displayName: 'Alice' },
    });
    expect(result.token).toBe('tok');
    expect(await credentials.load()).toEqual(CREDS);
  });

  it('clears creds and returns auth(expired) on 401', async () => {
    const credentials = memoryCredentialsStore(CREDS);
    const result = await bootState({
      env: baseEnv,
      credentials,
      validateToken: unauthValidator,
    });
    expect(result.state).toEqual({ kind: 'auth', reason: 'expired' });
    expect(result.token).toBeUndefined();
    expect(await credentials.load()).toBeNull();
  });

  it('keeps creds and returns auth(never) on transport error', async () => {
    const credentials = memoryCredentialsStore(CREDS);
    const result = await bootState({
      env: baseEnv,
      credentials,
      validateToken: transportValidator,
    });
    expect(result.state).toEqual({ kind: 'auth', reason: 'never' });
    expect(await credentials.load()).toEqual(CREDS);
  });

  it('env HARPA_TOKEN overrides creds token (and validate is called with env value)', async () => {
    const credentials = memoryCredentialsStore(CREDS);
    const spy = vi.fn(okValidator);
    await bootState({
      env: { ...baseEnv, HARPA_API_URL: 'http://api.example', HARPA_TOKEN: 'env-tok' },
      credentials,
      validateToken: spy,
    });
    expect(spy).toHaveBeenCalledWith({ apiUrl: 'http://api.example', token: 'env-tok' });
  });
});
