import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TestRenderer, { act } from 'react-test-renderer';

type GenerateRouteProps = {
  showDebugTab?: boolean;
};

type SavedReportRouteProps = {
  showDeveloperSection: boolean;
  onOpenDebug?: () => void;
};

const gateState = vi.hoisted(() => ({ visible: false }));
const screenState = vi.hoisted(() => ({
  generateProps: null as GenerateRouteProps | null,
  savedReportProps: null as SavedReportRouteProps | null,
}));
const hookSpies = vi.hoisted(() => ({
  useRouter: vi.fn(),
  useLocalSearchParams: vi.fn(),
  useDeveloperFlags: vi.fn(() => ({
    showGenerateDebugTab: true,
    setShowGenerateDebugTab: vi.fn(),
    isLoaded: true,
  })),
  useReportDebugQuery: vi.fn((_input: unknown, _options?: { enabled?: boolean }) => ({
    data: undefined,
    error: null,
    isLoading: false,
  })),
}));

vi.mock('@/lib/config/developer-tools', () => {
  const exports: Record<string, unknown> = {};
  Object.defineProperty(exports, 'SHOW_DEVELOPER_TOOLS', {
    enumerable: true,
    get: () => gateState.visible,
  });
  return exports;
});

vi.mock('expo-router', () => {
  const router = {
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    canGoBack: vi.fn(() => false),
  };
  return {
    useRouter: () => {
      React.useState(null);
      hookSpies.useRouter();
      return router;
    },
    useLocalSearchParams: () => {
      React.useState(null);
      hookSpies.useLocalSearchParams();
      return { project: 'harbour-tower', number: '7' };
    },
    useFocusEffect: (_callback: () => void) => {
      React.useState(null);
    },
  };
});

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => {
    React.useState(null);
    return {
      clear: vi.fn(),
      getQueryData: vi.fn(),
      getQueryState: vi.fn(),
      invalidateQueries: vi.fn(async () => undefined),
      refetchQueries: vi.fn(async () => undefined),
    };
  },
}));

vi.mock('@/lib/api/hooks', () => {
  function useHookValue<T>(value: T): T {
    React.useState(null);
    return value;
  }

  function query(data?: unknown) {
    return {
      data,
      error: null,
      isLoading: false,
      isFetching: false,
      refetch: vi.fn(async () => undefined),
    };
  }

  function mutation() {
    return {
      error: null,
      isError: false,
      isPending: false,
      mutate: vi.fn(),
      mutateAsync: vi.fn(async () => ({})),
    };
  }

  return {
    useProjectQuery: () => useHookValue(query({ name: 'Harbour Tower', myRole: 'owner' })),
    useProjectMembersQuery: () => useHookValue(query({ items: [] })),
    useReportQuery: () =>
      useHookValue(
        query({
          id: 'rep_7',
          status: 'draft',
          body: null,
          updatedAt: '2026-08-21T00:00:00.000Z',
          generatedAt: null,
          notesChangedAt: null,
          needsRegeneration: false,
        }),
      ),
    useReportNotesQuery: () => useHookValue(query({ items: [] })),
    useReportCommentsQuery: () => useHookValue(query({ items: [] })),
    useCreateReportCommentMutation: () => useHookValue(mutation()),
    useDeleteReportMutation: () => useHookValue(mutation()),
    useUnfinalizeReportMutation: () => useHookValue(mutation()),
    useGenerateReportMutation: () => useHookValue(mutation()),
    useRegenerateReportMutation: () => useHookValue(mutation()),
    useFinalizeReportMutation: () => useHookValue(mutation()),
    useReportDebugQuery: (input: unknown, options?: { enabled?: boolean }) => {
      React.useState(null);
      return hookSpies.useReportDebugQuery(input, options);
    },
  };
});

vi.mock('@/lib/config/dev-flags', () => ({
  useDeveloperFlags: () => {
    React.useState(null);
    return hookSpies.useDeveloperFlags();
  },
}));

vi.mock('@/lib/api/optimistic', () => {
  function useMutation() {
    React.useState(null);
    return {
      error: null,
      isError: false,
      isPending: false,
      mutate: vi.fn(),
      mutateAsync: vi.fn(async () => ({})),
    };
  }

  return {
    isOptimisticNoteId: () => false,
    useOptimisticCreateNote: useMutation,
    useOptimisticDeleteNote: useMutation,
    useOptimisticUpdateNote: useMutation,
    usePlaceAttachment: useMutation,
  };
});

vi.mock('@/lib/api/initial-data', () => ({
  projectInitialData: () => undefined,
  projectInitialDataUpdatedAt: () => undefined,
  reportInitialData: () => undefined,
  reportInitialDataUpdatedAt: () => undefined,
}));
vi.mock('@/lib/api/to-report-note-row', () => ({ toReportNoteRows: () => [] }));
vi.mock('@/lib/api/invalidation', () => ({
  invalidateAfterFileUpload: vi.fn(async () => undefined),
}));
vi.mock('@/lib/config/env', () => ({ env: { EXPO_PUBLIC_USE_FIXTURES: false } }));
vi.mock('@/lib/dev-fixtures/sample-report', () => ({ SAMPLE_GENERATED_REPORT: null }));

vi.mock('@/lib/util/use-refresh', () => ({
  useRefresh: () => {
    React.useState(null);
    return { refreshing: false, onRefresh: vi.fn() };
  },
}));
vi.mock('@/lib/reports/use-report-pdf-actions', () => ({
  useReportPdfActions: () => {
    React.useState(null);
    return {};
  },
}));
vi.mock('@/lib/reports/use-report-body-autosave', () => ({
  useReportBodyAutosave: () => {
    React.useState(null);
    return { error: null, isAutoSaving: false };
  },
}));
vi.mock('@/features/generate/useAutoRegenerate', () => ({
  useAutoRegenerate: () => {
    React.useState(null);
  },
}));

vi.mock('@/lib/reports/upload-sync-state', () => ({
  countNonCancelledUploadFailures: () => 0,
  getReportPhotoUploadQueueState: () => ({ activeCount: 0, failedCount: 0 }),
  initialUploadSyncState: { error: null },
  isUnreflectedCompletedReportPhotoJob: () => false,
  isUploadCancellation: () => false,
  isUploadSyncPending: () => false,
  uploadSyncReducer: (state: { error: string | null }) => state,
}));
vi.mock('@/features/generate/report-generation-idempotency', () => ({
  acceptReportGenerationSuccess: vi.fn(),
  createReportGenerationIdempotency: () => ({
    attempt: vi.fn(() => ({ key: 'generation-key', operation: 'generate' })),
    failed: vi.fn(),
  }),
}));
vi.mock('@/lib/reports/generation-sync', () => ({
  reportGenerationStateTestId: () => 'report-generation-current',
}));

vi.mock('@/lib/camera/camera-session-registry', () => ({
  consumeCameraSession: () => null,
  createCameraSession: () => 'camera-session',
  findCommittedSessionsForReport: () => [],
}));
vi.mock('@/lib/camera/use-camera-uploads', () => ({
  useCameraUploads: () => {
    React.useState(null);
    return { enqueueCameraUris: vi.fn(async () => []) };
  },
}));
vi.mock('@/lib/camera/pick-and-enqueue-gallery-images', () => ({
  pickAndEnqueueGalleryImages: vi.fn(async () => ({ kind: 'cancelled' })),
}));
vi.mock('@/lib/uploads', () => ({
  useFileUpload: () => {
    React.useState(null);
    return { jobs: [] };
  },
}));

vi.mock('@/components/account/UsageLimitDialog', () => ({ UsageLimitDialog: () => null }));
vi.mock('@/components/ui/AppHeaderActions', () => ({ AppHeaderActions: () => null }));
vi.mock('@/screens/generate-notes', () => ({
  GenerateNotes: (props: GenerateRouteProps) => {
    screenState.generateProps = props;
    return React.createElement('mock-GenerateNotes', props);
  },
}));
vi.mock('@/screens/saved-report', () => ({
  SavedReport: (props: SavedReportRouteProps) => {
    screenState.savedReportProps = props;
    return React.createElement('mock-SavedReport', props);
  },
}));

import GenerateReportRoute from '@/app/(app)/projects/[project]/reports/[number]/generate';
import SavedReportRoute from '@/app/(app)/projects/[project]/reports/[number]/index';

function render(element: React.ReactElement): TestRenderer.ReactTestRenderer {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(element);
  });
  return tree;
}

describe('developer-tools report route boundaries', () => {
  beforeEach(() => {
    gateState.visible = false;
    screenState.generateProps = null;
    screenState.savedReportProps = null;
    vi.clearAllMocks();
  });

  it('keeps a persisted Generate Debug preference disabled when policy is hidden', () => {
    const tree = render(<GenerateReportRoute />);

    expect(hookSpies.useDeveloperFlags).toHaveBeenCalledTimes(1);
    expect(hookSpies.useReportDebugQuery).toHaveBeenLastCalledWith(
      expect.any(Object),
      expect.objectContaining({ enabled: false }),
    );
    expect(screenState.generateProps?.showDebugTab).toBe(false);

    gateState.visible = true;
    expect(() => {
      act(() => tree.update(<GenerateReportRoute />));
    }).not.toThrow();
    expect(hookSpies.useReportDebugQuery).toHaveBeenLastCalledWith(
      expect.any(Object),
      expect.objectContaining({ enabled: true }),
    );
    expect(screenState.generateProps?.showDebugTab).toBe(true);
  });

  it('removes saved-report Debug props when policy is hidden', () => {
    const tree = render(<SavedReportRoute />);

    expect(screenState.savedReportProps?.showDeveloperSection).toBe(false);
    expect(screenState.savedReportProps?.onOpenDebug).toBeUndefined();

    gateState.visible = true;
    expect(() => {
      act(() => tree.update(<SavedReportRoute />));
    }).not.toThrow();
    expect(screenState.savedReportProps?.showDeveloperSection).toBe(true);
    expect(screenState.savedReportProps?.onOpenDebug).toEqual(expect.any(Function));
  });
});
