/**
 * `useAiProvider` server-backed behaviour tests.
 *
 * Pitfall 13 compliance: we drive the hook through real
 * `useGetAiSettingsQuery` + `useUpdateAiSettingsMutation` lifecycles
 * inside a `QueryClientProvider`. The integration boundary stubbed is
 * `fetch` — i.e. the wire — so a regression in the request shape or
 * response handling is caught here.
 */
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import TestRenderer, { act } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useAiProvider, type UseAiProviderApi } from './useAiProvider';

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => undefined),
  deleteItemAsync: vi.fn(async () => undefined),
}));
vi.mock('@/lib/api/base-url', () => ({
  getApiBaseUrl: async () => 'https://api.test.invalid',
}));
vi.mock('@/lib/api/auth', () => ({
  getAuthToken: async () => null,
  notifyUnauthorized: () => undefined,
  setAuthTokenGetter: () => undefined,
  setOnUnauthorizedCallback: () => undefined,
}));

const mockFetch = vi.fn();

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function renderHook<T>(useHook: () => T, qc: QueryClient): { current: T } {
  const ref: { current: T } = { current: undefined as unknown as T };
  function Probe() {
    ref.current = useHook();
    return null;
  }
  act(() => {
    TestRenderer.create(
      <QueryClientProvider client={qc}>
        <Probe />
      </QueryClientProvider>,
    );
  });
  return ref;
}

async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50));
  });
}

beforeEach(() => {
  mockFetch.mockReset();
  globalThis.fetch = mockFetch as unknown as typeof fetch;
});

describe('useAiProvider', () => {
  it('does not read settings when the caller disables the hook', async () => {
    const qc = makeClient();
    const ref = renderHook(() => useAiProvider({ enabled: false }), qc);
    await flush();

    expect(mockFetch).not.toHaveBeenCalled();
    expect(ref.current.isLoading).toBe(false);
    expect(ref.current.selection).toBeNull();
  });

  it('resolves selection from /settings/ai', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse(200, { vendor: 'openai', model: 'gpt-4.1-nano' }),
    );
    const qc = makeClient();
    const ref = renderHook(() => useAiProvider(), qc);
    expect(ref.current.isLoading).toBe(true);
    await flush();
    expect(ref.current.isLoading).toBe(false);
    expect(ref.current.selection).toEqual({
      vendor: 'openai',
      model: 'gpt-4.1-nano',
    });
  });

  it('selection is null when server returns nulls (the "Default" state)', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse(200, { vendor: null, model: null }),
    );
    const qc = makeClient();
    const ref = renderHook(() => useAiProvider(), qc);
    await flush();
    expect(ref.current.selection).toBeNull();
  });

  it('setSelection PATCHes /settings/ai and updates cache', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(200, { vendor: null, model: null }))
      .mockResolvedValueOnce(
        jsonResponse(200, { vendor: 'openai', model: 'gpt-4.1' }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, { vendor: 'openai', model: 'gpt-4.1' }),
      );
    const qc = makeClient();
    const ref = renderHook(() => useAiProvider(), qc);
    await flush();

    await act(async () => {
      await (ref.current as UseAiProviderApi).setSelection({
        vendor: 'openai',
        model: 'gpt-4.1',
      });
    });
    await flush();

    const patchCall = mockFetch.mock.calls.find(
      (c) => c[1]?.method === 'PATCH',
    );
    expect(patchCall).toBeTruthy();
    expect(JSON.parse(patchCall![1].body as string)).toEqual({
      vendor: 'openai',
      model: 'gpt-4.1',
    });
    expect(ref.current.selection).toEqual({ vendor: 'openai', model: 'gpt-4.1' });
  });

  it('setSelection(null) clears the row to {null, null}', async () => {
    mockFetch
      .mockResolvedValueOnce(
        jsonResponse(200, { vendor: 'openai', model: 'gpt-4.1' }),
      )
      .mockResolvedValueOnce(jsonResponse(200, { vendor: null, model: null }))
      .mockResolvedValueOnce(jsonResponse(200, { vendor: null, model: null }));
    const qc = makeClient();
    const ref = renderHook(() => useAiProvider(), qc);
    await flush();

    await act(async () => {
      await (ref.current as UseAiProviderApi).setSelection(null);
    });
    await flush();

    const patchCall = mockFetch.mock.calls.find(
      (c) => c[1]?.method === 'PATCH',
    );
    expect(JSON.parse(patchCall![1].body as string)).toEqual({
      vendor: null,
      model: null,
    });
    expect(ref.current.selection).toBeNull();
  });
});
