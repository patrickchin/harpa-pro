import type { projects } from '@harpa/api-contract';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Outlet, useNavigate, useOutletContext, useParams } from 'react-router';

import { DashboardShell } from '@/components/layout';
import {
  OnboardingForm,
  SignInForm,
  requestSignInCode,
  useAuthSession,
  verifySignInCode,
} from '@/features/auth';
import { MembersPageView } from '@/features/members';
import { ProjectOverview, ProjectSettingsPanel, ProjectsPageView } from '@/features/projects';
import { dashboardDataApi } from '@/features/projects/data-api';
import { ReportWorkspacePage, ReportsListPage, reportsApi } from '@/features/reports';
import { ApiError } from '@/lib/api';

export const projectKeys = {
  all: ['dashboard', 'projects'] as const,
  detail: (project: string) => ['dashboard', 'project', project] as const,
  members: (project: string) => ['dashboard', 'project-members', project] as const,
};

function queryErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 403) return 'You do not have access to this action.';
    if (error.status === 404) return 'This project could not be found.';
    return error.message;
  }
  return error instanceof Error ? error.message : 'Something went wrong.';
}

function LoadFailure({
  title,
  error,
  onRetry,
}: {
  title: string;
  error: unknown;
  onRetry: () => void;
}) {
  return (
    <section className="surface route-error" role="alert">
      <p className="eyebrow">Couldn’t load</p>
      <h1>{title}</h1>
      <p>{queryErrorMessage(error)}</p>
      <button className="button button-secondary" onClick={onRetry} type="button">
        Try again
      </button>
    </section>
  );
}

function AuthCanvas({ children }: { children: React.ReactNode }) {
  return (
    <main className="auth-canvas">
      <div className="auth-context">
        <p className="eyebrow">Reports made clear</p>
        <h2>Field context in. Professional reporting out.</h2>
        <p>
          Review projects, manage the team, and finish structured reports with the room and keyboard
          of your office.
        </p>
        <div className="auth-context-card" aria-hidden="true">
          <span>Site Visit #24</span>
          <strong>West elevation progress</strong>
          <div>
            <i />
            <i />
            <i />
          </div>
        </div>
      </div>
      {children}
    </main>
  );
}

export function SignInRoute(): React.JSX.Element {
  const session = useAuthSession();
  return (
    <AuthCanvas>
      <SignInForm
        onSendCode={requestSignInCode}
        onVerifyCode={async (input) => {
          await verifySignInCode(input);
          await session.refresh();
        }}
      />
    </AuthCanvas>
  );
}

export function OnboardingRoute(): React.JSX.Element | null {
  const session = useAuthSession();
  if (!session.user) return null;
  return (
    <AuthCanvas>
      <OnboardingForm
        email={session.user.email}
        onSubmit={async (input) => {
          await dashboardDataApi.updateMe(input);
          await session.refresh();
        }}
      />
    </AuthCanvas>
  );
}

export function ProjectsRoute(): React.JSX.Element | null {
  const session = useAuthSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const projectsQuery = useQuery({
    queryKey: projectKeys.all,
    queryFn: ({ signal }) =>
      dashboardDataApi.listProjects({ limit: 100 }).then((page) => {
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
        return page;
      }),
  });
  const createProject = useMutation({
    mutationFn: dashboardDataApi.createProject,
    onSuccess: (project) => {
      void queryClient.invalidateQueries({ queryKey: projectKeys.all });
      navigate(`/projects/${project.id}`);
    },
  });

  if (!session.user) return null;
  return (
    <DashboardShell user={session.user} onSignOut={session.signOut}>
      {projectsQuery.error ? (
        <div className="page">
          <LoadFailure
            title="Projects"
            error={projectsQuery.error}
            onRetry={() => void projectsQuery.refetch()}
          />
        </div>
      ) : (
        <ProjectsPageView
          isLoading={projectsQuery.isLoading}
          projects={projectsQuery.data?.items ?? []}
          onCreateProject={(input) => createProject.mutateAsync(input).then(() => undefined)}
        />
      )}
    </DashboardShell>
  );
}

interface ProjectOutletContext {
  project: projects.Project;
}

function useCurrentProject(): projects.Project {
  return useOutletContext<ProjectOutletContext>().project;
}

export function ProjectShellRoute(): React.JSX.Element | null {
  const session = useAuthSession();
  const { project: projectParam } = useParams();
  const projectQuery = useQuery({
    enabled: Boolean(projectParam),
    queryKey: projectKeys.detail(projectParam ?? ''),
    queryFn: () => dashboardDataApi.getProject(projectParam ?? ''),
  });

  if (!session.user) return null;
  if (!projectParam) {
    return (
      <DashboardShell user={session.user} onSignOut={session.signOut}>
        <div className="page">
          <LoadFailure
            title="Project"
            error={new Error('The project URL is incomplete.')}
            onRetry={() => undefined}
          />
        </div>
      </DashboardShell>
    );
  }
  if (projectQuery.error) {
    return (
      <DashboardShell user={session.user} onSignOut={session.signOut}>
        <div className="page">
          <LoadFailure
            title="Project"
            error={projectQuery.error}
            onRetry={() => void projectQuery.refetch()}
          />
        </div>
      </DashboardShell>
    );
  }
  if (!projectQuery.data) {
    return (
      <DashboardShell user={session.user} onSignOut={session.signOut}>
        <section className="boot-screen" aria-busy="true">
          <span className="spinner" aria-hidden="true" />
          <p>Loading project…</p>
        </section>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell
      user={session.user}
      project={{
        name: projectQuery.data.name,
        role: projectQuery.data.myRole,
        slug: projectQuery.data.id,
      }}
      onSignOut={session.signOut}
    >
      <Outlet context={{ project: projectQuery.data }} />
    </DashboardShell>
  );
}

export function ProjectOverviewRoute(): React.JSX.Element {
  const project = useCurrentProject();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const membersQuery = useQuery({
    queryKey: projectKeys.members(project.id),
    queryFn: () => dashboardDataApi.listMembers(project.id),
  });
  const reportsQuery = useQuery({
    queryKey: ['dashboard', 'project-reports', project.id, 'overview'],
    queryFn: ({ signal }) =>
      reportsApi.listReports(project.id, {
        status: 'all',
        limit: 5,
        signal,
      }),
  });
  const createReport = useMutation({
    mutationFn: () => reportsApi.createReport(project.id),
    onSuccess: (report) => {
      void queryClient.invalidateQueries({
        queryKey: ['dashboard', 'project-reports', project.id],
      });
      navigate(`reports/${report.number}`);
    },
  });

  return (
    <ProjectOverview
      members={membersQuery.data?.items ?? []}
      project={project}
      createReportError={createReport.error ? queryErrorMessage(createReport.error) : null}
      isCreatingReport={createReport.isPending}
      isLoadingRecentReports={reportsQuery.isLoading}
      onCreateReport={() => createReport.mutate()}
      recentReports={reportsQuery.data?.items ?? []}
    />
  );
}

export function ProjectMembersRoute(): React.JSX.Element {
  const project = useCurrentProject();
  const session = useAuthSession();
  const queryClient = useQueryClient();
  const membersQuery = useQuery({
    queryKey: projectKeys.members(project.id),
    queryFn: () => dashboardDataApi.listMembers(project.id),
  });
  const invalidateMembers = () =>
    queryClient.invalidateQueries({
      queryKey: projectKeys.members(project.id),
    });
  const addMember = useMutation({
    mutationFn: (input: { email: string; role: projects.ProjectRole }) =>
      dashboardDataApi.addMember(project.id, input),
    onSuccess: invalidateMembers,
  });
  const changeRole = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: projects.ProjectRole }) =>
      dashboardDataApi.changeMemberRole(project.id, userId, role),
    onSuccess: invalidateMembers,
  });
  const removeMember = useMutation({
    mutationFn: (userId: string) => dashboardDataApi.removeMember(project.id, userId),
    onSuccess: invalidateMembers,
  });

  if (membersQuery.error) {
    return (
      <div className="page">
        <LoadFailure
          title="Members"
          error={membersQuery.error}
          onRetry={() => void membersQuery.refetch()}
        />
      </div>
    );
  }

  return (
    <MembersPageView
      currentUserId={session.user?.id ?? ''}
      isLoading={membersQuery.isLoading}
      members={membersQuery.data?.items ?? []}
      myRole={project.myRole}
      onAddMember={(input) => addMember.mutateAsync(input).then(() => undefined)}
      onChangeRole={(userId, role) =>
        changeRole.mutateAsync({ userId, role }).then(() => undefined)
      }
      onRemoveMember={(userId) => removeMember.mutateAsync(userId).then(() => undefined)}
    />
  );
}

export function ProjectSettingsRoute(): React.JSX.Element {
  const project = useCurrentProject();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const updateProject = useMutation({
    mutationFn: (input: { name: string; clientName?: string; address?: string }) =>
      dashboardDataApi.updateProject(project.id, input),
    onSuccess: (updated) => {
      queryClient.setQueryData(projectKeys.detail(project.id), updated);
      void queryClient.invalidateQueries({ queryKey: projectKeys.all });
    },
  });
  const deleteProject = useMutation({
    mutationFn: () => dashboardDataApi.deleteProject(project.id),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: projectKeys.detail(project.id) });
      void queryClient.invalidateQueries({ queryKey: projectKeys.all });
      navigate('/projects', { replace: true });
    },
  });

  return (
    <ProjectSettingsPanel
      project={project}
      onDelete={() => deleteProject.mutateAsync()}
      onSave={(input) => updateProject.mutateAsync(input).then(() => undefined)}
    />
  );
}

export function ProjectReportsRoute(): React.JSX.Element {
  const project = useCurrentProject();
  const navigate = useNavigate();

  return (
    <ReportsListPage
      api={reportsApi}
      onOpenReport={(number) => navigate(String(number))}
      projectSlug={project.id}
      role={project.myRole}
    />
  );
}

export function ProjectReportWorkspaceRoute(): React.JSX.Element {
  const project = useCurrentProject();
  const navigate = useNavigate();
  const { number } = useParams();
  const reportNumber = Number(number);

  if (!Number.isInteger(reportNumber) || reportNumber < 1) {
    return (
      <div className="page">
        <LoadFailure
          title="Report"
          error={new Error('The report number in this URL is invalid.')}
          onRetry={() => navigate('..', { relative: 'path' })}
        />
      </div>
    );
  }

  return (
    <ReportWorkspacePage
      api={reportsApi}
      onDeleted={() => navigate('..', { relative: 'path', replace: true })}
      projectSlug={project.id}
      reportNumber={reportNumber}
      role={project.myRole}
    />
  );
}

export function NotFoundRoute(): React.JSX.Element {
  return (
    <main className="not-found-page">
      <p className="eyebrow">404</p>
      <h1>That page isn’t here</h1>
      <p>The link may be old, or you may no longer have project access.</p>
      <Link className="button button-primary" to="/projects">
        Back to projects
      </Link>
    </main>
  );
}
