// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SourceNotesPanel } from '../SourceNotesPanel';
import { button, click, flush, render } from './dom';
import { fakeReportsApi, noteFixtures } from './fixtures';

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()?.();
});

function wrap(children: ReactNode) {
  return (
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false } },
        })
      }
    >
      {children}
    </QueryClientProvider>
  );
}

describe('SourceNotesPanel', () => {
  it('renders stable loading, empty, and retryable error states', async () => {
    const retry = vi.fn();
    const loading = await render(
      wrap(<SourceNotesPanel api={fakeReportsApi()} notes={[]} isLoading />),
    );
    cleanups.push(loading.cleanup);
    expect(loading.container.textContent).toContain('Loading source notes…');

    const empty = await render(wrap(<SourceNotesPanel api={fakeReportsApi()} notes={[]} />));
    cleanups.push(empty.cleanup);
    expect(empty.container.textContent).toContain('No source notes were captured.');

    const failed = await render(
      wrap(
        <SourceNotesPanel
          api={fakeReportsApi()}
          notes={[]}
          error={new Error('Timed out')}
          onRetry={retry}
        />,
      ),
    );
    cleanups.push(failed.cleanup);
    expect(failed.container.textContent).toContain('Timed out');
    await click(button(failed.container, 'Retry source notes'));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('shows transcript evidence, signed thumbnails, and document references', async () => {
    const imageNote = {
      ...noteFixtures[0]!,
      id: 'not_23456789',
      kind: 'image' as const,
      body: 'East footing before the pour.',
      fileId: 'fil_01234567',
      thumbnailFileId: 'fil_12345678',
    };
    const documentNote = {
      ...noteFixtures[0]!,
      id: 'not_3456789a',
      kind: 'document' as const,
      body: 'Delivery docket.',
      fileId: 'fil_23456789',
    };
    const getFileUrl = vi.fn(async (fileId: string) => ({
      url: `https://files.example.test/${fileId}.jpg`,
      expiresAt: '2026-07-29T00:00:00.000Z',
    }));
    const rendered = await render(
      wrap(
        <SourceNotesPanel
          api={fakeReportsApi({ getFileUrl })}
          notes={[noteFixtures[1]!, imageNote, documentNote]}
        />,
      ),
    );
    cleanups.push(rendered.cleanup);
    await flush();

    expect(rendered.container.textContent).toContain('Transcript');
    expect(rendered.container.textContent).toContain('Attached document');
    const image = rendered.container.querySelector('img[alt="Source photo 1"]');
    expect(image?.getAttribute('src')).toContain('fil_12345678.jpg');
    expect(getFileUrl).toHaveBeenCalledWith('fil_12345678', expect.any(AbortSignal));
  });
});
