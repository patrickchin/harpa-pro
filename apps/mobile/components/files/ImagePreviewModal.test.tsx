/**
 * ImagePreviewModal — signed-URL resolver integration test.
 *
 * Pitfall 13: exercises the real `useFileSignedUrl` + API client wiring.
 * Only `fetch` is stubbed. Asserts the modal calls `/files/{id}/url`
 * when given a `fileId` and renders `CachedImage` with the resolved uri.
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ImagePreviewModal } from './ImagePreviewModal';

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

describe('ImagePreviewModal', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let calls: string[];

  beforeEach(() => {
    calls = [];
    fetchSpy = vi.fn(async (url: string) => {
      calls.push(url);
      return jsonResponse({
        url: 'https://r2.example.com/signed.jpg?sig=abc',
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      });
    });
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not fetch a signed URL while the modal is closed', () => {
    wrap(<ImagePreviewModal visible={false} fileId="fil_1" onClose={() => {}} />);
    expect(calls).toHaveLength(0);
  });

  it('fetches the signed URL when opened with a fileId and renders CachedImage', async () => {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = wrap(
        <ImagePreviewModal visible fileId="fil_xyz" onClose={() => {}} />,
      );
    });
    // The signed-URL endpoint was hit at least once with the file id.
    expect(calls.some((c) => c.includes('/files/fil_xyz/url'))).toBe(true);
    // Flush fetch + React-Query state-transition microtasks until the
    // CachedImage child renders with the resolved uri.
    const start = Date.now();
    while (
      tree.root.findAllByProps({ testID: 'image-preview' }).length === 0 &&
      Date.now() - start < 1000
    ) {
      // eslint-disable-next-line no-await-in-loop
      await act(async () => {
        await new Promise((r) => setTimeout(r, 5));
      });
    }
    const previews = tree.root.findAllByProps({ testID: 'image-preview' });
    expect(previews.length).toBeGreaterThan(0);
    const source = previews[0]!.props.source as { uri?: string };
    expect(source.uri).toBe('https://r2.example.com/signed.jpg?sig=abc');
  });

  it('renders the loading indicator before a signed URL resolves', () => {
    // Hold fetch pending so the query never resolves during the test tick.
    vi.unstubAllGlobals();
    const pending = new Promise<Response>(() => undefined);
    vi.stubGlobal('fetch', vi.fn(() => pending));
    const tree = wrap(
      <ImagePreviewModal visible fileId="fil_pending" onClose={() => {}} />,
    );
    expect(
      tree.root.findAllByProps({ testID: 'image-preview-loading' }).length,
    ).toBeGreaterThan(0);
    expect(tree.root.findAllByProps({ testID: 'image-preview' })).toHaveLength(
      0,
    );
  });

  it('uses a pre-resolved uri without fetching when provided', () => {
    const tree = wrap(
      <ImagePreviewModal
        visible
        uri="https://r2.example.com/explicit.jpg"
        onClose={() => {}}
      />,
    );
    expect(calls).toHaveLength(0);
    const previews = tree.root.findAllByProps({ testID: 'image-preview' });
    expect(previews.length).toBeGreaterThan(0);
    expect((previews[0]!.props.source as { uri: string }).uri).toBe(
      'https://r2.example.com/explicit.jpg',
    );
  });
});
