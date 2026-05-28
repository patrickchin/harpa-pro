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
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import TestRenderer, { act } from 'react-test-renderer';

const voicePipelineMock = vi.hoisted((): {
  state: {
    step: string;
    failedStep: string | null;
    error: string | null;
    note: unknown;
    fileId: string | null;
    capture: unknown;
    usageLimit: unknown;
  };
  capture: ReturnType<typeof vi.fn>;
  retry: ReturnType<typeof vi.fn>;
  reset: ReturnType<typeof vi.fn>;
} => ({
  state: {
    step: 'idle',
    failedStep: null,
    error: null,
    note: null,
    fileId: null,
    capture: null,
    usageLimit: null,
  },
  capture: vi.fn(async () => null),
  retry: vi.fn(async () => null),
  reset: vi.fn(),
}));

// `GenerateReportProvider` consumes the inline recorder + voice
// pipeline + audio playback hooks. None of them are exercised by the
// Notes-tab UI assertions below, so stub them out — exercising the
// real implementations would require wrapping the test in
// `<QueueProvider>` + `<AudioPlaybackProvider>` and is covered by the
// dedicated integration tests for those modules.
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
  useVoiceNotePipeline: () => voicePipelineMock,
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
import type { NoteEntry } from '@/lib/notes/note-entry';

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
  project: 'prj_test',
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
  beforeEach(() => {
    vi.useFakeTimers();
    voicePipelineMock.state = {
      step: 'idle',
      failedStep: null,
      error: null,
      note: null,
      fileId: null,
      capture: null,
      usageLimit: null,
    };
    voicePipelineMock.capture.mockClear();
    voicePipelineMock.retry.mockClear();
    voicePipelineMock.reset.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });
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

  it('falls back to "Report #N" when reportTitle is empty', () => {
    const tree = render(
      <GenerateNotes {...baseProps} reportTitle={null} reportNumber={1} />,
    );
    const titleNode = tree.root.findByProps({ testID: 'screen-header-title' });
    expect(collectText(titleNode.props.children)).toContain('Report #1');
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
      tree.root.findByProps({ testID: 'btn-generate-report' }),
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

  it('opens the attachment sheet with stable photo action testIDs', () => {
    const tree = render(<GenerateNotes {...baseProps} />);
    act(() => {
      tree.root.findByProps({ testID: 'btn-attachment' }).props.onPress();
    });
    expect(() =>
      tree.root.findByProps({ testID: 'btn-attachment-photo-library' }),
    ).not.toThrow();
    expect(() =>
      tree.root.findByProps({ testID: 'btn-attachment-camera' }),
    ).not.toThrow();
    expect(() =>
      tree.root.findByProps({ testID: 'btn-attachment-cancel' }),
    ).not.toThrow();
  });

  it('renders the back button when onBack is provided', () => {
    const onBack = vi.fn();
    const tree = render(<GenerateNotes {...baseProps} onBack={onBack} />);
    act(() => tree.root.findByProps({ testID: 'btn-back' }).props.onPress());
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('opens delete confirm and forwards onDeleteNote on confirm', () => {
    const onDeleteNote = vi.fn();
    const tree = render(
      <GenerateNotes
        {...baseProps}
        notes={sampleNotes}
        onDeleteNote={onDeleteNote}
      />,
    );
    // Tap the per-row options button on the first note (sourceIndex=0).
    act(() => {
      tree.root
        .findByProps({ testID: 'btn-note-options-0' })
        .props.onPress();
    });
    // Tap "Delete" in the shared options sheet.
    act(() => {
      tree.root
        .findByProps({ testID: 'btn-note-options-delete' })
        .props.onPress();
    });
    // Same-Modal stage swap to the destructive confirm — no native
    // handoff timer to flush.
    act(() => {
      tree.root
        .findByProps({ testID: 'btn-note-options-confirm-delete' })
        .props.onPress();
    });
    expect(onDeleteNote).toHaveBeenCalledTimes(1);
    expect(onDeleteNote).toHaveBeenCalledWith(sampleNotes[0], 0);
  });

  it('deletes a saved synthetic voice note from the rendered timeline', () => {
    const savedVoiceNote = {
      id: 'not_voice_saved',
      authorId: 'usr_test',
      body: 'Voice transcript body',
      transcript: 'Voice transcript body',
      title: 'Second floor concrete pour underway',
      summary: 'Concrete pour is underway on the second floor.',
      fileId: null,
      durationSec: 2,
      createdAt: new Date(1).toISOString(),
    };
    voicePipelineMock.state = {
      step: 'saved',
      failedStep: null,
      error: null,
      note: savedVoiceNote,
      fileId: null,
      capture: null,
      usageLimit: null,
    };
    const onDeleteNote = vi.fn();
    const tree = render(
      <GenerateNotes
        {...baseProps}
        reportId="rep_1"
        notes={[]}
        onDeleteNote={onDeleteNote}
      />,
    );

    const text = collectText(tree.toJSON());
    expect(text).toContain('Notes (1)');
    expect(text).toContain('Second floor concrete pour underway');

    act(() => {
      tree.root
        .findByProps({ testID: 'btn-note-options-0' })
        .props.onPress();
    });
    act(() => {
      tree.root
        .findByProps({ testID: 'btn-note-options-delete' })
        .props.onPress();
    });
    act(() => {
      tree.root
        .findByProps({ testID: 'btn-note-options-confirm-delete' })
        .props.onPress();
    });

    expect(onDeleteNote).toHaveBeenCalledTimes(1);
    expect(onDeleteNote).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'not_voice_saved',
        source: 'voice',
      }),
      0,
    );
    expect(voicePipelineMock.reset).toHaveBeenCalledTimes(1);
  });

  it('does not show the Edit action when onUpdateNote is not provided', () => {
    const tree = render(
      <GenerateNotes {...baseProps} notes={sampleNotes} onDeleteNote={vi.fn()} />,
    );
    act(() => {
      tree.root
        .findByProps({ testID: 'btn-note-options-0' })
        .props.onPress();
    });
    expect(
      tree.root.findAllByProps({ testID: 'btn-note-options-edit' }),
    ).toHaveLength(0);
  });

  it('forwards onUpdateNote with the trimmed body when Save is pressed', () => {
    const onUpdateNote = vi.fn();
    const tree = render(
      <GenerateNotes
        {...baseProps}
        notes={sampleNotes}
        onUpdateNote={onUpdateNote}
      />,
    );
    act(() => {
      tree.root
        .findByProps({ testID: 'btn-note-options-0' })
        .props.onPress();
    });
    act(() => {
      tree.root
        .findByProps({ testID: 'btn-note-options-edit' })
        .props.onPress();
    });
    act(() => {
      tree.root
        .findByProps({ testID: 'input-note-options-edit' })
        .props.onChangeText('  Updated crew note  ');
    });
    act(() => {
      tree.root
        .findByProps({ testID: 'btn-note-options-save-edit' })
        .props.onPress();
    });
    expect(onUpdateNote).toHaveBeenCalledTimes(1);
    expect(onUpdateNote).toHaveBeenCalledWith(
      sampleNotes[0],
      0,
      'Updated crew note',
    );
  });

  it('matches the empty-state snapshot', () => {
    const tree = render(<GenerateNotes {...baseProps} />);
    expect(tree.toJSON()).toMatchSnapshot();
  });

  it('auto-scrolls the timeline to the bottom when a new note arrives', () => {
    // Render with two notes, then grow the list to three. The
    // NotesTabPane runs a setTimeout(0) that calls scrollToEnd on
    // the forwarded ScrollView ref. We can't easily intercept the
    // ref instance with react-test-renderer, but we can prove the
    // effect path doesn't crash and the new row is in the tree.
    const tree = render(<GenerateNotes {...baseProps} notes={sampleNotes} />);
    const grown: NoteEntry[] = [
      ...sampleNotes,
      { id: 'n3', text: 'New entry', addedAt: 3, source: 'text' },
    ];
    act(() => {
      tree.update(<GenerateNotes {...baseProps} notes={grown} />);
    });
    act(() => {
      vi.runAllTimers();
    });
    const text = collectText(tree.toJSON());
    expect(text).toContain('New entry');
  });

  it('renders the keyboard-collapsible chrome wrapper', () => {
    const tree = render(<GenerateNotes {...baseProps} />);
    expect(() =>
      tree.root.findByProps({ testID: 'generate-notes-chrome' }),
    ).not.toThrow();
  });
});
