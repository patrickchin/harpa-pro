import type { projects as projectContract } from '@harpa/api-contract';
import { LoaderCircle, X } from 'lucide-react';
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
  'font-bold text-foreground underline decoration-transparent decoration-2 transition-colors hover:text-accent-ink hover:decoration-current';

function ProjectRows({ projects }: { projects: projectContract.Project[] }) {
  return projects.map((project) => (
    <tr className="transition-colors hover:bg-surface-emphasis" key={project.id}>
      <th className={tableCellClassName} scope="row">
        <Link className={projectLinkClassName} to={`/projects/${project.id}`}>
          {project.name}
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
            className="min-w-0 rounded-card-ui border border-border bg-card p-4 shadow-raised-ui"
            key={project.id}
          >
            <div className="flex min-w-0 items-start justify-between gap-3">
              <h2 className="min-w-0 text-title-sm font-bold">
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
              <div className="min-w-0 border-t border-border pt-3">
                <dt className="text-label font-bold tracking-label text-muted-foreground uppercase">
                  Client
                </dt>
                <dd className="mt-1 break-words">{project.clientName ?? 'Not provided'}</dd>
              </div>
              <div className="min-w-0 border-t border-border pt-3">
                <dt className="text-label font-bold tracking-label text-muted-foreground uppercase">
                  Address
                </dt>
                <dd className="mt-1 break-words">{project.address ?? 'Not provided'}</dd>
              </div>
              <div className="min-w-0 border-t border-border pt-3 sm:col-span-2">
                <dt className="text-label font-bold tracking-label text-muted-foreground uppercase">
                  Last updated
                </dt>
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
    <div className="flex min-w-0 flex-col gap-8">
      <PageHeader
        eyebrow="Workspace"
        title="Projects"
        description="Open a job, review its latest reports, or start a new project."
        action={
          <Button className="w-full sm:w-auto" onClick={() => setDialogOpen(true)}>
            New project
          </Button>
        }
      />

      {isLoading ? (
        <section
          aria-busy="true"
          className="flex min-h-60 items-center justify-center gap-3 rounded-card-ui border border-border bg-card p-8 text-center shadow-raised-ui"
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
          <TableShell className="hidden overflow-x-auto lg:block">
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
                <ProjectRows projects={projects} />
              </tbody>
            </table>
          </TableShell>
          <ProjectCards projects={projects} />
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
              <p className="text-label font-bold tracking-label text-muted-foreground uppercase">
                Create
              </p>
              <h2 className="mt-1 text-title-sm font-bold" id="new-project-title">
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
          <form className="mt-5 grid gap-5" onSubmit={createProject}>
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
