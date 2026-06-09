/**
 * ReportNotesPane — rich timeline dispatch tests.
 *
 * Asserts per-kind row dispatch (text / voice / photo / document),
 * chronological sort, and the photo/voice/document `onOpen*` callback
 * wiring. The signed-URL hook is exercised via the real
 * `useFileSignedUrl` → `useFileUrlQuery` chain; only `fetch` is
 * stubbed (Pitfall 13).
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import {
  ReportNotesPane,
  type ReportNoteRow,
} from './ReportNotesPane';
import {
  AudioPlaybackProvider,
  type PlaybackPlayer,
} from '@/lib/audio/AudioPlaybackProvider';

vi.mock('expo-image', () => ({
  Image: (props: Record<string, unknown>) => null,
}));

// `ReportNotesPane` now drives delete through `useOptimisticDeleteNote`,
// which transitively imports `@/lib/auth` and `@/lib/uuid`. Those touch
// native modules at init (`expo-secure-store`, `expo-crypto`) that
// aren't safe under the node vitest env. Same shape as
// `apps/mobile/lib/api/optimistic.test.tsx`.
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

// Voice rows mount `VoiceNoteRow` which calls `useAudioPlayback()`.
// We exercise the real `AudioPlaybackProvider` (Pitfall 13) with a
// node-safe `playerFactory` stub instead of mocking the hook.
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

function stubFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (String(url).includes('/files/') && String(url).endsWith('/url')) {
        return new Response(
          JSON.stringify({
            url: 'https://r2.example.com/signed/' + url,
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      throw new Error(`Unexpected fetch in test: ${url}`);
    }),
  );
}

function wrap(el: React.ReactElement): ReactTestRenderer {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <QueryClientProvider client={qc}>
        <AudioPlaybackProvider playerFactory={stubPlayerFactory}>
          {el}
        </AudioPlaybackProvider>
      </QueryClientProvider>,
    );
  });
  return tree;
}

const baseTextRow: ReportNoteRow = {
  id: 'n-text',
  kind: 'text',
  body: 'Crane wind-stop at 14:02.',
  createdAt: new Date('2024-05-01T14:02:00Z').toISOString(),
  authorName: 'Site Lead',
  fileId: null,
};

const voiceRow: ReportNoteRow = {
  id: 'n-voice',
  kind: 'voice',
  body: 'Concrete pour on track.',
  createdAt: new Date('2024-05-01T13:00:00Z').toISOString(),
  authorName: 'Foreman',
  fileId: 'fil_voice_1',
};

const photoRow: ReportNoteRow = {
  id: 'n-photo',
  kind: 'photo',
  body: 'Rebar tied off.',
  createdAt: new Date('2024-05-01T15:00:00Z').toISOString(),
  authorName: 'Site Lead',
  fileId: 'fil_photo_1',
};

const documentRow: ReportNoteRow = {
  id: 'n-doc',
  kind: 'document',
  body: 'Inspection sheet.pdf',
  createdAt: new Date('2024-05-01T12:00:00Z').toISOString(),
  authorName: 'PM',
  fileId: 'fil_doc_1',
};

describe('ReportNotesPane', () => {
  beforeEach(() => {
    stubFetch();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the empty state when there are no notes', () => {
    const tree = wrap(<ReportNotesPane noteRows={[]} />);
    expect(
      tree.root.findAllByProps({ testID: 'report-notes-pane' }).length,
    ).toBeGreaterThan(0);
    // EmptyState mounts → text "No source notes".
    const titles = tree.root
      .findAllByType('rn-Text' as unknown as React.ElementType)
      .map((n) => n.props.children);
    expect(titles).toContain('No source notes');
  });

  it('renders a text row inline with the body', () => {
    const tree = wrap(<ReportNotesPane noteRows={[baseTextRow]} />);
    expect(
      tree.root.findAllByProps({ testID: `report-note-${baseTextRow.id}` })
        .length,
    ).toBeGreaterThan(0);
    const texts = tree.root
      .findAllByType('rn-Text' as unknown as React.ElementType)
      .map((n) => n.props.children);
    expect(texts).toContain(baseTextRow.body);
  });

  it('renders a photo row with the open affordance', () => {
    const tree = wrap(<ReportNotesPane noteRows={[photoRow]} />);
    // Grid is gated on a measured container width — fire onLayout so
    // the PhotoBatchGrid mounts.
    const measured = tree.root.findByProps({
      testID: `report-note-${photoRow.id}-measure`,
    });
    act(() => {
      measured.props.onLayout({ nativeEvent: { layout: { width: 320 } } });
    });
    expect(
      tree.root.findAllByProps({ testID: `report-photo-${photoRow.id}-0` })
        .length,
    ).toBeGreaterThan(0);
  });

  it('renders a voice row with the transcript', () => {
    const tree = wrap(<ReportNotesPane noteRows={[voiceRow]} />);
    expect(
      tree.root.findAllByProps({ testID: `voice-transcript-preview-${voiceRow.id}` })
        .length,
    ).toBeGreaterThan(0);
  });

  it('renders a document row with a pressable card', () => {
    const tree = wrap(<ReportNotesPane noteRows={[documentRow]} />);
    expect(
      tree.root.findAllByProps({ testID: `report-note-${documentRow.id}` })
        .length,
    ).toBeGreaterThan(0);
  });

  it('sorts rows newest-first by createdAt across kinds', () => {
    const tree = wrap(
      <ReportNotesPane
        noteRows={[documentRow, voiceRow, baseTextRow, photoRow]}
      />,
    );
    // Photo is newest (15:00), then text (14:02), voice (13:00), document (12:00).
    const ids = tree.root
      .findAllByProps({})
      .filter((n) => typeof n.props.testID === 'string' && n.props.testID.startsWith('report-note-'))
      .map((n) => n.props.testID as string);
    // Each row id appears at least once.
    expect(ids).toContain('report-note-n-photo');
    expect(ids).toContain('report-note-n-text');
    expect(ids).toContain('report-note-n-voice');
    expect(ids).toContain('report-note-n-doc');
    // First occurrence ordering matches newest-first.
    const firstIdx = (id: string) => ids.indexOf(`report-note-${id}`);
    expect(firstIdx('n-photo')).toBeLessThan(firstIdx('n-text'));
    expect(firstIdx('n-text')).toBeLessThan(firstIdx('n-voice'));
    expect(firstIdx('n-voice')).toBeLessThan(firstIdx('n-doc'));
  });

  it('fires onOpenPhoto when the photo affordance is tapped', () => {
    const onOpenPhoto = vi.fn();
    const tree = wrap(
      <ReportNotesPane noteRows={[photoRow]} onOpenPhoto={onOpenPhoto} />,
    );
    const measured = tree.root.findByProps({
      testID: `report-note-${photoRow.id}-measure`,
    });
    act(() => {
      measured.props.onLayout({ nativeEvent: { layout: { width: 320 } } });
    });
    // PhotoTile is the host primitive `rn-Pressable` carrying the
    // tile testID; pick the host (non-function) component.
    const tile = tree.root
      .findAllByProps({ testID: `report-photo-${photoRow.id}-0` })
      .find((n) => typeof n.type !== 'function');
    expect(tile).toBeDefined();
    act(() => {
      tile!.props.onPress();
    });
    expect(onOpenPhoto).toHaveBeenCalledOnce();
    expect(onOpenPhoto.mock.calls[0]![0]).toEqual({
      fileId: 'fil_photo_1',
      title: 'Rebar tied off.',
    });
  });

  it('renders one tile per file for batch image notes', () => {
    const batchRow: ReportNoteRow = {
      id: 'n-photo-batch',
      kind: 'photo',
      body: 'Foundation pour — multi angle',
      createdAt: new Date('2024-05-01T16:00:00Z').toISOString(),
      authorName: 'Site Lead',
      fileId: null,
      files: [
        {
          id: 'nfl_1',
          fileId: 'fil_a',
          thumbnailFileId: null,
          position: 0,
        },
        {
          id: 'nfl_2',
          fileId: 'fil_b',
          thumbnailFileId: null,
          position: 1,
        },
        {
          id: 'nfl_3',
          fileId: 'fil_c',
          thumbnailFileId: null,
          position: 2,
        },
      ],
    };
    const tree = wrap(<ReportNotesPane noteRows={[batchRow]} />);
    const measured = tree.root.findByProps({
      testID: `report-note-${batchRow.id}-measure`,
    });
    act(() => {
      measured.props.onLayout({ nativeEvent: { layout: { width: 320 } } });
    });
    // 3 tiles: index 0..2.
    expect(
      tree.root.findAllByProps({ testID: `report-photo-${batchRow.id}-0` })
        .length,
    ).toBeGreaterThan(0);
    expect(
      tree.root.findAllByProps({ testID: `report-photo-${batchRow.id}-1` })
        .length,
    ).toBeGreaterThan(0);
    expect(
      tree.root.findAllByProps({ testID: `report-photo-${batchRow.id}-2` })
        .length,
    ).toBeGreaterThan(0);
  });
});
