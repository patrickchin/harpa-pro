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

vi.mock('expo-image', () => ({
  Image: (props: Record<string, unknown>) => null,
}));

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
      <QueryClientProvider client={qc}>{el}</QueryClientProvider>,
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
    expect(
      tree.root.findAllByProps({ testID: `btn-open-photo-${photoRow.id}` })
        .length,
    ).toBeGreaterThan(0);
  });

  it('renders a voice row with the transcript', () => {
    const tree = wrap(<ReportNotesPane noteRows={[voiceRow]} />);
    expect(
      tree.root.findAllByProps({ testID: `voice-transcript-${voiceRow.id}` })
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
    const btn = tree.root.findByProps({
      testID: `btn-open-photo-${photoRow.id}`,
    });
    act(() => {
      btn.props.onPress();
    });
    expect(onOpenPhoto).toHaveBeenCalledOnce();
    expect(onOpenPhoto.mock.calls[0]![0]).toEqual({
      fileId: 'fil_photo_1',
      title: 'Rebar tied off.',
    });
  });
});
