/**
 * Client behaviour tests. Stubs the global `fetch` so we can assert on
 * the outgoing request and on how the response (or transport failure)
 * is mapped into an `ApiError` envelope.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { request, substitutePath } from './client';
import { ApiError } from './errors';
import {
  setAuthTokenGetter,
  resetAuthTokenGetter,
  setOnUnauthorizedCallback,
  resetOnUnauthorizedCallback,
} from './auth';

interface FetchCall {
  url: string;
  init: RequestInit;
}

function stubFetch(handler: (call: FetchCall) => Response | Promise<Response>) {
  const fn = vi.fn(async (url: string, init: RequestInit = {}) => {
    return handler({ url, init });
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('lib/api/client', () => {
  beforeEach(() => {
    resetAuthTokenGetter();
    resetOnUnauthorizedCallback();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    resetAuthTokenGetter();
    resetOnUnauthorizedCallback();
  });

  describe('substitutePath', () => {
    it('substitutes path params and url-encodes values', () => {
      expect(
        substitutePath('/projects/{id}/members/{userId}', {
          id: 'p1',
          userId: 'user with space',
        }),
      ).toBe('/projects/p1/members/user%20with%20space');
    });

    it('throws ApiError when a required placeholder is unfilled', () => {
      expect(() => substitutePath('/projects/{id}', {})).toThrow(ApiError);
    });
  });

  describe('happy path', () => {
    it('issues GET, parses JSON response', async () => {
      const fetchFn = stubFetch(() =>
        jsonResponse(200, { items: [], nextCursor: null }),
      );
      const data = await request('/projects', 'get');
      expect(data).toEqual({ items: [], nextCursor: null });
      expect(fetchFn).toHaveBeenCalledTimes(1);
      const call = fetchFn.mock.calls[0]!;
      expect(call[0]).toBe('http://localhost:8787/projects');
      expect(call[1]?.method).toBe('GET');
      expect(call[1]?.body).toBeUndefined();
    });

    it('serialises JSON body for POST and sets Content-Type', async () => {
      const fetchFn = stubFetch(() =>
        jsonResponse(200, { verificationId: 'v1' }),
      );
      await request('/auth/otp/start', 'post', { body: { phone: '+15551234567' } });
      const init = fetchFn.mock.calls[0]![1]!;
      expect(init.method).toBe('POST');
      expect(init.body).toBe(JSON.stringify({ phone: '+15551234567' }));
      const headers = init.headers as Record<string, string>;
      expect(headers['Content-Type']).toBe('application/json');
    });

    it('substitutes path params + serialises query params', async () => {
      const fetchFn = stubFetch(() => jsonResponse(200, { items: [], nextCursor: null }));
      await request('/projects/{id}/reports', 'get', {
        params: { id: 'proj-42' },
        query: { cursor: 'abc', limit: 10 } as never,
      });
      expect(fetchFn.mock.calls[0]![0]).toBe(
        'http://localhost:8787/projects/proj-42/reports?cursor=abc&limit=10',
      );
    });

    it('returns undefined for 204 No Content', async () => {
      stubFetch(() => new Response(null, { status: 204 }));
      const result = await request('/notes/{noteId}', 'delete', {
        params: { noteId: '00000000-0000-0000-0000-000000000001' },
      });
      expect(result).toBeUndefined();
    });
  });

  describe('auth', () => {
    it('attaches Authorization header from the token getter', async () => {
      setAuthTokenGetter(() => 'jwt-abc');
      const fetchFn = stubFetch(() => jsonResponse(200, { user: null }));
      await request('/me', 'get');
      const headers = fetchFn.mock.calls[0]![1]!.headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer jwt-abc');
    });

    it('omits Authorization when the getter returns null', async () => {
      const fetchFn = stubFetch(() => jsonResponse(200, { user: null }));
      await request('/me', 'get');
      const headers = fetchFn.mock.calls[0]![1]!.headers as Record<string, string>;
      expect(headers['Authorization']).toBeUndefined();
    });

    it('awaits async token getters', async () => {
      setAuthTokenGetter(async () => 'async-jwt');
      const fetchFn = stubFetch(() => jsonResponse(200, { user: null }));
      await request('/me', 'get');
      const headers = fetchFn.mock.calls[0]![1]!.headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer async-jwt');
    });
  });

  describe('errors', () => {
    it('maps a 401 envelope to ApiError(unauthorized) preserving requestId', async () => {
      stubFetch(() =>
        jsonResponse(401, {
          error: { code: 'unauthorized', message: 'Bad token', requestId: 'req-9' },
        }),
      );
      try {
        await request('/me', 'get');
        throw new Error('expected throw');
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        const e = err as ApiError;
        expect(e.code).toBe('unauthorized');
        expect(e.status).toBe(401);
        expect(e.requestId).toBe('req-9');
      }
    });

    it('falls back to status-derived code when body is empty', async () => {
      stubFetch(() => new Response(null, { status: 500 }));
      try {
        await request('/me', 'get');
        throw new Error('expected throw');
      } catch (err) {
        const e = err as ApiError;
        expect(e.code).toBe('server_error');
        expect(e.status).toBe(500);
      }
    });

    it('maps a transport failure to ApiError(network_error)', async () => {
      stubFetch(() => {
        throw new TypeError('Failed to fetch');
      });
      try {
        await request('/me', 'get');
        throw new Error('expected throw');
      } catch (err) {
        const e = err as ApiError;
        expect(e.code).toBe('network_error');
        expect(e.status).toBe(0);
      }
    });

    it('throws parse_error on malformed JSON success body', async () => {
      stubFetch(
        () =>
          new Response('{not json', {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
      );
      try {
        await request('/me', 'get');
        throw new Error('expected throw');
      } catch (err) {
        const e = err as ApiError;
        expect(e.code).toBe('parse_error');
      }
    });
  });

  describe('headers', () => {
    it('forwards a per-call Idempotency-Key header', async () => {
      const fetchFn = stubFetch(() => jsonResponse(200, {} as unknown));
      await request('/voice/transcribe', 'post', {
        body: { fileId: '00000000-0000-0000-0000-000000000001' } as never,
        headers: { 'Idempotency-Key': 'idem-1' },
      });
      const headers = fetchFn.mock.calls[0]![1]!.headers as Record<string, string>;
      expect(headers['Idempotency-Key']).toBe('idem-1');
    });
  });

  describe('unauthorized callback', () => {
    it('fires the global onUnauthorized callback on a 401, then throws', async () => {
      const onUnauth = vi.fn();
      setOnUnauthorizedCallback(onUnauth);
      stubFetch(() =>
        jsonResponse(401, {
          error: { code: 'unauthorized', message: 'expired' },
        }),
      );
      await expect(request('/me', 'get')).rejects.toBeInstanceOf(ApiError);
      expect(onUnauth).toHaveBeenCalledTimes(1);
    });

    it('does NOT fire the callback on non-401 errors', async () => {
      const onUnauth = vi.fn();
      setOnUnauthorizedCallback(onUnauth);
      stubFetch(() =>
        jsonResponse(500, {
          error: { code: 'server_error', message: 'boom' },
        }),
      );
      await expect(request('/me', 'get')).rejects.toBeInstanceOf(ApiError);
      expect(onUnauth).not.toHaveBeenCalled();
    });

    it('still throws ApiError(unauthorized) even if the callback throws', async () => {
      setOnUnauthorizedCallback(() => {
        throw new Error('handler bug');
      });
      stubFetch(() =>
        jsonResponse(401, { error: { code: 'unauthorized', message: 'x' } }),
      );
      try {
        await request('/me', 'get');
        throw new Error('expected throw');
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        expect((err as ApiError).code).toBe('unauthorized');
      }
    });
  });
});
