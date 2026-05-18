/**
 * Unit tests for the sign-in / sign-out flows (TUI-app.4).
 *
 * Uses `vi.stubGlobal('fetch', …)` to stand in for the real HTTP
 * layer — both flows build their own `ApiClient` so DI by override
 * isn't an option without leaking a test seam. The in-process Hono
 * behaviour test (covered by the existing auth integration suite)
 * exercises the real wiring; here we focus on the prompter dialogue
 * + session-state transitions + creds-store side effects.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { signInFlow, signOutFlow } from '../../../tui/flows/auth.js';
import { scriptedPrompter } from '../../../tui/prompter.js';
import { createSession } from '../../../tui/session.js';
import { memoryCredentialsStore, type StoredCredentials } from '../../../tui/credentials.js';

const API = 'http://api.example';
const CREDS_PRE: StoredCredentials = {
  version: 1, apiUrl: API, token: 'tok_old',
  userId: 'u1', savedAt: '2025-01-01T00:00:00.000Z',
};

interface MockRoute {
  match: (url: string) => boolean;
  respond: () => { status: number; body: unknown };
}

function makeFetch(routes: ReadonlyArray<MockRoute>) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url =
      typeof input === 'string' ? input
      : input instanceof URL ? input.toString()
      : input.url;
    for (const r of routes) {
      if (r.match(url)) {
        const { status, body } = r.respond();
        return new Response(JSON.stringify(body), {
          status,
          headers: { 'content-type': 'application/json' },
        });
      }
    }
    throw new Error(`unstubbed fetch: ${url}`);
  });
}

beforeEach(() => { vi.unstubAllGlobals(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('signInFlow', () => {
  it('end-to-end: phone → start → code → verify → /me → setAuth', async () => {
    const store = memoryCredentialsStore();
    const session = createSession({
      env: { HARPA_API_URL: API, HARPA_DEBUG: '0' as const },
      credentials: store,
      initialState: { kind: 'auth', reason: 'never' },
    });
    const fetchMock = makeFetch([
      {
        match: (u) => u.endsWith('/auth/otp/start'),
        respond: () => ({ status: 200, body: { verificationId: 'v1' } }),
      },
      {
        match: (u) => u.endsWith('/auth/otp/verify'),
        respond: () => ({
          status: 200,
          body: { token: 'tok_new', user: { id: 'u1', phone: '+15551234567', displayName: 'Alice' } },
        }),
      },
      {
        match: (u) => u.endsWith('/me'),
        respond: () => ({
          status: 200,
          body: { user: { id: 'u1', phone: '+15551234567', displayName: 'Alice' } },
        }),
      },
    ]);
    vi.stubGlobal('fetch', fetchMock);

    const prompter = scriptedPrompter([
      { kind: 'text', answer: '+15551234567' },
      { kind: 'text', answer: '123456' },
    ]);
    const result = await signInFlow.run({ prompter, session });

    expect(result).toEqual({ kind: 'stay' });
    expect(session.state).toMatchObject({
      kind: 'authed',
      user: { userId: 'u1', displayName: 'Alice', phone: '+15551234567' },
    });
    expect(session.effectiveEnv().HARPA_TOKEN).toBe('tok_new');
    const saved = await store.load();
    expect(saved?.token).toBe('tok_new');
    expect(saved?.userId).toBe('u1');
    expect(prompter.transcript.some((t) => t.kind === 'log.success')).toBe(true);
  });

  it('shows an error and stays when otp/start fails', async () => {
    const store = memoryCredentialsStore();
    const session = createSession({
      env: { HARPA_API_URL: API, HARPA_DEBUG: '0' as const },
      credentials: store,
      initialState: { kind: 'auth', reason: 'never' },
    });
    vi.stubGlobal('fetch', makeFetch([
      {
        match: (u) => u.endsWith('/auth/otp/start'),
        respond: () => ({ status: 429, body: { error: { code: 'rate_limited', message: 'too many' } } }),
      },
    ]));
    const prompter = scriptedPrompter([
      { kind: 'text', answer: '+15551234567' },
    ]);
    await signInFlow.run({ prompter, session });
    expect(session.state.kind).toBe('auth');
    expect(prompter.transcript.some((t) => t.kind === 'log.error')).toBe(true);
    expect(await store.load()).toBeNull();
  });

  it('retries verify up to 3 times then bails', async () => {
    const store = memoryCredentialsStore();
    const session = createSession({
      env: { HARPA_API_URL: API, HARPA_DEBUG: '0' as const },
      credentials: store,
      initialState: { kind: 'auth', reason: 'never' },
    });
    vi.stubGlobal('fetch', makeFetch([
      {
        match: (u) => u.endsWith('/auth/otp/start'),
        respond: () => ({ status: 200, body: { verificationId: 'v1' } }),
      },
      {
        match: (u) => u.endsWith('/auth/otp/verify'),
        respond: () => ({ status: 400, body: { error: { code: 'invalid_code', message: 'bad code' } } }),
      },
    ]));
    const prompter = scriptedPrompter([
      { kind: 'text', answer: '+15551234567' },
      { kind: 'text', answer: '111111' },
      { kind: 'text', answer: '222222' },
      { kind: 'text', answer: '333333' },
    ]);
    await signInFlow.run({ prompter, session });
    expect(session.state.kind).toBe('auth');
    expect(await store.load()).toBeNull();
    const errors = prompter.transcript.filter((t) => t.kind === 'log.error');
    expect(errors.length).toBeGreaterThanOrEqual(3);
  });
});

describe('signOutFlow', () => {
  it('confirms, calls POST /auth/logout, clears creds, transitions to auth(logged-out)', async () => {
    const store = memoryCredentialsStore(CREDS_PRE);
    const session = createSession({
      env: { HARPA_API_URL: API, HARPA_DEBUG: '0' as const },
      credentials: store,
      initialState: { kind: 'authed', user: { userId: 'u1' } },
      token: 'tok_old',
    });
    const fetchMock = makeFetch([
      {
        match: (u) => u.endsWith('/auth/logout'),
        respond: () => ({ status: 200, body: { ok: true } }),
      },
    ]);
    vi.stubGlobal('fetch', fetchMock);
    const prompter = scriptedPrompter([
      { kind: 'confirm', answer: true },
    ]);
    await signOutFlow.run({ prompter, session });
    expect(session.state).toEqual({ kind: 'auth', reason: 'logged-out' });
    expect(await store.load()).toBeNull();
    expect(fetchMock).toHaveBeenCalled();
  });

  it('stays when the user declines the confirm', async () => {
    const store = memoryCredentialsStore(CREDS_PRE);
    const session = createSession({
      env: { HARPA_API_URL: API, HARPA_DEBUG: '0' as const },
      credentials: store,
      initialState: { kind: 'authed', user: { userId: 'u1' } },
      token: 'tok_old',
    });
    const prompter = scriptedPrompter([
      { kind: 'confirm', answer: false },
    ]);
    await signOutFlow.run({ prompter, session });
    expect(session.state.kind).toBe('authed');
    expect(await store.load()).toEqual(CREDS_PRE);
  });

  it('still clears local creds when the server logout fails', async () => {
    const store = memoryCredentialsStore(CREDS_PRE);
    const session = createSession({
      env: { HARPA_API_URL: API, HARPA_DEBUG: '0' as const },
      credentials: store,
      initialState: { kind: 'authed', user: { userId: 'u1' } },
      token: 'tok_old',
    });
    vi.stubGlobal('fetch', makeFetch([
      {
        match: (u) => u.endsWith('/auth/logout'),
        respond: () => ({ status: 500, body: { error: { code: 'oops', message: 'down' } } }),
      },
    ]));
    const prompter = scriptedPrompter([
      { kind: 'confirm', answer: true },
    ]);
    await signOutFlow.run({ prompter, session });
    expect(session.state).toEqual({ kind: 'auth', reason: 'logged-out' });
    expect(await store.load()).toBeNull();
    expect(prompter.transcript.some((t) => t.kind === 'log.warn')).toBe(true);
  });
});
