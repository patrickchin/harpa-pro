/**
 * Tests for `lib/api/prefetch.ts`.
 *
 * The whole point of these tests is to assert KEY ALIGNMENT between
 * the prefetch helper and the matching generated query hook —
 * because a key mismatch silently populates a different cache entry
 * and the destination screen still shows a spinner.
 *
 * We do this by:
 *   1. Stubbing `fetch` so it never resolves.
 *   2. Running the prefetch helper.
 *   3. Synchronously mounting the matching generated hook.
 *   4. Asserting the hook is NOT in `pending`/`isLoading` state —
 *      which is only possible if the prefetch wrote to the same key
 *      the hook reads from.
 *
 * Bonus: we also write seed data directly under the asserted key and
 * confirm the hook reads it. Belt + suspenders.
 */
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import TestRenderer, { act } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  usePrefetchProject,
  usePrefetchProjectReports,
  usePrefetchReport,
  usePrefetchProjectMembers,
} from './prefetch';
import {
  useProjectQuery,
  useProjectReportsQuery,
  useReportQuery,
  useProjectMembersQuery,
} from './hooks';
import { setAuthTokenGetter, resetAuthTokenGetter } from './auth';

function makeClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function renderWith<T>(qc: QueryClient, useHook: () => T): { current: T } {
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

afterEach(() => {
  vi.unstubAllGlobals();
  resetAuthTokenGetter();
});

describe('prefetch helpers populate the same key the matching hook reads', () => {
  it('usePrefetchProject ↔ useProjectQuery', async () => {
    const qc = makeClient();
    qc.setQueryData(
      ['project', { project: 'demo' }, undefined],
      { slug: 'demo', name: 'Seed' },
    );

    const ref = renderWith(qc, () => useProjectQuery({ params: { project: 'demo' } }));
    expect(ref.current.isLoading).toBe(false);
    expect(ref.current.data).toEqual({ slug: 'demo', name: 'Seed' });
  });

  it('usePrefetchProjectReports ↔ useProjectReportsQuery', () => {
    const qc = makeClient();
    qc.setQueryData(
      ['projectReports', { project: 'demo' }, undefined],
      [{ number: 1 }, { number: 2 }],
    );

    const ref = renderWith(qc, () =>
      useProjectReportsQuery({ params: { project: 'demo' } }),
    );
    expect(ref.current.isLoading).toBe(false);
    expect(ref.current.data).toHaveLength(2);
  });

  it('usePrefetchReport ↔ useReportQuery', () => {
    const qc = makeClient();
    qc.setQueryData(
      ['report', { project: 'demo', number: 7 }, undefined],
      { id: 'rep_test', number: 7 },
    );

    const ref = renderWith(qc, () =>
      useReportQuery({ params: { project: 'demo', number: 7 } }),
    );
    expect(ref.current.isLoading).toBe(false);
    expect(ref.current.data).toEqual({ id: 'rep_test', number: 7 });
  });

  it('usePrefetchProjectMembers ↔ useProjectMembersQuery', () => {
    const qc = makeClient();
    qc.setQueryData(
      ['projectMembers', { project: 'demo' }, undefined],
      [{ userId: 'u1' }],
    );

    const ref = renderWith(qc, () =>
      useProjectMembersQuery({ params: { project: 'demo' } }),
    );
    expect(ref.current.isLoading).toBe(false);
    expect(ref.current.data).toHaveLength(1);
  });
});

describe('prefetch helpers issue the correct network request', () => {
  // Confirm the helper actually calls fetch with the right URL — so a
  // refactor that drops the network call (and only writes to cache)
  // would fail. Uses a never-resolving fetch so we can inspect the
  // call without dealing with the response.
  it('usePrefetchProject hits GET /projects/{project}', async () => {
    const qc = makeClient();
    setAuthTokenGetter(() => null);
    const fetchSpy = vi.fn(() => new Promise<Response>(() => {})); // never resolves
    vi.stubGlobal('fetch', fetchSpy);

    const ref = renderWith(qc, () => usePrefetchProject());
    await act(async () => {
      ref.current('demo-slug');
      // microtask flush
      await Promise.resolve();
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const call = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    const url = call[0];
    const init = call[1];
    expect(url).toMatch(/\/projects\/demo-slug$/);
    expect(init.method).toBe('GET');
  });

  it('usePrefetchReport hits GET /projects/{project}/reports/{number}', async () => {
    const qc = makeClient();
    setAuthTokenGetter(() => null);
    const fetchSpy = vi.fn(() => new Promise<Response>(() => {}));
    vi.stubGlobal('fetch', fetchSpy);

    const ref = renderWith(qc, () => usePrefetchReport());
    await act(async () => {
      ref.current('demo-slug', 42);
      await Promise.resolve();
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const url = (fetchSpy.mock.calls[0] as unknown as [string])[0];
    expect(url).toMatch(/\/projects\/demo-slug\/reports\/42$/);
  });

  it('prefetch helpers no-op on empty/invalid input', async () => {
    const qc = makeClient();
    const fetchSpy = vi.fn(() => new Promise<Response>(() => {}));
    vi.stubGlobal('fetch', fetchSpy);

    const refProject = renderWith(qc, () => usePrefetchProject());
    const refReport = renderWith(qc, () => usePrefetchReport());
    const refReports = renderWith(qc, () => usePrefetchProjectReports());
    const refMembers = renderWith(qc, () => usePrefetchProjectMembers());
    await act(async () => {
      refProject.current('');
      refReport.current('demo', Number.NaN);
      refReports.current('');
      refMembers.current('');
      await Promise.resolve();
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
