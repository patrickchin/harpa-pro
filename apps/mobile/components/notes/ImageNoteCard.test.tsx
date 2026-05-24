/**
 * ImageNoteCard — signed-URL resolver + thumbnail rendering test.
 *
 * Pitfall 13: exercises the real `useFileSignedUrl` + API client
 * wiring; only `fetch` is stubbed. Asserts the card calls
 * `/files/{id}/url`, renders `CachedImage` once resolved, and shows the
 * skeleton while pending.
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ImageNoteCard } from './ImageNoteCard';
import type { NoteEntry } from '@/lib/note-entry';

vi.mock('expo-image', () => ({
  Image: (props: Record<string, unknown>) =>
    React.createElement('rn-expo-image', props, null),
}));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
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

const baseEntry: NoteEntry = {
  id: 'note_1',
  text: '',
  addedAt: Date.parse('2025-01-02T03:04:05Z'),
  source: 'image',
  fileId: 'fil_xyz',
};

describe('ImageNoteCard', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let calls: string[];

  beforeEach(() => {
    calls = [];
    fetchSpy = vi.fn(async (url: string) => {
      calls.push(url);
      return jsonResponse({
        url: 'https://r2.example.com/note.jpg?sig=abc',
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      });
    });
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches the signed URL by fileId and renders the thumbnail', async () => {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = wrap(<ImageNoteCard entry={baseEntry} sourceIndex={0} />);
    });
    expect(calls.some((c) => c.includes('/files/fil_xyz/url'))).toBe(true);
    const start = Date.now();
    while (
      tree.root.findAllByProps({ testID: 'btn-image-note-open-0-img' })
        .length === 0 &&
      Date.now() - start < 1000
    ) {
      // eslint-disable-next-line no-await-in-loop
      await act(async () => {
        await new Promise((r) => setTimeout(r, 5));
      });
    }
    const imgs = tree.root.findAllByProps({
      testID: 'btn-image-note-open-0-img',
    });
    expect(imgs.length).toBeGreaterThan(0);
    expect((imgs[0]!.props.source as { uri: string }).uri).toBe(
      'https://r2.example.com/note.jpg?sig=abc',
    );
  });

  it('shows a loading state while the signed URL is pending', () => {
    vi.unstubAllGlobals();
    const pending = new Promise<Response>(() => undefined);
    vi.stubGlobal('fetch', vi.fn(() => pending));
    const tree = wrap(<ImageNoteCard entry={baseEntry} sourceIndex={3} />);
    expect(
      tree.root.findAllByProps({ testID: 'btn-image-note-open-3-loading' })
        .length,
    ).toBeGreaterThan(0);
    expect(
      tree.root.findAllByProps({ testID: 'btn-image-note-open-3-img' }),
    ).toHaveLength(0);
  });

  it('renders the empty fallback state on fetch error', async () => {
    vi.unstubAllGlobals();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('boom', { status: 500 })),
    );
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = wrap(<ImageNoteCard entry={baseEntry} sourceIndex={2} />);
    });
    const start = Date.now();
    while (
      tree.root.findAllByProps({ testID: 'btn-image-note-open-2-empty' })
        .length === 0 &&
      Date.now() - start < 4000
    ) {
      // eslint-disable-next-line no-await-in-loop
      await act(async () => {
        await new Promise((r) => setTimeout(r, 5));
      });
    }
    expect(
      tree.root.findAllByProps({ testID: 'btn-image-note-open-2-empty' })
        .length,
    ).toBeGreaterThan(0);
  });
});
