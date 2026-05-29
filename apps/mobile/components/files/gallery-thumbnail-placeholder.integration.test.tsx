import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ImagePreviewModal } from './ImagePreviewModal';
import { PhotoBatchGrid } from '@/components/notes/PhotoBatchGrid';
import type { Attachment } from '@/lib/notes/attachments';

vi.mock('expo-image', () => ({
  Image: (props: Record<string, unknown>) =>
    React.createElement('rn-expo-image', props, null),
}));

vi.mock('react-native-pager-view', () => ({
  default: ({ children, testID }: { children: React.ReactNode; testID?: string }) =>
    React.createElement('rn-pager-view', { testID }, children),
}));

vi.mock('expo-status-bar', () => ({
  StatusBar: (props: Record<string, unknown>) =>
    React.createElement('rn-status-bar', props, null),
}));

vi.mock('react-native-gesture-handler', () => {
  const makeGesture = () => {
    const cfg: Record<string, unknown> = {};
    const handler: ProxyHandler<typeof cfg> = {
      get(_target, prop) {
        if (prop === '__cfg') return cfg;
        // Every method call returns the proxy for chaining
        return (...args: unknown[]) => {
          if (typeof prop === 'string' && /^on[A-Z]/.test(prop))
            cfg[prop] = args[0];
          return proxy;
        };
      },
    };
    const proxy = new Proxy(cfg, handler);
    return proxy;
  };
  return {
    Gesture: {
      Tap: makeGesture,
      Pinch: makeGesture,
      Pan: makeGesture,
      Race: (...gestures: unknown[]) => ({ type: 'race', gestures }),
      Exclusive: (...gestures: unknown[]) => ({ type: 'exclusive', gestures }),
      Simultaneous: (...gestures: unknown[]) => ({
        type: 'simultaneous',
        gestures,
      }),
    },
    GestureDetector: ({ children }: { children: React.ReactNode }) =>
      React.createElement('rn-gesture-detector', null, children),
  };
});

vi.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: { createAnimatedComponent: (C: unknown) => C, View: 'rn-animated-view' },
  runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
  useAnimatedStyle: (fn: () => unknown) => fn(),
  useAnimatedProps: (fn: () => unknown) => fn(),
  useSharedValue: (value: unknown) => ({ value }),
  withSpring: (value: unknown) => value,
  withTiming: (value: unknown) => value,
}));

vi.mock('react-native-svg', () => ({
  default: ({ children }: { children: React.ReactNode }) =>
    React.createElement('rn-svg', null, children),
  Circle: (props: Record<string, unknown>) =>
    React.createElement('rn-circle', props, null),
}));

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function waitForImage(
  tree: ReactTestRenderer,
  testID: string,
): Promise<void> {
  const start = Date.now();
  while (
    tree.root.findAllByProps({ testID }).length === 0 &&
    Date.now() - start < 1000
  ) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
  }
  expect(tree.root.findAllByProps({ testID }).length).toBeGreaterThan(0);
}

describe('gallery thumbnail placeholder default wiring', () => {
  it('reuses the grid thumbnail query when opening the fullscreen modal', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls.push(url);
        const id = url.includes('/files/fil_thumb/url') ? 'thumb' : 'full';
        return jsonResponse({
          url: `https://r2.example.com/${id}.jpg?sig=abc`,
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        });
      }),
    );

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const attachment: Attachment = {
      key: 'nf_1',
      fileId: 'fil_full',
      thumbnailFileId: 'fil_thumb',
      sourceUri: null,
      isPending: false,
      status: 'completed',
      progress: 1,
      position: 0,
    };

    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = create(
        <QueryClientProvider client={queryClient}>
          <PhotoBatchGrid
            attachments={[attachment]}
            containerWidth={320}
            onOpenFile={() => {}}
          />
        </QueryClientProvider>,
      );
    });

    await waitForImage(tree, 'batch-grid-tile-0-img');
    const thumbnailCallsAfterGrid = calls.filter((c) =>
      c.includes('/files/fil_thumb/url'),
    );
    expect(thumbnailCallsAfterGrid).toHaveLength(1);

    await act(async () => {
      tree.update(
        <QueryClientProvider client={queryClient}>
          <ImagePreviewModal
            visible
            photos={[
              {
                fileId: 'fil_full',
                thumbnailFileId: 'fil_thumb',
                title: 'Photo',
                cacheKey: 'fil_full',
              },
            ]}
            onClose={() => {}}
          />
        </QueryClientProvider>,
      );
    });

    await waitForImage(tree, 'image-preview-0-image');
    const thumbnailCallsAfterModal = calls.filter((c) =>
      c.includes('/files/fil_thumb/url'),
    );
    expect(thumbnailCallsAfterModal).toHaveLength(1);

    const image = tree.root.findByProps({ testID: 'image-preview-0-image' });
    expect(image.props.placeholder).toEqual({
      uri: 'https://r2.example.com/thumb.jpg?sig=abc',
    });
    expect(image.props.placeholderCacheKey).toBe('fil_thumb');

    vi.unstubAllGlobals();
  });
});
