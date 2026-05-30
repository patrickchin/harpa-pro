/**
 * NoteTimeline — anti-flicker key-stability contract.
 *
 * The voice + photo pipelines stitch synthetic NoteEntry rows into
 * the timeline before the server has confirmed the row. Once the
 * server confirms, the entry is replaced by a saved row carrying the
 * canonical `not_…` id. To prevent the card from unmounting +
 * remounting (= visible flicker, content shift), saved server rows
 * carry an optional `reactKey` that mirrors the synthetic id so
 * React reuses the same component instance across the transition.
 *
 * This test pins that contract: the same PhotoNoteCard instance must
 * survive the pending → saved transition.
 */
import React from 'react';
import { Pressable } from 'react-native';
import { describe, it, expect, vi } from 'vitest';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { NoteTimeline } from './NoteTimeline';
import type { NoteEntry } from '@/lib/notes/note-entry';

vi.mock('expo-image', () => ({
  Image: (props: Record<string, unknown>) =>
    React.createElement('rn-expo-image', props, null),
}));

function wrap(el: React.ReactElement): ReactTestRenderer {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <QueryClientProvider client={qc}>{el}</QueryClientProvider>,
    );
  });
  return tree;
}

describe('NoteTimeline key stability', () => {
  it('keeps the same PhotoNoteCard instance across pending → saved transition', () => {
    const pending: NoteEntry = {
      id: '__batch-b1',
      reactKey: '__batch-b1',
      text: '',
      addedAt: 1700000000000,
      source: 'image',
      isPending: true,
      batchKey: 'b1',
      noteId: 'not_X',
      attachments: [
        { key: 'a', fileId: null, thumbnailFileId: null, sourceUri: 'file:///a.jpg', isPending: true, jobId: 'a', status: 'uploading' as const, progress: 0.5, position: 0 },
        { key: 'b', fileId: null, thumbnailFileId: null, sourceUri: 'file:///b.jpg', isPending: true, jobId: 'b', status: 'uploading' as const, progress: 0.5, position: 1 },
      ],
    };
    const saved: NoteEntry = {
      // Server-canonical id is preserved for downstream mutations…
      id: 'not_X',
      // …but the timeline keys on `reactKey`, which mirrors the
      // synthetic id minted while the upload was in flight.
      reactKey: '__batch-b1',
      text: '',
      addedAt: 1700000000000,
      source: 'image',
      fileId: 'fil_1',
      thumbnailFileId: 'fil_thumb_1',
      attachments: [
        { key: 'nf_1', fileId: 'fil_1', thumbnailFileId: 'fil_thumb_1', sourceUri: null, isPending: false, position: 0 },
        { key: 'nf_2', fileId: 'fil_2', thumbnailFileId: 'fil_thumb_2', sourceUri: null, isPending: false, position: 1 },
      ],
    };

    const tree = wrap(<NoteTimeline notes={[pending]} />);
    // Snapshot the React node identity of the rendered photo card
    // (the testID-bearing View that wraps the card body).
    const before = tree.root.findByProps({ testID: 'note-row-0' });
    const beforeInstance = before.instance;
    const beforeNode = before;

    act(() => {
      tree.update(
        <QueryClientProvider client={new QueryClient()}>
          <NoteTimeline notes={[saved]} />
        </QueryClientProvider>,
      );
    });

    const after = tree.root.findByProps({ testID: 'note-row-0' });
    // Same testID, same React key path → React reuses the parent.
    // The host instance identity check is the strongest signal that
    // the component wasn't remounted between renders.
    expect(after).toBe(beforeNode);
    expect(after.instance).toBe(beforeInstance);

    // And the saved view actually shows the resolved tiles (no more
    // pending status footer).
    expect(
      tree.root.findAllByProps({ testID: 'pending-photo-status-0' }),
    ).toHaveLength(0);
  });

  it('remounts when reactKey changes (negative control)', () => {
    const a: NoteEntry = {
      id: '__batch-b1',
      reactKey: '__batch-b1',
      text: '',
      addedAt: 1700000000000,
      source: 'image',
      attachments: [
        { key: 'j', fileId: null, thumbnailFileId: null, sourceUri: 'file:///a.jpg', isPending: true, jobId: 'j', status: 'uploading' as const, progress: 0.5, position: 0 },
      ],
    };
    const b: NoteEntry = {
      ...a,
      // Different reactKey → React MUST treat as a new row and
      // unmount the previous one. This test pins the negative
      // behaviour so a future regression in NoteTimeline's key
      // selection is caught.
      reactKey: 'not_X',
    };

    const tree = wrap(<NoteTimeline notes={[a]} />);
    const before = tree.root.findByProps({ testID: 'note-row-0' });

    act(() => {
      tree.update(
        <QueryClientProvider client={new QueryClient()}>
          <NoteTimeline notes={[b]} />
        </QueryClientProvider>,
      );
    });

    const after = tree.root.findByProps({ testID: 'note-row-0' });
    expect(after).not.toBe(before);
  });
});

describe('NoteTimeline image routing — legacy single-file entry', () => {
  it('routes a legacy fileId/thumbnailFileId entry through PhotoNoteCard and PhotoBatchGrid', () => {
    // A saved image entry with only fileId + thumbnailFileId and no
    // `attachments` array exercises the `buildAttachments` fallback path
    // that existed before the batch-upload pipeline shipped.  NoteTimeline
    // must continue to route `source === 'image'` to PhotoNoteCard regardless
    // of whether the entry came from the new batch path or this legacy path.
    const entry: NoteEntry = {
      id: 'not_img_1',
      text: 'Site photo',
      addedAt: 1700000000000,
      source: 'image',
      fileId: 'fil_full_1',
      thumbnailFileId: 'fil_thumb_1',
      // No `attachments` — exercises the buildAttachments fileId fallback
    };

    const opens: Array<{ fileId: string; sourceIndex: number }> = [];
    const tree = wrap(
      <NoteTimeline
        notes={[entry]}
        onOpenPhoto={(fileId, sourceIndex) => opens.push({ fileId, sourceIndex })}
      />,
    );

    // Card wrapper is present before layout is fired.
    expect(tree.root.findByProps({ testID: 'note-row-0' })).toBeDefined();

    // Fire the layout event to expose containerWidth → grid renders.
    const measure = tree.root.findByProps({ testID: 'note-row-0-measure' });
    act(() => {
      measure.props.onLayout({ nativeEvent: { layout: { width: 320 } } });
    });

    // A single tile should appear for the one legacy file.
    const tile = tree.root.findByProps({ testID: 'batch-grid-tile-0' });

    // Pressing fires onOpenPhoto with the original fileId and sourceIndex 0.
    const pressable = tile.findByType(Pressable);
    act(() => {
      pressable.props.onPress();
    });

    expect(opens).toEqual([{ fileId: 'fil_full_1', sourceIndex: 0 }]);
  });
});
