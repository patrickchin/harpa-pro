# 2026-07-28 — Membership collapsed project roles (Pattern R11)

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** A project member with the `viewer` role could call project-content
mutation endpoints directly. That included updating project metadata; creating,
editing, and deleting reports and their own notes; uploading project files;
running report generation; and finalizing or unfinalizing a report. An `editor`
could also finalize even though publication is owner-only.

**Root cause.** The database policies correctly used
`app.is_member(project_id)` to hide project rows from non-members, but several
route handlers treated that visibility check as the complete authorization
decision. Membership-only RLS therefore collapsed `owner`, `editor`, and
`viewer` into one write role. Existing integration tests primarily compared an
owner with a non-member, so they proved tenant isolation without proving the
role hierarchy inside a tenant.

**Fix.** Add a shared route-boundary authorization helper with two explicit
decisions: project writer (`owner | editor`) and project owner (`owner`). Apply
it before every project metadata, draft report, note, project-file, voice-note,
generation, finalization, and unfinalization mutation. Preserve the deliberate
any-member exceptions for append-only published-report review comments and PDF
export. The existing scoped database accessor remains the membership and
cross-project isolation boundary; this fix does not add a schema migration.

**Test.** `member-role-permissions.integration.test.ts` runs the real Hono
application against Testcontainers Postgres and exercises each operation as an
owner, editor, and viewer. The RED checkpoint showed the viewer receiving
success across every affected surface and the editor finalizing; the GREEN
checkpoint requires the documented matrix while retaining review/PDF
exceptions.

**Pattern.** New pattern **R11 — membership is mistaken for write
authorization**. Every new project-content mutation must state whether it
requires any member, a writer, or an owner, then include all three roles in its
integration coverage. Owner-versus-outsider coverage alone is not sufficient.
