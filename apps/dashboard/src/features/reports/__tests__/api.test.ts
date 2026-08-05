import { describe, expect, it, vi } from 'vitest';
import type { DashboardApiClient } from '@/lib/api';

import { createReportsApi } from '../api';
import type { ReportConflictError } from '../api';
import { reportFixture } from './fixtures';

describe('createReportsApi', () => {
  it('maps every report operation to its canonical API route', async () => {
    const request = vi.fn().mockResolvedValue({
      items: [],
      nextCursor: null,
      url: 'https://files.example.test/file',
      expiresAt: '2026-07-29T00:00:00.000Z',
      report: reportFixture(),
    });
    const api = createReportsApi({
      request,
    } as unknown as DashboardApiClient);
    const body = reportFixture().body!;
    const version = { expectedUpdatedAt: '2026-07-28T09:00:00.000Z' };

    await api.createReport('highland-tower');
    await api.getReport('highland-tower', 7);
    await api.updateReport('highland-tower', 7, { body, ...version });
    await api.deleteReport('highland-tower', 7);
    await api.listNotes('rpt_01234567');
    await api.getFileUrl('fil_01234567');
    await api.generateReport('highland-tower', 7, version);
    await api.updateGeneratedReport('highland-tower', 7, version);
    await api.finalizeReport('highland-tower', 7, version);
    await api.reopenReport('highland-tower', 7, version);
    await api.renderPdf('highland-tower', 7);
    await api.listComments('highland-tower', 7);
    await api.createComment('highland-tower', 7, 'Looks ready.');

    expect(request.mock.calls.map(([path, method]) => [path, method])).toEqual([
      ['/projects/{project}/reports', 'post'],
      ['/projects/{project}/reports/{number}', 'get'],
      ['/projects/{project}/reports/{number}', 'patch'],
      ['/projects/{project}/reports/{number}', 'delete'],
      ['/reports/{report}/notes', 'get'],
      ['/files/{id}/url', 'get'],
      ['/projects/{project}/reports/{number}/generate', 'post'],
      ['/projects/{project}/reports/{number}/regenerate', 'post'],
      ['/projects/{project}/reports/{number}/finalize', 'post'],
      ['/projects/{project}/reports/{number}/unfinalize', 'post'],
      ['/projects/{project}/reports/{number}/pdf', 'post'],
      ['/projects/{project}/reports/{number}/comments', 'get'],
      ['/projects/{project}/reports/{number}/comments', 'post'],
    ]);
    expect(request.mock.calls.at(-1)?.[2]).toMatchObject({
      body: { body: 'Looks ready.' },
    });
  });

  it('maps the list status to the server query and omits the all sentinel', async () => {
    const request = vi.fn().mockResolvedValue({ items: [], nextCursor: null });
    const api = createReportsApi({
      request,
    } as unknown as DashboardApiClient);

    await api.listReports('highland-tower', {
      status: 'all',
      cursor: 'cursor-1',
      limit: 25,
    });
    await api.listReports('highland-tower', {
      status: 'finalized',
      limit: 25,
    });

    expect(request.mock.calls[0]?.[2]).toMatchObject({
      params: { project: 'highland-tower' },
      query: {
        cursor: 'cursor-1',
        limit: 25,
        status: undefined,
      },
    });
    expect(request.mock.calls[1]?.[2]).toMatchObject({
      query: { limit: 25, status: 'finalized' },
    });
  });

  it('preserves the current report from a 409 payload', async () => {
    const current = reportFixture({
      updatedAt: '2026-07-28T09:05:00.000Z',
    });
    const request = vi.fn().mockRejectedValue({
      status: 409,
      payload: { report: current },
    });
    const api = createReportsApi({
      request,
    } as unknown as DashboardApiClient);

    await expect(
      api.updateReport('highland-tower', 7, {
        body: current.body!,
        expectedUpdatedAt: '2026-07-28T09:00:00.000Z',
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<ReportConflictError>>({
        name: 'ReportConflictError',
        currentReport: current,
      }),
    );
  });

  it('does not relabel an unrelated or malformed conflict response', async () => {
    const original = {
      status: 409,
      payload: { error: { message: 'Report is finalized.' } },
    };
    const request = vi.fn().mockRejectedValue(original);
    const api = createReportsApi({
      request,
    } as unknown as DashboardApiClient);

    await expect(
      api.finalizeReport('highland-tower', 7, {
        expectedUpdatedAt: '2026-07-28T09:00:00.000Z',
      }),
    ).rejects.toBe(original);
  });
});
