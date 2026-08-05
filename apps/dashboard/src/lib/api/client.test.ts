import { describe, expect, it, vi } from 'vitest';

import { createApiClient, type ApiError } from './client';

describe('createApiClient', () => {
  it('encodes params, serializes input, and always includes browser credentials', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'prj_1',
          name: 'Harbor House',
          clientName: 'Northstar',
          address: null,
          ownerId: 'usr_1',
          myRole: 'owner',
          createdAt: '2026-07-01T00:00:00.000Z',
          updatedAt: '2026-07-29T00:00:00.000Z',
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
    );
    const client = createApiClient({
      baseUrl: 'https://api.harpapro.com/',
      fetch: fetchMock,
    });

    await client.request('/projects/{project}', 'patch', {
      params: { project: 'harbor house' },
      body: { name: 'Harbor House' },
      headers: { 'Idempotency-Key': 'dashboard-1' },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.harpapro.com/projects/harbor%20house',
      expect.objectContaining({
        method: 'PATCH',
        credentials: 'include',
        body: JSON.stringify({ name: 'Harbor House' }),
        headers: expect.objectContaining({
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'Idempotency-Key': 'dashboard-1',
        }),
      }),
    );
  });

  it('serializes only defined query values', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ items: [], nextCursor: null }), {
        status: 200,
      }),
    );
    const client = createApiClient({
      baseUrl: 'https://api.harpapro.com',
      fetch: fetchMock,
    });

    await client.request('/projects', 'get', {
      query: { cursor: undefined, limit: 25 },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.harpapro.com/projects?limit=25',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('turns API error envelopes into a stable ApiError', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: 'forbidden',
            message: 'Owners only.',
            details: { role: 'viewer' },
            requestId: 'req_123',
          },
        }),
        { status: 403 },
      ),
    );
    const client = createApiClient({
      baseUrl: 'https://api.harpapro.com',
      fetch: fetchMock,
    });

    await expect(
      client.request('/projects/{project}/members', 'post', {
        params: { project: 'harbor-house' },
        body: { email: 'member@example.com', role: 'viewer' },
      }),
    ).rejects.toEqual(
      expect.objectContaining<ApiError>({
        name: 'ApiError',
        code: 'forbidden',
        message: 'Owners only.',
        status: 403,
        requestId: 'req_123',
      }),
    );
  });

  it('returns undefined for a successful empty response', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
    const client = createApiClient({
      baseUrl: 'https://api.harpapro.com',
      fetch: fetchMock,
    });

    await expect(
      client.request('/projects/{project}', 'delete', {
        params: { project: 'harbor-house' },
      }),
    ).resolves.toBeUndefined();
  });

  it('maps transport failures without leaking fetch-specific error types', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch'));
    const client = createApiClient({
      baseUrl: 'https://api.harpapro.com',
      fetch: fetchMock,
    });

    await expect(client.request('/projects', 'get')).rejects.toEqual(
      expect.objectContaining({
        code: 'network_error',
        status: 0,
        message: 'Failed to fetch',
      }),
    );
  });
});
