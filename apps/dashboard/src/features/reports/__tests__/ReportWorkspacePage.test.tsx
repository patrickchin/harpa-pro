// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ReportConflictError } from '../api';
import { ReportWorkspacePage, reportDraftStorageKey } from '../ReportWorkspacePage';
import { button, change, click, field, flush, keydown, render } from './dom';
import { commentFixture, fakeReportsApi, reportFixture } from './fixtures';

const cleanups: Array<() => Promise<void>> = [];

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()?.();
  vi.restoreAllMocks();
});

function queryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

async function mountWorkspace(
  props: Partial<React.ComponentProps<typeof ReportWorkspacePage>> = {},
) {
  const rendered = await render(
    <QueryClientProvider client={queryClient()}>
      <ReportWorkspacePage
        api={fakeReportsApi()}
        projectSlug="highland-tower"
        reportNumber={7}
        role="owner"
        autosaveDelayMs={10}
        {...props}
      />
    </QueryClientProvider>,
  );
  cleanups.push(rendered.cleanup);
  await flush();
  return rendered;
}

describe('ReportWorkspacePage draft editing', () => {
  it('uses a responsive Tailwind workspace scaffold', async () => {
    const rendered = await mountWorkspace();
    const workspace = rendered.container.querySelector('[data-testid="report-workspace"]');
    const draftLayout = rendered.container.querySelector('[data-testid="report-draft-layout"]');

    expect(workspace).not.toBeNull();
    expect(workspace?.className).toContain('min-w-0');
    expect(workspace?.className).not.toContain('reports-workspace');
    expect(draftLayout?.className).toContain('grid');
    expect(draftLayout?.className).toContain('xl:grid-cols-[minmax(0,1.8fr)_minmax(20rem,1fr)]');
  });

  it('updates the live preview and autosaves with the loaded version', async () => {
    const updateReport = vi.fn(
      async (
        _project: string,
        _number: number,
        input: Parameters<ReturnType<typeof fakeReportsApi>['updateReport']>[2],
      ) =>
        reportFixture({
          body: input.body,
          updatedAt: '2026-07-28T09:01:00.000Z',
        }),
    );
    const rendered = await mountWorkspace({
      api: fakeReportsApi({ updateReport }),
      autosaveDelayMs: 100,
    });

    vi.useFakeTimers();
    try {
      await change(field(rendered.container, 'Report title'), 'Keyboard revised progress report');

      const preview = rendered.container.querySelector('[data-testid="report-preview"]');
      expect(preview?.textContent).toContain('Keyboard revised progress report');
      expect(rendered.container.textContent).toContain('Unsaved changes');
      expect(button(rendered.container, 'Finalize').disabled).toBe(true);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });
    } finally {
      vi.useRealTimers();
    }

    expect(updateReport).toHaveBeenCalledTimes(1);
    expect(updateReport.mock.calls[0]?.[2]).toMatchObject({
      expectedUpdatedAt: '2026-07-28T09:00:00.000Z',
      body: {
        meta: {
          title: 'Keyboard revised progress report',
        },
      },
    });
    expect(rendered.container.textContent).toContain('Saved');
    expect(button(rendered.container, 'Finalize').disabled).toBe(false);
    expect(rendered.container.textContent).toContain('Concrete delivery moved to 09:15.');
  });

  it('forces save with Cmd/Ctrl+S without waiting for autosave', async () => {
    const updateReport = vi.fn(async () =>
      reportFixture({ updatedAt: '2026-07-28T09:01:00.000Z' }),
    );
    const rendered = await mountWorkspace({
      api: fakeReportsApi({ updateReport }),
      autosaveDelayMs: 60_000,
    });

    await change(field(rendered.container, 'Summary'), 'Forced-save copy');
    await keydown(document, 's', { ctrlKey: true });
    await flush();

    expect(updateReport).toHaveBeenCalledTimes(1);
  });

  it('debounces crash-recovery persistence while typing', async () => {
    const rendered = await mountWorkspace({
      autosaveDelayMs: 60_000,
      draftPersistenceDelayMs: 25,
    });
    const key = reportDraftStorageKey('highland-tower', 7);

    vi.useFakeTimers();
    try {
      await change(field(rendered.container, 'Summary'), 'First keystroke');
      expect(sessionStorage.getItem(key)).toBeNull();
      await change(field(rendered.container, 'Summary'), 'Latest draft value');
      expect(sessionStorage.getItem(key)).toBeNull();

      vi.advanceTimersByTime(24);
      expect(sessionStorage.getItem(key)).toBeNull();
      vi.advanceTimersByTime(1);
      expect(sessionStorage.getItem(key)).toContain('Latest draft value');
      expect(sessionStorage.getItem(key)).not.toContain('First keystroke');
    } finally {
      vi.useRealTimers();
    }
  });

  it('preserves a stale local draft, stops autosave, and requires an explicit overwrite', async () => {
    const currentServer = reportFixture({
      updatedAt: '2026-07-28T09:02:00.000Z',
      body: {
        ...reportFixture().body!,
        meta: {
          ...reportFixture().body!.meta,
          title: 'Changed on the phone',
        },
      },
    });
    const updateReport = vi
      .fn()
      .mockRejectedValueOnce(new ReportConflictError(currentServer))
      .mockResolvedValueOnce(reportFixture({ updatedAt: '2026-07-28T09:03:00.000Z' }));
    const rendered = await mountWorkspace({
      api: fakeReportsApi({ updateReport }),
      autosaveDelayMs: 60_000,
    });

    await change(field(rendered.container, 'Report title'), 'My browser draft');
    await keydown(document, 's', { metaKey: true });
    await flush();

    expect(rendered.container.textContent).toContain('This report changed on another device');
    expect(rendered.container.textContent).toContain('Changed elsewhere');
    expect(button(rendered.container, 'Finalize').disabled).toBe(true);
    expect(updateReport).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(reportDraftStorageKey('highland-tower', 7))).toContain(
      'My browser draft',
    );

    await click(button(rendered.container, 'Overwrite with my draft'));
    expect(rendered.container.textContent).toContain('Replace the newer server copy?');
    await click(button(rendered.container, 'Confirm overwrite'));
    await flush();

    expect(updateReport).toHaveBeenCalledTimes(2);
    expect(updateReport.mock.calls[1]?.[2]).toMatchObject({
      expectedUpdatedAt: '2026-07-28T09:02:00.000Z',
    });
    expect(rendered.container.textContent).toContain('Saved');
    expect(sessionStorage.getItem(reportDraftStorageKey('highland-tower', 7))).toBeNull();
  });

  it('sends the current version through update and finalization actions', async () => {
    const generated = reportFixture({
      updatedAt: '2026-07-28T09:04:00.000Z',
      needsRegeneration: false,
    });
    const updateGeneratedReport = vi.fn(async () => ({ report: generated }));
    const finalizeReport = vi.fn(async () => ({
      report: reportFixture({
        status: 'finalized',
        updatedAt: '2026-07-28T09:05:00.000Z',
        finalizedAt: '2026-07-28T09:05:00.000Z',
      }),
    }));
    const rendered = await mountWorkspace({
      api: fakeReportsApi({ updateGeneratedReport, finalizeReport }),
    });

    await click(button(rendered.container, 'Update report'));
    await flush();
    expect(updateGeneratedReport).toHaveBeenCalledWith('highland-tower', 7, {
      expectedUpdatedAt: '2026-07-28T09:00:00.000Z',
    });

    await click(button(rendered.container, 'Finalize'));
    expect(rendered.container.textContent).toContain('Finalize Site Visit #7?');
    await click(button(rendered.container, 'Confirm finalize'));
    await flush();

    expect(finalizeReport).toHaveBeenCalledWith('highland-tower', 7, {
      expectedUpdatedAt: '2026-07-28T09:04:00.000Z',
    });
  });

  it('reloads the current server body after a conflict without losing it first', async () => {
    const currentServer = reportFixture({
      updatedAt: '2026-07-28T09:02:00.000Z',
      body: {
        ...reportFixture().body!,
        meta: {
          ...reportFixture().body!.meta,
          title: 'Latest server title',
        },
      },
    });
    const rendered = await mountWorkspace({
      api: fakeReportsApi({
        updateReport: async () => {
          throw new ReportConflictError(currentServer);
        },
      }),
      autosaveDelayMs: 60_000,
    });

    await change(field(rendered.container, 'Report title'), 'Local title');
    await keydown(document, 's', { ctrlKey: true });
    await flush();
    await click(button(rendered.container, 'Reload latest'));

    expect(field(rendered.container, 'Report title').value).toBe('Latest server title');
    expect(rendered.container.textContent).not.toContain('This report changed on another device');
    expect(sessionStorage.getItem(reportDraftStorageKey('highland-tower', 7))).toBeNull();
  });

  it('shows save failure persistently and retries only on demand', async () => {
    const updateReport = vi
      .fn()
      .mockRejectedValueOnce(new Error('Network unavailable'))
      .mockResolvedValueOnce(reportFixture({ updatedAt: '2026-07-28T09:02:00.000Z' }));
    const rendered = await mountWorkspace({
      api: fakeReportsApi({ updateReport }),
      autosaveDelayMs: 60_000,
    });

    await change(field(rendered.container, 'Summary'), 'Retry this draft');
    await keydown(document, 's', { ctrlKey: true });
    await flush();

    expect(rendered.container.textContent).toContain('Save failed');
    expect(rendered.container.textContent).toContain('Retry save');
    expect(updateReport).toHaveBeenCalledTimes(1);

    await click(button(rendered.container, 'Retry save'));
    await flush();
    expect(updateReport).toHaveBeenCalledTimes(2);
    expect(rendered.container.textContent).toContain('Saved');
  });

  it('uses generate for an empty report and exposes malformed payloads safely', async () => {
    const empty = reportFixture({
      body: null,
      generatedAt: null,
      visitDate: null,
    });
    const generated = reportFixture({
      updatedAt: '2026-07-28T09:04:00.000Z',
    });
    const generateReport = vi.fn(async () => ({ report: generated }));
    const rendered = await mountWorkspace({
      api: fakeReportsApi({
        getReport: async () => empty,
        generateReport,
      }),
    });

    await click(button(rendered.container, 'Generate report'));
    await flush();
    expect(generateReport).toHaveBeenCalledWith('highland-tower', 7, {
      expectedUpdatedAt: '2026-07-28T09:00:00.000Z',
    });

    await rendered.cleanup();
    cleanups.pop();
    const malformed = {
      ...reportFixture(),
      body: { meta: { title: 'Invalid' }, workers: 'broken' },
    } as unknown as ReturnType<typeof reportFixture>;
    const malformedRendered = await mountWorkspace({
      api: fakeReportsApi({ getReport: async () => malformed }),
    });
    expect(malformedRendered.container.textContent).toContain('This report body was malformed');
  });

  it('restores a compatible browser draft from session storage', async () => {
    const stored = reportFixture().body!;
    stored.meta.title = 'Recovered browser draft';
    sessionStorage.setItem(
      reportDraftStorageKey('highland-tower', 7),
      JSON.stringify({
        body: stored,
        baseUpdatedAt: '2026-07-28T09:00:00.000Z',
        storedAt: '2026-07-28T09:01:00.000Z',
      }),
    );

    const rendered = await mountWorkspace({ autosaveDelayMs: 60_000 });

    expect(field(rendered.container, 'Report title').value).toBe('Recovered browser draft');
    expect(rendered.container.textContent).toContain('Unsaved changes');
  });
});

describe('ReportWorkspacePage finalized report', () => {
  it('defaults to Report, downloads a PDF, and keeps Review comments append-only', async () => {
    const finalized = reportFixture({
      status: 'finalized',
      finalizedAt: '2026-07-28T10:00:00.000Z',
    });
    const createComment = vi.fn(async (_project, _number, body: string) => ({
      ...commentFixture,
      id: 'rcm_02NEW',
      body,
    }));
    const onDownloadPdf = vi.fn();
    const rendered = await mountWorkspace({
      api: fakeReportsApi({
        getReport: async () => finalized,
        createComment,
      }),
      role: 'viewer',
      onDownloadPdf,
    });

    expect(rendered.container.querySelector('[aria-selected="true"]')?.textContent).toBe('Report');
    expect(rendered.container.textContent).not.toContain(commentFixture.body);
    expect(rendered.container.textContent).toContain('Concrete delivery moved to 09:15.');

    await click(button(rendered.container, 'Download PDF'));
    await flush();
    expect(onDownloadPdf).toHaveBeenCalledWith(
      'https://files.example.test/report.pdf',
      'Highland Tower progress report.pdf',
    );

    await click(button(rendered.container, 'Review'));
    await flush();
    expect(rendered.container.textContent).toContain(commentFixture.body);

    await change(
      field(rendered.container, 'Add a comment'),
      'Quantity confirmed with the supplier.',
    );
    await click(button(rendered.container, 'Add comment'));
    await flush();

    expect(createComment).toHaveBeenCalledWith(
      'highland-tower',
      7,
      'Quantity confirmed with the supplier.',
    );
    expect(rendered.container.textContent).toContain('Quantity confirmed with the supplier.');
    const actionLabels = [...rendered.container.querySelectorAll('button')].map((candidate) =>
      candidate.textContent?.trim(),
    );
    expect(actionLabels).not.toContain('Finalize');
    expect(actionLabels).not.toContain('Reopen as draft');
    expect(actionLabels).not.toContain('Delete report');
  });

  it('requires confirmation before an editor reopens a finalized report', async () => {
    const finalized = reportFixture({
      status: 'finalized',
      finalizedAt: '2026-07-28T10:00:00.000Z',
    });
    const reopenReport = vi.fn(async () => ({
      report: reportFixture({ status: 'draft', finalizedAt: null }),
    }));
    const rendered = await mountWorkspace({
      api: fakeReportsApi({
        getReport: async () => finalized,
        reopenReport,
      }),
      role: 'editor',
    });

    await click(button(rendered.container, 'Reopen as draft'));
    expect(rendered.container.textContent).toContain(
      'Review will be unavailable until this report is finalized again.',
    );
    await click(button(rendered.container, 'Confirm reopen'));
    await flush();

    expect(reopenReport).toHaveBeenCalledWith('highland-tower', 7, {
      expectedUpdatedAt: '2026-07-28T09:00:00.000Z',
    });
    expect(rendered.container.textContent).toContain('Draft');
  });

  it('requires a named confirmation before a writer deletes a report', async () => {
    const finalized = reportFixture({
      status: 'finalized',
      finalizedAt: '2026-07-28T10:00:00.000Z',
    });
    const deleteReport = vi.fn(async () => undefined);
    const onDeleted = vi.fn();
    const rendered = await mountWorkspace({
      api: fakeReportsApi({
        getReport: async () => finalized,
        deleteReport,
      }),
      role: 'owner',
      onDeleted,
    });

    await click(button(rendered.container, 'Delete report'));
    expect(rendered.container.textContent).toContain('Delete Site Visit #7?');
    await click(button(rendered.container, 'Confirm delete'));
    await flush();

    expect(deleteReport).toHaveBeenCalledWith('highland-tower', 7);
    expect(onDeleted).toHaveBeenCalledTimes(1);
  });

  it('supports copy, preview, tab, PDF, and dialog keyboard-reachable actions', async () => {
    const finalized = reportFixture({
      status: 'finalized',
      finalizedAt: '2026-07-28T10:00:00.000Z',
    });
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    const anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    const rendered = await mountWorkspace({
      api: fakeReportsApi({ getReport: async () => finalized }),
      role: 'editor',
    });

    await click(button(rendered.container, 'Copy link'));
    await flush();
    expect(writeText).toHaveBeenCalledWith(window.location.href);
    expect(rendered.container.textContent).toContain('Report link copied');

    await click(button(rendered.container, 'Hide preview'));
    expect(button(rendered.container, 'Show preview').getAttribute('aria-pressed')).toBe('false');

    await click(button(rendered.container, 'Review'));
    await click(button(rendered.container, 'Report'));
    expect(rendered.container.querySelector('[aria-selected="true"]')?.textContent).toBe('Report');

    const reportTab = button(rendered.container, 'Report');
    reportTab.focus();
    await keydown(reportTab, 'ArrowRight');
    expect(rendered.container.querySelector('[aria-selected="true"]')?.textContent).toBe('Review');

    await click(button(rendered.container, 'Download PDF'));
    await flush();
    expect(anchorClick).toHaveBeenCalledTimes(1);

    const reopenTrigger = button(rendered.container, 'Reopen as draft');
    reopenTrigger.focus();
    await click(reopenTrigger);
    expect(button(rendered.container, 'Cancel')).toHaveFocus();
    await keydown(document, 'Escape');
    expect(rendered.container.textContent).not.toContain(
      'Review will be unavailable until this report is finalized again.',
    );
    expect(reopenTrigger).toHaveFocus();
  });
});
