import type { projects, reports } from '@harpa/api-contract';
import { ArrowRight, CalendarDays, FileText, PencilLine, Plus } from 'lucide-react';
import { Link } from 'react-router';
import type { z } from 'zod';

import { PageHeader } from '@/components/layout';
import {
  Badge,
  Button,
  buttonStyles,
  tableCellClassName,
  tableClassName,
  tableHeadClassName,
  TableShell,
} from '@/components/ui';
import { formatDate, formatRelativeDate, formatRole } from '@/lib/format';

interface ProjectOverviewProps {
  project: projects.Project;
  members: Array<z.infer<typeof projects.projectMember>>;
  onCreateReport: () => void;
  recentReports?: reports.Report[];
  isCreatingReport?: boolean;
  isLoadingRecentReports?: boolean;
  createReportError?: string | null;
}

const eyebrowClassName = 'text-label text-muted-foreground';
const sectionLinkClassName =
  'inline-flex min-h-11 items-center font-semibold text-foreground underline decoration-transparent decoration-2 transition-colors hover:text-accent-ink hover:decoration-current';
const reportLinkClassName =
  'font-semibold text-foreground underline decoration-transparent decoration-2 transition-colors hover:text-accent-ink hover:decoration-current';

function RecentReportTable({
  projectId,
  recentReports,
}: {
  projectId: string;
  recentReports: reports.Report[];
}) {
  return (
    <TableShell className="hidden overflow-x-auto rounded-none border-0 lg:block">
      <table className={tableClassName}>
        <caption className="sr-only">Recent reports</caption>
        <thead>
          <tr>
            <th className={tableHeadClassName} scope="col">
              Site visit
            </th>
            <th className={tableHeadClassName} scope="col">
              Report
            </th>
            <th className={tableHeadClassName} scope="col">
              Status
            </th>
            <th className={tableHeadClassName} scope="col">
              Attention
            </th>
            <th className={`${tableHeadClassName} whitespace-nowrap`} scope="col">
              Last updated
            </th>
          </tr>
        </thead>
        <tbody>
          {recentReports.map((report) => {
            const title = report.body?.meta.title?.trim() || 'Untitled report';
            return (
              <tr className="transition-colors hover:bg-surface-emphasis" key={report.id}>
                <td className={`${tableCellClassName} whitespace-nowrap`}>#{report.number}</td>
                <th className={tableCellClassName} scope="row">
                  <Link
                    className={reportLinkClassName}
                    to={`/projects/${projectId}/reports/${report.number}`}
                  >
                    {title}
                  </Link>
                </th>
                <td className={tableCellClassName}>
                  <Badge tone={report.status === 'finalized' ? 'success' : 'neutral'}>
                    {report.status === 'finalized' ? 'Finalized' : 'Draft'}
                  </Badge>
                </td>
                <td className={tableCellClassName}>
                  {report.needsRegeneration ? <Badge tone="warning">Needs update</Badge> : '—'}
                </td>
                <td className={`${tableCellClassName} whitespace-nowrap`}>
                  <time dateTime={report.updatedAt}>{formatRelativeDate(report.updatedAt)}</time>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </TableShell>
  );
}

function RecentReportCards({
  projectId,
  recentReports,
}: {
  projectId: string;
  recentReports: reports.Report[];
}) {
  return (
    <ul aria-label="Recent reports" className="grid gap-3 lg:hidden">
      {recentReports.map((report) => {
        const title = report.body?.meta.title?.trim() || 'Untitled report';
        return (
          <li className="min-w-0 border-b border-border/40 py-4 last:border-b-0" key={report.id}>
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <p className={eyebrowClassName}>Site visit #{report.number}</p>
                <h3 className="font-heading mt-1 break-words text-title-sm">
                  <Link
                    className={reportLinkClassName}
                    to={`/projects/${projectId}/reports/${report.number}`}
                  >
                    {title}
                  </Link>
                </h3>
              </div>
              <Badge
                className="shrink-0"
                tone={report.status === 'finalized' ? 'success' : 'neutral'}
              >
                {report.status === 'finalized' ? 'Finalized' : 'Draft'}
              </Badge>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border/40 pt-3 text-meta">
              {report.needsRegeneration ? (
                <Badge tone="warning">Needs update</Badge>
              ) : (
                <span className="text-muted-foreground">No updates needed</span>
              )}
              <time className="text-muted-foreground" dateTime={report.updatedAt}>
                Updated {formatRelativeDate(report.updatedAt)}
              </time>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function ProjectOverview({
  project,
  members,
  onCreateReport,
  recentReports = [],
  isCreatingReport = false,
  isLoadingRecentReports = false,
  createReportError = null,
}: ProjectOverviewProps): React.JSX.Element {
  const canCreateReport = project.myRole === 'owner' || project.myRole === 'editor';
  const stats = project.stats ?? {
    totalReports: 0,
    drafts: 0,
    lastReportAt: null,
  };

  return (
    <div className="flex min-w-0 flex-col gap-6 sm:gap-8">
      <PageHeader
        eyebrow="Project overview"
        title={project.name}
        context={<Badge tone={project.myRole}>{formatRole(project.myRole)}</Badge>}
        description={[project.clientName, project.address].filter(Boolean).join(' · ')}
        action={
          canCreateReport ? (
            <Button
              className="w-full sm:w-auto"
              disabled={isCreatingReport}
              onClick={onCreateReport}
            >
              <Plus className="size-4" aria-hidden="true" />
              {isCreatingReport ? 'Creating report…' : 'New report'}
            </Button>
          ) : undefined
        }
      />

      {createReportError ? (
        <p
          className="rounded-control-ui border border-danger-border bg-danger-soft px-4 py-3 text-meta text-danger-text"
          role="alert"
        >
          Couldn’t create report. {createReportError}
        </p>
      ) : null}

      <section
        className="grid overflow-hidden rounded-card-ui border border-border/40 bg-card sm:grid-cols-2 xl:grid-cols-3"
        aria-label="Report summary"
      >
        <article className="flex min-h-28 flex-col sm:min-h-48 border-b border-border/40 p-5 sm:p-7 sm:border-r sm:last:border-r-0 xl:border-b-0">
          <div className="flex items-center justify-between gap-3">
            <span className={eyebrowClassName}>Total reports</span>
            <FileText className="size-4 text-muted-foreground" aria-hidden="true" />
          </div>
          <strong
            className="mt-4 font-heading text-stat-compact tabular-nums sm:text-stat"
            data-stat-value
          >
            {stats.totalReports}
          </strong>
          <Link
            className={`${sectionLinkClassName} mt-4 self-start text-meta`}
            to={`/projects/${project.id}/reports`}
          >
            View reports
          </Link>
        </article>
        <article className="flex min-h-28 flex-col sm:min-h-48 border-b border-border/40 p-5 sm:p-7 sm:border-r sm:last:border-r-0 xl:border-b-0">
          <div className="flex items-center justify-between gap-3">
            <span className={eyebrowClassName}>Drafts</span>
            <PencilLine className="size-4 text-accent-ink" aria-hidden="true" />
          </div>
          <strong
            className="mt-4 font-heading text-stat-compact tabular-nums sm:text-stat"
            data-stat-value
          >
            {stats.drafts}
          </strong>
          <Link
            className={`${sectionLinkClassName} mt-4 self-start text-meta`}
            to={`/projects/${project.id}/reports?status=draft`}
          >
            Continue work
          </Link>
        </article>
        <article className="flex min-h-28 flex-col sm:min-h-48 p-5 sm:p-7 sm:col-span-2 xl:col-span-1">
          <div className="flex items-center justify-between gap-3">
            <span className={eyebrowClassName}>Latest report</span>
            <CalendarDays className="size-4 text-muted-foreground" aria-hidden="true" />
          </div>
          <strong
            className="mt-4 font-heading text-2xl font-semibold tracking-tight"
            data-stat-value
          >
            {stats.lastReportAt ? formatDate(stats.lastReportAt) : 'None yet'}
          </strong>
          <span className="mt-auto pt-5 text-meta text-muted-foreground">
            Most recent finalized or draft
          </span>
        </article>
      </section>

      <section
        className="min-w-0 rounded-card-ui border border-border/40 bg-card p-5 sm:p-7"
        aria-labelledby="recent-reports-heading"
      >
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2
              className="flex items-center gap-2.5 font-heading text-section"
              id="recent-reports-heading"
            >
              <FileText className="size-4 text-muted-foreground" aria-hidden="true" />
              Recent reports
            </h2>
          </div>
          <Link className={sectionLinkClassName} to={`/projects/${project.id}/reports`}>
            View all reports
          </Link>
        </div>
        {isLoadingRecentReports ? (
          <p className="py-6 text-muted-foreground" role="status">
            Loading recent reports…
          </p>
        ) : recentReports.length === 0 ? (
          <p className="rounded-control-ui bg-surface-muted px-4 py-6 text-muted-foreground">
            No reports have been created yet.
          </p>
        ) : (
          <>
            <RecentReportTable projectId={project.id} recentReports={recentReports} />
            <RecentReportCards projectId={project.id} recentReports={recentReports} />
          </>
        )}
      </section>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(18rem,0.75fr)]">
        <section className="min-w-0 rounded-card-ui border border-border/40 bg-card p-5 sm:p-7">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-heading text-section">Project members</h2>
            </div>
            <Link className={sectionLinkClassName} to={`/projects/${project.id}/members`}>
              View all members
            </Link>
          </div>
          {members.length ? (
            <ul className="mt-4 divide-y divide-border/40">
              {members.slice(0, 4).map((member) => (
                <li
                  className="flex min-w-0 items-center gap-3 py-3 first:pt-0 last:pb-0"
                  key={member.userId}
                >
                  <span
                    className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/5 text-meta font-bold"
                    aria-hidden="true"
                  >
                    {(member.displayName ?? member.email)[0]?.toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <strong className="block truncate text-body font-semibold">
                      {member.displayName ?? 'Unnamed Harpa Pro member'}
                    </strong>
                    <small className="block truncate text-meta text-muted-foreground">
                      {member.email}
                    </small>
                  </span>
                  <Badge className="shrink-0" tone={member.role}>
                    {formatRole(member.role)}
                  </Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-muted-foreground">No members were returned.</p>
          )}
        </section>

        <section className="flex min-w-0 flex-col rounded-card-ui bg-primary p-6 text-primary-foreground sm:p-7">
          <p className="text-meta text-primary-foreground/75">Next step</p>
          <h2 className="mt-4 font-heading text-title tracking-tight text-primary-foreground">
            {stats.drafts ? 'Drafts need attention' : 'Project is current'}
          </h2>
          <p className="mt-3 text-meta leading-relaxed text-primary-foreground/80">
            {stats.drafts
              ? `${stats.drafts} draft${stats.drafts === 1 ? '' : 's'} can be reviewed and finalized.`
              : 'There are no unfinished reports for this project.'}
          </p>
          <Link
            className={buttonStyles({
              className: 'mt-6 w-full sm:w-auto xl:mt-auto',
              variant: 'secondary',
            })}
            to={`/projects/${project.id}/reports`}
          >
            Open reports
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </section>
      </div>
    </div>
  );
}
