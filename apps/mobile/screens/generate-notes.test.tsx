/**
 * GenerateNotes screen body tests.
 *
 * Covers each visible state the canonical Notes tab exposes:
 *  - empty (no notes, not loading)
 *  - loading (notesLoading=true)
 *  - populated (notes render through NoteTimeline)
 *  - read-only (canWrite=false hides input bar + action row)
 *  - input → onAddTextNote callback
 *  - report title fallback
 *
 * One snapshot covers the empty layout. Pitfall R4: tests live in
 * `screens/`, not under `app/`.
 */
import { describe, expect, it, vi } from 'vitest';
import TestRenderer, { act } from 'react-test-renderer';

import { GenerateNotes, type GenerateNotesProps } from './generate-notes';
import type { NoteEntry } from '@/lib/note-entry';

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

const baseProps: GenerateNotesProps = {
  projectSlug: 'prj_test',
  reportNumber: 1,
  notes: [],
  notesLoading: false,
  reportTitle: 'Highland Tower',
  canWrite: true,
  onAddTextNote: vi.fn(),
  onBack: vi.fn(),
};

const sampleNotes: NoteEntry[] = [
  { id: 'n1', text: 'Crew arrived 7:45 AM.', addedAt: 1, source: 'text' },
  { id: 'n2', text: 'Slab pour delayed by rain.', addedAt: 2, source: 'text' },
];

describe('GenerateNotes', () => {
  it('renders the empty state when there are no notes', () => {
    const tree = render(<GenerateNotes {...baseProps} />);
    const text = collectText(tree.toJSON());
    expect(text).toContain('Start capturing site notes');
  });

  it('renders the loading indicator when notesLoading=true', () => {
    const tree = render(<GenerateNotes {...baseProps} notesLoading />);
    expect(() =>
      tree.root.findByProps({ testID: 'note-timeline-loading' }),
    ).not.toThrow();
  });

  it('does NOT render the empty state while loading', () => {
    const tree = render(<GenerateNotes {...baseProps} notesLoading />);
    const text = collectText(tree.toJSON());
    expect(text).not.toContain('Start capturing site notes');
  });

  it('renders text notes in the timeline when populated', () => {
    const tree = render(<GenerateNotes {...baseProps} notes={sampleNotes} />);
    const text = collectText(tree.toJSON());
    expect(text).toContain('Crew arrived 7:45 AM.');
    expect(text).toContain('Slab pour delayed by rain.');
  });

  it('renders all three tab labels (notes count reflects total)', () => {
    const tree = render(<GenerateNotes {...baseProps} notes={sampleNotes} />);
    const text = collectText(tree.toJSON());
    expect(text).toContain('Notes (2)');
    expect(text).toContain('Report');
    expect(text).toContain('Edit');
  });

  it('falls back to "New Report" when reportTitle is empty', () => {
    const tree = render(
      <GenerateNotes {...baseProps} reportTitle={null} />,
    );
    const titleNode = tree.root.findByProps({ testID: 'screen-header-title' });
    expect(collectText(titleNode.props.children)).toContain('New Report');
  });

  it('hides the input bar + action row when canWrite=false', () => {
    const tree = render(<GenerateNotes {...baseProps} canWrite={false} />);
    expect(
      tree.root.findAllByProps({ testID: 'input-note' }),
    ).toHaveLength(0);
    expect(
      tree.root.findAllByProps({ testID: 'btn-generate-update-report' }),
    ).toHaveLength(0);
  });

  it('shows input bar + action row when canWrite=true', () => {
    const tree = render(<GenerateNotes {...baseProps} />);
    expect(() => tree.root.findByProps({ testID: 'input-note' })).not.toThrow();
    expect(() =>
      tree.root.findByProps({ testID: 'btn-generate-update-report' }),
    ).not.toThrow();
  });

  it('calls onAddTextNote with the trimmed body when Add is pressed', () => {
    const onAddTextNote = vi.fn();
    const tree = render(
      <GenerateNotes {...baseProps} onAddTextNote={onAddTextNote} />,
    );
    // Type into the input
    act(() => {
      tree.root
        .findByProps({ testID: 'input-note' })
        .props.onChangeText('  Slab pour scheduled  ');
    });
    // Press Add (only rendered when input has non-whitespace content)
    act(() => {
      tree.root.findByProps({ testID: 'btn-add-note' }).props.onPress();
    });
    expect(onAddTextNote).toHaveBeenCalledWith('Slab pour scheduled');
  });

  it('does NOT render the Add button while input is empty', () => {
    const tree = render(<GenerateNotes {...baseProps} />);
    expect(tree.root.findAllByProps({ testID: 'btn-add-note' })).toHaveLength(0);
    expect(() =>
      tree.root.findByProps({ testID: 'btn-camera-capture' }),
    ).not.toThrow();
    expect(() =>
      tree.root.findByProps({ testID: 'btn-record-start' }),
    ).not.toThrow();
  });

  it('renders the back button when onBack is provided', () => {
    const onBack = vi.fn();
    const tree = render(<GenerateNotes {...baseProps} onBack={onBack} />);
    act(() => tree.root.findByProps({ testID: 'btn-back' }).props.onPress());
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('matches the empty-state snapshot', () => {
    const tree = render(<GenerateNotes {...baseProps} />);
    expect(tree.toJSON()).toMatchSnapshot();
  });
});
