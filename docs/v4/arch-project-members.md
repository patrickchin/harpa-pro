# Project members

> Status: implemented. This document describes the current API and database
> helpers.
>
> Companions: [`arch-api-design.md`](arch-api-design.md),
> [`arch-auth-and-rls.md`](arch-auth-and-rls.md), and
> [`arch-database.md`](arch-database.md).

## Roles

`app.project_role` has three values:

| Role     | Purpose                                                         |
| -------- | --------------------------------------------------------------- |
| `owner`  | Full project control and member administration                  |
| `editor` | Project and draft-content changes without member administration |
| `viewer` | Read access plus the explicit review-comment and PDF exceptions |

The route guard in `packages/api/src/lib/project-authorization.ts` defines
writer roles as `owner` and `editor`. It defines the owner role separately.

## Project-content permissions

| Operation                                     | Owner | Editor | Viewer |
| --------------------------------------------- | :---: | :----: | :----: |
| Read project, reports, notes, and files       |  Yes  |  Yes   |  Yes   |
| Update project metadata                       |  Yes  |  Yes   |   No   |
| Delete project                                |  Yes  |   No   |   No   |
| Create, update, or delete a draft report      |  Yes  |  Yes   |   No   |
| Create a note                                 |  Yes  |  Yes   |   No   |
| Update or delete an authored note             |  Yes  |  Yes   |   No   |
| Append files to an authored image note        |  Yes  |  Yes   |   No   |
| Presign and register a project upload         |  Yes  |  Yes   |   No   |
| Generate or regenerate a report               |  Yes  |  Yes   |   No   |
| Finalize a report                             |  Yes  |   No   |   No   |
| Unfinalize a report                           |  Yes  |  Yes   |   No   |
| Export a PDF                                  |  Yes  |  Yes   |  Yes   |
| Read or add a finalized-report review comment |  Yes  |  Yes   |  Yes   |

Content mutation routes return `404` when the project is absent, hidden, or
visible with an insufficient role. This prevents a mutation route from
revealing project existence.

Database RLS still controls row visibility. The route guard adds the role
decision for writes.

## Member-management permissions

| Operation            | Required role |
| -------------------- | ------------- |
| List project members | Any member    |
| Add a member         | Owner         |
| Change a member role | Owner         |
| Remove a member      | Owner         |

Member-management routes return `403` for a visible project when the caller
is not an owner.

## API contract

The shared schemas live in
`packages/api-contract/src/schemas/projects.ts`.

### Member shape

```ts
{
  userId: string;
  displayName: string | null;
  email: string;
  role: 'owner' | 'editor' | 'viewer';
  joinedAt: string;
}
```

The API no longer identifies members by phone number.

### List members

```http
GET /projects/{project}/members
```

- Any project member can call this route.
- The response is `{ items: ProjectMember[] }`.
- The database orders members by `joined_at`.
- A non-member receives `404`.

### Add a member

```http
POST /projects/{project}/members
Content-Type: application/json

{
  "email": "member@example.com",
  "role": "editor"
}
```

- `role` defaults to `editor`.
- The email match is case-insensitive.
- The target must already have a Better Auth user row.
- A successful request returns `201` and the member row.
- Adding an existing member returns `409` without changing the old role.
- An unknown email returns `404`.

This route does not create a pending invitation. It does not send an email.
Product copy must say "add member" unless an invitation workflow ships.

### Change a role

```http
PATCH /projects/{project}/members/{user}
Content-Type: application/json

{
  "role": "viewer"
}
```

- `{user}` is the target `usr_*` ID.
- A successful request returns `200` and the updated member row.
- Sending the current role succeeds without changing the row.
- Demoting the last owner returns `409`.
- An unknown target member returns `404`.

### Remove a member

```http
DELETE /projects/{project}/members/{user}
```

- A successful request returns `204`.
- Removing the calling owner when they are the last owner returns `409`.
- An unknown target member returns `404`.

## Error mapping

The route maps PostgreSQL failures through
`packages/api/src/lib/pg-error.ts`. The application error mapper is
`packages/api/src/middleware/errorMapper.ts`.

The current wire codes are generic and lowercase:

| Condition                             | Status | Wire code   |
| ------------------------------------- | -----: | ----------- |
| Caller is not an owner                |  `403` | `forbidden` |
| User or member is not found           |  `404` | `not_found` |
| Member already exists                 |  `409` | `conflict`  |
| Operation would remove the last owner |  `409` | `conflict`  |

The database messages `not_an_owner`, `user_not_found`,
`member_not_found`, `already_member`, and `last_owner` are not stable wire
codes. Clients must not branch on those messages.

## Database helpers

Migration `0014_better_auth_init.sql` defines these current helpers:

- `app.list_project_members(app.prj_id)`
- `app.add_project_member_by_email(app.prj_id, text, app.project_role)`
- `app.update_member_role(app.prj_id, app.usr_id, app.project_role)`

Migration `0001_init.sql` defines
`app.remove_project_member(app.prj_id, app.usr_id)`.

Each helper is `SECURITY DEFINER`, pins `search_path`, revokes `PUBLIC`, and
reads the caller from `current_setting('app.user_id')`.

`POST` is insert-only. It checks for an existing membership before the
insert. This prevents a repeated add from silently changing a role.

The role-update and removal helpers count owners before they remove an owner
role. They do not lock all project memberships while they count. Two
concurrent owner-demotion or owner-removal transactions can both observe the
old count. Serializing that invariant is an unresolved implementation gap.

## Account deletion

`DELETE /me` uses the current `app.delete_current_user()` definition from
migration `0022_r2_object_lifecycle.sql`. Migration
`0019_account_deletion.sql` contains the older definition.

The helper preserves shared project data:

- It deletes a project when the account is its only member.
- It removes the account from a shared project.
- It transfers `projects.owner_id` to an existing owner when possible.
- It otherwise promotes the oldest remaining member to owner.
- It retains reports and notes in shared projects.

The helper locks the affected project and membership rows before it chooses
solo projects and replacement owners. It also creates durable object-cleanup
jobs before it deletes the user.

See [`arch-auth-and-rls.md#account-deletion`](arch-auth-and-rls.md#account-deletion)
and [`arch-storage.md#account-deletion-cleanup`](arch-storage.md#account-deletion-cleanup).

## Tests

The current behavior has these primary test sources:

- `packages/api/src/__tests__/projects.integration.test.ts` covers member
  add, list, role change, removal, and last-owner cases.
- `packages/api/src/__tests__/member-role-permissions.integration.test.ts`
  covers the owner, editor, and viewer matrix across content routes.
- `packages/api/src/__tests__/scope/projects.scope.test.ts` covers scoped
  project visibility.
- `packages/api/src/__tests__/account-deletion.integration.test.ts` covers
  shared-project transfer behavior.

The member tests verify that adding an existing member cannot demote that
member. They do not prove the last-owner invariant under concurrent role
changes.

## Planned work

The repository does not implement these features:

- pending invitations for users without an account
- invitation email delivery and acceptance
- bulk member changes
- a serialized database invariant for concurrent owner changes

Treat these items as planned only after a design and implementation land.
