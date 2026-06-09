/**
 * Integration test for `ReportTabPane`'s placement pipeline.
 *
 * Locks in the contract that the user asked for: a photo group with
 * report.body attachments must render the matching photo group inside
 * its issue/section card (via `PlacedPhotoStrip`), and must NOT render
 * that group in the bottom "Unplaced photos" grid.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, create } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { GeneratedSiteReport } from '@harpa/report-core';

import { ReportTabPane } from './ReportTabPane';

vi.mock('expo-image', () => ({ Image: () => null }));

function stubFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            url: 'https://r2.example.com/signed.jpg',
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    ),
  );
}

const REPORT = {
  report: {
    meta: { summary: 'Day on site went fine.' },
    issues: [
      {
        title: 'Cracked beam',
        severity: 'high',
        urgency: 'today',
        category: 'structural',
        details: '',
        actionRequired: null,
        attachments: { images: ['n_issue'] },
      },
    ],
    sections: [
      { title: 'Foundations', content: 'All good in the foundations.' },
      {
        title: 'Roof',
        content: 'Roof needs work.',
        attachments: { images: ['n_placed'] },
      },
    ],
    workers: null,
    materials: [],
    nextSteps: [],
  },
} as unknown as GeneratedSiteReport;

const PHOTO_PLACED_IN_SECTION = {
  fileId: 'fil_placed',
  thumbnailFileId: null,
  noteId: 'n_placed',
  title: 'Placed photo',
  cacheKey: 'fil_placed',
};

const PHOTO_UNPLACED = {
  fileId: 'fil_unplaced',
  thumbnailFileId: null,
  noteId: 'n_unplaced',
  title: 'Unplaced photo',
  cacheKey: 'fil_unplaced',
};

const PHOTO_PLACED_IN_ISSUE = {
  fileId: 'fil_issue',
  thumbnailFileId: null,
  noteId: 'n_issue',
  title: 'Issue photo',
  cacheKey: 'fil_issue',
};

function buildContext(overrides: Record<string, unknown> = {}) {
  return {
    project: 'p1',
    reportNumber: 1,
    reportTitle: 'Report 1',
    notes: { list: [], totalCount: 0, isLoading: false },
    tabs: {
      activeTab: 'report' as const,
      setActiveTab: vi.fn(),
      openEdit: vi.fn(),
      editManually: vi.fn(),
    },
    timeline: { items: [] },
    generation: {
      report: REPORT,
      isUpdating: false,
      error: null,
      lastGeneration: null,
      notesSinceLastGeneration: 0,
      needsRegeneration: false,
      setReport: vi.fn(),
    },
    draft: {
      isFinalizing: false,
      isFinalizeConfirmVisible: false,
      finalizeError: null,
      handleFinalize: vi.fn(),
      openFinalize: vi.fn(),
      closeFinalize: vi.fn(),
      isAutoSaving: false,
      lastSavedAt: null,
    },
    voice: {} as Record<string, unknown>,
    photo: {} as Record<string, unknown>,
    preview: {
      openFile: vi.fn(),
      photoGallery: [
        PHOTO_PLACED_IN_SECTION,
        PHOTO_UNPLACED,
        PHOTO_PLACED_IN_ISSUE,
      ],
      photoIndex: null,
      openPhoto: vi.fn(),
      closePhoto: vi.fn(),
    },
    placement: { onPlacePhotoGroup: vi.fn() },
    ui: {
      attachmentSheetVisible: false,
      setAttachmentSheetVisible: vi.fn(),
      fileUploadError: null,
      setFileUploadError: vi.fn(),
    },
    members: new Map(),
    handlePickAttachment: vi.fn(),
    handleRegenerate: vi.fn(),
    ...overrides,
  };
}

let mockCtx: ReturnType<typeof buildContext>;
vi.mock('@/features/generate/GenerateReportProvider', () => ({
  useGenerateReport: () => mockCtx,
}));

function render(width = 400) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  let tree!: ReturnType<typeof create>;
  act(() => {
    tree = create(
      <QueryClientProvider client={qc}>
        <ReportTabPane width={width} />
      </QueryClientProvider>,
    );
  });
  // Fire onLayout on every layout-aware view so PhotoTile renders.
  const layoutNodes = tree.root.findAll(
    (n) => typeof (n.props as { onLayout?: unknown }).onLayout === 'function',
  );
  for (const node of layoutNodes) {
    act(() => {
      (node.props as { onLayout: (e: unknown) => void }).onLayout({
        nativeEvent: { layout: { width: 300, height: 0, x: 0, y: 0 } },
      });
    });
  }
  return tree;
}

describe('ReportTabPane placement pipeline', () => {
  beforeEach(() => {
    stubFetch();
    mockCtx = buildContext();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('renders the placed photo inside its target section card', () => {
    const tree = render();
    expect(
      tree.root.findAllByProps({ testID: 'placed-photos-section-1' }).length,
    ).toBeGreaterThan(0);
    expect(
      tree.root.findAllByProps({ testID: 'btn-placed-photo-fil_placed' }).length,
    ).toBeGreaterThan(0);
  });

  it('renders the placed photo inside its target issue card', () => {
    const tree = render();
    expect(
      tree.root.findAllByProps({ testID: 'placed-photos-issue-0' }).length,
    ).toBeGreaterThan(0);
    expect(
      tree.root.findAllByProps({ testID: 'btn-placed-photo-fil_issue' }).length,
    ).toBeGreaterThan(0);
  });

  it('keeps only unplaced photos in the bottom grid', () => {
    const tree = render();
    expect(
      tree.root.findAllByProps({ testID: 'btn-generate-report-photo-fil_unplaced' }).length,
    ).toBeGreaterThan(0);
    expect(
      tree.root.findAllByProps({ testID: 'btn-generate-report-photo-fil_placed' }),
    ).toHaveLength(0);
    expect(
      tree.root.findAllByProps({ testID: 'btn-generate-report-photo-fil_issue' }),
    ).toHaveLength(0);
  });

  it('does not render the bottom grid when all photos are placed', () => {
    mockCtx = buildContext({
      preview: {
        ...buildContext().preview,
        photoGallery: [PHOTO_PLACED_IN_SECTION],
      },
    });
    const tree = render();
    expect(
      tree.root.findAllByProps({ testID: 'generate-report-photos' }),
    ).toHaveLength(0);
    expect(
      tree.root.findAllByProps({ testID: 'placed-photos-section-1' }).length,
    ).toBeGreaterThan(0);
  });
});
