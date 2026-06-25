# Project Members — roles, invite, role-change, and removal

> **Status:** decided — implementation-ready.
>
> Companions:
> [`arch-api-design.md`](arch-api-design.md),
> [`arch-auth-and-rls.md`](arch-auth-and-rls.md),
> [`arch-database.md`](arch-database.md).
>
> Pitfalls addressed: [Pitfall 6](pitfalls.md#pitfall-6--per-request-db-scope-rls-replacement-added-late),
> [Pitfall 1](pitfalls.md#pitfall-1--p1-done-without-real-api-tests),
> [Pitfall 4](pitfalls.md#pitfall-4--big-features-stubbed-then-forgotten).

---

## 1. Design problem

The project-members surface has three routes: `GET`, `POST`, and `DELETE`
on `/projects/{project}/members` / `/projects/{project}/members/{user}`.
The `POST` route adds a new member **by phone number**.

The key bug this document was written to prevent: **a project owner can call
`POST /projects/{project}/members` with their own phone number and a
downgraded role (e.g. `viewer`), which—if the handler naively upserted—would
demote them from `owner`, potentially locking the project out of all
owner-only operations** (member management, project deletion). The current DB
helper `app.add_project_member_by_phone` already blocks re-invites with a
`23505` unique-violation (→ 409), but the protection is documented only in a
SQL comment, there is no `PATCH /projects/{project}/members/{user}` route for
legitimate role changes, no owner-demotion guard tests for that path exist,
and the stable error-code enum is not specified. This doc fills those gaps.

---

## 2. Roles

Three roles, enumerated in `app.project_role` (`owner | editor | viewer`).

| Role | Capabilities |
|------|-------------|
| `owner` | Full control: manage members (add/update/remove), update project metadata, delete project, finalize reports. At least one owner must exist at all times. |
| `editor` | Create, edit, and delete own notes; create draft reports; trigger generate/regenerate. Cannot manage members, delete the project, or finalize reports. |
| `viewer` | Read-only: list reports, view notes, download PDFs. Cannot write anything. |

### Role hierarchy enforcement summary

| Operation | Minimum caller role |
|-----------|-------------------|
| `GET /projects/{project}/members` | member (any role) |
| `POST /projects/{project}/members` | owner |
| `PATCH /projects/{project}/members/{user}` | owner |
| `DELETE /projects/{project}/members/{user}` | owner |

---

## 2.1 Account deletion

`DELETE /me` must preserve project-owner invariants while deleting the
current account:

- If the deleting account is the only member of a project, the project
  is deleted. Existing cascades remove reports, notes, member rows, and
  project-scoped file rows.
- If the deleting account owns a shared project and another owner
  remains, `projects.owner_id` transfers to the oldest remaining owner,
  then the deleting account's member row is removed.
- If the deleting account owns a shared project and no other owner
  remains, `projects.owner_id` transfers to the oldest remaining member
  and that member is promoted to `owner`.
- If the deleting account is an editor or viewer, only that member row
  is removed.

Reports and notes authored by the deleted account remain in shared
projects as project records for the remaining members. The deleted
account's profile, email, auth sessions, settings, usage events, and
owned file rows are removed by the auth/account-deletion path.

The implementation lives in migration
`packages/api/migrations/0019_account_deletion.sql` as
`app.delete_current_user()`. The route calls it through the normal
scoped `/me` accessor so `current_setting('app.user_id')` is the only
source of account identity.

---

## 3. Design notes (rejected alternatives)

- **POST upserts on conflict (rejected)** — would let an owner self-demote via the "invite" UX. Keep POST insert-only with 409 on conflict; "add" and "change role" stay distinct intents.
- **Block `owner` in the POST role field (rejected)** — multiple owners is a legitimate setup. Cleaner split: `POST` adds a new member at any role (no demote-vector since the row didn't exist); `PATCH` changes an existing member's role with a last-owner guard.
- **Self-demotion-only guard (rejected)** — insufficient: Alice could demote Bob (the only other owner) and then leave. The last-owner check fires for **any** `owner → <lower>` transition, regardless of whether the target is the caller.

---

## 4. Contract

### 4.1 Stable error codes

All member-operation errors use the `{ error: { code, message } }` envelope
defined in `arch-api-design.md`. The stable `code` strings for this surface:

| Code | HTTP | When |
|------|------|------|
| `MEMBER_EXISTS` | 409 | POST: the phone already belongs to a project member |
| `MEMBER_NOT_FOUND` | 404 | PATCH / DELETE: target `usr_*` is not a member of this project |
| `LAST_OWNER` | 409 | PATCH / DELETE: operation would leave zero owners |
| `NOT_AN_OWNER` | 403 | POST / PATCH / DELETE: caller's role is not `owner` |
| `USER_NOT_FOUND` | 404 | POST: phone number is not registered |

These are **additive** to the generic codes (`AUTH_INVALID_TOKEN`,
`VALIDATION_FAILED`, etc.) already defined in the error mapper
(`packages/api/src/lib/errors.ts`).

### 4.2 Zod schemas (`packages/api-contract/src/schemas/projects.ts`)

Existing schemas — no change required:

```ts
export const projectRole = z.enum(['owner', 'editor', 'viewer']);

export const projectMember = z.object({
  userId:      userId,
  displayName: z.string().nullable(),
  phone,
  role:        projectRole,
  joinedAt:    isoDateTime,
});

export const inviteMemberRequest = z.object({
  phone,
  role: projectRole.default('editor'),
});
```

New schema for PATCH:

```ts
export const updateMemberRoleRequest = z.object({
  role: projectRole,          // all three values valid; last-owner guard is server-side
});
```

### 4.3 Route shapes

#### `GET /projects/{project}/members`

- **Auth:** any member role.
- **Response 200:** `{ items: ProjectMember[] }` — ordered by `joined_at` ASC.
- **Response 404:** project not found or caller is not a member (indistinguishable per Pitfall 6).
- **Notes:** implemented; no change.

#### `POST /projects/{project}/members`

- **Auth:** owner only.
- **Request body:** `{ phone: E.164, role?: 'owner'|'editor'|'viewer' }`.
  `role` defaults to `'editor'`.
- **Response 201:** `ProjectMember` — the newly created row.
- **Response 403:** `NOT_AN_OWNER` — caller's role is not `owner`.
- **Response 404:** `USER_NOT_FOUND` — no account with that phone.
- **Response 409:** `MEMBER_EXISTS` — that phone already belongs to a project
  member (any role, including `owner`).
- **Notes:** DB-level enforcement via `app.add_project_member_by_phone`.
  The 409 is **not** an "invite already sent" state — it is a permanent
  "this person is already on the project" response. The mobile client should
  offer the user a direct link to the PATCH flow instead.

#### `PATCH /projects/{project}/members/{user}` ← **new**

- **Auth:** owner only.
- **Path params:** `project` = `prj_*`, `user` = `usr_*`.
- **Request body:** `{ role: 'owner'|'editor'|'viewer' }`.
- **Response 200:** `ProjectMember` — the member row after update.
  - If the new role equals the current role, the row is returned unchanged
    (idempotent — no DB write, no error).
- **Response 403:** `NOT_AN_OWNER` — caller's role is not `owner`.
- **Response 404:** `MEMBER_NOT_FOUND` — `user` is not a member of this
  project (or project does not exist / caller cannot see it).
- **Response 409:** `LAST_OWNER` — the role change would leave zero owners
  (`current_role = 'owner'` AND `new_role ≠ 'owner'` AND only one owner
  exists).
- **Idempotency:** Same-role PATCH is a valid no-op; the route returns 200 with
  the current row. Callers may retry safely.
- **Notes:** implemented via new `app.update_member_role` SECURITY DEFINER
  (§4.4 below). Owner cannot be forced below `owner` when they are the last
  owner—regardless of whether the target is the caller or another owner.

#### `DELETE /projects/{project}/members/{user}`

- **Auth:** owner only.
- **Response 204:** member removed.
- **Response 403:** `NOT_AN_OWNER`.
- **Response 404:** `MEMBER_NOT_FOUND`.
- **Response 409:** `LAST_OWNER` — cannot remove the last owner.
- **Notes:** implemented; `app.remove_project_member` already has the
  last-owner guard. No change required. Owner CAN remove themselves
  if at least one other owner exists.

### 4.4 New SECURITY DEFINER — `app.update_member_role`

**File:** new migration `packages/api/migrations/0002_update_member_role.sql`.

```sql
CREATE OR REPLACE FUNCTION app.update_member_role(
  p_project_id app.prj_id,
  p_user_id    app.usr_id,
  p_new_role   app.project_role
)
RETURNS TABLE (
  user_id      app.usr_id,
  display_name text,
  phone        varchar(32),
  role         app.project_role,
  joined_at    timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, auth, pg_temp AS $$
#variable_conflict use_column
DECLARE
  v_caller      app.usr_id := current_setting('app.user_id')::app.usr_id;
  v_cur_role    app.project_role;
  v_owner_count int;
BEGIN
  -- 1. Caller must be an owner of this project.
  IF NOT EXISTS (
    SELECT 1 FROM app.project_members pm
    WHERE pm.project_id = p_project_id
      AND pm.user_id = v_caller
      AND pm.role = 'owner'
  ) THEN
    RAISE EXCEPTION 'not_an_owner' USING ERRCODE = '42501';
  END IF;

  -- 2. Target must be an existing member (not just a registered user).
  SELECT pm.role INTO v_cur_role
  FROM app.project_members pm
  WHERE pm.project_id = p_project_id AND pm.user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'member_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- 3. Idempotency: same role is a no-op; skip the update.
  IF v_cur_role <> p_new_role THEN
    -- 4. Last-owner guard: demoting an owner requires at least one other owner.
    IF v_cur_role = 'owner' AND p_new_role <> 'owner' THEN
      SELECT count(*) INTO v_owner_count
      FROM app.project_members
      WHERE project_id = p_project_id AND role = 'owner';

      IF v_owner_count <= 1 THEN
        -- 23514 = check_violation (same ERRCODE as the last-owner check in
        -- remove_project_member — mapPgError maps it to 'conflict' → 409).
        RAISE EXCEPTION 'last_owner' USING ERRCODE = '23514';
      END IF;
    END IF;

    UPDATE app.project_members
    SET role = p_new_role
    WHERE project_id = p_project_id AND user_id = p_user_id;
  END IF;

  RETURN QUERY
    SELECT pm.user_id, u.display_name, u.phone, pm.role, pm.joined_at
    FROM app.project_members pm
    JOIN auth.users u ON u.id = pm.user_id
    WHERE pm.project_id = p_project_id AND pm.user_id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION app.update_member_role(app.prj_id, app.usr_id, app.project_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.update_member_role(app.prj_id, app.usr_id, app.project_role)
  TO app_authenticated;
```

**Error-code mapping** (extends `mapPgError` in `services/projects.ts`):

| SQLSTATE | Message text | Mapped category | HTTP |
|----------|-------------|-----------------|------|
| `42501` | `not_an_owner` | `forbidden` | 403 `NOT_AN_OWNER` |
| `P0002` | `member_not_found` | `not_found` | 404 `MEMBER_NOT_FOUND` |
| `23514` | `last_owner` | `conflict` | 409 `LAST_OWNER` |

The existing `mapPgError` already maps `42501 → 'forbidden'`, `P0002 →
'not_found'`, `23514 → 'conflict'`. The route handler translates those to the
new stable codes — no change to `mapPgError` is needed.

### 4.5 New service function (`services/projects.ts`)

```ts
export async function updateMemberRole(
  db: Db,
  projectId: string,
  targetUserId: string,
  newRole: ProjectRole,
): Promise<ProjectMemberRow> {
  const r = await db.execute<{
    user_id: string;
    display_name: string | null;
    phone: string;
    role: ProjectRole;
    joined_at: Date;
  }>(sql`
    SELECT * FROM app.update_member_role(
      ${projectId}, ${targetUserId}, ${newRole}::app.project_role
    )
  `);
  const row = r.rows[0];
  if (!row) throw new Error('update_member_role returned no row');
  return {
    userId:      row.user_id,
    displayName: row.display_name,
    phone:       row.phone,
    role:        row.role,
    joinedAt:    new Date(row.joined_at).toISOString(),
  };
}
```

### 4.6 New route handler (`routes/projects.ts`)

```ts
projectRoutes.openapi(
  createRoute({
    method: 'patch',
    path: '/projects/{project}/members/{user}',
    tags: ['projects'],
    security: [{ bearerAuth: [] }],
    middleware: [withAuth()] as const,
    request: {
      params: memberPathParams,
      body: {
        content: {
          'application/json': { schema: projectSchemas.updateMemberRoleRequest },
        },
      },
    },
    responses: {
      200: {
        description: 'Member role updated (or unchanged if already correct).',
        content: { 'application/json': { schema: projectSchemas.projectMember } },
      },
      401: { description: 'Unauthorized.',     content: { 'application/json': { schema: errorEnvelope } } },
      403: { description: 'Not an owner.',     content: { 'application/json': { schema: errorEnvelope } } },
      404: { description: 'Member not found.', content: { 'application/json': { schema: errorEnvelope } } },
      409: { description: 'Last owner.',       content: { 'application/json': { schema: errorEnvelope } } },
    },
  }),
  async (c) => {
    const userId  = c.get('userId');
    const db      = c.get('db');
    if (!userId || !db) throw new HTTPException(401);
    const { project: slug, user: target } = c.req.valid('param');
    const { role } = c.req.valid('json');
    const existing = await db((d) => getProjectBySlug(d, userId, slug, false));
    if (!existing) throw new HTTPException(404, { message: 'Project not found.' });
    try {
      const member = await db((d) => updateMemberRole(d, existing.id, target, role));
      return c.json(member, 200);
    } catch (err) {
      const cat = mapPgError(err);
      if (cat === 'forbidden') throw new HTTPException(403, { message: 'Owner only.' });
      if (cat === 'not_found') throw new HTTPException(404, { message: 'Member not found.' });
      if (cat === 'conflict')  throw new HTTPException(409, { message: 'Cannot demote the last owner.' });
      throw err;
    }
  },
);
```

### 4.7 Scope-test pairs (Pitfall 6)

Each test lives in `packages/api/src/__tests__/projects.integration.test.ts`
(extend the existing describe blocks). All use Testcontainers Postgres.

#### For `POST /projects/{project}/members`

| # | Scenario | Actors | Expected |
|---|----------|--------|----------|
| S1 | Owner A adds new user B as `editor` | A=owner, B=no existing membership | 201 `{ role: 'editor' }` |
| S2 | Owner A invites B who is not registered | A=owner, B=no auth.users row | 404 `USER_NOT_FOUND` |
| S3 | Owner A tries to add themselves (same phone) | A=owner | 409 `MEMBER_EXISTS` |
| S4 | Owner A adds already-member B again | A=owner, B=editor | 409 `MEMBER_EXISTS` |
| S5 | Editor B tries to add C | B=editor, C=new | 403 `NOT_AN_OWNER` |
| S6 | Owner A adds B as `owner` (co-owner) | A=owner, B=new | 201 `{ role: 'owner' }` |

#### For `PATCH /projects/{project}/members/{user}` ← new

| # | Scenario | Expected |
|---|----------|----------|
| P1 | Owner A promotes editor B to `owner` | 200 `{ role: 'owner' }` |
| P2 | Owner A demotes co-owner B (two owners) | 200 `{ role: 'editor' }` |
| P3 | Owner A tries to demote themselves, sole owner | 409 `LAST_OWNER` |
| P4 | Owner A tries to demote B who is sole owner | 409 `LAST_OWNER` |
| P5 | Owner A patches B with same role (idempotent) | 200 (no DB write) |
| P6 | Editor B tries to patch any member | 403 `NOT_AN_OWNER` |
| P7 | Owner A patches `usr_notamember` | 404 `MEMBER_NOT_FOUND` |
| P8 | Cross-project: owner A patches member in project C (not their project) | 404 (project invisible via RLS) |

#### For `DELETE /projects/{project}/members/{user}` (existing — verify no regression)

| # | Scenario | Expected |
|---|----------|----------|
| D1 | Owner A removes editor B | 204 |
| D2 | Owner A removes themselves (two owners) | 204 |
| D3 | Owner A removes themselves (sole owner) | 409 `LAST_OWNER` |
| D4 | Editor B tries to remove anyone | 403 `NOT_AN_OWNER` |

**Negative-control test** (Pitfall 6 "the wrapper is the thing protecting it"):
A direct SQL query _without_ `withScopedConnection` against
`app.project_members` must return rows from both projects (no filtering).
The same query _with_ `withScopedConnection` must return only rows visible to
the scoped user. Both live in `__tests__/scope/project-members.scope.test.ts`.

### 4.8 Maestro flow

File: `.maestro/flows/project-members.yaml`

Happy path:
1. Sign in as owner Alice.
2. Create project.
3. Invite Bob as `editor` → assert member list shows Bob.
4. Patch Bob to `owner` → assert member list shows Bob as `owner`.
5. Attempt to remove Alice (sole… then with Bob as co-owner) → assert 204 succeeds.

Edge cases (separate `project-members-edge.yaml`):
- Attempt PATCH with same role → UI shows no error, same role displayed.
- Attempt to demote sole owner → UI shows `AppDialogSheet` error (not
  `Alert.alert` — Pitfall 12). Error text includes "last owner".

---

## 5. Behaviour across all three mutating routes — decision table

| Caller role | Target state | Operation | Result |
|-------------|--------------|-----------|--------|
| owner | not yet a member | POST (any role) | 201 |
| owner | already a member (any role) | POST | 409 `MEMBER_EXISTS` |
| owner | existing member, different role, not last owner | PATCH | 200 updated |
| owner | existing member, same role | PATCH | 200 unchanged |
| owner | last owner → non-owner | PATCH | 409 `LAST_OWNER` |
| owner | existing member, not last owner | DELETE | 204 |
| owner | last owner | DELETE | 409 `LAST_OWNER` |
| editor / viewer | any | POST / PATCH / DELETE | 403 `NOT_AN_OWNER` |
| any | project not visible (not a member) | any | 404 |

---

## 6. OpenAPI spec impact

The new route adds one path to the frozen spec. Per AGENTS.md rule 3 and
[Pitfall 14](pitfalls.md#pitfall-14--cli--contract-path-drift), the
implementation commit must:

```bash
pnpm --filter @harpa/api spec:emit
pnpm --filter @harpa/api-contract gen:types
pnpm --filter @harpa/cli build   # verifies the CLI consumer compiles
```

The CI spec-drift gate (`scripts/check-spec-drift.sh`) will catch any miss.

---

## 7. Mobile client considerations

The mobile Members screen (`app/(app)/projects/[project]/members.tsx`) should:

1. After receiving `409 MEMBER_EXISTS` on invite, surface a toast:
   _"[Name] is already a member. To change their role, tap their name."_
   — uses `useAppDialogSheet()` (not `Alert.alert`; AGENTS.md rule 4).
2. Provide a role-picker sheet (e.g. `RolePicker` bottom-sheet) reachable
   from the member row; calls `PATCH /projects/{project}/members/{user}`.
3. After receiving `409 LAST_OWNER` on PATCH or DELETE, surface:
   _"You can't remove the only owner. Promote another member first."_
4. The `role` field in `ProjectMember` is the source of truth for what the
   current user can do — the members screen and project header should derive
   write-access state from `myRole === 'owner'` in the `Project` object, not
   from a separate flag.

---

## 8. Pitfall mitigations

| Pitfall | Risk on this surface | Mitigation |
|---------|---------------------|------------|
| **Pitfall 1** — no real API tests | PATCH route could ship without scope tests | P1-style gate: PATCH route commit includes scope tests S1–S8 + negative-control; CI check-scope-tests.sh grep enforced |
| **Pitfall 4** — big features stubbed | PATCH route could be added as a stub with `throw new Error('not implemented')` | Zero-stub gate already in `p1-exit-gate.yml`; PATCH commit is one route + one migration + tests |
| **Pitfall 6** — per-request scope missing | PATCH handler could call `updateMemberRole` outside `withScopedConnection` | ESLint `no-restricted-imports` bans raw `db` import; handler uses `c.get('db')(fn)` |
| **Pitfall 12** — `Alert.alert` for dialogs | LAST_OWNER error surfaced via native alert | ESLint `no-restricted-imports` on `react-native#Alert`; use `useAppDialogSheet()` |
| **Pitfall 14** — CLI/contract drift | New route missing from OpenAPI spec | spec:emit + gen:types + CLI build in same commit; check-spec-drift.sh gates merge |

---

## 9. Carve-outs

The following are explicitly **not** in scope for this design and must be
picked up in their named plan tasks:

| Carve-out | Where to pick up |
|-----------|-----------------|
| **Transferring `projects.owner_id`** — the "created by" column is not the same as the `owner` role in `project_members`. Renaming a project's "original creator" is not yet exposed. | Pick up in P3 members screen if the UX requires it; add a `PATCH /projects/{project}` field `ownerId`. |
| **Invitation flow for unregistered phone** — today POST returns 404 if the phone is not in `auth.users`. A full invitation flow (SMS link, pending invite row) is a separate feature. | Record as a deferred feature in `plan-p5-beta-ga.md §invitations`. |
| **Bulk role changes** — e.g. "promote all editors to owners". Not needed in P3. | Defer to post-GA if ever needed. |
| **Viewer-can-invite toggle** — a project setting to allow non-owners to invite. | Defer; would require a new `project_settings` row and RLS policy changes. |
