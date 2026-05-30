import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { PhotoTile } from './PhotoTile';
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
    progress: 0.4,
    position: 0,
    ...over,
  };
}

function saved(over: Partial<Attachment> = {}): Attachment {
  return {
    key: 'nf_1',
    fileId: 'fil_1',
    thumbnailFileId: 'fil_1_t',
    sourceUri: null,
    isPending: false,
    position: 0,
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

describe('PhotoTile pending state', () => {
  it('renders the local source uri thumbnail + progress ring + cancel target', () => {
    const onCancel = vi.fn();
    const tree = render(
      <PhotoTile attachment={pending()} size={120} onCancel={onCancel} testID="tile" />,
    );
    expect(
      tree.root.findByProps({ testID: 'tile-img' }).props.source.uri,
    ).toBe('file:///tmp/a.jpg');
    expect(tree.root.findAllByProps({ testID: 'tile-ring' }).length).toBe(1);
    const cancel = tree.root.findByProps({ testID: 'tile-cancel' });
    act(() => cancel.props.onPress());
    expect(onCancel).toHaveBeenCalledWith('job_1');
  });

  it('hides the ring during the finalizing tail (progress=1, not completed)', () => {
    const tree = render(
      <PhotoTile
        attachment={pending({ status: 'registering', progress: 1 })}
        size={120}
        testID="tile"
      />,
    );
    expect(tree.root.findAllByProps({ testID: 'tile-ring' }).length).toBe(0);
  });
});

describe('PhotoTile failed state', () => {
  it('shows the warning overlay; tap fires retry, long-press fires dismiss', () => {
    const onRetry = vi.fn();
    const onDismiss = vi.fn();
    const tree = render(
      <PhotoTile
        attachment={pending({ status: 'failed', progress: 0, error: 'boom' })}
        size={120}
        onRetry={onRetry}
        onCancel={onDismiss}
        testID="tile"
      />,
    );
    expect(tree.root.findAllByProps({ testID: 'tile-failed' }).length).toBe(1);
    expect(tree.root.findAllByProps({ testID: 'tile-ring' }).length).toBe(0);
    const surface = tree.root.findAllByProps({ testID: 'tile' }).find(
      (n) => typeof n.type !== 'function',
    );
    if (!surface) throw new Error('Pressable surface with testID "tile" not found');
    act(() => surface.props.onPress());
    expect(onRetry).toHaveBeenCalledWith('job_1');
    act(() => surface.props.onLongPress());
    expect(onDismiss).toHaveBeenCalledWith('job_1');
  });
});

describe('PhotoTile saved state', () => {
  it('renders the server thumbnail and fires onPress with the fileId', () => {
    const onPress = vi.fn();
    const tree = render(
      <PhotoTile attachment={saved()} size={120} onPress={onPress} testID="tile" />,
    );
    expect(tree.root.findAllByProps({ testID: 'tile-ring' }).length).toBe(0);
    expect(tree.root.findAllByProps({ testID: 'tile-cancel' }).length).toBe(0);
    const surface = tree.root.findAllByProps({ testID: 'tile' }).find(
      (n) => typeof n.type !== 'function',
    );
    if (!surface) throw new Error('Pressable surface with testID "tile" not found');
    act(() => surface.props.onPress());
    expect(onPress).toHaveBeenCalledWith('fil_1');
  });

  it('renders an overflow badge when overflowCount is provided', () => {
    const tree = render(
      <PhotoTile
        attachment={saved()}
        size={120}
        overflowCount={5}
        testID="tile"
      />,
    );
    const badge = tree.root.findByProps({ testID: 'tile-overflow' });
    expect(JSON.stringify(badge.props.children)).toContain('5');
  });
});
