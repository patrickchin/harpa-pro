// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router';

import { ReportsListPage, type ReportsListPageProps } from '../ReportsListPage';
import type { ReportListInput } from '../api';
import { button, change, click, field, flush, keydown, render } from './dom';
import { fakeReportsApi, reportFixture } from './fixtures';

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()?.();
});

function queryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="current-url">{location.pathname + location.search}</output>;
}

function renderList(
  props: ReportsListPageProps,
  initialEntry = '/projects/highland-tower/reports',
) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <QueryClientProvider client={queryClient()}>
        <ReportsListPage {...props} />
        <LocationProbe />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('ReportsListPage', () => {
  it('renders the accessible report table and sends status to the server', async () => {
    const calls: ReportListInput[] = [];
    const api = fakeReportsApi({
      listReports: async (_project, input) => {
        calls.push(input);
        return {
          items: [
            reportFixture({
              body: {
                ...reportFixture().body!,
                meta: {
                  title: null,
                  summary: null,
                  visitDate: '2026-07-28T00:00:00.000Z',
                },
              },
              needsRegeneration: true,
            }),
          ],
          nextCursor: 'cursor-2',
        };
      },
    });

    const rendered = await renderList({
      api,
      projectSlug: 'highland-tower',
      role: 'owner',
      onOpenReport: () => undefined,
    });
    cleanups.push(rendered.cleanup);
    await flush();

    expect(rendered.container.querySelector('table')).not.toBeNull();
    expect(
      rendered.container.querySelector('section[aria-labelledby="reports-heading"]'),
    ).toHaveClass('space-y-6');
    expect(rendered.container.querySelector('#reports-heading')).toHaveClass('text-title-sm');
    expect(rendered.container.querySelector('#reports-heading')).not.toHaveClass('text-title');
    expect(field(rendered.container, 'Status')).toHaveClass(
      'font-normal',
      'tracking-normal',
      'normal-case',
    );
    const reportTitleButtons = [
      ...rendered.container.querySelectorAll<HTMLButtonElement>(
        'button[aria-label^="Open Site Visit"]',
      ),
    ];
    expect(reportTitleButtons.length).toBeGreaterThan(0);
    for (const button of reportTitleButtons) {
      expect(button).toHaveClass('text-foreground');
    }
    expect(
      [...rendered.container.querySelectorAll('th')].map((cell) => cell.textContent?.trim()),
    ).toEqual([
      'Site visit',
      'Report',
      'Visit date',
      'Status',
      'Attention',
      'Last updated',
      'Actions',
    ]);
    expect(rendered.container.textContent).toContain('Untitled report');
    expect(rendered.container.textContent).toContain('Needs update');
    expect(calls[0]).toMatchObject({ status: 'all', cursor: undefined });

    expect(rendered.container.querySelector('table')?.parentElement).toHaveClass(
      'hidden',
      'lg:block',
    );
    expect(rendered.container.querySelector('ul[aria-label="Reports"]')).toHaveClass(
      'grid',
      'gap-3',
      'lg:hidden',
    );

    await change(field(rendered.container, 'Status'), 'finalized');
    await flush();

    expect(calls.at(-1)).toMatchObject({
      status: 'finalized',
      cursor: undefined,
    });
  });

  it('hydrates the draft filter from the URL and keeps filter pagination coherent', async () => {
    const calls: ReportListInput[] = [];
    const api = fakeReportsApi({
      listReports: async (_project, input) => {
        calls.push(input);
        return {
          items: [reportFixture()],
          nextCursor: input.cursor ? null : 'cursor-2',
        };
      },
    });
    const rendered = await renderList(
      {
        api,
        projectSlug: 'highland-tower',
        role: 'owner',
        onOpenReport: () => undefined,
      },
      '/projects/highland-tower/reports?status=draft',
    );
    cleanups.push(rendered.cleanup);
    await flush();

    expect(field(rendered.container, 'Status')).toHaveValue('draft');
    expect(calls[0]).toMatchObject({
      status: 'draft',
      cursor: undefined,
    });

    await click(button(rendered.container, 'Next'));
    await flush();

    expect(calls.at(-1)).toMatchObject({
      status: 'draft',
      cursor: 'cursor-2',
    });
    expect(rendered.container.querySelector('[data-testid="current-url"]')).toHaveTextContent(
      '/projects/highland-tower/reports?status=draft&cursor=cursor-2',
    );

    await change(field(rendered.container, 'Status'), 'finalized');
    await flush();

    expect(calls.at(-1)).toMatchObject({
      status: 'finalized',
      cursor: undefined,
    });
    expect(rendered.container.querySelector('[data-testid="current-url"]')).toHaveTextContent(
      '/projects/highland-tower/reports?status=finalized',
    );
    expect(button(rendered.container, 'Previous')).toBeDisabled();
  });

  it('creates a report for writers and opens the new workspace', async () => {
    const onOpenReport = vi.fn();
    const createReport = vi.fn(async () => reportFixture({ number: 8 }));
    const rendered = await renderList({
      api: fakeReportsApi({ createReport }),
      projectSlug: 'highland-tower',
      role: 'editor',
      onOpenReport,
    });
    cleanups.push(rendered.cleanup);
    await flush();

    await click(button(rendered.container, 'New report'));
    await flush();

    expect(createReport).toHaveBeenCalledWith('highland-tower');
    expect(onOpenReport).toHaveBeenCalledWith(8);
  });

  it('does not expose report mutations to viewers', async () => {
    const rendered = await renderList({
      api: fakeReportsApi(),
      projectSlug: 'highland-tower',
      role: 'viewer',
      onOpenReport: () => undefined,
    });
    cleanups.push(rendered.cleanup);
    await flush();

    expect(
      [...rendered.container.querySelectorAll('button')].some(
        (candidate) => candidate.textContent?.trim() === 'New report',
      ),
    ).toBe(false);
    expect(rendered.container.textContent).not.toContain('Delete report');
  });

  it('paginates in both directions and confirms a named delete', async () => {
    const calls: ReportListInput[] = [];
    const deleteReport = vi.fn(async () => undefined);
    const onOpenReport = vi.fn();
    const api = fakeReportsApi({
      listReports: async (_project, input) => {
        calls.push(input);
        return {
          items: [reportFixture()],
          nextCursor: input.cursor ? null : 'cursor-2',
        };
      },
      deleteReport,
    });
    const rendered = await renderList({
      api,
      projectSlug: 'highland-tower',
      role: 'owner',
      onOpenReport,
    });
    cleanups.push(rendered.cleanup);
    await flush();

    await click(button(rendered.container, 'Open Site Visit #7: Highland Tower progress report'));
    expect(onOpenReport).toHaveBeenCalledWith(7);

    await click(button(rendered.container, 'Refresh'));
    await flush();
    expect(calls.length).toBeGreaterThan(1);

    await click(button(rendered.container, 'Next'));
    await flush();
    expect(calls.at(-1)?.cursor).toBe('cursor-2');
    expect(rendered.container.querySelector('[data-testid="current-url"]')).toHaveTextContent(
      '/projects/highland-tower/reports?cursor=cursor-2',
    );

    await click(button(rendered.container, 'Previous'));
    await flush();
    expect(calls.at(-1)?.cursor).toBeUndefined();
    expect(rendered.container.querySelector('[data-testid="current-url"]')).toHaveTextContent(
      '/projects/highland-tower/reports',
    );

    const deleteTrigger = button(rendered.container, 'Delete Site Visit #7');
    deleteTrigger.focus();
    await click(deleteTrigger);
    expect(document.body.textContent).toContain('Delete Site Visit #7?');
    expect(button(document, 'Cancel')).toHaveFocus();
    await keydown(document, 'Escape');
    expect(document.body.textContent).not.toContain('Delete Site Visit #7?');
    expect(deleteTrigger).toHaveFocus();
    await click(deleteTrigger);
    await click(button(document, 'Confirm delete'));
    await flush();

    expect(deleteReport).toHaveBeenCalledWith('highland-tower', 7);
  });

  it('keeps the table scaffold and offers retry after a list failure', async () => {
    const listReports = vi
      .fn()
      .mockRejectedValueOnce(new Error('Network unavailable'))
      .mockResolvedValueOnce({ items: [], nextCursor: null });
    const rendered = await renderList({
      api: fakeReportsApi({ listReports }),
      projectSlug: 'highland-tower',
      role: 'viewer',
      onOpenReport: () => undefined,
    });
    cleanups.push(rendered.cleanup);
    await flush();

    expect(rendered.container.querySelector('table')).not.toBeNull();
    expect(rendered.container.textContent).toContain('Network unavailable');
    await click(button(rendered.container, 'Retry reports'));
    await flush();
    expect(rendered.container.textContent).toContain('No reports found');
  });
});
