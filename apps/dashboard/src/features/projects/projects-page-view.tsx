import type { projects as projectContract } from '@harpa/api-contract';
import { ArrowUpRight, FolderKanban, LoaderCircle, Plus, Search, X } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';

import { PageHeader } from '@/components/layout';
import { Modal } from '@/components/modal';
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Input,
  tableCellClassName,
  tableClassName,
  tableHeadClassName,
  TableShell,
} from '@/components/ui';
import { formatRelativeDate, formatRole } from '@/lib/format';

interface CreateProjectInput {
  name: string;
  clientName?: string;
  address?: string;
}

interface ProjectsPageViewProps {
  projects: projectContract.Project[];
  onCreateProject: (input: CreateProjectInput) => Promise<void>;
  isLoading?: boolean;
}

const projectLinkClassName =
  'text-foreground underline decoration-transparent decoration-2 transition-colors hover:text-accent-ink hover:decoration-current';

function ProjectRows({ projects }: { projects: projectContract.Project[] }) {
  return projects.map((project) => (
    <tr className="transition-colors hover:bg-surface-emphasis" key={project.id}>
      <th className={tableCellClassName} scope="row">
        <Link
          className={`${projectLinkClassName} flex min-h-11 items-center gap-3 font-bold`}
          to={`/projects/${project.id}`}
        >
          <span
            className="grid size-10 shrink-0 place-items-center rounded-control-ui bg-primary/5 text-primary"
            aria-hidden="true"
          >
            <FolderKanban className="size-5" strokeWidth={1.5} />
          </span>
          <span className="min-w-0 break-words">{project.name}</span>
          <ArrowUpRight
            className="ml-auto size-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
        </Link>
      </th>
      <td className={tableCellClassName}>{project.clientName ?? 'Not provided'}</td>
      <td className={`${tableCellClassName} max-w-72 break-words`}>
        {project.address ?? 'Not provided'}
      </td>
      <td className={tableCellClassName}>
        <Badge tone={project.myRole}>{formatRole(project.myRole)}</Badge>
      </td>
      <td className={`${tableCellClassName} whitespace-nowrap`}>
        <time dateTime={project.updatedAt}>{formatRelativeDate(project.updatedAt)}</time>
      </td>
    </tr>
  ));
}

function ProjectCards({ projects }: { projects: projectContract.Project[] }) {
  return (
    <ul aria-label="Projects" className="grid gap-3 lg:hidden">
      {projects.map((project) => {
        const role = formatRole(project.myRole);
        return (
          <li
            className="min-w-0 border-b border-border/40 px-5 py-5 last:border-b-0"
            key={project.id}
          >
            <div className="flex min-w-0 items-start justify-between gap-3">
              <h2 className="min-w-0 font-heading text-section">
                <Link
                  className={`${projectLinkClassName} break-words`}
                  to={`/projects/${project.id}`}
                >
                  {project.name}
                </Link>
              </h2>
              <Badge aria-label={`Your role: ${role}`} className="shrink-0" tone={project.myRole}>
                {role}
              </Badge>
            </div>
            <dl className="mt-4 grid gap-3 text-meta sm:grid-cols-2">
              <div className="min-w-0">
                <dt className="text-label text-muted-foreground">Client</dt>
                <dd className="mt-1 break-words">{project.clientName ?? 'Not provided'}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-label text-muted-foreground">Address</dt>
                <dd className="mt-1 break-words">{project.address ?? 'Not provided'}</dd>
              </div>
              <div className="min-w-0 sm:col-span-2">
                <dt className="text-label text-muted-foreground">Last updated</dt>
                <dd className="mt-1">
                  <time dateTime={project.updatedAt}>{formatRelativeDate(project.updatedAt)}</time>
                </dd>
              </div>
            </dl>
          </li>
        );
      })}
    </ul>
  );
}

export function ProjectsPageView({
  projects,
  onCreateProject,
  isLoading = false,
}: ProjectsPageViewProps): React.JSX.Element {
  const [search, setSearch] = useState('');
  const query = search.trim().toLowerCase();
  const visibleProjects = projects.filter((project) =>
    [project.name, project.clientName, project.address].some((value) =>
      value?.toLowerCase().includes(query),
    ),
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const projectNameRef = useRef<HTMLInputElement>(null);

  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get('name') ?? '').trim();
    const clientName = String(form.get('clientName') ?? '').trim();
    const address = String(form.get('address') ?? '').trim();
    if (!name) {
      setError('Enter a project name.');
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      await onCreateProject({
        name,
        ...(clientName ? { clientName } : {}),
        ...(address ? { address } : {}),
      });
      setDialogOpen(false);
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : 'Could not create the project.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-6 sm:gap-8">
      <PageHeader
        eyebrow="Workspace"
        title="Projects"
        description="Open a job, review its latest reports, or start a new project."
        action={
          <Button className="w-full sm:w-auto" onClick={() => setDialogOpen(true)}>
            <Plus className="size-4" aria-hidden="true" />
            New project
          </Button>
        }
      />

      {isLoading ? (
        <section
          aria-busy="true"
          className="flex min-h-44 items-center justify-center gap-3 rounded-card-ui border border-border/40 bg-card p-5 text-center"
        >
          <LoaderCircle className="size-5 animate-spin text-muted-foreground" aria-hidden="true" />
          <p className="text-muted-foreground">Loading projects…</p>
        </section>
      ) : projects.length === 0 ? (
        <EmptyState
          description="Create your first project to organize reports and teammates."
          title="No projects yet"
        />
      ) : (
        <>
          <div className="overflow-hidden rounded-card-ui border border-border/40 bg-card">
            <div className="flex flex-col gap-3 border-b border-border/40 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div className="flex items-center gap-2.5">
                <h2 className="font-heading text-section">All projects</h2>
                <span
                  className="rounded-full bg-primary/5 px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground"
                  role="status"
                >
                  {query ? `${visibleProjects.length} of ${projects.length}` : projects.length}
                </span>
              </div>
              <div className="relative w-full sm:w-72">
                <Search
                  className="pointer-events-none absolute top-3.5 left-3 size-4 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  aria-label="Search projects"
                  className="pl-10 shadow-none"
                  placeholder="Search projects…"
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.currentTarget.value)}
                />
              </div>
            </div>
            {visibleProjects.length === 0 ? (
              <div className="grid min-h-48 content-center gap-2 p-5 text-center">
                <h2 className="font-semibold">No matching projects</h2>
                <p className="text-meta text-muted-foreground">
                  Try a project name, client, or address.
                </p>
                <Button className="mx-auto" variant="quiet" onClick={() => setSearch('')}>
                  Clear search
                </Button>
              </div>
            ) : (
              <>
                <TableShell className="hidden overflow-x-auto rounded-none border-0 lg:block">
                  <table className={tableClassName}>
                    <caption className="sr-only">Projects</caption>
                    <thead>
                      <tr>
                        <th className={tableHeadClassName} scope="col">
                          Project
                        </th>
                        <th className={tableHeadClassName} scope="col">
                          Client
                        </th>
                        <th className={tableHeadClassName} scope="col">
                          Address
                        </th>
                        <th className={tableHeadClassName} scope="col">
                          Your role
                        </th>
                        <th className={`${tableHeadClassName} whitespace-nowrap`} scope="col">
                          Last updated
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <ProjectRows projects={visibleProjects} />
                    </tbody>
                  </table>
                </TableShell>
                <ProjectCards projects={visibleProjects} />
              </>
            )}
          </div>
        </>
      )}

      {dialogOpen ? (
        <Modal
          ariaLabelledBy="new-project-title"
          closeOnEscape={!isSubmitting}
          initialFocusRef={projectNameRef}
          onClose={() => setDialogOpen(false)}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-label text-muted-foreground">Create</p>
              <h2 className="font-heading mt-1 text-title-sm" id="new-project-title">
                New project
              </h2>
            </div>
            <Button
              aria-label="Close new project"
              onClick={() => setDialogOpen(false)}
              size="icon"
              variant="quiet"
            >
              <X className="size-5" aria-hidden="true" />
            </Button>
          </div>
          <form className="mt-5 grid gap-4" onSubmit={createProject}>
            <Field label="Project name">
              <Input name="name" ref={projectNameRef} />
            </Field>
            <Field label="Client" optional>
              <Input aria-label="Client" name="clientName" />
            </Field>
            <Field label="Address" optional>
              <Input aria-label="Address" name="address" />
            </Field>
            {error ? (
              <p
                className="rounded-control-ui border border-danger-border bg-danger-soft px-4 py-3 text-meta text-danger-text"
                role="alert"
              >
                {error}
              </p>
            ) : null}
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button
                className="w-full sm:w-auto"
                onClick={() => setDialogOpen(false)}
                variant="quiet"
              >
                Cancel
              </Button>
              <Button
                className="w-full sm:w-auto"
                disabled={isSubmitting}
                type="submit"
                variant="hero"
              >
                {isSubmitting ? 'Creating…' : 'Create project'}
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}
