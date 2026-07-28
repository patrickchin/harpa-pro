import type { projects } from '@harpa/api-contract';
import { useRef, useState, type FormEvent } from 'react';
import type { z } from 'zod';

import { PageHeader } from '@/components/layout';
import { Modal } from '@/components/modal';
import { formatDate, formatRole } from '@/lib/format';

interface AddMemberInput {
  email: string;
  role: projects.ProjectRole;
}

type ProjectMember = z.infer<typeof projects.projectMember>;

interface MembersPageViewProps {
  members: ProjectMember[];
  myRole: projects.ProjectRole;
  currentUserId: string;
  onAddMember: (input: AddMemberInput) => Promise<void>;
  onChangeRole: (userId: string, role: projects.ProjectRole) => Promise<void>;
  onRemoveMember: (userId: string) => Promise<void>;
  isLoading?: boolean;
}

function memberName(member: ProjectMember): string {
  return member.displayName ?? member.email;
}

export function MembersPageView({
  members,
  myRole,
  currentUserId,
  onAddMember,
  onChangeRole,
  onRemoveMember,
  isLoading = false,
}: MembersPageViewProps): React.JSX.Element {
  const [addOpen, setAddOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<ProjectMember | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const addEmailRef = useRef<HTMLInputElement>(null);
  const canManage = myRole === 'owner';
  const ownerCount = members.filter((member) => member.role === 'owner').length;

  async function addMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') ?? '')
      .trim()
      .toLowerCase();
    const role = String(form.get('role') ?? 'editor') as projects.ProjectRole;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Enter a valid email address.');
      return;
    }
    setBusyKey('add');
    setError(null);
    try {
      await onAddMember({ email, role });
      setAddOpen(false);
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : 'Could not add the member.');
    } finally {
      setBusyKey(null);
    }
  }

  async function changeRole(member: ProjectMember, role: projects.ProjectRole) {
    setBusyKey(`role:${member.userId}`);
    setError(null);
    try {
      await onChangeRole(member.userId, role);
    } catch (roleError) {
      setError(
        roleError instanceof Error ? roleError.message : 'Could not change the member role.',
      );
    } finally {
      setBusyKey(null);
    }
  }

  async function removeMember() {
    if (!removeTarget) return;
    setBusyKey(`remove:${removeTarget.userId}`);
    setError(null);
    try {
      await onRemoveMember(removeTarget.userId);
      setRemoveTarget(null);
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : 'Could not remove the member.');
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="Project team"
        title="Members"
        description={`${members.length} project member${members.length === 1 ? '' : 's'} can access this workspace.`}
        action={
          canManage ? (
            <button
              className="button button-primary"
              onClick={() => {
                setError(null);
                setAddOpen(true);
              }}
              type="button"
            >
              Add member
            </button>
          ) : undefined
        }
      />

      {error && !addOpen && !removeTarget ? (
        <p className="page-alert" role="alert">
          {error}
        </p>
      ) : null}

      <div className="surface table-surface">
        {isLoading ? (
          <div className="loading-surface" aria-busy="true">
            <span className="spinner" aria-hidden="true" />
            <p>Loading members…</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Email</th>
                <th scope="col">Role</th>
                <th scope="col">Joined</th>
                {canManage ? <th scope="col">Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {members.map((member) => {
                const displayName = memberName(member);
                const isLastOwner = member.role === 'owner' && ownerCount === 1;
                const isCurrentUser = member.userId === currentUserId;
                return (
                  <tr key={member.userId}>
                    <th scope="row">
                      <span className="member-name-cell">
                        <span className="avatar" aria-hidden="true">
                          {displayName[0]?.toUpperCase()}
                        </span>
                        <span>
                          {member.displayName ?? 'Unnamed member'}
                          {isCurrentUser ? <small className="you-label">You</small> : null}
                        </span>
                      </span>
                    </th>
                    <td>{member.email}</td>
                    <td>
                      {canManage ? (
                        <label className="sr-only-select">
                          <span>Change role for {displayName}</span>
                          <select
                            aria-label={`Change role for ${displayName}`}
                            disabled={isLastOwner || busyKey === `role:${member.userId}`}
                            onChange={(event) =>
                              void changeRole(
                                member,
                                event.currentTarget.value as projects.ProjectRole,
                              )
                            }
                            value={member.role}
                          >
                            <option value="owner">Owner</option>
                            <option value="editor">Editor</option>
                            <option value="viewer">Viewer</option>
                          </select>
                        </label>
                      ) : (
                        <span className={`role-badge role-${member.role}`}>
                          {formatRole(member.role)}
                        </span>
                      )}
                    </td>
                    <td>{formatDate(member.joinedAt)}</td>
                    {canManage ? (
                      <td>
                        <button
                          className="button button-table-danger"
                          disabled={isLastOwner}
                          onClick={() => setRemoveTarget(member)}
                          type="button"
                          aria-label={`Remove ${displayName}`}
                        >
                          Remove
                        </button>
                        {isLastOwner ? (
                          <span className="row-help">Add another owner first.</span>
                        ) : null}
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {addOpen ? (
        <Modal
          ariaDescribedBy="add-member-description"
          ariaLabelledBy="add-member-title"
          closeOnEscape={busyKey !== 'add'}
          initialFocusRef={addEmailRef}
          onClose={() => setAddOpen(false)}
        >
          <div className="modal-heading">
            <div>
              <p className="eyebrow">Project access</p>
              <h2 id="add-member-title">Add member</h2>
            </div>
            <button
              aria-label="Close add member"
              className="icon-button"
              onClick={() => setAddOpen(false)}
              type="button"
            >
              ×
            </button>
          </div>
          <p className="notice" id="add-member-description">
            The person must already have a Harpa Pro account. This adds them immediately; it does
            not send an invitation.
          </p>
          <form className="form-stack" onSubmit={addMember}>
            <label>
              Email address
              <input name="email" ref={addEmailRef} type="email" />
            </label>
            <label>
              Project role
              <select defaultValue="editor" name="role">
                <option value="owner">Owner</option>
                <option value="editor">Editor</option>
                <option value="viewer">Viewer</option>
              </select>
            </label>
            <dl className="role-guide">
              <div>
                <dt>Owner</dt>
                <dd>Manage people, project details, and reports.</dd>
              </div>
              <div>
                <dt>Editor</dt>
                <dd>Create and edit reports and project details.</dd>
              </div>
              <div>
                <dt>Viewer</dt>
                <dd>Read project information and finalized reviews.</dd>
              </div>
            </dl>
            {error ? <p role="alert">{error}</p> : null}
            <div className="modal-actions">
              <button
                className="button button-quiet"
                onClick={() => setAddOpen(false)}
                type="button"
              >
                Cancel
              </button>
              <button className="button button-primary" disabled={busyKey === 'add'}>
                {busyKey === 'add' ? 'Adding…' : 'Add member'}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {removeTarget ? (
        <Modal
          ariaDescribedBy="remove-member-description"
          ariaLabelledBy="remove-member-title"
          closeOnEscape={busyKey !== `remove:${removeTarget.userId}`}
          onClose={() => setRemoveTarget(null)}
        >
          <p className="eyebrow danger-copy">Remove access</p>
          <h2 id="remove-member-title">Remove {memberName(removeTarget)}</h2>
          <p id="remove-member-description">
            They will no longer be able to open this project or its reports.
          </p>
          {error ? <p role="alert">{error}</p> : null}
          <div className="modal-actions">
            <button
              className="button button-quiet"
              onClick={() => setRemoveTarget(null)}
              type="button"
            >
              Cancel
            </button>
            <button
              className="button button-danger"
              disabled={busyKey === `remove:${removeTarget.userId}`}
              onClick={() => void removeMember()}
              type="button"
            >
              {busyKey === `remove:${removeTarget.userId}` ? 'Removing…' : 'Confirm removal'}
            </button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
