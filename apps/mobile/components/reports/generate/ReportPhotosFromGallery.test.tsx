/**
 * Render + behaviour tests for `ReportPhotosFromGallery` — the
 * placement-aware bottom photo grid on the Generate Report tab.
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReportPhotosFromGallery } from './ReportPhotosFromGallery';

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
  const layoutNode = tree.root.findAll(
    (n) => typeof (n.props as { onLayout?: unknown }).onLayout === 'function',
  )[0];
  if (layoutNode) {
    act(() => {
      (layoutNode.props as { onLayout: (e: unknown) => void }).onLayout({
        nativeEvent: { layout: { width: 300, height: 0, x: 0, y: 0 } },
      });
    });
  }
  return tree;
}

function findRenderedNodeWithDisabledState(
  tree: ReactTestRenderer,
  testID: string,
) {
  const matches = tree.root.findAllByProps({ testID });
  const node = matches.find(
    (match) => match.props.accessibilityState?.disabled !== undefined,
  );
  expect(node).toBeDefined();
  return node!;
}

const PHOTOS = [
  {
    fileId: 'fa',
    thumbnailFileId: null,
    noteId: 'n1',
    title: 'Cracked beam',
    cacheKey: 'fa',
    placement: null,
  },
  {
    fileId: 'fb',
    thumbnailFileId: null,
    noteId: 'n2',
    title: 'Loose railing',
    cacheKey: 'fb',
    placement: { kind: 'issue' as const, index: 0 },
  },
];

describe('ReportPhotosFromGallery', () => {
  beforeEach(() => stubFetch());
  afterEach(() => vi.unstubAllGlobals());

  it('returns null when there are no photos', () => {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(<ReportPhotosFromGallery photos={[]} onOpen={vi.fn()} />);
    });
    expect(tree.toJSON()).toBeNull();
  });

  it('renders a tile per photo and forwards taps to onOpen', () => {
    const onOpen = vi.fn();
    const tree = wrap(
      <ReportPhotosFromGallery photos={PHOTOS} onOpen={onOpen} />,
    );
    const tile = tree.root.findAllByProps({
      testID: 'btn-generate-report-photo-fa',
    })[0];
    expect(tile).toBeTruthy();
    act(() => {
      tile!.props.onPress();
    });
    expect(onOpen).toHaveBeenCalledWith('fa');
  });

  it('does not render placement chips when onOpenPlacementSheet is omitted', () => {
    const tree = wrap(
      <ReportPhotosFromGallery photos={PHOTOS} onOpen={vi.fn()} />,
    );
    expect(
      tree.root.findAllByProps({
        testID: 'btn-generate-report-photos-place-n1',
      }),
    ).toHaveLength(0);
  });

  it('renders a placement chip per group when onOpenPlacementSheet is provided', () => {
    const onOpenSheet = vi.fn();
    const tree = wrap(
      <ReportPhotosFromGallery
        photos={PHOTOS}
        onOpen={vi.fn()}
        onOpenPlacementSheet={onOpenSheet}
      />,
    );
    const chip = tree.root.findAllByProps({
      testID: 'btn-generate-report-photos-place-n1',
    })[0];
    expect(chip).toBeTruthy();
    act(() => {
      chip!.props.onPress();
    });
    expect(onOpenSheet).toHaveBeenCalledWith('n1');
  });

  it('keeps placement chips visible but disabled when placement actions are locked', () => {
    const onOpenSheet = vi.fn();
    const tree = wrap(
      <ReportPhotosFromGallery
        photos={PHOTOS}
        onOpen={vi.fn()}
        onOpenPlacementSheet={onOpenSheet}
        placementActionsDisabled
      />,
    );
    const chip = tree.root.findByProps({
      testID: 'btn-generate-report-photos-place-n1',
    });
    expect(chip.props.disabled).toBe(true);
    expect(
      findRenderedNodeWithDisabledState(
        tree,
        'btn-generate-report-photos-place-n1',
      ).props.accessibilityState,
    ).toMatchObject({ disabled: true });

    act(() => {
      chip.props.onPress?.();
    });

    expect(onOpenSheet).not.toHaveBeenCalled();
  });
});
