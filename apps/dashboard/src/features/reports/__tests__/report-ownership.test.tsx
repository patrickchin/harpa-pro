// @vitest-environment jsdom
import { act } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
import { ReportWorkspacePage } from '../ReportWorkspacePage';
import type { ReportsApi } from '../api';
import { fakeReportsApi, reportFixture } from './fixtures';
import { change, field, flush, keydown, render, waitMs } from './dom';
it('a late save for report A must not dirty and save report B after route reuse', async () => {
  let resolveA!: (v: Awaited<ReturnType<ReportsApi['updateReport']>>) => void;
  const update = vi
    .fn<ReportsApi['updateReport']>()
    .mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolveA = r;
        }),
    )
    .mockImplementation(async (_p, n, input) =>
      reportFixture({
        id: `rpt_${n}`,
        number: n,
        body: input.body,
        updatedAt: '2026-07-28T09:10:00.000Z',
      }),
    );
  const api = fakeReportsApi({
    getReport: async (_p, n) =>
      reportFixture({
        id: `rpt_${n}`,
        number: n,
        updatedAt: n === 7 ? '2026-07-28T09:00:00.000Z' : '2026-07-28T09:05:00.000Z',
      }),
    updateReport: update,
  });
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const page = (number: number) => (
    <QueryClientProvider client={qc}>
      <ReportWorkspacePage
        api={api}
        projectSlug="highland-tower"
        reportNumber={number}
        role="owner"
        autosaveDelayMs={10}
      />
    </QueryClientProvider>
  );
  const rendered = await render(page(7));
  try {
    await flush();
    await change(field(rendered.container, 'Report title'), 'Edit A');
    await keydown(document, 's', { ctrlKey: true });
    expect(update).toHaveBeenCalledTimes(1);
    await act(async () => {
      rendered.root.render(page(8));
    });
    await flush();
    await waitMs(15);
    await act(async () => {
      resolveA(
        reportFixture({
          id: 'rpt_7',
          number: 7,
          body: update.mock.calls[0][2].body,
          updatedAt: '2026-07-28T09:01:00.000Z',
        }),
      );
    });
    await waitMs(25);
    expect(update.mock.calls.map((c) => c[1])).toEqual([7]);
  } finally {
    await rendered.cleanup();
    qc.clear();
    sessionStorage.clear();
  }
});
