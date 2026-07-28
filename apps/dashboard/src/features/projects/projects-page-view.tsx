import type { projects as projectContract } from '@harpa/api-contract';
import { useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';

import { PageHeader } from '@/components/layout';
import { Modal } from '@/components/modal';
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

function ProjectRows({ projects }: { projects: projectContract.Project[] }) {
  return projects.map((project) => (
    <tr key={project.id}>
      <th scope="row">
        <Link className="table-primary-link" to={`/projects/${project.id}`}>
          {project.name}
        </Link>
      </th>
      <td>{project.clientName ?? 'Not provided'}</td>
      <td>{project.address ?? 'Not provided'}</td>
      <td>
        <span className={`role-badge role-${project.myRole}`}>{formatRole(project.myRole)}</span>
      </td>
      <td>{formatRelativeDate(project.updatedAt)}</td>
    </tr>
  ));
}

function ProjectCards({ projects }: { projects: projectContract.Project[] }) {
  return (
    <ul aria-label="Projects" className="project-card-list">
      {projects.map((project) => {
        const role = formatRole(project.myRole);
        return (
          <li className="surface project-card" key={project.id}>
            <div className="project-card-heading">
              <h2>
                <Link className="project-card-link" to={`/projects/${project.id}`}>
                  {project.name}
                </Link>
              </h2>
              <span
                aria-label={`Your role: ${role}`}
                className={`role-badge role-${project.myRole}`}
              >
                {role}
              </span>
            </div>
            <dl className="project-card-details">
              <div>
                <dt>Client</dt>
                <dd>{project.clientName ?? 'Not provided'}</dd>
              </div>
              <div>
                <dt>Address</dt>
                <dd>{project.address ?? 'Not provided'}</dd>
              </div>
              <div>
                <dt>Last updated</dt>
                <dd>
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
    <div className="page">
      <PageHeader
        eyebrow="Workspace"
        title="Projects"
        description="Open a job, review its latest reports, or start a new project."
        action={
          <button
            className="button button-primary"
            onClick={() => setDialogOpen(true)}
            type="button"
          >
            New project
          </button>
        }
      />

      {isLoading ? (
        <section className="surface loading-surface" aria-busy="true">
          <span className="spinner" aria-hidden="true" />
          <p>Loading projects…</p>
        </section>
      ) : projects.length === 0 ? (
        <section className="surface empty-state">
          <span className="empty-state-mark" aria-hidden="true">
            HP
          </span>
          <h2>No projects yet</h2>
          <p>Create your first project to organize reports and teammates.</p>
        </section>
      ) : (
        <>
          <div className="surface table-surface desktop-table">
            <table>
              <caption className="sr-only">Projects</caption>
              <thead>
                <tr>
                  <th scope="col">Project</th>
                  <th scope="col">Client</th>
                  <th scope="col">Address</th>
                  <th scope="col">Your role</th>
                  <th scope="col">Last updated</th>
                </tr>
              </thead>
              <tbody>
                <ProjectRows projects={projects} />
              </tbody>
            </table>
          </div>
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
          <div className="modal-heading">
            <div>
              <p className="eyebrow">Create</p>
              <h2 id="new-project-title">New project</h2>
            </div>
            <button
              aria-label="Close new project"
              className="icon-button"
              onClick={() => setDialogOpen(false)}
              type="button"
            >
              ×
            </button>
          </div>
          <form className="form-stack" onSubmit={createProject}>
            <label>
              Project name
              <input name="name" ref={projectNameRef} />
            </label>
            <label>
              Client{' '}
              <span aria-hidden="true" className="optional-label">
                Optional
              </span>
              <input name="clientName" />
            </label>
            <label>
              Address{' '}
              <span aria-hidden="true" className="optional-label">
                Optional
              </span>
              <input name="address" />
            </label>
            {error ? <p role="alert">{error}</p> : null}
            <div className="modal-actions">
              <button
                className="button button-quiet"
                onClick={() => setDialogOpen(false)}
                type="button"
              >
                Cancel
              </button>
              <button className="button button-primary" disabled={isSubmitting}>
                {isSubmitting ? 'Creating…' : 'Create project'}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}
