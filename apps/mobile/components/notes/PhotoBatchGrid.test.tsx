import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { act, create } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { PhotoBatchGrid } from './PhotoBatchGrid';
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

function render(el: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let tree!: ReturnType<typeof create>;
  act(() => {
    tree = create(<QueryClientProvider client={qc}>{el}</QueryClientProvider>);
  });
  return tree;
}

describe('PhotoBatchGrid sizing', () => {
  function tileWidth(tree: ReturnType<typeof render>, testID: string): number {
    const node = tree.root.findAllByProps({ testID })
      .find((n) => typeof n.type !== 'function');
    expect(node).toBeDefined();
    const style = node!.props.style as
      | { width: number }
      | Array<{ width?: number }>;
    return Array.isArray(style)
      ? style.find((s) => s && typeof s.width === 'number')!.width!
      : style.width;
  }

  // GAP = 6, COLUMNS = 3 → tileSize = floor((320 - 12) / 3) = 102
  it('gives 102px tiles for a single attachment in a 320px container', () => {
    const items: Attachment[] = [saved(0)];
    const tree = render(
      <PhotoBatchGrid attachments={items} containerWidth={320} />,
    );
    expect(tileWidth(tree, 'batch-grid-tile-0')).toBe(102);
  });

  it('gives 102px tiles for two attachments in a 320px container', () => {
    const items: Attachment[] = [saved(0), saved(1)];
    const tree = render(
      <PhotoBatchGrid attachments={items} containerWidth={320} />,
    );
    expect(tileWidth(tree, 'batch-grid-tile-0')).toBe(102);
    expect(tileWidth(tree, 'batch-grid-tile-1')).toBe(102);
  });

  it('gives 102px tiles for three attachments in a 320px container', () => {
    const items: Attachment[] = [saved(0), saved(1), saved(2)];
    const tree = render(
      <PhotoBatchGrid attachments={items} containerWidth={320} />,
    );
    expect(tileWidth(tree, 'batch-grid-tile-0')).toBe(102);
    expect(tileWidth(tree, 'batch-grid-tile-1')).toBe(102);
    expect(tileWidth(tree, 'batch-grid-tile-2')).toBe(102);
  });

  it('renders +N overflow on the 9th tile when more than 9 attachments and keeps tile width', () => {
    const items = Array.from({ length: 11 }, (_, i) => saved(i));
    const tree = render(
      <PhotoBatchGrid attachments={items} containerWidth={320} />,
    );
    expect(
      tree.root.findAllByProps({ testID: 'batch-grid-tile-8' }).length,
    ).toBeGreaterThan(0);
    expect(
      tree.root.findAllByProps({ testID: 'batch-grid-tile-9' }),
    ).toHaveLength(0);
    const overflow = tree.root.findByProps({ testID: 'batch-grid-tile-8-overflow' });
    // overflow shows +3 because 9th tile becomes the +N badge replacing what would be the 9th item; total - (visible-1) = 11 - 8 = 3
    expect(JSON.stringify(overflow.props.children)).toContain('3');
    expect(tileWidth(tree, 'batch-grid-tile-8')).toBe(102);
  });
});
