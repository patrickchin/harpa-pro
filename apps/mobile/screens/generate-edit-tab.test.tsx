/**
 * Generate Report — Edit tab tests.
 *
 * Covers each visible state the canonical Edit tab exposes:
 *  - empty (no report) → EmptyState ("Generate a report first to edit")
 *  - populated (report present) → ReportEditForm with all 7 section cards
 *  - autosave status row → "Saving…" / "Saved" / blank
 *  - onChange propagates immutable patches via the helpers
 *  - "Edit manually" on the empty Report tab lazy-seeds an empty
 *    report via `onSetReport(createEmptyReport())` then switches to Edit
 *
 * Tests use `initialTab="edit"` so the Edit pane is mounted + visible
 * on first render. Pitfall R4: tests live in `screens/`, not under `app/`.
 */
import { describe, expect, it, vi } from 'vitest';
import TestRenderer, { act } from 'react-test-renderer';

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
  projectSlug: 'prj_test',
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

  it('"Edit manually" on the empty Report tab lazy-seeds a blank report via onSetReport', () => {
    const onSetReport = vi.fn<(next: GeneratedSiteReport) => void>();
    const tree = render(
      <GenerateNotes
        {...baseProps}
        initialTab="report"
        onSetReport={onSetReport}
      />,
    );
    const editManually = tree.root.findByProps({ testID: 'btn-edit-manually' });
    act(() => {
      (editManually.props.onPress as () => void)();
    });
    expect(onSetReport).toHaveBeenCalledTimes(1);
    const seeded = onSetReport.mock.calls[0]![0];
    expect(seeded.report.meta.title).toBe('');
    expect(seeded.report.meta.reportType).toBe('site_visit');
    expect(seeded.report.materials).toEqual([]);
  });
});
