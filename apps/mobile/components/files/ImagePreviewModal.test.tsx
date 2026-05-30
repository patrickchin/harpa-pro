/**
 * ImagePreviewModal — signed-URL resolver integration test.
 *
 * Pitfall 13: exercises the real `useFileSignedUrl` + API client wiring.
 * Only `fetch` is stubbed. Asserts the modal calls `/files/{id}/url`
 * when given a `fileId` and renders `CachedImage` with the resolved uri.
 */
import React from 'react';
import { Modal } from 'react-native';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ImagePreviewModal } from './ImagePreviewModal';

vi.mock('expo-image', () => ({
  Image: (props: Record<string, unknown>) =>
    React.createElement('rn-expo-image', props, null),
}));

vi.mock('react-native-pager-view', () => ({
  default: ({
    children,
    scrollEnabled,
    onPageSelected,
    testID,
  }: {
    children: React.ReactNode;
    scrollEnabled?: boolean;
    onPageSelected?: (event: { nativeEvent: { position: number } }) => void;
    testID?: string;
  }) =>
    React.createElement(
      'rn-pager-view',
      { scrollEnabled, onPageSelected, testID },
      children,
    ),
}));

vi.mock('expo-status-bar', () => ({
  StatusBar: (props: Record<string, unknown>) =>
    React.createElement('rn-status-bar', props, null),
}));

vi.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: { View: 'rn-animated-view' },
  useAnimatedStyle: (fn: () => unknown) => fn(),
  useSharedValue: (value: unknown) => ({ value }),
  withTiming: (value: unknown) => value,
}));

vi.mock('./ZoomableImage', () => ({
  ZoomableImage: (props: Record<string, unknown>) =>
    React.createElement('rn-zoomable-image', props, null),
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
    // ZoomableImage child renders with the resolved uri.
    const start = Date.now();
    while (
      tree.root.findAllByType('rn-zoomable-image' as any).length === 0 &&
      Date.now() - start < 1000
    ) {
      // eslint-disable-next-line no-await-in-loop
      await act(async () => {
        await new Promise((r) => setTimeout(r, 5));
      });
    }
    const previews = tree.root.findAllByType('rn-zoomable-image' as any);
    expect(previews.length).toBeGreaterThan(0);
    const source = previews[0]!.props.source as { uri?: string };
    expect(source.uri).toBe('https://r2.example.com/signed.jpg?sig=abc');
  });

  it('accepts thumbnailFileId on gallery photos without widening onOpenPhoto callbacks', async () => {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = wrap(
        <ImagePreviewModal
          visible
          photos={[
            {
              fileId: 'fil_full_1',
              thumbnailFileId: 'fil_thumb_1',
              title: 'Gallery photo',
              cacheKey: 'fil_full_1',
            },
          ]}
          initialIndex={0}
          onClose={() => {}}
        />,
      );
    });

    expect(calls.some((c) => c.includes('/files/fil_full_1/url'))).toBe(true);
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
    expect(tree.root.findAllByType('rn-zoomable-image' as any)).toHaveLength(
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
    const previews = tree.root.findAllByType('rn-zoomable-image' as any);
    expect(previews.length).toBeGreaterThan(0);
    expect((previews[0]!.props.source as { uri: string }).uri).toBe(
      'https://r2.example.com/explicit.jpg',
    );
  });

  it('uses thumbnailFileId as the fullscreen placeholder cache key', async () => {
    fetchSpy.mockImplementation(async (url: string) => {
      calls.push(url);
      const id = url.includes('/files/fil_thumb_1/url')
        ? 'thumb'
        : 'full';
      return jsonResponse({
        url: `https://r2.example.com/${id}.jpg?sig=abc`,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      });
    });

    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = wrap(
        <ImagePreviewModal
          visible
          photos={[
            {
              fileId: 'fil_full_1',
              thumbnailFileId: 'fil_thumb_1',
              title: 'Gallery photo',
              cacheKey: 'fil_full_1',
            },
          ]}
          onClose={() => {}}
        />,
      );
    });

    const start = Date.now();
    while (
      tree.root.findAllByType('rn-zoomable-image' as any).length === 0 &&
      Date.now() - start < 1000
    ) {
      await act(async () => {
        await new Promise((r) => setTimeout(r, 5));
      });
    }

    const zoomable = tree.root.findByType('rn-zoomable-image' as any);
    expect(zoomable.props.placeholder).toEqual({
      uri: 'https://r2.example.com/thumb.jpg?sig=abc',
    });
    expect(zoomable.props.placeholderCacheKey).toBe('fil_thumb_1');
  });

  it('renders a black fullscreen modal with declarative light status bar', () => {
    const tree = wrap(
      <ImagePreviewModal
        visible
        uri="https://r2.example.com/explicit.jpg"
        title="Explicit"
        onClose={() => {}}
      />,
    );

    const statusBar = tree.root.findByType('rn-status-bar' as any);
    expect(statusBar.props.style).toBe('light');
    expect(statusBar.props.hidden).toBe(false);

    const modal = tree.root.findByType(Modal);
    expect(modal.props.presentationStyle).toBe('overFullScreen');
    expect(modal.props.transparent).toBe(true);
    expect(modal.props.statusBarTranslucent).toBe(true);
  });

  it('disables pager scrolling while a child image is zoomed', () => {
    const tree = wrap(
      <ImagePreviewModal
        visible
        photos={[
          { fileId: 'fil_1', title: 'One', cacheKey: 'fil_1' },
          { fileId: 'fil_2', title: 'Two', cacheKey: 'fil_2' },
        ]}
        onClose={() => {}}
      />,
    );

    const pager = tree.root.findByType('rn-pager-view' as any);
    expect(pager.props.scrollEnabled).toBe(true);

    const zoomable = tree.root.findByProps({ testID: 'image-preview-0' });
    act(() => {
      zoomable.props.onZoomChange(true);
    });

    expect(tree.root.findByType('rn-pager-view' as any).props.scrollEnabled).toBe(false);
  });
});
