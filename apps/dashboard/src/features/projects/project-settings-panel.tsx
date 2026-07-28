import type { projects } from '@harpa/api-contract';
import { useRef, useState, type FormEvent } from 'react';

import { PageHeader } from '@/components/layout';
import { Modal } from '@/components/modal';

interface UpdateProjectInput {
  name: string;
  clientName?: string;
  address?: string;
}

interface ProjectSettingsPanelProps {
  project: projects.Project;
  onSave: (input: UpdateProjectInput) => Promise<void>;
  onDelete: () => Promise<void>;
}

export function ProjectSettingsPanel({
  project,
  onSave,
  onDelete,
}: ProjectSettingsPanelProps): React.JSX.Element {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<'save' | 'delete' | null>(null);
  const deleteConfirmationRef = useRef<HTMLInputElement>(null);
  const canEdit = project.myRole === 'owner' || project.myRole === 'editor';

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get('name') ?? '').trim();
    if (!name) {
      setError('Enter a project name.');
      return;
    }
    const clientName = String(form.get('clientName') ?? '').trim();
    const address = String(form.get('address') ?? '').trim();
    setBusyAction('save');
    setError(null);
    try {
      await onSave({
        name,
        ...(clientName ? { clientName } : {}),
        ...(address ? { address } : {}),
      });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save project settings.');
    } finally {
      setBusyAction(null);
    }
  }

  async function deleteProject() {
    setBusyAction('delete');
    setError(null);
    try {
      await onDelete();
      setDeleteOpen(false);
    } catch (deleteError) {
      setError(
        deleteError instanceof Error ? deleteError.message : 'Could not delete the project.',
      );
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow={project.name}
        title="Project settings"
        description="Keep the identifying details used throughout reports up to date."
      />

      {canEdit ? (
        <section className="surface settings-panel">
          <div className="section-heading">
            <div>
              <h2>Project details</h2>
              <p>These details appear in the project shell and report exports.</p>
            </div>
          </div>
          <form className="form-stack" onSubmit={save}>
            <label>
              Project name
              <input defaultValue={project.name} name="name" />
            </label>
            <label>
              Client{' '}
              <span aria-hidden="true" className="optional-label">
                Optional
              </span>
              <input defaultValue={project.clientName ?? ''} name="clientName" />
            </label>
            <label>
              Address{' '}
              <span aria-hidden="true" className="optional-label">
                Optional
              </span>
              <textarea defaultValue={project.address ?? ''} name="address" />
            </label>
            {error && !deleteOpen ? <p role="alert">{error}</p> : null}
            <div>
              <button className="button button-primary" disabled={busyAction !== null}>
                {busyAction === 'save' ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </form>
        </section>
      ) : (
        <section className="surface settings-panel">
          <h2>Project details</h2>
          <dl className="details-list">
            <div>
              <dt>Project name</dt>
              <dd>{project.name}</dd>
            </div>
            <div>
              <dt>Client</dt>
              <dd>{project.clientName ?? 'Not provided'}</dd>
            </div>
            <div>
              <dt>Address</dt>
              <dd>{project.address ?? 'Not provided'}</dd>
            </div>
          </dl>
          <p className="notice">Only owners and editors can change project details.</p>
        </section>
      )}

      {project.myRole === 'owner' ? (
        <section className="surface danger-zone">
          <div>
            <h2>Delete project</h2>
            <p>Permanently remove this project, its reports, and attached project records.</p>
          </div>
          <button
            className="button button-danger"
            onClick={() => {
              setConfirmation('');
              setError(null);
              setDeleteOpen(true);
            }}
            type="button"
          >
            Delete project
          </button>
        </section>
      ) : null}

      {deleteOpen ? (
        <Modal
          ariaDescribedBy="delete-project-description"
          ariaLabelledBy="delete-project-title"
          closeOnEscape={busyAction !== 'delete'}
          initialFocusRef={deleteConfirmationRef}
          onClose={() => setDeleteOpen(false)}
        >
          <p className="eyebrow danger-copy">Permanent action</p>
          <h2 id="delete-project-title">Delete {project.name}?</h2>
          <p id="delete-project-description">
            Its reports and attached project records are removed. This cannot be undone.
          </p>
          <label>
            Type {project.name} to confirm
            <input
              onChange={(event) => setConfirmation(event.currentTarget.value)}
              ref={deleteConfirmationRef}
              value={confirmation}
            />
          </label>
          {error ? <p role="alert">{error}</p> : null}
          <div className="modal-actions">
            <button
              className="button button-quiet"
              onClick={() => setDeleteOpen(false)}
              type="button"
            >
              Cancel
            </button>
            <button
              className="button button-danger"
              disabled={confirmation !== project.name || busyAction === 'delete'}
              onClick={() => void deleteProject()}
              type="button"
            >
              {busyAction === 'delete' ? 'Deleting…' : 'Permanently delete project'}
            </button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
