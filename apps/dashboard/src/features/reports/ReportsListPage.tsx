import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { projects, reports } from '@harpa/api-contract';
import { useSearchParams } from 'react-router';

import { Modal } from '@/components/modal';

import type { ReportListStatus, ReportsApi } from './api';
import { errorMessage } from './api';
import { formatDate, formatDateTime } from './format';
import { displayReportTitle } from './report-body';
import './reports.css';

export interface ReportsListPageProps {
  api: ReportsApi;
  projectSlug: string;
  role: projects.ProjectRole;
  onOpenReport: (reportNumber: number) => void;
}

function ReportStatus({ report }: { report: reports.Report }) {
  return (
    <span
      className={`reports-badge ${
        report.status === 'finalized' ? 'reports-badge--finalized' : 'reports-badge--draft'
      }`}
    >
      {report.status === 'finalized' ? 'Finalized' : 'Draft'}
    </span>
  );
}

function statusFromSearch(searchParams: URLSearchParams): ReportListStatus {
  const status = searchParams.get('status');
  return status === 'draft' || status === 'finalized' ? status : 'all';
}

export function ReportsListPage({ api, projectSlug, role, onOpenReport }: ReportsListPageProps) {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const status = statusFromSearch(searchParams);
  const cursor = searchParams.get('cursor') || undefined;
  const [cursorHistory, setCursorHistory] = useState<Array<string | undefined>>([]);
  const [deleteTarget, setDeleteTarget] = useState<reports.Report | null>(null);
  const canWrite = role === 'owner' || role === 'editor';

  const reportsQuery = useQuery({
    queryKey: ['dashboard', 'project-reports', projectSlug, status, cursor ?? null],
    queryFn: ({ signal }) =>
      api.listReports(projectSlug, {
        status,
        cursor,
        limit: 25,
        signal,
      }),
  });

  const createMutation = useMutation({
    mutationFn: () => api.createReport(projectSlug),
    onSuccess: (report) => {
      void queryClient.invalidateQueries({
        queryKey: ['dashboard', 'project-reports', projectSlug],
      });
      onOpenReport(report.number);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (report: reports.Report) => api.deleteReport(projectSlug, report.number),
    onSuccess: () => {
      setDeleteTarget(null);
      void queryClient.invalidateQueries({
        queryKey: ['dashboard', 'project-reports', projectSlug],
      });
    },
  });

  const items = reportsQuery.data?.items ?? [];
  const updateListLocation = (nextStatus: ReportListStatus, nextCursor: string | undefined) => {
    const next = new URLSearchParams(searchParams);
    if (nextStatus === 'all') next.delete('status');
    else next.set('status', nextStatus);
    if (nextCursor) next.set('cursor', nextCursor);
    else next.delete('cursor');
    setSearchParams(next);
  };
  const setFilter = (next: ReportListStatus) => {
    setCursorHistory([]);
    updateListLocation(next, undefined);
  };

  return (
    <section className="reports-page" aria-labelledby="reports-heading">
      <header className="reports-page-header">
        <div>
          <p className="reports-eyebrow">Project workspace</p>
          <h1 id="reports-heading">Reports</h1>
          <p>Open drafts, review finalized reports, and track source updates.</p>
        </div>
        {canWrite ? (
          <button
            type="button"
            className="reports-button reports-button--primary"
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? 'Creating report…' : 'New report'}
          </button>
        ) : null}
      </header>

      <div className="reports-toolbar">
        <label className="reports-field reports-field--compact" htmlFor="report-status-filter">
          <span>Status</span>
          <select
            id="report-status-filter"
            value={status}
            onChange={(event) => setFilter(event.currentTarget.value as ReportListStatus)}
          >
            <option value="all">All reports</option>
            <option value="draft">Drafts</option>
            <option value="finalized">Finalized</option>
          </select>
        </label>
        <button
          type="button"
          className="reports-button reports-button--secondary"
          onClick={() => void reportsQuery.refetch()}
          disabled={reportsQuery.isFetching}
        >
          {reportsQuery.isFetching && !reportsQuery.isLoading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {createMutation.error ? (
        <p className="reports-inline-error" role="alert">
          Couldn&apos;t create report. {errorMessage(createMutation.error)}
        </p>
      ) : null}

      <div className="reports-table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">Site visit</th>
              <th scope="col">Report</th>
              <th scope="col">Visit date</th>
              <th scope="col">Status</th>
              <th scope="col">Attention</th>
              <th scope="col">Last updated</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {reportsQuery.isLoading ? (
              <tr>
                <td colSpan={7}>
                  <p role="status">Loading reports…</p>
                </td>
              </tr>
            ) : reportsQuery.error ? (
              <tr>
                <td colSpan={7}>
                  <div className="reports-inline-error" role="alert">
                    <p>Couldn&apos;t load reports. {errorMessage(reportsQuery.error)}</p>
                    <button
                      type="button"
                      className="reports-button reports-button--secondary"
                      onClick={() => void reportsQuery.refetch()}
                    >
                      Retry reports
                    </button>
                  </div>
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <div className="reports-empty-state">
                    <h2>No reports found</h2>
                    <p>
                      {status === 'all'
                        ? 'This project has no reports yet.'
                        : `No ${status} reports match this filter.`}
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              items.map((report) => (
                <tr key={report.id}>
                  <td>#{report.number}</td>
                  <td>
                    <button
                      type="button"
                      className="reports-table-link"
                      onClick={() => onOpenReport(report.number)}
                      aria-label={`Open Site Visit #${report.number}: ${displayReportTitle(
                        report.body,
                      )}`}
                    >
                      {displayReportTitle(report.body)}
                    </button>
                  </td>
                  <td>{formatDate(report.body?.meta.visitDate ?? report.visitDate)}</td>
                  <td>
                    <ReportStatus report={report} />
                  </td>
                  <td>
                    {report.needsRegeneration ? (
                      <span className="reports-badge reports-badge--attention">Needs update</span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>{formatDateTime(report.updatedAt)}</td>
                  <td>
                    <div className="reports-row-actions">
                      <button
                        type="button"
                        className="reports-button reports-button--quiet"
                        onClick={() => onOpenReport(report.number)}
                      >
                        Open
                      </button>
                      {canWrite ? (
                        <button
                          type="button"
                          className="reports-button reports-button--quiet reports-button--danger"
                          aria-label={`Delete Site Visit #${report.number}`}
                          onClick={() => setDeleteTarget(report)}
                        >
                          Delete
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <nav className="reports-pagination" aria-label="Reports pagination">
        <button
          type="button"
          className="reports-button reports-button--secondary"
          disabled={cursorHistory.length === 0 || reportsQuery.isFetching}
          onClick={() => {
            const previousCursor = cursorHistory.at(-1);
            setCursorHistory((history) => history.slice(0, -1));
            updateListLocation(status, previousCursor);
          }}
        >
          Previous
        </button>
        <button
          type="button"
          className="reports-button reports-button--secondary"
          disabled={!reportsQuery.data?.nextCursor || reportsQuery.isFetching}
          onClick={() => {
            const next = reportsQuery.data?.nextCursor;
            if (!next) return;
            setCursorHistory((history) => [...history, cursor]);
            updateListLocation(status, next);
          }}
        >
          Next
        </button>
      </nav>

      {deleteTarget ? (
        <Modal
          ariaDescribedBy="delete-report-description"
          ariaLabelledBy="delete-report-title"
          backdropClassName="reports-dialog-backdrop"
          closeOnEscape={!deleteMutation.isPending}
          dialogClassName="reports-dialog"
          onClose={() => setDeleteTarget(null)}
          role="alertdialog"
        >
          <h2 id="delete-report-title">Delete Site Visit #{deleteTarget.number}?</h2>
          <p id="delete-report-description">
            This permanently removes <strong>{displayReportTitle(deleteTarget.body)}</strong> and
            its attached report records.
          </p>
          {deleteMutation.error ? (
            <p className="reports-field-error" role="alert">
              {errorMessage(deleteMutation.error)}
            </p>
          ) : null}
          <div className="reports-dialog__actions">
            <button
              type="button"
              className="reports-button reports-button--secondary"
              onClick={() => setDeleteTarget(null)}
              disabled={deleteMutation.isPending}
            >
              Cancel
            </button>
            <button
              type="button"
              className="reports-button reports-button--danger-solid"
              onClick={() => deleteMutation.mutate(deleteTarget)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Deleting…' : 'Confirm delete'}
            </button>
          </div>
        </Modal>
      ) : null}
    </section>
  );
}
