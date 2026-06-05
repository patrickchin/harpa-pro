/**
 * Render + behaviour tests for `PlacedPhotoStrip` — the inline grid
 * of thumbnails rendered under an issue / summary section card.
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { PlacedPhotoStrip } from './PlacedPhotoStrip';
import type { PhotoGroup } from '@/lib/reports/photo-placements';

vi.mock('expo-image', () => ({
  Image: (_props: Record<string, unknown>) => null,
}));

function stubFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            url: 'https://r2.example.com/signed.jpg',
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    ),
  );
}

function wrap(el: React.ReactElement, layoutTestID = 'strip'): ReactTestRenderer {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <QueryClientProvider client={qc}>{el}</QueryClientProvider>,
    );
  });
  const root = tree.root.findAll(
    (n) =>
      (n.props as { testID?: string; onLayout?: unknown }).testID ===
        layoutTestID &&
      typeof (n.props as { onLayout?: unknown }).onLayout === 'function',
  )[0];
  if (root) {
    act(() => {
      (root.props as { onLayout: (e: unknown) => void }).onLayout({
        nativeEvent: { layout: { width: 400, height: 0, x: 0, y: 0 } },
      });
    });
  }
  return tree;
}

const GROUP: PhotoGroup = {
  noteId: 'n1',
  title: 'Cracked beam',
  placement: { kind: 'issue', index: 0 },
  photos: [
    { id: 'p1', fileId: 'fil_a', thumbnailFileId: 'thm_a' },
    { id: 'p2', fileId: 'fil_b', thumbnailFileId: null },
  ],
};

describe('PlacedPhotoStrip', () => {
  beforeEach(() => {
    stubFetch();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns null when there are no groups', () => {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(<PlacedPhotoStrip groups={[]} testID="strip" />);
    });
    expect(tree.toJSON()).toBeNull();
  });

  it('renders a tile per photo and forwards taps to onOpenPhoto', () => {
    const onOpenPhoto = vi.fn();
    const tree = wrap(
      <PlacedPhotoStrip
        groups={[GROUP]}
        onOpenPhoto={onOpenPhoto}
        testID="strip"
      />,
    );
    const tile = tree.root.findAllByProps({ testID: 'btn-placed-photo-p1' })[0];
    expect(tile).toBeTruthy();
    act(() => {
      tile!.props.onPress();
    });
    expect(onOpenPhoto).toHaveBeenCalledWith({
      fileId: 'fil_a',
      title: 'Cracked beam',
    });
  });

  it('renders an edit-placement chip when onEditPlacement is provided', () => {
    const onEditPlacement = vi.fn();
    const tree = wrap(
      <PlacedPhotoStrip
        groups={[GROUP]}
        onEditPlacement={onEditPlacement}
        testID="strip"
      />,
    );
    const chip = tree.root.findAllByProps({
      testID: 'btn-edit-placement-n1',
    })[0];
    expect(chip).toBeTruthy();
    act(() => {
      chip!.props.onPress();
    });
    expect(onEditPlacement).toHaveBeenCalledWith('n1');
  });

  it('omits the edit chip when onEditPlacement is not provided', () => {
    const tree = wrap(<PlacedPhotoStrip groups={[GROUP]} testID="strip" />);
    expect(
      tree.root.findAllByProps({ testID: 'btn-edit-placement-n1' }),
    ).toHaveLength(0);
  });
});
