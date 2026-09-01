import { afterEach, describe, expect, it, vi } from 'vitest';

import { loadAdminObservation } from './admin-observation';

vi.mock('./env', () => ({
  getPublicEnv: () => ({ apiBaseUrl: 'https://api.example.test' }),
}));

const observation = { status: 'available' as const, value: 7 };
const schema = {
  safeParse(value: unknown) {
    return typeof value === 'object' &&
      value !== null &&
      'status' in value &&
      value.status === observation.status &&
      'value' in value &&
      value.value === observation.value
      ? { success: true as const, data: observation }
      : { success: false as const };
  },
};

describe('loadAdminObservation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads and validates an authenticated no-store observation', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(observation), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(loadAdminObservation('/admin/operations/example', schema)).resolves.toEqual({
      status: 'ready',
      observation,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.test/admin/operations/example',
      {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
      },
    );
  });

  it('returns unauthorized without parsing the response body', async () => {
    const json = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ status: 401, ok: false, json } satisfies Partial<Response>),
    );

    await expect(loadAdminObservation('/admin/operations/example', schema)).resolves.toEqual({
      status: 'unauthorized',
    });
    expect(json).not.toHaveBeenCalled();
  });

  it('returns the status for an HTTP failure without parsing the response body', async () => {
    const json = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ status: 429, ok: false, json } satisfies Partial<Response>),
    );

    await expect(loadAdminObservation('/admin/operations/example', schema)).resolves.toEqual({
      status: 'http-error',
      responseStatus: 429,
    });
    expect(json).not.toHaveBeenCalled();
  });

  it('returns network-error when fetch rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));

    await expect(loadAdminObservation('/admin/operations/example', schema)).resolves.toEqual({
      status: 'network-error',
    });
  });

  it.each([
    ['JSON parsing fails', () => Promise.reject(new SyntaxError('invalid JSON'))],
    ['schema validation fails', () => Promise.resolve({ unexpected: true })],
  ])('returns invalid-response when %s', async (_caseName, json) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ status: 200, ok: true, json } satisfies Partial<Response>),
    );

    await expect(loadAdminObservation('/admin/operations/example', schema)).resolves.toEqual({
      status: 'invalid-response',
    });
  });
});
