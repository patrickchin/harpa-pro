import { describe, it, expect } from 'vitest';
import { createApiClient, MissingTokenError, requireToken } from '../lib/client.js';
import type { CliEnv } from '../lib/env.js';

function makeEnv(over: Partial<CliEnv> = {}): CliEnv {
  return { HARPA_API_URL: 'http://localhost:8787', HARPA_DEBUG: '0', ...over };
}

function captureHeaders(): {
  fetch: typeof fetch;
  headers: () => Headers | undefined;
} {
  let observed: Headers | undefined;
  const fakeFetch: typeof fetch = async (input, init) => {
    if (input instanceof Request) {
      observed = input.headers;
    } else if (init?.headers) {
      observed = new Headers(init.headers as HeadersInit);
    } else {
      observed = new Headers();
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  return { fetch: fakeFetch, headers: () => observed };
}

describe('createApiClient', () => {
  it('builds a client with no auth header when token absent', async () => {
    const cap = captureHeaders();
    const client = createApiClient(makeEnv(), { fetch: cap.fetch });
    await client.GET('/healthz', {});
    expect(cap.headers()?.get('authorization')).toBeNull();
  });

  it('threads bearer + idempotency-key when present', async () => {
    const cap = captureHeaders();
    const client = createApiClient(
      makeEnv({ HARPA_TOKEN: 'tok_xyz', HARPA_IDEMPOTENCY_KEY: 'key-1' }),
      { fetch: cap.fetch },
    );
    await client.GET('/healthz', {});
    expect(cap.headers()?.get('authorization')).toBe('Bearer tok_xyz');
    expect(cap.headers()?.get('idempotency-key')).toBe('key-1');
  });

  it('option overrides win over env', async () => {
    const cap = captureHeaders();
    const client = createApiClient(makeEnv({ HARPA_TOKEN: 'env-tok' }), {
      token: 'override-tok',
      fetch: cap.fetch,
    });
    await client.GET('/healthz', {});
    expect(cap.headers()?.get('authorization')).toBe('Bearer override-tok');
  });
});

describe('requireToken', () => {
  it('throws MissingTokenError when token absent', () => {
    expect(() => requireToken(makeEnv())).toThrow(MissingTokenError);
  });

  it('passes when token present', () => {
    expect(() => requireToken(makeEnv({ HARPA_TOKEN: 't' }))).not.toThrow();
  });

  it('MissingTokenError carries auth exit code', () => {
    try {
      requireToken(makeEnv());
    } catch (err) {
      expect(err).toBeInstanceOf(MissingTokenError);
      expect((err as MissingTokenError).exitCode).toBe(3);
    }
  });
});
