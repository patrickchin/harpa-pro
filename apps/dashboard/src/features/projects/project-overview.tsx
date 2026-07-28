import type { projects, reports } from '@harpa/api-contract';
import { Link } from 'react-router';
import type { z } from 'zod';

import { PageHeader } from '@/components/layout';
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
    <div className="page">
      <PageHeader
        eyebrow="Project overview"
        title={project.name}
        context={
          <span className={`role-badge role-${project.myRole}`}>{formatRole(project.myRole)}</span>
        }
        description={[project.clientName, project.address].filter(Boolean).join(' · ')}
        action={
          canCreateReport ? (
            <button
              className="button button-primary"
              disabled={isCreatingReport}
              onClick={onCreateReport}
              type="button"
            >
              {isCreatingReport ? 'Creating report…' : 'New report'}
            </button>
          ) : undefined
        }
      />

      {createReportError ? (
        <p className="inline-error" role="alert">
          Couldn’t create report. {createReportError}
        </p>
      ) : null}

      <section className="stat-grid" aria-label="Report summary">
        <article className="surface stat-card">
          <span>Total reports</span>
          <strong data-stat-value>{stats.totalReports}</strong>
          <Link to={`/projects/${project.id}/reports`}>View reports</Link>
        </article>
        <article className="surface stat-card">
          <span>Drafts</span>
          <strong data-stat-value>{stats.drafts}</strong>
          <Link to={`/projects/${project.id}/reports?status=draft`}>Continue work</Link>
        </article>
        <article className="surface stat-card">
          <span>Latest report</span>
          <strong className="stat-date" data-stat-value>
            {stats.lastReportAt ? formatDate(stats.lastReportAt) : 'None yet'}
          </strong>
          <span className="stat-caption">Most recent finalized or draft</span>
        </article>
      </section>

      <section
        className="surface section-card overview-reports"
        aria-labelledby="recent-reports-heading"
      >
        <div className="section-heading">
          <div>
            <p className="eyebrow">Activity</p>
            <h2 id="recent-reports-heading">Recent reports</h2>
          </div>
          <Link to={`/projects/${project.id}/reports`}>View all reports</Link>
        </div>
        {isLoadingRecentReports ? (
          <p role="status">Loading recent reports…</p>
        ) : recentReports.length === 0 ? (
          <p className="muted-copy">No reports have been created yet.</p>
        ) : (
          <div className="table-surface">
            <table>
              <thead>
                <tr>
                  <th scope="col">Site visit</th>
                  <th scope="col">Report</th>
                  <th scope="col">Status</th>
                  <th scope="col">Attention</th>
                  <th scope="col">Last updated</th>
                </tr>
              </thead>
              <tbody>
                {recentReports.map((report) => {
                  const title = report.body?.meta.title?.trim() || 'Untitled report';
                  return (
                    <tr key={report.id}>
                      <td>#{report.number}</td>
                      <th scope="row">
                        <Link
                          className="table-primary-link"
                          to={`/projects/${project.id}/reports/${report.number}`}
                        >
                          {title}
                        </Link>
                      </th>
                      <td>{report.status === 'finalized' ? 'Finalized' : 'Draft'}</td>
                      <td>{report.needsRegeneration ? 'Needs update' : '—'}</td>
                      <td>{formatRelativeDate(report.updatedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="overview-grid">
        <section className="surface section-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Team</p>
              <h2>Project members</h2>
            </div>
            <Link to={`/projects/${project.id}/members`}>View all members</Link>
          </div>
          {members.length ? (
            <ul className="member-preview-list">
              {members.slice(0, 4).map((member) => (
                <li key={member.userId}>
                  <span className="avatar" aria-hidden="true">
                    {(member.displayName ?? member.email)[0]?.toUpperCase()}
                  </span>
                  <span>
                    <strong>{member.displayName ?? 'Unnamed Harpa Pro member'}</strong>
                    <small>{member.email}</small>
                  </span>
                  <span className={`role-badge role-${member.role}`}>
                    {formatRole(member.role)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted-copy">No members were returned.</p>
          )}
        </section>

        <section className="surface section-card attention-card">
          <p className="eyebrow">Next step</p>
          <h2>{stats.drafts ? 'Drafts need attention' : 'Project is current'}</h2>
          <p>
            {stats.drafts
              ? `${stats.drafts} draft${stats.drafts === 1 ? '' : 's'} can be reviewed and finalized.`
              : 'There are no unfinished reports for this project.'}
          </p>
          <Link className="button button-secondary" to={`/projects/${project.id}/reports`}>
            Open reports
          </Link>
        </section>
      </div>
    </div>
  );
}
