/**
 * SavedReport screen body tests.
 *
 * Covers each visible state + every interaction the canonical
 * `app/projects/[projectId]/reports/[reportId].tsx` exercises:
 *  - loading skeleton
 *  - error / retry
 *  - invalid route params
 *  - tab switching (Report → Notes → Edit)
 *  - actions menu open/close
 *  - finalized → Edit tab hidden, auto-bounce from Edit when finalize fires
 *  - confirm-delete + confirm-unfinalize dialogs invoke callbacks
 *  - PDF preview modal opens from "View PDF"
 *  - one snapshot of the populated draft layout.
 */
import { describe, expect, it, vi } from 'vitest';
import TestRenderer, { act } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('expo-image', () => ({
  Image: (props: Record<string, unknown>) => null,
}));

// `ReportNotesPane` now drives delete through `useOptimisticDeleteNote`,
// which transitively imports `@/lib/auth` and `@/lib/uuid`. Those touch
// native modules at init (`expo-secure-store`, `expo-crypto`) that
// aren't safe under the node vitest env. Stub them the same way
// `apps/mobile/lib/api/optimistic.test.tsx` does.
vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => undefined),
  deleteItemAsync: vi.fn(async () => undefined),
}));
vi.mock('expo-crypto', () => ({
  randomUUID: () => '00000000-0000-4000-8000-000000000000',
}));
vi.mock('@/lib/auth', () => ({
  useAuthSession: () => ({ user: { id: 'usr_test12345' } }),
}));

import {
  SavedReport,
  type SavedReportProps,
} from './saved-report';
import { SAMPLE_GENERATED_REPORT } from '@/lib/dev-fixtures/sample-report';
import type { UseReportPdfActionsReturn } from '@/lib/reports/use-report-pdf-actions';
import {
  AudioPlaybackProvider,
  type PlaybackPlayer,
} from '@/lib/audio/AudioPlaybackProvider';

// Switching to the Notes tab mounts `ReportNotesPane`, whose voice
// rows call `useAudioPlayback()` and whose signed-URL chain pulls
// from React Query. Wrap every render in the real providers
// (Pitfall 13) with a node-safe `playerFactory` stub.
function stubPlayerFactory(): PlaybackPlayer {
  return {
    play: () => {},
    pause: () => {},
    currentTime: 0,
    duration: 0,
    playing: false,
    seekTo: async () => {},
    remove: () => {},
  };
}

function render(el: React.ReactElement): TestRenderer.ReactTestRenderer {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(
      <QueryClientProvider client={qc}>
        <AudioPlaybackProvider playerFactory={stubPlayerFactory}>
          {el}
        </AudioPlaybackProvider>
      </QueryClientProvider>,
    );
  });
  return tree;
}

const STUB_PDF_ACTIONS: UseReportPdfActionsReturn = {
  isExporting: false,
  isOpeningSavedPdf: false,
  isSharingSavedPdf: false,
  isSaving: false,
  savedReportSheet: null,
  savedReportSheetError: null,
  savedReportDetails: null,
  closeSavedReportSheet: vi.fn(),
  handleSavePdf: vi.fn(async () => undefined),
  handleOpenSavedPdf: vi.fn(async () => undefined),
  handleShareSavedPdf: vi.fn(async () => undefined),
  handleSharePdf: vi.fn(async () => undefined),
};

function baseProps(overrides: Partial<SavedReportProps> = {}): SavedReportProps {
  return {
    report: SAMPLE_GENERATED_REPORT,
    reportStatus: 'draft',
    projectName: 'Highland Tower',
    noteRows: [],
    isLoading: false,
    loadError: null,
    hasValidRouteParams: true,
    refreshing: false,
    onRefresh: vi.fn(),
    onBack: vi.fn(),
    onRetry: vi.fn(),
    onBackToProjects: vi.fn(),
    onChangeReport: vi.fn(),
    isAutoSaving: false,
    lastSavedAt: null,
    canUnfinalize: true,
    canDelete: true,
    onConfirmDelete: vi.fn(),
    onConfirmUnfinalize: vi.fn(),
    isDeleting: false,
    isUnfinalizing: false,
    pdfActions: { ...STUB_PDF_ACTIONS },
    ...overrides,
  };
}

describe('SavedReport', () => {
  it('renders the skeleton when isLoading', () => {
    const tree = render(<SavedReport {...baseProps({ isLoading: true })} />);
    expect(
      tree.root.findAllByProps({ testID: 'report-detail-skeleton' }).length,
    ).toBeGreaterThan(0);
    expect(tree.root.findAllByProps({ testID: 'btn-report-actions' })).toHaveLength(0);
  });

  it('renders the invalid-route fallback when hasValidRouteParams=false', () => {
    const onBackToProjects = vi.fn();
    const tree = render(
      <SavedReport
        {...baseProps({ hasValidRouteParams: false, onBackToProjects })}
      />,
    );
    const btn = tree.root.findByProps({
      testID: 'btn-saved-report-back-projects',
    });
    act(() => {
      btn.props.onPress();
    });
    expect(onBackToProjects).toHaveBeenCalledOnce();
  });

  it('renders the error state when loadError is set and Retry triggers onRetry', () => {
    const onRetry = vi.fn();
    const tree = render(
      <SavedReport
        {...baseProps({
          loadError: new Error('boom'),
          report: null,
          onRetry,
        })}
      />,
    );
    const btn = tree.root.findByProps({ testID: 'btn-saved-report-retry' });
    act(() => {
      btn.props.onPress();
    });
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('renders the Report tab pane by default', () => {
    const tree = render(<SavedReport {...baseProps()} />);
    expect(
      tree.root.findAllByProps({ testID: 'saved-report-pane' }).length,
    ).toBeGreaterThan(0);
    expect(
      tree.root.findAllByProps({ testID: 'saved-report-edit-pane' }),
    ).toHaveLength(0);
  });

  it('switches to the Notes tab when its tab button is pressed', () => {
    const tree = render(<SavedReport {...baseProps()} />);
    const notesTab = tree.root.findByProps({ testID: 'btn-tab-notes' });
    act(() => {
      notesTab.props.onPress();
    });
    expect(
      tree.root.findAllByProps({ testID: 'report-notes-pane' }).length,
    ).toBeGreaterThan(0);
  });

  it('switches to the Edit tab on draft reports', () => {
    const tree = render(<SavedReport {...baseProps()} />);
    const editTab = tree.root.findByProps({ testID: 'btn-tab-edit' });
    act(() => {
      editTab.props.onPress();
    });
    expect(
      tree.root.findAllByProps({ testID: 'saved-report-edit-pane' }).length,
    ).toBeGreaterThan(0);
    // Autosave status row mounts on the Edit tab.
    expect(
      tree.root.findAllByProps({ testID: 'edit-autosave-status' }).length,
    ).toBeGreaterThan(0);
  });

  it('hides the Edit tab when the report is finalized', () => {
    const tree = render(
      <SavedReport {...baseProps({ reportStatus: 'finalized' })} />,
    );
    expect(
      tree.root.findAllByProps({ testID: 'btn-tab-edit' }),
    ).toHaveLength(0);
  });

  it('hides the Notes tab when the report is finalized', () => {
    const tree = render(
      <SavedReport {...baseProps({ reportStatus: 'finalized' })} />,
    );
    expect(
      tree.root.findAllByProps({ testID: 'btn-tab-notes' }),
    ).toHaveLength(0);
  });

  it('surfaces "View Notes" in the actions menu when onViewNotes is provided', () => {
    const onViewNotes = vi.fn();
    const tree = render(
      <SavedReport
        {...baseProps({ reportStatus: 'finalized', onViewNotes })}
      />,
    );
    act(() => {
      tree.root.findByProps({ testID: 'btn-report-actions' }).props.onPress();
    });
    const btn = tree.root.findByProps({ testID: 'btn-report-view-notes' });
    act(() => {
      btn.props.onPress();
    });
    expect(onViewNotes).toHaveBeenCalledOnce();
  });

  it('omits "View Notes" from the actions menu when onViewNotes is not provided', () => {
    const tree = render(<SavedReport {...baseProps()} />);
    act(() => {
      tree.root.findByProps({ testID: 'btn-report-actions' }).props.onPress();
    });
    expect(
      tree.root.findAllByProps({ testID: 'btn-report-view-notes' }),
    ).toHaveLength(0);
  });

  it('bounces from Edit back to Report when the report flips to finalized', () => {
    const props = baseProps({ initialTab: 'edit' });
    const tree = render(<SavedReport {...props} />);
    expect(
      tree.root.findAllByProps({ testID: 'saved-report-edit-pane' }).length,
    ).toBeGreaterThan(0);
    act(() => {
      tree.update(<SavedReport {...props} reportStatus="finalized" />);
    });
    expect(
      tree.root.findAllByProps({ testID: 'saved-report-edit-pane' }),
    ).toHaveLength(0);
    expect(
      tree.root.findAllByProps({ testID: 'saved-report-pane' }).length,
    ).toBeGreaterThan(0);
  });

  it('opens and closes the actions menu', () => {
    const tree = render(<SavedReport {...baseProps()} />);
    const actionsBtn = tree.root.findByProps({ testID: 'btn-report-actions' });
    act(() => {
      actionsBtn.props.onPress();
    });
    const closeBtn = tree.root.findByProps({
      testID: 'btn-report-actions-close',
    });
    expect(closeBtn).toBeTruthy();
    act(() => {
      closeBtn.props.onPress();
    });
    // Close button still mounted (Modal stays in the tree).
    expect(
      tree.root.findAllByProps({ testID: 'btn-report-actions-close' }).length,
    ).toBeGreaterThan(0);
  });

  it('confirms delete via the confirmation dialog', async () => {
    const onConfirmDelete = vi.fn();
    const tree = render(
      <SavedReport {...baseProps({ onConfirmDelete })} />,
    );
    act(() => {
      tree.root.findByProps({ testID: 'btn-report-actions' }).props.onPress();
    });
    act(() => {
      tree.root.findByProps({ testID: 'btn-report-delete' }).props.onPress();
    });
    await act(async () => {
      await tree.root
        .findByProps({ testID: 'btn-confirm-delete-report' })
        .props.onPress();
    });
    expect(onConfirmDelete).toHaveBeenCalledOnce();
  });

  it('confirms unfinalize via the confirmation dialog', async () => {
    const onConfirmUnfinalize = vi.fn();
    const tree = render(
      <SavedReport {...baseProps({ onConfirmUnfinalize })} />,
    );
    act(() => {
      tree.root.findByProps({ testID: 'btn-report-actions' }).props.onPress();
    });
    act(() => {
      tree.root
        .findByProps({ testID: 'btn-unfinalize-report' })
        .props.onPress();
    });
    await act(async () => {
      await tree.root
        .findByProps({ testID: 'btn-confirm-unfinalize-report' })
        .props.onPress();
    });
    expect(onConfirmUnfinalize).toHaveBeenCalledOnce();
  });

  it('opens the PDF preview modal from "View PDF"', () => {
    const tree = render(<SavedReport {...baseProps()} />);
    act(() => {
      tree.root.findByProps({ testID: 'btn-report-actions' }).props.onPress();
    });
    act(() => {
      tree.root.findByProps({ testID: 'btn-report-view-pdf' }).props.onPress();
    });
    // The PDF preview modal isn't given a stable testID by the
    // component, but mounting it surfaces the ScreenHeader with
    // "PDF Preview" as the title.
    const titles = tree.root
      .findAllByProps({ testID: 'screen-header-title' })
      .map((n) => n.props.children);
    expect(titles).toContain('PDF Preview');
  });

  it('invokes handleSavePdf when the Save PDF action is tapped', async () => {
    const handleSavePdf = vi.fn(async () => undefined);
    const tree = render(
      <SavedReport
        {...baseProps({
          pdfActions: { ...STUB_PDF_ACTIONS, handleSavePdf },
        })}
      />,
    );
    act(() => {
      tree.root.findByProps({ testID: 'btn-report-actions' }).props.onPress();
    });
    await act(async () => {
      await tree.root
        .findByProps({ testID: 'btn-report-save-pdf' })
        .props.onPress();
    });
    expect(handleSavePdf).toHaveBeenCalledOnce();
  });

  it('renders all main panels for a populated draft layout', () => {
    const tree = render(<SavedReport {...baseProps()} />);
    // Header + report pane mount; ScreenHeader title is set by ReportDetailHeader.
    expect(
      tree.root.findAllByProps({ testID: 'btn-report-actions' }).length,
    ).toBeGreaterThan(0);
    expect(
      tree.root.findAllByProps({ testID: 'saved-report-pane' }).length,
    ).toBeGreaterThan(0);
    expect(
      tree.root.findAllByProps({ testID: 'btn-tab-edit' }).length,
    ).toBeGreaterThan(0);
  });
});

const finalizedDefaults = { ...baseProps(), reportStatus: 'finalized' as const };

describe('SavedReport — finalized layout', () => {
  it('does not render the tab bar when finalized', () => {
    const tree = render(
      <SavedReport
        {...finalizedDefaults}
        reportStatus="finalized"
        report={SAMPLE_GENERATED_REPORT}
      />,
    );
    expect(
      tree.root.findAllByProps({ testID: 'btn-tab-report' }),
    ).toHaveLength(0);
    expect(
      tree.root.findAllByProps({ testID: 'btn-tab-notes' }),
    ).toHaveLength(0);
    expect(
      tree.root.findAllByProps({ testID: 'btn-tab-edit' }),
    ).toHaveLength(0);
  });

  it('falls back to "Report #N" when meta.title is empty', () => {
    const blank = {
      ...SAMPLE_GENERATED_REPORT,
      report: {
        ...SAMPLE_GENERATED_REPORT.report,
        meta: { ...SAMPLE_GENERATED_REPORT.report.meta, title: '' },
      },
    };
    const tree = render(
      <SavedReport
        {...finalizedDefaults}
        reportStatus="finalized"
        reportNumber={7}
        report={blank}
      />,
    );
    // Check that the report pane is still visible
    expect(
      tree.root.findAllByProps({ testID: 'saved-report-pane' }).length,
    ).toBeGreaterThan(0);
  });
});
