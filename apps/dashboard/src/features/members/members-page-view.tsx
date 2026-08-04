import type { projects } from '@harpa/api-contract';
import { X } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import type { z } from 'zod';

import { PageHeader } from '@/components/layout';
import { Modal } from '@/components/modal';
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  Select,
  TableShell,
  tableCellClassName,
  tableClassName,
  tableHeadClassName,
} from '@/components/ui';
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

function MemberAvatar({ member }: { member: ProjectMember }): React.JSX.Element {
  return (
    <span
      aria-hidden="true"
      className="grid size-10 shrink-0 place-items-center rounded-full bg-primary text-sm font-extrabold text-primary-foreground"
    >
      {memberName(member)[0]?.toUpperCase()}
    </span>
  );
}

function MemberRoleBadge({ role }: { role: projects.ProjectRole }): React.JSX.Element {
  return <Badge tone={role}>{formatRole(role)}</Badge>;
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
  const removeCancelRef = useRef<HTMLButtonElement>(null);
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
    <div className="min-w-0">
      <PageHeader
        eyebrow="Project team"
        title="Members"
        description={`${members.length} project member${members.length === 1 ? '' : 's'} can access this workspace.`}
        action={
          canManage ? (
            <Button
              onClick={() => {
                setError(null);
                setAddOpen(true);
              }}
            >
              Add member
            </Button>
          ) : undefined
        }
      />

      {error && !addOpen && !removeTarget ? (
        <p
          className="mb-4 rounded-card-ui border border-danger-border bg-danger-soft px-4 py-3 text-sm font-semibold text-danger-text"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {isLoading ? (
        <Card className="flex min-h-40 items-center justify-center gap-3 p-5" aria-busy="true">
          <span
            className="size-5 animate-spin rounded-full border-2 border-primary/20 border-t-primary"
            aria-hidden="true"
          />
          <p className="text-sm font-semibold text-muted-foreground">Loading members…</p>
        </Card>
      ) : (
        <>
          <TableShell className="hidden lg:block" data-testid="members-desktop-table">
            <table className={tableClassName}>
              <thead>
                <tr>
                  <th className={tableHeadClassName} scope="col">
                    Name
                  </th>
                  <th className={tableHeadClassName} scope="col">
                    Email
                  </th>
                  <th className={tableHeadClassName} scope="col">
                    Role
                  </th>
                  <th className={tableHeadClassName} scope="col">
                    Joined
                  </th>
                  {canManage ? (
                    <th className={tableHeadClassName} scope="col">
                      Actions
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {members.map((member) => {
                  const displayName = memberName(member);
                  const isLastOwner = member.role === 'owner' && ownerCount === 1;
                  const isCurrentUser = member.userId === currentUserId;

                  return (
                    <tr className="last:[&>*]:border-b-0" key={member.userId}>
                      <th className={tableCellClassName} scope="row">
                        <span className="flex min-w-0 items-center gap-3 text-left">
                          <MemberAvatar member={member} />
                          <span className="min-w-0 font-bold text-foreground">
                            <span className="block truncate">
                              {member.displayName ?? 'Unnamed member'}
                            </span>
                            {isCurrentUser ? (
                              <span className="mt-1 block text-label font-bold tracking-label text-accent-ink uppercase">
                                You
                              </span>
                            ) : null}
                          </span>
                        </span>
                      </th>
                      <td className={tableCellClassName}>
                        <a
                          className="font-medium text-muted-foreground hover:text-foreground"
                          href={`mailto:${member.email}`}
                        >
                          {member.email}
                        </a>
                      </td>
                      <td className={tableCellClassName}>
                        {canManage ? (
                          <Select
                            aria-label={`Change role for ${displayName}`}
                            className="min-w-32 py-2 text-sm"
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
                          </Select>
                        ) : (
                          <MemberRoleBadge role={member.role} />
                        )}
                      </td>
                      <td className={tableCellClassName}>{formatDate(member.joinedAt)}</td>
                      {canManage ? (
                        <td className={tableCellClassName}>
                          <div className="flex flex-col items-start gap-1.5">
                            <Button
                              aria-label={`Remove ${displayName}`}
                              disabled={isLastOwner}
                              onClick={() => setRemoveTarget(member)}
                              size="small"
                              variant="destructive"
                            >
                              Remove
                            </Button>
                            {isLastOwner ? (
                              <span className="text-label font-medium text-muted-foreground">
                                Add another owner first.
                              </span>
                            ) : null}
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableShell>

          <div
            className="grid gap-3 lg:hidden"
            data-testid="members-mobile-list"
            role="list"
          >
            {members.map((member) => {
              const displayName = memberName(member);
              const isLastOwner = member.role === 'owner' && ownerCount === 1;
              const isCurrentUser = member.userId === currentUserId;

              return (
                <Card
                  className="min-w-0 p-4"
                  data-testid="member-mobile-card"
                  key={member.userId}
                  role="listitem"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <MemberAvatar member={member} />
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <h2 className="min-w-0 truncate text-base font-extrabold text-foreground">
                          {member.displayName ?? 'Unnamed member'}
                        </h2>
                        {isCurrentUser ? (
                          <Badge className="border-accent/30 bg-accent/10 text-accent-ink">
                            You
                          </Badge>
                        ) : null}
                      </div>
                      <a
                        className="mt-1 block truncate text-sm font-medium text-muted-foreground hover:text-foreground"
                        href={`mailto:${member.email}`}
                      >
                        {member.email}
                      </a>
                    </div>
                    {!canManage ? <MemberRoleBadge role={member.role} /> : null}
                  </div>

                  <dl className="mt-4 grid grid-cols-2 gap-3 rounded-control-ui bg-surface-muted p-3">
                    <div>
                      <dt className="text-label font-bold tracking-label text-muted-foreground uppercase">
                        Role
                      </dt>
                      <dd className="mt-1 text-sm font-bold text-foreground">
                        {formatRole(member.role)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-label font-bold tracking-label text-muted-foreground uppercase">
                        Joined
                      </dt>
                      <dd className="mt-1 text-sm font-bold text-foreground">
                        {formatDate(member.joinedAt)}
                      </dd>
                    </div>
                  </dl>

                  {canManage ? (
                    <div className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                      <Field label={`Role for ${displayName}`}>
                        <Select
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
                        </Select>
                      </Field>
                      <Button
                        aria-label={`Remove ${displayName}`}
                        className="w-full sm:w-auto"
                        disabled={isLastOwner}
                        onClick={() => setRemoveTarget(member)}
                        variant="destructive"
                      >
                        Remove
                      </Button>
                      {isLastOwner ? (
                        <p className="text-label font-medium text-muted-foreground sm:col-span-2">
                          Add another owner first.
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </Card>
              );
            })}
          </div>
        </>
      )}

      {addOpen ? (
        <Modal
          ariaDescribedBy="add-member-description"
          ariaLabelledBy="add-member-title"
          closeOnEscape={busyKey !== 'add'}
          initialFocusRef={addEmailRef}
          onClose={() => setAddOpen(false)}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-label font-bold tracking-label text-muted-foreground uppercase">
                Project access
              </p>
              <h2 className="mt-1 text-title-sm font-extrabold text-foreground" id="add-member-title">
                Add member
              </h2>
            </div>
            <Button
              aria-label="Close add member"
              onClick={() => setAddOpen(false)}
              size="icon"
              variant="quiet"
            >
              <X aria-hidden="true" className="size-5" />
            </Button>
          </div>
          <p
            className="mt-4 rounded-control-ui border border-info-border bg-info-soft p-3 text-sm font-medium text-info-text"
            id="add-member-description"
          >
            The person must already have a Harpa Pro account. This adds them immediately; it does
            not send an invitation.
          </p>
          <form className="mt-5 flex flex-col gap-4" onSubmit={addMember}>
            <Field label="Email address">
              <Input name="email" ref={addEmailRef} type="email" />
            </Field>
            <Field label="Project role">
              <Select defaultValue="editor" name="role">
                <option value="owner">Owner</option>
                <option value="editor">Editor</option>
                <option value="viewer">Viewer</option>
              </Select>
            </Field>
            <dl className="grid gap-2">
              <div className="rounded-control-ui bg-surface-muted p-3">
                <dt className="text-sm font-extrabold text-foreground">Owner</dt>
                <dd className="mt-1 text-sm text-muted-foreground">
                  Manage people, project details, and reports.
                </dd>
              </div>
              <div className="rounded-control-ui bg-surface-muted p-3">
                <dt className="text-sm font-extrabold text-foreground">Editor</dt>
                <dd className="mt-1 text-sm text-muted-foreground">
                  Create and edit reports and project details.
                </dd>
              </div>
              <div className="rounded-control-ui bg-surface-muted p-3">
                <dt className="text-sm font-extrabold text-foreground">Viewer</dt>
                <dd className="mt-1 text-sm text-muted-foreground">
                  Read project information and finalized reviews.
                </dd>
              </div>
            </dl>
            {error ? (
              <p className="text-sm font-semibold text-danger-text" role="alert">
                {error}
              </p>
            ) : null}
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button onClick={() => setAddOpen(false)} variant="quiet">
                Cancel
              </Button>
              <Button disabled={busyKey === 'add'} type="submit">
                {busyKey === 'add' ? 'Adding…' : 'Add member'}
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}

      {removeTarget ? (
        <Modal
          ariaDescribedBy="remove-member-description"
          ariaLabelledBy="remove-member-title"
          closeOnEscape={busyKey !== `remove:${removeTarget.userId}`}
          initialFocusRef={removeCancelRef}
          onClose={() => setRemoveTarget(null)}
        >
          <p className="text-label font-bold tracking-label text-danger-text uppercase">
            Remove access
          </p>
          <h2
            className="mt-1 text-title-sm font-extrabold text-foreground"
            id="remove-member-title"
          >
            Remove {memberName(removeTarget)}
          </h2>
          <p className="mt-3 text-sm text-muted-foreground" id="remove-member-description">
            They will no longer be able to open this project or its reports.
          </p>
          {error ? (
            <p className="mt-4 text-sm font-semibold text-danger-text" role="alert">
              {error}
            </p>
          ) : null}
          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button
              onClick={() => setRemoveTarget(null)}
              ref={removeCancelRef}
              variant="quiet"
            >
              Cancel
            </Button>
            <Button
              disabled={busyKey === `remove:${removeTarget.userId}`}
              onClick={() => void removeMember()}
              variant="danger-solid"
            >
              {busyKey === `remove:${removeTarget.userId}` ? 'Removing…' : 'Confirm removal'}
            </Button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
