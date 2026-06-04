/**
 * Generate Report — Edit tab tests.
 *
 * Covers each visible state the canonical Edit tab exposes:
 *  - empty (no report) → EmptyState ("Generate a report first to edit")
 *  - populated (report present) → ReportEditForm with all 7 section cards
 *  - autosave status row → "Saving…" / "Saved" / blank
 *  - onChange propagates immutable patches via the helpers
 *  - "Edit manually" on the empty Report tab lazy-seeds an empty
 *    report in the provider's local state (NOT via onSetReport, so
 *    the route's dirty flag is not triggered by tab navigation)
 *
 * Tests use `initialTab="edit"` so the Edit pane is mounted + visible
 * on first render. Pitfall R4: tests live in `screens/`, not under `app/`.
 */
import { describe, expect, it, vi } from 'vitest';
import TestRenderer, { act } from 'react-test-renderer';

// See `generate-notes.test.tsx` for rationale — stub the voice +
// audio hooks the underlying `GenerateReportProvider` always calls so
// these Edit-tab tests don't need to wrap renders in
// `<QueueProvider>` + `<AudioPlaybackProvider>`. Real wiring is
// covered by the dedicated integration tests for those hooks.
vi.mock('@/features/voice/useInlineRecorder', () => ({
  useInlineRecorder: () => ({
    isRecording: false,
    snapshot: { status: 'idle', durationMs: 0, amplitude: 0 },
    historyBars: [],
    permission: 'unknown',
    error: null,
    start: vi.fn(async () => {}),
    stopAndCapture: vi.fn(async () => null),
    cancel: vi.fn(async () => {}),
    dismissError: vi.fn(),
  }),
}));
vi.mock('@/features/voice/useVoiceNotePipeline', () => ({
  useVoiceNotePipeline: () => ({
    state: {
      step: 'idle',
      failedStep: null,
      error: null,
      note: null,
      fileId: null,
      capture: null,
    },
    capture: vi.fn(async () => null),
    retry: vi.fn(async () => null),
    reset: vi.fn(),
  }),
}));
vi.mock('@/lib/audio/AudioPlaybackProvider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/audio/AudioPlaybackProvider')>();
  return {
    ...actual,
    useAudioPlayback: () => ({
      play: vi.fn(async () => {}),
      pause: vi.fn(),
      stop: vi.fn(),
      seek: vi.fn(async () => {}),
      status: { uri: null, playing: false, positionSec: 0, durationSec: 0 },
    }),
  };
});

vi.mock('@/lib/api/hooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/hooks')>();
  return {
    ...actual,
    useMeQuery: () => ({ data: { user: { id: 'usr_test' } }, isLoading: false, isError: false }),
  };
});

import { GenerateNotes, type GenerateNotesProps } from './generate-notes';
import { SAMPLE_GENERATED_REPORT } from '@/lib/dev-fixtures/sample-report';
import type { GeneratedSiteReport } from '@harpa/report-core';

function render(el: React.ReactElement): TestRenderer.ReactTestRenderer {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(el);
  });
  return tree;
}

function collectText(n: unknown): string {
  if (n == null) return '';
  if (typeof n === 'string') return n;
  if (Array.isArray(n)) return n.map(collectText).join(' ');
  const node = n as { children?: unknown };
  if (node.children !== undefined) return collectText(node.children);
  return '';
}

function instanceText(inst: TestRenderer.ReactTestInstance): string {
  return collectText(inst.children);
}

function editPaneText(tree: TestRenderer.ReactTestRenderer): string {
  const pane = tree.root.findByProps({ testID: 'edit-tab-pane' });
  return instanceText(pane);
}

const baseProps: GenerateNotesProps = {
  project: 'prj_test',
  reportNumber: 1,
  notes: [],
  notesLoading: false,
  reportTitle: 'Highland Tower',
  canWrite: true,
  onAddTextNote: vi.fn(),
  onBack: vi.fn(),
  initialTab: 'edit',
};

describe('GenerateNotes — Edit tab', () => {
  it('renders the empty state when no report is present', () => {
    const tree = render(<GenerateNotes {...baseProps} />);
    expect(() =>
      tree.root.findByProps({ testID: 'edit-tab-empty' }),
    ).not.toThrow();
    expect(
      tree.root.findAllByProps({ testID: 'edit-tab-form' }),
    ).toHaveLength(0);
    expect(editPaneText(tree)).toContain('Generate a report first to edit');
  });

  it('renders the inline form once a report is present', () => {
    const tree = render(
      <GenerateNotes {...baseProps} report={SAMPLE_GENERATED_REPORT} />,
    );
    expect(() =>
      tree.root.findByProps({ testID: 'edit-tab-form' }),
    ).not.toThrow();
    // All seven editable section cards mount.
    for (const id of [
      'edit-section-meta',
      'edit-section-weather',
      'edit-section-workers',
      'edit-section-materials',
      'edit-section-issues',
      'edit-section-next-steps',
      'edit-section-sections',
    ]) {
      expect(() => tree.root.findByProps({ testID: id })).not.toThrow();
    }
  });

  it('shows "Saving…" when isAutoSaving is true', () => {
    const tree = render(
      <GenerateNotes
        {...baseProps}
        report={SAMPLE_GENERATED_REPORT}
        isAutoSaving
        lastSavedAt={Date.now()}
      />,
    );
    const status = tree.root.findByProps({ testID: 'edit-autosave-status' });
    expect(instanceText(status)).toBe('Saving…');
  });

  it('shows "Saved" when lastSavedAt is set and not currently saving', () => {
    const tree = render(
      <GenerateNotes
        {...baseProps}
        report={SAMPLE_GENERATED_REPORT}
        isAutoSaving={false}
        lastSavedAt={Date.now()}
      />,
    );
    const status = tree.root.findByProps({ testID: 'edit-autosave-status' });
    expect(instanceText(status)).toBe('Saved');
  });

  it('shows blank status when never saved', () => {
    const tree = render(
      <GenerateNotes
        {...baseProps}
        report={SAMPLE_GENERATED_REPORT}
        isAutoSaving={false}
        lastSavedAt={null}
      />,
    );
    const status = tree.root.findByProps({ testID: 'edit-autosave-status' });
    expect(instanceText(status)).toBe('');
  });

  it('propagates form edits through onSetReport with a new identity', () => {
    const onSetReport = vi.fn<(next: GeneratedSiteReport) => void>();
    const tree = render(
      <GenerateNotes
        {...baseProps}
        report={SAMPLE_GENERATED_REPORT}
        onSetReport={onSetReport}
      />,
    );
    // Find the title TextInput in the Meta card.
    const titleInput = tree.root.findByProps({
      accessibilityLabel: 'Report title',
    });
    act(() => {
      const onChangeText = titleInput.props.onChangeText as (v: string) => void;
      onChangeText('New title');
    });
    expect(onSetReport).toHaveBeenCalledTimes(1);
    const next = onSetReport.mock.calls[0]![0];
    expect(next).not.toBe(SAMPLE_GENERATED_REPORT);
    expect(next.report).not.toBe(SAMPLE_GENERATED_REPORT.report);
    expect(next.report.meta.title).toBe('New title');
    // Other slices preserved by reference.
    expect(next.report.workers).toBe(SAMPLE_GENERATED_REPORT.report.workers);
  });
});
