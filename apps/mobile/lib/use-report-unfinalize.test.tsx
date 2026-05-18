/**
 * `useReportUnfinalize` integration test.
 *
 * Pitfall 13: exercises the real `request()` + `useMutation` wiring.
 * Only `fetch` is stubbed (the boundary the API client actually hits).
 *
 * Covers:
 *  - Successful POST hits the unfinalize path with the right slug + number.
 *  - 204 No Content is treated as success and triggers
 *    `report` + `projectReports` query invalidation.
 *  - 5xx surfaces as an `ApiError` on the mutation `error` field.
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Text } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useReportUnfinalize } from './use-report-unfinalize';
import { ApiError } from './api/errors';

interface RecordedCall {
  url: string;
  method: string;
  body: unknown;
}

let calls: RecordedCall[] = [];

function stubFetch(handler: (call: RecordedCall) => Response | Promise<Response>) {
  const fn = vi.fn(async (url: string, init: RequestInit = {}) => {
    let body: unknown = undefined;
    if (typeof init.body === 'string') {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    }
    const call: RecordedCall = {
      url,
      method: String(init.method ?? 'GET').toUpperCase(),
      body,
    };
    calls.push(call);
    return handler(call);
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

let tree: ReactTestRenderer | null = null;

type HookApi = ReturnType<typeof useReportUnfinalize>;

function Harness({ onReady }: { onReady: (api: HookApi) => void }) {
  const api = useReportUnfinalize();
  React.useEffect(() => {
    onReady(api);
  }, [api, onReady]);
  return <Text>harness</Text>;
}

function mount(): { qc: QueryClient; ready: Promise<HookApi> } {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const ready = new Promise<HookApi>((resolve) => {
    act(() => {
      tree = create(
        <QueryClientProvider client={qc}>
          <Harness onReady={(a) => resolve(a)} />
        </QueryClientProvider>,
      );
    });
  });
  return { qc, ready };
}

describe('useReportUnfinalize', () => {
  beforeEach(() => {
    calls = [];
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    if (tree) {
      act(() => {
        tree!.unmount();
      });
      tree = null;
    }
  });

  it('POSTs to the unfinalize path with the resolved slug + number', async () => {
    stubFetch(() => new Response(null, { status: 204 }));
    const { ready } = mount();
    const api = await ready;
    await act(async () => {
      await api.mutateAsync({ params: { project: 'highland-tower', number: 7 } });
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.url).toContain(
      '/projects/highland-tower/reports/7/unfinalize',
    );
  });

  it('invalidates report + projectReports queries on success', async () => {
    stubFetch(() => new Response(null, { status: 204 }));
    const { qc, ready } = mount();
    const api = await ready;
    const spy = vi.spyOn(qc, 'invalidateQueries');
    await act(async () => {
      await api.mutateAsync({ params: { project: 'p', number: 1 } });
    });
    const invalidated = spy.mock.calls.map((c) =>
      (c[0] as { queryKey: unknown[] }).queryKey[0],
    );
    expect(invalidated).toContain('report');
    expect(invalidated).toContain('projectReports');
  });

  it('surfaces a 5xx response as an ApiError on `error`', async () => {
    stubFetch(
      () =>
        new Response(
          JSON.stringify({ error: { code: 'server_error', message: 'boom' } }),
          { status: 500, headers: { 'Content-Type': 'application/json' } },
        ),
    );
    const { ready } = mount();
    const api = await ready;
    let caught: unknown = null;
    await act(async () => {
      try {
        await api.mutateAsync({ params: { project: 'p', number: 1 } });
      } catch (err) {
        caught = err;
      }
    });
    expect(caught).toBeInstanceOf(ApiError);
    expect((caught as ApiError).status).toBe(500);
  });
});
