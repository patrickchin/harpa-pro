import type { projects, reports } from '@harpa/api-contract';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, FilePlus2, RefreshCw, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { useSearchParams } from 'react-router';

import { Modal } from '@/components/modal';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Select,
  TableShell,
  tableCellClassName,
  tableClassName,
  tableHeadClassName,
} from '@/components/ui';

import type { ReportListStatus, ReportsApi } from './api';
import { errorMessage } from './api';
import { formatDate, formatDateTime } from './format';
import { displayReportTitle } from './report-body';

export interface ReportsListPageProps {
  api: ReportsApi;
  projectSlug: string;
  role: projects.ProjectRole;
  onOpenReport: (reportNumber: number) => void;
}

function ReportStatus({ report }: { report: reports.Report }) {
  const finalized = report.status === 'finalized';
  return <Badge tone={finalized ? 'success' : 'info'}>{finalized ? 'Finalized' : 'Draft'}</Badge>;
}

function AttentionStatus({ report }: { report: reports.Report }) {
  return report.needsRegeneration ? (
    <Badge tone="warning">Needs update</Badge>
  ) : (
    <span className="text-muted-foreground">—</span>
  );
}

function statusFromSearch(searchParams: URLSearchParams): ReportListStatus {
  const status = searchParams.get('status');
  return status === 'draft' || status === 'finalized' ? status : 'all';
}

interface ReportActionsProps {
  canWrite: boolean;
  onDelete: () => void;
  onOpen: () => void;
  reportNumber: number;
  stacked?: boolean;
}

function ReportActions({
  canWrite,
  onDelete,
  onOpen,
  reportNumber,
  stacked = false,
}: ReportActionsProps) {
  return (
    <div className={stacked ? 'grid grid-cols-2 gap-2' : 'flex flex-wrap items-center gap-2'}>
      <Button
        className={stacked ? 'w-full' : undefined}
        onClick={onOpen}
        size="small"
        variant="quiet"
      >
        Open
      </Button>
      {canWrite ? (
        <Button
          aria-label={`Delete Site Visit #${reportNumber}`}
          className={stacked ? 'w-full' : undefined}
          onClick={onDelete}
          size="small"
          variant="destructive"
        >
          <Trash2 aria-hidden="true" className="size-4" />
          Delete
        </Button>
      ) : null}
    </div>
  );
}

interface ReportCollectionProps {
  canWrite: boolean;
  items: reports.Report[];
  onDelete: (report: reports.Report) => void;
  onOpen: (reportNumber: number) => void;
}

interface ReportTableProps extends ReportCollectionProps {
  error: Error | null;
  isLoading: boolean;
  onRetry: () => void;
  status: ReportListStatus;
}

function ReportTable({
  canWrite,
  error,
  isLoading,
  items,
  onDelete,
  onOpen,
  onRetry,
  status,
}: ReportTableProps) {
  return (
    <TableShell className="hidden lg:block">
      <table className={`${tableClassName} min-w-[58rem]`}>
        <caption className="sr-only">Reports</caption>
        <thead>
          <tr>
            <th className={tableHeadClassName} scope="col">
              Site visit
            </th>
            <th className={tableHeadClassName} scope="col">
              Report
            </th>
            <th className={tableHeadClassName} scope="col">
              Visit date
            </th>
            <th className={tableHeadClassName} scope="col">
              Status
            </th>
            <th className={tableHeadClassName} scope="col">
              Attention
            </th>
            <th className={tableHeadClassName} scope="col">
              Last updated
            </th>
            <th className={tableHeadClassName} scope="col">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <tr>
              <td className={`${tableCellClassName} p-6 text-center`} colSpan={7}>
                <p role="status">Loading reports…</p>
              </td>
            </tr>
          ) : error ? (
            <tr>
              <td className={`${tableCellClassName} p-5`} colSpan={7}>
                <div
                  className="flex flex-wrap items-center justify-between gap-3 rounded-card-ui border border-danger-border bg-danger-soft p-4 text-danger-text"
                  role="alert"
                >
                  <p>Couldn&apos;t load reports. {errorMessage(error)}</p>
                  <Button onClick={onRetry} variant="secondary">
                    Retry reports
                  </Button>
                </div>
              </td>
            </tr>
          ) : items.length === 0 ? (
            <tr>
              <td className={`${tableCellClassName} p-6 text-center`} colSpan={7}>
                <h2 className="text-title-sm">No reports found</h2>
                <p className="mt-2 text-muted-foreground">
                  {status === 'all'
                    ? 'This project has no reports yet.'
                    : `No ${status} reports match this filter.`}
                </p>
              </td>
            </tr>
          ) : (
            items.map((report) => (
              <tr className="last:[&>td]:border-b-0" key={report.id}>
                <td className={tableCellClassName}>#{report.number}</td>
                <td className={tableCellClassName}>
                  <Button
                    aria-label={`Open Site Visit #${report.number}: ${displayReportTitle(report.body)}`}
                    className="min-h-11 max-w-72 justify-start px-0 text-left text-foreground underline decoration-accent decoration-2 underline-offset-4"
                    onClick={() => onOpen(report.number)}
                    variant="quiet"
                  >
                    <span className="min-w-0 [overflow-wrap:anywhere]">
                      {displayReportTitle(report.body)}
                    </span>
                  </Button>
                </td>
                <td className={tableCellClassName}>
                  {formatDate(report.body?.meta.visitDate ?? report.visitDate)}
                </td>
                <td className={tableCellClassName}>
                  <ReportStatus report={report} />
                </td>
                <td className={tableCellClassName}>
                  <AttentionStatus report={report} />
                </td>
                <td className={tableCellClassName}>{formatDateTime(report.updatedAt)}</td>
                <td className={tableCellClassName}>
                  <ReportActions
                    canWrite={canWrite}
                    onDelete={() => onDelete(report)}
                    onOpen={() => onOpen(report.number)}
                    reportNumber={report.number}
                  />
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </TableShell>
  );
}

function ReportCards({ canWrite, items, onDelete, onOpen }: ReportCollectionProps) {
  return (
    <ul aria-label="Reports" className="grid gap-3 lg:hidden">
      {items.map((report) => (
        <li key={report.id}>
          <Card className="space-y-3 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-label text-muted-foreground uppercase">
                  Site visit #{report.number}
                </p>
                <Button
                  aria-label={`Open Site Visit #${report.number}: ${displayReportTitle(report.body)}`}
                  className="mt-1 min-h-11 max-w-full justify-start p-0 text-left text-lg text-foreground underline decoration-accent decoration-2 underline-offset-4"
                  onClick={() => onOpen(report.number)}
                  variant="quiet"
                >
                  <span className="min-w-0 [overflow-wrap:anywhere]">
                    {displayReportTitle(report.body)}
                  </span>
                </Button>
              </div>
              <ReportStatus report={report} />
            </div>

            <dl className="grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
              <div>
                <dt className="text-label text-muted-foreground uppercase">Visit date</dt>
                <dd className="mt-1 text-meta">
                  {formatDate(report.body?.meta.visitDate ?? report.visitDate)}
                </dd>
              </div>
              <div>
                <dt className="text-label text-muted-foreground uppercase">Last updated</dt>
                <dd className="mt-1 text-meta">{formatDateTime(report.updatedAt)}</dd>
              </div>
              <div>
                <dt className="text-label text-muted-foreground uppercase">Attention</dt>
                <dd className="mt-1 text-meta">
                  <AttentionStatus report={report} />
                </dd>
              </div>
            </dl>

            <div className="border-t border-border pt-4">
              <ReportActions
                canWrite={canWrite}
                onDelete={() => onDelete(report)}
                onOpen={() => onOpen(report.number)}
                reportNumber={report.number}
                stacked
              />
            </div>
          </Card>
        </li>
      ))}
    </ul>
  );
}

export function ReportsListPage({ api, projectSlug, role, onOpenReport }: ReportsListPageProps) {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const status = statusFromSearch(searchParams);
  const cursor = searchParams.get('cursor') || undefined;
  const [cursorHistory, setCursorHistory] = useState<Array<string | undefined>>([]);
  const [deleteTarget, setDeleteTarget] = useState<reports.Report | null>(null);
  const cancelDeleteRef = useRef<HTMLButtonElement>(null);
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
    <section className="min-w-0 space-y-6 text-foreground" aria-labelledby="reports-heading">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="mb-1 text-label text-accent-ink uppercase">Project workspace</p>
          <h1 className="text-title-sm" id="reports-heading">
            Reports
          </h1>
          <p className="mt-1 max-w-reading text-muted-foreground">
            Open drafts, review finalized reports, and track source updates.
          </p>
        </div>
        {canWrite ? (
          <Button
            className="w-full sm:w-auto"
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending}
          >
            <FilePlus2 aria-hidden="true" className="size-4" />
            {createMutation.isPending ? 'Creating report…' : 'New report'}
          </Button>
        ) : null}
      </header>

      <Card className="flex flex-col gap-3 p-3 sm:flex-row sm:items-end sm:justify-between sm:p-4">
        <Field className="w-full sm:w-auto" htmlFor="report-status-filter" label="Status">
          <Select
            className="sm:min-w-40"
            id="report-status-filter"
            value={status}
            onChange={(event) => setFilter(event.currentTarget.value as ReportListStatus)}
          >
            <option value="all">All reports</option>
            <option value="draft">Drafts</option>
            <option value="finalized">Finalized</option>
          </Select>
        </Field>
        <Button
          className="w-full sm:w-auto"
          onClick={() => void reportsQuery.refetch()}
          disabled={reportsQuery.isFetching}
          variant="secondary"
        >
          <RefreshCw aria-hidden="true" className="size-4" />
          {reportsQuery.isFetching && !reportsQuery.isLoading ? 'Refreshing…' : 'Refresh'}
        </Button>
      </Card>

      {createMutation.error ? (
        <Card className="border-danger-border bg-danger-soft p-4 text-danger-text" role="alert">
          Couldn&apos;t create report. {errorMessage(createMutation.error)}
        </Card>
      ) : null}

      <ReportTable
        canWrite={canWrite}
        error={reportsQuery.error}
        isLoading={reportsQuery.isLoading}
        items={items}
        onDelete={setDeleteTarget}
        onOpen={onOpenReport}
        onRetry={() => void reportsQuery.refetch()}
        status={status}
      />

      <div className="lg:hidden">
        {reportsQuery.isLoading ? (
          <Card className="grid min-h-48 place-items-center p-5" aria-busy="true">
            <p role="status">Loading reports…</p>
          </Card>
        ) : reportsQuery.error ? (
          <Card
            className="space-y-3 border-danger-border bg-danger-soft p-4 text-danger-text"
            role="alert"
          >
            <p>Couldn&apos;t load reports. {errorMessage(reportsQuery.error)}</p>
            <Button onClick={() => void reportsQuery.refetch()} variant="secondary">
              Retry reports
            </Button>
          </Card>
        ) : items.length === 0 ? (
          <EmptyState
            description={
              status === 'all'
                ? 'This project has no reports yet.'
                : `No ${status} reports match this filter.`
            }
            title="No reports found"
          />
        ) : (
          <ReportCards
            canWrite={canWrite}
            items={items}
            onDelete={setDeleteTarget}
            onOpen={onOpenReport}
          />
        )}
      </div>

      <nav
        className="grid grid-cols-2 gap-3 sm:flex sm:justify-end"
        aria-label="Reports pagination"
      >
        <Button
          className="w-full sm:w-auto"
          disabled={cursorHistory.length === 0 || reportsQuery.isFetching}
          onClick={() => {
            const previousCursor = cursorHistory.at(-1);
            setCursorHistory((history) => history.slice(0, -1));
            updateListLocation(status, previousCursor);
          }}
          variant="secondary"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Previous
        </Button>
        <Button
          className="w-full sm:w-auto"
          disabled={!reportsQuery.data?.nextCursor || reportsQuery.isFetching}
          onClick={() => {
            const next = reportsQuery.data?.nextCursor;
            if (!next) return;
            setCursorHistory((history) => [...history, cursor]);
            updateListLocation(status, next);
          }}
          variant="secondary"
        >
          Next
          <ArrowRight aria-hidden="true" className="size-4" />
        </Button>
      </nav>

      {deleteTarget ? (
        <Modal
          ariaDescribedBy="delete-report-description"
          ariaLabelledBy="delete-report-title"
          closeOnEscape={!deleteMutation.isPending}
          initialFocusRef={cancelDeleteRef}
          onClose={() => setDeleteTarget(null)}
          role="alertdialog"
        >
          <div className="space-y-3">
            <h2 className="text-title-sm" id="delete-report-title">
              Delete Site Visit #{deleteTarget.number}?
            </h2>
            <p className="text-muted-foreground" id="delete-report-description">
              This permanently removes{' '}
              <strong className="font-semibold">{displayReportTitle(deleteTarget.body)}</strong> and
              its attached report records.
            </p>
            {deleteMutation.error ? (
              <p className="text-danger-text" role="alert">
                {errorMessage(deleteMutation.error)}
              </p>
            ) : null}
            <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
              <Button
                onClick={() => setDeleteTarget(null)}
                disabled={deleteMutation.isPending}
                ref={cancelDeleteRef}
                variant="secondary"
              >
                Cancel
              </Button>
              <Button
                onClick={() => deleteMutation.mutate(deleteTarget)}
                disabled={deleteMutation.isPending}
                variant="danger-solid"
              >
                <Trash2 aria-hidden="true" className="size-4" />
                {deleteMutation.isPending ? 'Deleting…' : 'Confirm delete'}
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}
    </section>
  );
}
