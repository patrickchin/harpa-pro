/**
 * ReportPhotos block tests.
 *
 * Asserts the 0 / 1 / N photo render branches and the `onOpenPhoto`
 * callback wiring. Uses the real `useFileSignedUrl` chain — `fetch`
 * is the only stub (Pitfall 13).
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ReportPhotos } from './ReportPhotos';
import type { ReportNoteRow } from './ReportNotesPane';

vi.mock('expo-image', () => ({
  Image: (props: Record<string, unknown>) => null,
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
  // Simulate layout so the onLayout-driven grid knows its width.
  const grid = tree.root.findAllByProps({ testID: 'report-photos-grid' })[0];
  if (grid) {
    act(() => {
      grid.props.onLayout({
        nativeEvent: { layout: { width: 330, height: 0, x: 0, y: 0 } },
      });
    });
  }
  return tree;
}

function photo(id: string, fileId: string): ReportNoteRow {
  return {
    id,
    kind: 'photo',
    body: `caption ${id}`,
    createdAt: new Date().toISOString(),
    authorName: 'Site Lead',
    fileId,
  };
}

describe('ReportPhotos', () => {
  beforeEach(() => {
    stubFetch();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders nothing when there are zero photos', () => {
    const tree = wrap(<ReportPhotos noteRows={[]} />);
    expect(tree.root.findAllByProps({ testID: 'report-photos' })).toHaveLength(
      0,
    );
  });

  it('skips photo rows missing a fileId', () => {
    const tree = wrap(
      <ReportPhotos
        noteRows={[
          {
            id: 'p',
            kind: 'photo',
            body: null,
            createdAt: null,
            fileId: null,
          },
        ]}
      />,
    );
    expect(tree.root.findAllByProps({ testID: 'report-photos' })).toHaveLength(
      0,
    );
  });

  it('renders a single photo with its open affordance', () => {
    const tree = wrap(<ReportPhotos noteRows={[photo('p1', 'fil_1')]} />);
    expect(
      tree.root.findAllByProps({ testID: 'report-photos' }).length,
    ).toBeGreaterThan(0);
    expect(
      tree.root.findAllByProps({ testID: 'btn-report-photo-p1' }).length,
    ).toBeGreaterThan(0);
  });

  it('renders N photo affordances when given N photos', () => {
    const tree = wrap(
      <ReportPhotos
        noteRows={[
          photo('p1', 'fil_1'),
          photo('p2', 'fil_2'),
          photo('p3', 'fil_3'),
        ]}
      />,
    );
    expect(
      tree.root.findAllByProps({ testID: 'btn-report-photo-p1' }).length,
    ).toBeGreaterThan(0);
    expect(
      tree.root.findAllByProps({ testID: 'btn-report-photo-p2' }).length,
    ).toBeGreaterThan(0);
    expect(
      tree.root.findAllByProps({ testID: 'btn-report-photo-p3' }).length,
    ).toBeGreaterThan(0);
  });

  it('invokes onOpenPhoto with the resolved fileId when tapped', () => {
    const onOpenPhoto = vi.fn();
    const tree = wrap(
      <ReportPhotos
        noteRows={[photo('p1', 'fil_1')]}
        onOpenPhoto={onOpenPhoto}
      />,
    );
    const btn = tree.root.findByProps({ testID: 'btn-report-photo-p1' });
    act(() => {
      btn.props.onPress();
    });
    expect(onOpenPhoto).toHaveBeenCalledWith({
      fileId: 'fil_1',
      title: 'caption p1',
    });
  });
});
