/**
 * PhotoNoteCard — unified pending → saved lifecycle.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { PhotoNoteCard } from './PhotoNoteCard';
import type { NoteEntry } from '@/lib/notes/note-entry';
import type { Attachment } from '@/lib/notes/attachments';

vi.mock('expo-image', () => ({
  Image: (props: Record<string, unknown>) =>
    React.createElement('rn-expo-image', props, null),
}));
vi.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: { createAnimatedComponent: (C: unknown) => C, View: 'rn-anim-view' },
  useSharedValue: (v: number) => ({ value: v }),
  useAnimatedStyle: (fn: () => unknown) => fn(),
  useAnimatedProps: (fn: () => unknown) => fn(),
  withTiming: (v: number) => v,
}));

function pending(over: Partial<Attachment> = {}): Attachment {
  return {
    key: 'job_1',
    fileId: null,
    thumbnailFileId: null,
    sourceUri: 'file:///tmp/a.jpg',
    isPending: true,
    jobId: 'job_1',
    status: 'uploading',
    progress: 0.5,
    position: 0,
    ...over,
  };
}

function saved(i: number): Attachment {
  return {
    key: `nf_${i}`,
    fileId: `fil_${i}`,
    thumbnailFileId: null,
    sourceUri: null,
    isPending: false,
    position: i,
  };
}

function entry(over: Partial<NoteEntry> = {}): NoteEntry {
  return {
    id: '__upload-job_1',
    reactKey: '__upload-job_1',
    text: '',
    addedAt: 1700000000000,
    source: 'image',
    isPending: true,
    attachments: [pending()],
    ...over,
  };
}

function render(el: React.ReactElement): ReactTestRenderer {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<QueryClientProvider client={qc}>{el}</QueryClientProvider>);
  });
  return tree;
}

function layout(tree: ReactTestRenderer, sourceIndex: number, width: number) {
  const measured = tree.root.findByProps({ testID: `note-row-${sourceIndex}-measure` });
  act(() => {
    measured.props.onLayout({ nativeEvent: { layout: { width } } });
  });
}

describe('PhotoNoteCard', () => {
  it('renders a single pending tile with a progress ring (no status text)', () => {
    const tree = render(
      <PhotoNoteCard entry={entry()} sourceIndex={0} onCancelUpload={() => {}} />,
    );
    layout(tree, 0, 320);
    expect(tree.root.findAllByProps({ testID: 'batch-grid-tile-0-ring' }).length).toBe(1);
    expect(tree.root.findAllByProps({ testID: 'pending-photo-status-0' })).toHaveLength(0);
  });

  it('shows the failed overlay on the tile and fires retry on tap', () => {
    const onRetry = vi.fn();
    const onCancel = vi.fn();
    const tree = render(
      <PhotoNoteCard
        entry={entry({
          attachments: [pending({ status: 'failed', progress: 0, error: 'boom' })],
        })}
        sourceIndex={2}
        onRetryUpload={onRetry}
        onCancelUpload={onCancel}
      />,
    );
    layout(tree, 2, 320);
    expect(tree.root.findAllByProps({ testID: 'batch-grid-tile-0-failed' }).length).toBe(1);
    const tile = tree.root.findAllByProps({ testID: 'batch-grid-tile-0' })
      .find((n) => typeof n.type !== 'function');
    expect(tile).toBeDefined();
    act(() => tile!.props.onPress());
    expect(onRetry).toHaveBeenCalledWith('job_1');
    act(() => tile!.props.onLongPress());
    expect(onCancel).toHaveBeenCalledWith('job_1');
  });

  it('renders the kebab even while uploads are pending', () => {
    const onOpenOptions = vi.fn();
    const tree = render(
      <PhotoNoteCard
        entry={entry()}
        sourceIndex={0}
        onOpenOptions={onOpenOptions}
        onCancelUpload={() => {}}
      />,
    );
    layout(tree, 0, 320);
    // NoteOptionsKebab emits testID `btn-note-options-${noteId}`. The
    // card passes sourceIndex as noteId.
    const kebabInstances = tree.root.findAllByProps({ testID: 'btn-note-options-0' });
    expect(kebabInstances.length).toBeGreaterThan(0);
    const kebab = (kebabInstances.find((n) => typeof n.type !== 'function') ?? kebabInstances[0])!;
    act(() => kebab.props.onPress());
    expect(onOpenOptions).toHaveBeenCalledWith(0);
  });

  it('renders saved 3-up batch with no overlays and tap fires onOpen with fileId', () => {
    const onOpen = vi.fn();
    const tree = render(
      <PhotoNoteCard
        entry={entry({
          id: 'not_X',
          reactKey: '__batch-b1',
          isPending: false,
          attachments: [saved(0), saved(1), saved(2)],
        })}
        sourceIndex={3}
        onOpen={onOpen}
      />,
    );
    layout(tree, 3, 320);
    expect(tree.root.findAllByProps({ testID: 'batch-grid-tile-0-ring' })).toHaveLength(0);
    expect(tree.root.findAllByProps({ testID: 'batch-grid-tile-0-cancel' })).toHaveLength(0);
    const tile = tree.root.findAllByProps({ testID: 'batch-grid-tile-1' })
      .find((n) => typeof n.type !== 'function');
    expect(tile).toBeDefined();
    act(() => tile!.props.onPress());
    expect(onOpen).toHaveBeenCalledWith('fil_1', 3);
  });
});
