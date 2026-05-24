/**
 * Unit tests for `lib/api/optimistic.ts`.
 *
 * Drives the optimistic wrappers via real `useMutation` lifecycles
 * inside a `QueryClientProvider`. `useAuthSession` is mocked because
 * the provider has dev-only multi-mount assertions + side effects we
 * don't need here. `fetch` is stubbed so the mutation actually
 * resolves / rejects.
 *
 * Covers:
 *  - create: optimistic insert → swap to server row on success
 *  - create: rollback on error restores the original cache
 *  - update: optimistic patch → rollback on error
 *  - delete: optimistic remove → rollback on error
 *  - `isOptimisticNoteId` correctly classifies temp ids
 */
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import TestRenderer, { act } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import {
  isOptimisticNoteId,
  isOptimisticReportId,
  optimisticNoteId,
  optimisticReportId,
  useOptimisticCreateNote,
  useOptimisticCreateReport,
  useOptimisticDeleteNote,
  useOptimisticUpdateNote,
} from './optimistic';

// Avoid pulling the real native modules transitively through
// `@/lib/auth` and `@/lib/uuid`. We mock `useAuthSession` directly so
// the real auth provider never has to initialise its secure-store
// bootstrap, and stub the native imports for completeness.
vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => undefined),
  deleteItemAsync: vi.fn(async () => undefined),
}));
vi.mock('expo-crypto', () => ({
  randomUUID: () =>
    `${Math.random().toString(16).slice(2, 10)}-1111-2222-3333-${Math.random()
      .toString(16)
      .slice(2, 14)}`,
}));

vi.mock('@/lib/auth', () => ({
  useAuthSession: () => ({ user: { id: 'usr_test12345' } }),
}));
vi.mock('./base-url', () => ({
  getApiBaseUrl: async () => 'https://api.test.invalid',
}));
vi.mock('./auth', () => ({
  getAuthToken: async () => null,
  notifyUnauthorized: () => undefined,
  setAuthTokenGetter: () => undefined,
  setOnUnauthorizedCallback: () => undefined,
}));

type NoteRow = {
  id: string;
  reportId: string;
  authorId: string;
  kind: 'text' | 'voice' | 'image' | 'document';
  body: string | null;
  fileId: string | null;
  transcript: string | null;
  createdAt: string;
  updatedAt: string;
};
type NotesPage = { items: NoteRow[]; nextCursor: string | null };

const REPORT = 'rpt_demo000001';
const NOTES_KEY = ['reportNotes', { report: REPORT }, undefined] as const;

function seedNote(id: string, body: string): NoteRow {
  const t = new Date().toISOString();
  return {
    id,
    reportId: REPORT,
    authorId: 'usr_other00001',
    kind: 'text',
    body,
    fileId: null,
    transcript: null,
    createdAt: t,
    updatedAt: t,
  };
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

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function defer<T>(): { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void } {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('optimisticNoteId / isOptimisticNoteId', () => {
  it('mints an id with the not_opt prefix', () => {
    const id = optimisticNoteId();
    expect(id.startsWith('not_opt')).toBe(true);
    expect(isOptimisticNoteId(id)).toBe(true);
  });

  it('rejects server ids', () => {
    expect(isOptimisticNoteId('not_real00000001')).toBe(false);
    expect(isOptimisticNoteId(undefined)).toBe(false);
    expect(isOptimisticNoteId(null)).toBe(false);
  });
});

describe('useOptimisticCreateNote', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('inserts a temp row immediately and swaps for the server response on success', async () => {
    const qc = makeClient();
    qc.setQueryData<NotesPage>(NOTES_KEY, {
      items: [seedNote('not_seed00000001', 'existing')],
      nextCursor: null,
    });

    const serverRow: NoteRow = {
      ...seedNote('not_real00000001', 'hello'),
      authorId: 'usr_test12345',
    };
    const gate = defer<Response>();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => gate.promise),
    );

    const hookRef = renderHook(() => useOptimisticCreateNote(), qc);

    let promise!: Promise<unknown>;
    await act(async () => {
      promise = hookRef.current.mutateAsync({
        params: { report: REPORT },
        body: { kind: 'text', body: 'hello' },
      });
      // Let onMutate run (it awaits cancelQueries).
      await Promise.resolve();
      await Promise.resolve();
    });

    const pendingPage = qc.getQueryData<NotesPage>(NOTES_KEY)!;
    expect(pendingPage.items).toHaveLength(2);
    const tempRow = pendingPage.items.find((n) =>
      isOptimisticNoteId(n.id),
    );
    expect(tempRow).toBeDefined();
    expect(tempRow!.body).toBe('hello');
    expect(tempRow!.authorId).toBe('usr_test12345');

    gate.resolve(jsonResponse(201, serverRow));
    await act(async () => {
      await promise;
    });

    const finalPage = qc.getQueryData<NotesPage>(NOTES_KEY)!;
    const ids = finalPage.items.map((n) => n.id);
    expect(ids).toContain('not_real00000001');
    expect(ids.some(isOptimisticNoteId)).toBe(false);
  });

  it('rolls back the cache when the mutation rejects', async () => {
    const qc = makeClient();
    const initial: NotesPage = {
      items: [seedNote('not_seed00000002', 'existing')],
      nextCursor: null,
    };
    qc.setQueryData<NotesPage>(NOTES_KEY, initial);

    const gate = defer<Response>();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => gate.promise),
    );

    const hookRef = renderHook(() => useOptimisticCreateNote(), qc);

    let promise!: Promise<unknown>;
    await act(async () => {
      promise = hookRef.current.mutateAsync({
        params: { report: REPORT },
        body: { kind: 'text', body: 'will-fail' },
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(qc.getQueryData<NotesPage>(NOTES_KEY)!.items).toHaveLength(2);

    gate.resolve(
      jsonResponse(500, { error: { code: 'internal', message: 'boom' } }),
    );
    await act(async () => {
      await expect(promise).rejects.toBeDefined();
    });

    const afterPage = qc.getQueryData<NotesPage>(NOTES_KEY)!;
    expect(afterPage.items).toHaveLength(1);
    expect(afterPage.items[0]!.id).toBe('not_seed00000002');
  });
});

describe('useOptimisticUpdateNote', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('patches the cached row immediately, rolls back on error', async () => {
    const qc = makeClient();
    qc.setQueryData<NotesPage>(NOTES_KEY, {
      items: [seedNote('not_target0001', 'before')],
      nextCursor: null,
    });

    const gate = defer<Response>();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => gate.promise),
    );

    const hookRef = renderHook(() => useOptimisticUpdateNote(), qc);

    let promise!: Promise<unknown>;
    await act(async () => {
      promise = hookRef.current.mutateAsync({
        params: { note: 'not_target0001' },
        body: { body: 'after' },
        reportId: REPORT,
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(qc.getQueryData<NotesPage>(NOTES_KEY)!.items[0]!.body).toBe('after');

    gate.resolve(jsonResponse(500, { error: { code: 'i', message: 'x' } }));
    await act(async () => {
      await expect(promise).rejects.toBeDefined();
    });

    expect(qc.getQueryData<NotesPage>(NOTES_KEY)!.items[0]!.body).toBe('before');
  });
});

describe('useOptimisticDeleteNote', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('removes the cached row immediately, rolls back on error', async () => {
    const qc = makeClient();
    qc.setQueryData<NotesPage>(NOTES_KEY, {
      items: [
        seedNote('not_keep000001', 'keep'),
        seedNote('not_drop000001', 'drop'),
      ],
      nextCursor: null,
    });

    const gate = defer<Response>();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => gate.promise),
    );

    const hookRef = renderHook(() => useOptimisticDeleteNote(), qc);

    let promise!: Promise<unknown>;
    await act(async () => {
      promise = hookRef.current.mutateAsync({
        params: { note: 'not_drop000001' },
        reportId: REPORT,
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(qc.getQueryData<NotesPage>(NOTES_KEY)!.items).toHaveLength(1);

    gate.resolve(jsonResponse(500, { error: { code: 'i', message: 'x' } }));
    await act(async () => {
      await expect(promise).rejects.toBeDefined();
    });

    const items = qc.getQueryData<NotesPage>(NOTES_KEY)!.items;
    expect(items.map((n) => n.id)).toEqual([
      'not_keep000001',
      'not_drop000001',
    ]);
  });
});

// ─── reports ─────────────────────────────────────────────────

type ReportRow = {
  id: string;
  number: number;
  projectId: string;
  status: 'draft' | 'finalized';
  visitDate: string | null;
  body: unknown;
  notesSinceLastGeneration: number;
  generatedAt: string | null;
  finalizedAt: string | null;
  pdfUrl: string | null;
  createdAt: string;
  updatedAt: string;
};
type ReportsPage = { items: ReportRow[]; nextCursor: string | null };

const PROJECT = 'demo-tower';
const REPORTS_KEY = ['projectReports', { project: PROJECT }, undefined] as const;

function seedReport(id: string, number: number): ReportRow {
  const t = new Date().toISOString();
  return {
    id,
    number,
    projectId: 'prj_demo00000001',
    status: 'finalized',
    visitDate: null,
    body: null,
    notesSinceLastGeneration: 0,
    generatedAt: null,
    finalizedAt: t,
    pdfUrl: null,
    createdAt: t,
    updatedAt: t,
  };
}

describe('optimisticReportId / isOptimisticReportId', () => {
  it('mints an id with the rep_opt prefix', () => {
    const id = optimisticReportId();
    expect(id.startsWith('rep_opt')).toBe(true);
    expect(isOptimisticReportId(id)).toBe(true);
  });

  it('rejects server ids', () => {
    expect(isOptimisticReportId('rep_real00000001')).toBe(false);
    expect(isOptimisticReportId(undefined)).toBe(false);
    expect(isOptimisticReportId(null)).toBe(false);
  });
});

describe('useOptimisticCreateReport', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('inserts a temp draft row immediately and swaps for the server response on success', async () => {
    const qc = makeClient();
    qc.setQueryData<ReportsPage>(REPORTS_KEY, {
      items: [seedReport('rep_seed00000001', 1)],
      nextCursor: null,
    });

    const serverRow: ReportRow = {
      ...seedReport('rep_real00000001', 2),
      status: 'draft',
      finalizedAt: null,
    };
    const gate = defer<Response>();
    vi.stubGlobal('fetch', vi.fn(async () => gate.promise));

    const hookRef = renderHook(() => useOptimisticCreateReport(), qc);

    let promise!: Promise<unknown>;
    await act(async () => {
      promise = hookRef.current.mutateAsync({
        params: { project: PROJECT },
        body: {},
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    const pendingPage = qc.getQueryData<ReportsPage>(REPORTS_KEY)!;
    expect(pendingPage.items).toHaveLength(2);
    const tempRow = pendingPage.items.find((r) => isOptimisticReportId(r.id));
    expect(tempRow).toBeDefined();
    expect(tempRow!.status).toBe('draft');
    // Optimistic row is prepended so it sorts to the top of the list.
    expect(pendingPage.items[0]!.id).toBe(tempRow!.id);

    gate.resolve(jsonResponse(201, serverRow));
    await act(async () => {
      await promise;
    });

    const finalPage = qc.getQueryData<ReportsPage>(REPORTS_KEY)!;
    const ids = finalPage.items.map((r) => r.id);
    expect(ids).toContain('rep_real00000001');
    expect(ids.some(isOptimisticReportId)).toBe(false);
  });

  it('rolls back the cache when the mutation rejects', async () => {
    const qc = makeClient();
    const initial: ReportsPage = {
      items: [seedReport('rep_seed00000002', 1)],
      nextCursor: null,
    };
    qc.setQueryData<ReportsPage>(REPORTS_KEY, initial);

    const gate = defer<Response>();
    vi.stubGlobal('fetch', vi.fn(async () => gate.promise));

    const hookRef = renderHook(() => useOptimisticCreateReport(), qc);

    let promise!: Promise<unknown>;
    await act(async () => {
      promise = hookRef.current.mutateAsync({
        params: { project: PROJECT },
        body: {},
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(qc.getQueryData<ReportsPage>(REPORTS_KEY)!.items).toHaveLength(2);

    gate.resolve(jsonResponse(500, { error: { code: 'i', message: 'x' } }));
    await act(async () => {
      await expect(promise).rejects.toBeDefined();
    });

    const after = qc.getQueryData<ReportsPage>(REPORTS_KEY)!;
    expect(after.items).toHaveLength(1);
    expect(after.items[0]!.id).toBe('rep_seed00000002');
  });

  it('leaves other projects\' caches untouched', async () => {
    const qc = makeClient();
    const otherKey = ['projectReports', { project: 'other-proj' }, undefined] as const;
    const otherInitial: ReportsPage = {
      items: [seedReport('rep_other00000001', 5)],
      nextCursor: null,
    };
    qc.setQueryData<ReportsPage>(REPORTS_KEY, { items: [], nextCursor: null });
    qc.setQueryData<ReportsPage>(otherKey, otherInitial);

    const gate = defer<Response>();
    vi.stubGlobal('fetch', vi.fn(async () => gate.promise));

    const hookRef = renderHook(() => useOptimisticCreateReport(), qc);

    await act(async () => {
      hookRef.current.mutate({ params: { project: PROJECT }, body: {} });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(qc.getQueryData<ReportsPage>(REPORTS_KEY)!.items).toHaveLength(1);
    expect(qc.getQueryData<ReportsPage>(otherKey)!.items).toEqual(
      otherInitial.items,
    );

    gate.resolve(jsonResponse(201, seedReport('rep_real00000099', 6)));
  });
});
