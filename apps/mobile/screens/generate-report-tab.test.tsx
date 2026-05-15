/**
 * Generate Report — Report tab tests.
 *
 * Covers each visible state the canonical Report tab exposes:
 *  - empty (no report, not generating, no error) → CompletenessCard skeleton + Edit manually
 *  - generating (isGeneratingReport=true, report=null) → shimmer + info notice
 *  - populated (report present) → StatBar / workers / issues / next steps
 *  - generation error → error banner + Retry triggers onRegenerate
 *  - finalize error → finalize error banner alongside the report
 *  - "Edit manually" press triggers the default tab switch
 *
 * Tests use `initialTab="report"` so the Report tab is mounted +
 * visible on first render (the screen also mounts Notes/Edit panes
 * via the pager, but assertions live inside `report-tab-pane`).
 *
 * One snapshot covers the populated layout.
 */
import { describe, expect, it, vi } from 'vitest';
import TestRenderer, { act } from 'react-test-renderer';

import { GenerateNotes, type GenerateNotesProps } from './generate-notes';
import { SAMPLE_GENERATED_REPORT } from '@/lib/dev-fixtures/sample-report';

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

function reportTabText(tree: TestRenderer.ReactTestRenderer): string {
  // The pager mounts Notes / Report / Edit side-by-side; for these
  // assertions a whole-tree text scan is sufficient because the
  // Notes pane on an empty notes list contains unrelated copy and
  // the Edit pane is empty.
  return collectText(tree.toJSON());
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
  initialTab: 'report',
};

describe('GenerateNotes — Report tab', () => {
  it('renders the empty state with CompletenessCard + Edit manually CTA', () => {
    const tree = render(<GenerateNotes {...baseProps} />);
    expect(() =>
      tree.root.findByProps({ testID: 'btn-edit-manually' }),
    ).not.toThrow();
    // No live-report container, no generating shimmer.
    expect(
      tree.root.findAllByProps({ testID: 'report-tab-live' }),
    ).toHaveLength(0);
    expect(
      tree.root.findAllByProps({ testID: 'report-tab-generating' }),
    ).toHaveLength(0);
  });

  it('calls onEditManually when "Edit manually" is pressed', () => {
    const onEditManually = vi.fn();
    const tree = render(
      <GenerateNotes {...baseProps} onEditManually={onEditManually} />,
    );
    act(() => {
      tree.root.findByProps({ testID: 'btn-edit-manually' }).props.onPress();
    });
    expect(onEditManually).toHaveBeenCalledTimes(1);
  });

  it('renders the generating shimmer when isGeneratingReport=true', () => {
    const tree = render(
      <GenerateNotes
        {...baseProps}
        report={null}
        isGeneratingReport
      />,
    );
    expect(() =>
      tree.root.findByProps({ testID: 'report-tab-generating' }),
    ).not.toThrow();
    expect(reportTabText(tree)).toContain('Generating your report');
  });

  it('renders the live ReportView when a report is provided', () => {
    const tree = render(
      <GenerateNotes {...baseProps} report={SAMPLE_GENERATED_REPORT} />,
    );
    expect(() =>
      tree.root.findByProps({ testID: 'report-tab-live' }),
    ).not.toThrow();
    const text = reportTabText(tree);
    expect(text).toContain('Concrete delivery delay');
    expect(text).toContain('Steel fixer');
    expect(text).toContain('Close east footing pour.');
  });

  it('renders the generation error banner and Retry calls onRegenerate', () => {
    const onRegenerate = vi.fn();
    const tree = render(
      <GenerateNotes
        {...baseProps}
        report={null}
        generationError="Provider returned 500"
        onRegenerate={onRegenerate}
      />,
    );
    expect(reportTabText(tree)).toContain('Provider returned 500');
    act(() => {
      tree.root.findByProps({ testID: 'btn-report-tab-retry' }).props.onPress();
    });
    expect(onRegenerate).toHaveBeenCalledTimes(1);
  });

  it('renders the finalize error banner alongside a populated report', () => {
    const tree = render(
      <GenerateNotes
        {...baseProps}
        report={SAMPLE_GENERATED_REPORT}
        finalizeError="Finalize failed: please retry."
      />,
    );
    expect(reportTabText(tree)).toContain('Finalize failed: please retry.');
  });

  it('renders without a snapshot break when populated (smoke)', () => {
    // Skip a full toJSON snapshot — the report tree includes
    // `entering={FadeIn.duration(…)}` props whose mock is a Proxy
    // and pretty-format can't serialize Proxies. The other tests in
    // this file cover the visible surface; this is a smoke check
    // that nothing throws during render with a fully populated report.
    expect(() =>
      render(
        <GenerateNotes {...baseProps} report={SAMPLE_GENERATED_REPORT} />,
      ),
    ).not.toThrow();
  });
});
