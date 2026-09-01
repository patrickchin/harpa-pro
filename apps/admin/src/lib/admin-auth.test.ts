import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./env', () => ({
  getPublicEnv: () => ({ apiBaseUrl: 'https://api.example.test' }),
}));

import { adminAuthClient } from './admin-auth';

const csrfToken = 'A'.repeat(43);
const session = {
  authenticated: true,
  email: 'admin@harpapro.com',
  csrfToken,
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => vi.restoreAllMocks());

describe('adminAuthClient', () => {
  it('reads a dedicated admin session and keeps its CSRF token in the returned value', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(session));

    await expect(adminAuthClient.getSession()).resolves.toEqual(session);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.test/admin/auth/session',
      expect.objectContaining({ credentials: 'include', cache: 'no-store' }),
    );
  });

  it('returns null only for an unauthorized session response', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 401 }));

    await expect(adminAuthClient.getSession()).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('rejects unavailable and malformed session responses', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(jsonResponse({ ...session, csrfToken: 'too-short' }))
      .mockResolvedValueOnce(jsonResponse({ authenticated: true, email: session.email }));

    await expect(adminAuthClient.getSession()).rejects.toMatchObject({ code: 'unavailable' });
    await expect(adminAuthClient.getSession()).rejects.toThrow('Invalid admin session response');
    await expect(adminAuthClient.getSession()).rejects.toThrow('Invalid admin session response');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('logs in with an exact credentialed JSON request and returns the CSRF-bearing session', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(session));

    await expect(
      adminAuthClient.login({ email: session.email, password: 'test-password' }),
    ).resolves.toEqual(session);
    expect(fetchMock).toHaveBeenCalledWith('https://api.example.test/admin/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      cache: 'no-store',
      body: JSON.stringify({ email: session.email, password: 'test-password' }),
    });
  });

  it.each([
    [401, 'invalid_credentials'],
    [429, 'rate_limited'],
    [503, 'unavailable'],
  ] as const)('maps login HTTP %i to %s', async (status, code) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status }));

    await expect(
      adminAuthClient.login({ email: session.email, password: 'test-password' }),
    ).rejects.toMatchObject({ code });
  });

  it('accepts successful and already-unauthorized logout responses', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 401 }));

    await expect(adminAuthClient.logout()).resolves.toBeUndefined();
    await expect(adminAuthClient.logout()).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenNthCalledWith(1, 'https://api.example.test/admin/auth/logout', {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
    });
  });

  it('reports other logout failures as unavailable', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 503 }));

    await expect(adminAuthClient.logout()).rejects.toMatchObject({ code: 'unavailable' });
  });
});
