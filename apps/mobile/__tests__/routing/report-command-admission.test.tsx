import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GenerateNotesProps } from '@/screens/generate-notes';
import type { UploadJob } from '@/lib/uploads/types';
import { ApiError } from '@/lib/api/errors';

const state = vi.hoisted(() => ({
  role: 'owner',
  needsRegeneration: false,
  jobs: [] as UploadJob[],
  error: null as Error | null,
  generating: false,
  finalize: vi.fn(),
  generate: vi.fn(),
  closeLimit: null as (() => void) | null,
}));
vi.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ project: 'prj_01234567', number: '7' }),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), canGoBack: () => false }),
  useFocusEffect: () => {},
}));
vi.mock('@/lib/api/hooks', () => {
  const query = (data?: unknown) => ({
    data,
    error: state.error,
    isLoading: false,
    isFetching: false,
    refetch: vi.fn(async () => undefined),
  });
  const mutation = () => ({
    isPending: false,
    isError: false,
    error: null,
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
  });
  const generate = { isPending: false, mutate: state.generate };
  return {
    useProjectQuery: () => query({ myRole: state.role }),
    useProjectMembersQuery: () => query({ items: [] }),
    useReportQuery: () =>
      query({
        id: 'rpt_01234567',
        status: 'draft',
        body: {
          meta: { title: 'Site', summary: '', visitDate: '' },
          weather: null,
          workers: [],
          materials: [],
          issues: [],
          nextSteps: [],
          summarySections: [],
        },
        updatedAt: '2026-11-11T00:00:00Z',
        generatedAt: '2026-11-11T00:00:00Z',
        notesChangedAt: '2026-11-11T00:00:00Z',
        needsRegeneration: state.needsRegeneration,
      }),
    useReportNotesQuery: () => query({ items: [] }),
    useReportDebugQuery: () => query(),
    useGenerateReportMutation: () => {
      generate.isPending = state.generating;
      return generate;
    },
    useRegenerateReportMutation: () => {
      generate.isPending = state.generating;
      return generate;
    },
    useFinalizeReportMutation: () => ({ ...mutation(), mutate: state.finalize }),
    useDeleteReportMutation: mutation,
  };
});
vi.mock('@/lib/api/optimistic', () => {
  const mutation = () => ({
    isPending: false,
    isError: false,
    error: null,
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
  });
  return {
    isOptimisticNoteId: () => false,
    useOptimisticCreateNote: mutation,
    useOptimisticDeleteNote: mutation,
    useOptimisticUpdateNote: mutation,
    usePlaceAttachment: mutation,
  };
});
vi.mock('@/features/generate/report-generation-idempotency', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/features/generate/report-generation-idempotency')>();
  let next = 0;
  return {
    ...actual,
    createReportGenerationIdempotency: () =>
      actual.createReportGenerationIdempotency(() => `test-${++next}`),
  };
});
vi.mock('@/lib/config/dev-flags', () => ({
  useDeveloperFlags: () => ({ showGenerateDebugTab: false }),
}));
vi.mock('@/lib/config/developer-tools', () => ({ SHOW_DEVELOPER_TOOLS: false }));
vi.mock('@/lib/reports/use-report-body-autosave', () => ({
  useReportBodyAutosave: () => ({
    status: 'idle',
    isAutoSaving: false,
    error: null,
    retry: vi.fn(),
  }),
}));
vi.mock('@/lib/uploads', () => ({ useFileUpload: () => ({ jobs: state.jobs }) }));
vi.mock('@/lib/camera/use-camera-uploads', () => ({
  useCameraUploads: () => ({ enqueueCameraUris: vi.fn() }),
}));
vi.mock('@/lib/camera/camera-session-registry', () => ({
  consumeCameraSession: vi.fn(),
  createCameraSession: vi.fn(),
  findCommittedSessionsForReport: () => [],
}));
vi.mock('@/components/ui/AppHeaderActions', () => ({ AppHeaderActions: () => null }));
vi.mock('@/components/account/UsageLimitDialog', () => ({
  UsageLimitDialog: ({ onClose }: { onClose: () => void }) => {
    state.closeLimit = onClose;
    return null;
  },
}));
let screen!: GenerateNotesProps;
vi.mock('@/screens/generate-notes', () => ({
  GenerateNotes: (props: GenerateNotesProps) => {
    screen = props;
    return null;
  },
}));
import GenerateReportRoute from '@/app/(app)/projects/[project]/reports/[number]/generate';
let tree: TestRenderer.ReactTestRenderer | null = null;
let client: QueryClient;
function render() {
  act(() => {
    const element = (
      <QueryClientProvider client={client}>
        <GenerateReportRoute />
      </QueryClientProvider>
    );
    if (tree) tree.update(element);
    else tree = TestRenderer.create(element);
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  state.role = 'owner';
  state.needsRegeneration = false;
  state.jobs = [];
  state.error = null;
  state.generating = false;
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});
afterEach(() => {
  if (tree) act(() => tree!.unmount());
  tree = null;
  client.clear();
});
describe('report command admission at the route boundary', () => {
  it('blocks both the controls and direct handlers while a photo is uploading', () => {
    state.jobs = [
      {
        id: 'upl_pending',
        input: { kind: 'image', reportId: 'rpt_01234567' },
        status: 'uploading',
        progress: 0.2,
        attempt: 1,
      } as UploadJob,
    ];
    render();
    act(() => {
      screen.onFinalize?.();
      screen.onRegenerate?.();
    });
    expect(state.finalize).not.toHaveBeenCalled();
    expect(state.generate).not.toHaveBeenCalled();
    expect(screen.canFinalizeReport).toBe(false);
    state.jobs = [];
    render();
    expect(screen.canFinalizeReport).toBe(true);
    act(() => {
      screen.onFinalize?.();
    });
    expect(state.finalize).toHaveBeenCalledTimes(1);
  });

  it('blocks automatic generation while a manual edit is unsaved', () => {
    render();
    act(() => {
      screen.onSetReport?.({
        meta: { title: 'Unsaved', summary: '', visitDate: '' },
        weather: null,
        workers: [],
        materials: [],
        issues: [],
        nextSteps: [],
        summarySections: [],
      });
    });
    state.needsRegeneration = true;
    render();
    expect(state.generate).not.toHaveBeenCalled();
    act(() => {
      screen.onRegenerate?.();
      screen.onFinalize?.();
    });
    expect(state.generate).not.toHaveBeenCalled();
    expect(state.finalize).not.toHaveBeenCalled();
  });

  it('keeps an edit made while generation is pending instead of replacing it with the response', () => {
    render();
    act(() => { screen.onRegenerate?.(); });
    const callbacks = state.generate.mock.calls[0]![1];
    act(() => { screen.onSetReport?.({ meta: { title: 'New local edit', summary: '', visitDate: '' }, weather: null, workers: [], materials: [], issues: [], nextSteps: [], summarySections: [] }); });
    act(() => { callbacks.onSuccess({ report: { body: { meta: { title: 'Old generated snapshot', summary: '', visitDate: '' }, weather: null, workers: [], materials: [], issues: [], nextSteps: [], summarySections: [] }, updatedAt: '2026-11-11T00:00:01Z' } }); callbacks.onSettled?.(); });
    expect(screen.report?.meta.title).toBe('New local edit');
  });

  it('requires the owner role to finalize, while an editor may generate', () => {
    state.role = 'editor';
    render();
    expect(screen.canFinalizeReport).toBe(false);
    act(() => {
      screen.onFinalize?.();
      screen.onRegenerate?.();
    });
    expect(state.finalize).not.toHaveBeenCalled();
    expect(state.generate).toHaveBeenCalledTimes(1);
  });

  it('keeps quota failure latched after closing its dialog and permits explicit retry', () => {
    state.needsRegeneration = true;
    render();
    expect(state.generate).toHaveBeenCalledTimes(1);
    const callbacks = state.generate.mock.calls[0]![1];
    const error = new ApiError({
      code: 'usage_limit_exceeded',
      status: 403,
      message: 'Monthly report limit reached.',
      details: {
        kind: 'report_generate',
        limit: 5,
        used: 5,
        remaining: 0,
        resetAt: '2026-12-01T00:00:00Z',
        plan: 'free',
        overridden: false,
      },
    });
    act(() => {
      callbacks.onError(error);
      callbacks.onSettled?.();
    });
    act(() => {
      state.closeLimit?.();
    });
    state.generating = true;
    render();
    state.generating = false;
    render();
    expect(state.generate).toHaveBeenCalledTimes(1);
    expect(screen.generationError).toBe(error.message);
    act(() => {
      screen.onRegenerate?.();
    });
    expect(state.generate).toHaveBeenCalledTimes(2);
  });
});
