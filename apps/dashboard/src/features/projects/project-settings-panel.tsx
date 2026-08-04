import type { projects } from '@harpa/api-contract';
import { Trash2 } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';

import { PageHeader } from '@/components/layout';
import { Modal } from '@/components/modal';
import { Button, Field, Input, Textarea } from '@/components/ui';

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
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        eyebrow={project.name}
        title="Project settings"
        description="Keep the identifying details used throughout reports up to date."
      />

      {canEdit ? (
        <section className="w-full max-w-3xl rounded-card-ui border border-border bg-card p-4 shadow-raised-ui sm:p-5">
          <div>
            <h2 className="text-title-sm">Project details</h2>
            <p className="mt-1 text-meta text-muted-foreground">
              These details appear in the project shell and report exports.
            </p>
          </div>
          <form className="mt-5 grid gap-4" onSubmit={save}>
            <Field label="Project name">
              <Input defaultValue={project.name} name="name" />
            </Field>
            <Field label="Client" optional>
              <Input
                aria-label="Client"
                defaultValue={project.clientName ?? ''}
                name="clientName"
              />
            </Field>
            <Field label="Address" optional>
              <Textarea aria-label="Address" defaultValue={project.address ?? ''} name="address" />
            </Field>
            {error && !deleteOpen ? (
              <p
                className="rounded-control-ui border border-danger-border bg-danger-soft px-4 py-3 text-meta text-danger-text"
                role="alert"
              >
                {error}
              </p>
            ) : null}
            <div className="flex justify-stretch sm:justify-start">
              <Button
                className="w-full sm:w-auto"
                disabled={busyAction !== null}
                type="submit"
                variant="hero"
              >
                {busyAction === 'save' ? 'Saving…' : 'Save changes'}
              </Button>
            </div>
          </form>
        </section>
      ) : (
        <section className="w-full max-w-3xl rounded-card-ui border border-border bg-card p-4 shadow-raised-ui sm:p-5">
          <h2 className="text-title-sm">Project details</h2>
          <dl className="mt-5 grid gap-4">
            <div className="border-t border-border pt-3 first:border-t-0 first:pt-0">
              <dt className="text-label text-muted-foreground uppercase">
                Project name
              </dt>
              <dd className="mt-1 break-words">{project.name}</dd>
            </div>
            <div className="border-t border-border pt-3">
              <dt className="text-label text-muted-foreground uppercase">
                Client
              </dt>
              <dd className="mt-1 break-words">{project.clientName ?? 'Not provided'}</dd>
            </div>
            <div className="border-t border-border pt-3">
              <dt className="text-label text-muted-foreground uppercase">
                Address
              </dt>
              <dd className="mt-1 break-words">{project.address ?? 'Not provided'}</dd>
            </div>
          </dl>
          <p className="mt-5 rounded-control-ui border border-info-border bg-info-soft px-4 py-3 text-meta text-info-text">
            Only owners and editors can change project details.
          </p>
        </section>
      )}

      {project.myRole === 'owner' ? (
        <section className="flex w-full max-w-3xl flex-col gap-4 rounded-card-ui border border-danger-border bg-danger-soft p-4 shadow-raised-ui sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="min-w-0">
            <h2 className="text-title-sm text-danger-text">Delete project</h2>
            <p className="mt-1 text-meta text-danger-text">
              Permanently remove this project, its reports, and attached project records.
            </p>
          </div>
          <Button
            className="w-full sm:w-auto"
            onClick={() => {
              setConfirmation('');
              setError(null);
              setDeleteOpen(true);
            }}
            variant="destructive"
          >
            <Trash2 className="size-4" aria-hidden="true" />
            Delete project
          </Button>
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
          <p className="text-label text-danger-text uppercase">
            Permanent action
          </p>
          <h2 className="mt-2 text-title-sm" id="delete-project-title">
            Delete {project.name}?
          </h2>
          <p className="mt-2 text-meta text-muted-foreground" id="delete-project-description">
            Its reports and attached project records are removed. This cannot be undone.
          </p>
          <Field className="mt-5" label={`Type ${project.name} to confirm`}>
            <Input
              onChange={(event) => setConfirmation(event.currentTarget.value)}
              ref={deleteConfirmationRef}
              value={confirmation}
            />
          </Field>
          {error ? (
            <p
              className="mt-4 rounded-control-ui border border-danger-border bg-danger-soft px-4 py-3 text-meta text-danger-text"
              role="alert"
            >
              {error}
            </p>
          ) : null}
          <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button
              className="w-full sm:w-auto"
              onClick={() => setDeleteOpen(false)}
              variant="quiet"
            >
              Cancel
            </Button>
            <Button
              className="w-full sm:w-auto"
              disabled={confirmation !== project.name || busyAction === 'delete'}
              onClick={() => void deleteProject()}
              variant="danger-solid"
            >
              {busyAction === 'delete' ? 'Deleting…' : 'Permanently delete project'}
            </Button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
