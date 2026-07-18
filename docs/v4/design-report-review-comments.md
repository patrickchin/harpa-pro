# Design — Published report review comments

Status: approved for implementation.

## Problem

Finalized reports currently remove the tab bar and show only the report.
Project members need a separate place to review the published report and leave
feedback without changing the report body or its source notes. The report
header also keeps its title in the same row as navigation controls, truncating
long titles on a phone.

## User journeys

- A project member opens a finalized report and sees the existing report on
  the default `Report` tab.
- The member opens `Review`, reads the report discussion, and adds a comment.
- Any current project member, including a viewer, can read and add review
  comments. A non-member cannot discover the report or its comments.
- A long report title appears below the navigation controls, uses the full
  content width, and wraps instead of being ellipsized.

## Product decisions

- Draft reports keep their existing `Report` and `Notes` tabs. Review is a
  published-report workflow and appears only while the report is finalized.
- Finalized reports show exactly two tabs: `Report` and `Review`. `Report` is
  selected whenever the screen opens or a draft becomes finalized.
- Review comments are separate from `app.notes`. Posting a comment must not
  update `reports.body`, `notes_changed_at`, `generated_at`, or the report's
  `updated_at` timestamp.
- Comments are append-only in this iteration. Editing, deleting, mentions,
  reactions, and section-level annotations are out of scope.
- Existing comments remain stored if a report is unfinalized, but review APIs
  return a conflict until it is finalized again.

## API contract

Add two authenticated endpoints under the canonical report path:

| Method | Path | Result |
|---|---|---|
| `GET` | `/projects/{project}/reports/{number}/comments` | `{ items: ReportComment[] }` in oldest-first order |
| `POST` | `/projects/{project}/reports/{number}/comments` | Creates one comment and returns it with `201` |

`ReportComment` contains `id`, `reportId`, `authorId`,
`authorDisplayName`, `body`, and `createdAt`. The create body is
`{ body: string }`; it is trimmed and constrained to 1–2,000 characters.

Both handlers first resolve the `(project, number)` pair through the existing
scoped `loadReport` path. Missing or RLS-hidden reports return `404`; draft
reports return `409`; invalid bodies return `400`; missing authentication
returns `401`.

The OpenAPI document, generated TypeScript paths, mobile hook table, and
mutation invalidation map stay in lock-step. A successful create invalidates
the `reportComments` query key.

## Database and access control

Migration `0020_report_review_comments.sql` adds:

- the `app.rcm_id` prefixed-ID domain;
- `app.report_comments(id, report_id, author_id, body, created_at)`;
- an index on `(report_id, created_at, id)`;
- RLS policies allowing current project members to select and insert, with an
  insert check that pins `author_id` to `app.user_id`.

IDs are minted through the shared `newId('rcm')` path. Comment reads join the
author's current profile name through a narrowly-scoped `SECURITY DEFINER`
function. This is necessary because better-auth's `public."user"` RLS exposes
only the caller's own profile row. The function resolves only comments already
visible through report membership and exposes no email or other profile data.

The table cascades on report and author deletion. This aligns report deletion
with existing notes and ensures account deletion cannot leave orphaned review
content.

## Mobile design

`SavedReport` remains a props-only screen body. The route owns the generated
comment query/mutation hooks and passes comment rows, loading/error/submitting
state, and an async add callback into the screen.

`ReportDetailTabBar` supports finalized `Report` / `Review` labels while
retaining draft `Report` / `Notes` behavior. The review pane contains:

- a loading state and retryable error state;
- an empty state explaining that no review comments exist yet;
- comment cards with member name, timestamp, and body;
- a multiline composer and `Add comment` button, disabled for whitespace or
  while a mutation is pending.

The composer clears only after the add callback succeeds. Mutation errors stay
visible beside the composer so typed text is not lost.

The saved-report header opts into a stacked `ScreenHeader` layout. Navigation
and action controls remain on the first row. The title moves to its own row,
has no `numberOfLines` or tail ellipsis, and occupies the full content width.
The default one-line `ScreenHeader` behavior remains unchanged elsewhere.

## Verification

- Contract tests cover comment schemas, trimming, and length limits.
- Testcontainers integration tests prove owner/viewer read-write access,
  cross-project denial, draft conflict, validation, chronological reads, and
  the inverse assertion that posting does not dirty or update the report.
- Mobile behavior tests prove finalized tab defaults and switching, review
  empty/populated/loading/error states, successful and failed submission, and
  the non-truncating stacked title.
- The existing Maestro finalize flow adds a review comment and observes it
  after the mutation refresh.
- Run focused mobile/API tests, package typechecks and lint, contract/codegen
  drift checks, and the relevant coverage gates. Maestro is updated but only
  run when the user authorizes the device E2E suite.

