import { reports as reportSchemas } from '@harpa/api-contract';
import type { notes, reports } from '@harpa/api-contract';

import type { DashboardApiClient } from '@/lib/api';

export type ReportListStatus = 'all' | reports.ReportStatus;

export interface ReportListInput {
  status: ReportListStatus;
  cursor?: string;
  limit?: number;
  signal?: AbortSignal;
}

export interface ReportPage {
  items: reports.Report[];
  nextCursor: string | null;
}

export interface ReportVersionInput {
  expectedUpdatedAt: string;
}

export interface UpdateReportInput extends ReportVersionInput {
  body: reports.ReportBody;
}

export interface ReportsApi {
  listReports(projectSlug: string, input: ReportListInput): Promise<ReportPage>;
  createReport(projectSlug: string): Promise<reports.Report>;
  getReport(
    projectSlug: string,
    reportNumber: number,
    signal?: AbortSignal,
  ): Promise<reports.Report>;
  updateReport(
    projectSlug: string,
    reportNumber: number,
    input: UpdateReportInput,
  ): Promise<reports.Report>;
  deleteReport(projectSlug: string, reportNumber: number): Promise<void>;
  listNotes(reportId: string, signal?: AbortSignal): Promise<{ items: notes.Note[] }>;
  getFileUrl(fileId: string, signal?: AbortSignal): Promise<{ url: string; expiresAt: string }>;
  generateReport(
    projectSlug: string,
    reportNumber: number,
    input: ReportVersionInput,
  ): Promise<{ report: reports.Report }>;
  updateGeneratedReport(
    projectSlug: string,
    reportNumber: number,
    input: ReportVersionInput,
  ): Promise<{ report: reports.Report }>;
  finalizeReport(
    projectSlug: string,
    reportNumber: number,
    input: ReportVersionInput,
  ): Promise<{ report: reports.Report }>;
  reopenReport(
    projectSlug: string,
    reportNumber: number,
    input: ReportVersionInput,
  ): Promise<{ report: reports.Report }>;
  renderPdf(projectSlug: string, reportNumber: number): Promise<{ url: string; expiresAt: string }>;
  listComments(
    projectSlug: string,
    reportNumber: number,
    signal?: AbortSignal,
  ): Promise<{ items: reports.ReportComment[] }>;
  createComment(
    projectSlug: string,
    reportNumber: number,
    body: string,
  ): Promise<reports.ReportComment>;
}

/**
 * A stale report mutation carries the current server row so the UI can
 * offer reload or a deliberate overwrite without issuing a hidden retry.
 */
export class ReportConflictError extends Error {
  readonly currentReport: reports.Report;

  constructor(currentReport: reports.Report) {
    super('This report changed on another device');
    this.name = 'ReportConflictError';
    this.currentReport = currentReport;
  }
}

export function errorMessage(error: unknown, fallback = 'Something went wrong.'): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

interface ApiErrorLike {
  status?: unknown;
  payload?: unknown;
}

async function translateConflict<T>(operation: Promise<T>): Promise<T> {
  try {
    return await operation;
  } catch (caught) {
    const apiError = caught as ApiErrorLike | null;
    if (apiError?.status === 409) {
      const payload = apiError.payload as { report?: unknown } | undefined;
      const current = reportSchemas.report.safeParse(payload?.report);
      if (current.success) throw new ReportConflictError(current.data);
    }
    throw caught;
  }
}

function listQuery(input: ReportListInput) {
  return {
    cursor: input.cursor,
    limit: input.limit,
    status: input.status === 'all' ? undefined : input.status,
  };
}

export function createReportsApi(client: DashboardApiClient): ReportsApi {
  return {
    async listReports(projectSlug, input) {
      return client.request('/projects/{project}/reports', 'get', {
        params: { project: projectSlug },
        query: listQuery(input),
        signal: input.signal,
      });
    },

    async createReport(projectSlug) {
      return client.request('/projects/{project}/reports', 'post', {
        params: { project: projectSlug },
        body: {},
      });
    },

    async getReport(projectSlug, reportNumber, signal) {
      return client.request('/projects/{project}/reports/{number}', 'get', {
        params: { project: projectSlug, number: reportNumber },
        signal,
      });
    },

    async updateReport(projectSlug, reportNumber, input) {
      return translateConflict(
        client.request('/projects/{project}/reports/{number}', 'patch', {
          params: { project: projectSlug, number: reportNumber },
          body: input,
        }),
      );
    },

    async deleteReport(projectSlug, reportNumber) {
      await client.request('/projects/{project}/reports/{number}', 'delete', {
        params: { project: projectSlug, number: reportNumber },
      });
    },

    async listNotes(reportId, signal) {
      return client.request('/reports/{report}/notes', 'get', {
        params: { report: reportId },
        signal,
      });
    },

    async getFileUrl(fileId, signal) {
      return client.request('/files/{id}/url', 'get', {
        params: { id: fileId },
        signal,
      });
    },

    async generateReport(projectSlug, reportNumber, input) {
      return translateConflict(
        client.request('/projects/{project}/reports/{number}/generate', 'post', {
          params: { project: projectSlug, number: reportNumber },
          body: input,
        }),
      );
    },

    async updateGeneratedReport(projectSlug, reportNumber, input) {
      return translateConflict(
        client.request('/projects/{project}/reports/{number}/regenerate', 'post', {
          params: { project: projectSlug, number: reportNumber },
          body: input,
        }),
      );
    },

    async finalizeReport(projectSlug, reportNumber, input) {
      return translateConflict(
        client.request('/projects/{project}/reports/{number}/finalize', 'post', {
          params: { project: projectSlug, number: reportNumber },
          body: input,
        }),
      );
    },

    async reopenReport(projectSlug, reportNumber, input) {
      return translateConflict(
        client.request('/projects/{project}/reports/{number}/unfinalize', 'post', {
          params: { project: projectSlug, number: reportNumber },
          body: input,
        }),
      );
    },

    async renderPdf(projectSlug, reportNumber) {
      return client.request('/projects/{project}/reports/{number}/pdf', 'post', {
        params: { project: projectSlug, number: reportNumber },
      });
    },

    async listComments(projectSlug, reportNumber, signal) {
      return client.request('/projects/{project}/reports/{number}/comments', 'get', {
        params: { project: projectSlug, number: reportNumber },
        signal,
      });
    },

    async createComment(projectSlug, reportNumber, body) {
      return client.request('/projects/{project}/reports/{number}/comments', 'post', {
        params: { project: projectSlug, number: reportNumber },
        body: { body },
      });
    },
  };
}
