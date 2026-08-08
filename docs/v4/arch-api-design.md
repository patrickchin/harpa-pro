# API design

> Status: implemented. The route modules and the generated OpenAPI document
> are the executable sources of truth.
>
> Companions: [`arch-auth-and-rls.md`](arch-auth-and-rls.md),
> [`arch-ai-fixtures.md`](arch-ai-fixtures.md),
> [`arch-rate-limiting.md`](arch-rate-limiting.md), and
> [`arch-storage.md`](arch-storage.md).

## Stack

- Hono handles HTTP routing.
- `@hono/zod-openapi` validates documented route inputs and generates
  OpenAPI 3.1.
- Zod schemas in `packages/api-contract` define shared wire types.
- Drizzle runs typed SQL through the scoped database accessor.
- Better Auth owns the `/api/auth/*` route family.

## Route inventory

The committed OpenAPI document is `packages/api-contract/openapi.json`.
Better Auth routes and the legacy programmatic admin routes are mounted at
runtime but are not part of that document.

### System and public routes

| Method | Path                                      | Purpose                                           |
| ------ | ----------------------------------------- | ------------------------------------------------- |
| `GET`  | `/healthz`                                | Process liveness and release identity             |
| `GET`  | `/readyz`                                 | Application database and migration-head readiness |
| `GET`  | `/admin/readyz`                           | Independent admin database readiness              |
| `GET`  | `/openapi.json`                           | Generated OpenAPI document                        |
| `GET`  | `/.well-known/apple-app-site-association` | Apple universal-link manifest                     |
| `GET`  | `/.well-known/assetlinks.json`            | Android app-link manifest                         |
| `POST` | `/waitlist`                               | Create or refresh a waitlist signup               |
| `POST` | `/waitlist/confirm`                       | Confirm a waitlist token                          |

### Application authentication

Better Auth mounts its handler at `/api/auth/*`. The application uses these
routes directly:

| Method | Path                                        | Purpose                                      |
| ------ | ------------------------------------------- | -------------------------------------------- |
| `POST` | `/api/auth/email-otp/send-verification-otp` | Send an email OTP                            |
| `POST` | `/api/auth/sign-in/email-otp`               | Verify an OTP and create a session           |
| `POST` | `/api/auth/sign-in/email`                   | Sign in an allow-listed test or demo account |
| `POST` | `/api/auth/sign-out`                        | Revoke the current session                   |

Better Auth can expose supporting plugin routes. Do not infer that every
library route is a supported product API.

### Current user

| Method   | Path                   | Purpose                                 |
| -------- | ---------------------- | --------------------------------------- |
| `GET`    | `/me`                  | Read the current profile                |
| `PATCH`  | `/me`                  | Update profile fields                   |
| `GET`    | `/me/deletion-preview` | Preview account-deletion effects        |
| `DELETE` | `/me`                  | Delete the current account              |
| `GET`    | `/me/usage`            | Read monthly usage summaries            |
| `GET`    | `/me/usage/events`     | Read paginated usage events             |
| `GET`    | `/me/limits`           | Read effective limits and current usage |

### Projects and members

`{project}` is the `prj_*` project ID. `{user}` is the `usr_*` user ID.

| Method   | Path                                 | Purpose                           |
| -------- | ------------------------------------ | --------------------------------- |
| `GET`    | `/projects`                          | List visible projects             |
| `POST`   | `/projects`                          | Create a project                  |
| `GET`    | `/projects/{project}`                | Read a project and its statistics |
| `PATCH`  | `/projects/{project}`                | Update project metadata           |
| `DELETE` | `/projects/{project}`                | Delete a project                  |
| `GET`    | `/projects/{project}/members`        | List members                      |
| `POST`   | `/projects/{project}/members`        | Add an existing user by email     |
| `PATCH`  | `/projects/{project}/members/{user}` | Change a member role              |
| `DELETE` | `/projects/{project}/members/{user}` | Remove a member                   |

See [`arch-project-members.md`](arch-project-members.md) for role behavior.

### Reports and review comments

`{number}` is the report number within one project. It is not a report ID.

| Method   | Path                                               | Purpose                                    |
| -------- | -------------------------------------------------- | ------------------------------------------ |
| `GET`    | `/projects/{project}/reports`                      | List project reports                       |
| `POST`   | `/projects/{project}/reports`                      | Create a draft                             |
| `GET`    | `/projects/{project}/reports/{number}`             | Read a report                              |
| `GET`    | `/projects/{project}/reports/{number}/debug`       | Read the last generation inputs and output |
| `PATCH`  | `/projects/{project}/reports/{number}`             | Update the draft date or body              |
| `PATCH`  | `/projects/{project}/reports/{number}/attachments` | Place a note attachment in the report body |
| `DELETE` | `/projects/{project}/reports/{number}`             | Delete a draft report                      |
| `GET`    | `/projects/{project}/reports/{number}/comments`    | List review comments                       |
| `POST`   | `/projects/{project}/reports/{number}/comments`    | Add a review comment                       |
| `POST`   | `/projects/{project}/reports/{number}/generate`    | Generate the report body                   |
| `POST`   | `/projects/{project}/reports/{number}/regenerate`  | Replace the generated report body          |
| `POST`   | `/projects/{project}/reports/{number}/finalize`    | Finalize a report                          |
| `POST`   | `/projects/{project}/reports/{number}/unfinalize`  | Return a report to draft state             |
| `POST`   | `/projects/{project}/reports/{number}/pdf`         | Render and store a PDF                     |

### Notes

`{report}` is the `rpt_*` report ID. `{note}` is the `not_*` note ID.

| Method   | Path                            | Purpose                                          |
| -------- | ------------------------------- | ------------------------------------------------ |
| `GET`    | `/reports/{report}/notes`       | List timeline notes                              |
| `POST`   | `/reports/{report}/notes`       | Create a note                                    |
| `POST`   | `/reports/{report}/notes/voice` | Transcribe, summarize, and create one voice note |
| `POST`   | `/notes/{note}/files`           | Append files to an image note                    |
| `PATCH`  | `/notes/{note}`                 | Update editable note fields                      |
| `DELETE` | `/notes/{note}`                 | Delete a note                                    |

### Files, voice, and settings

| Method  | Path                | Purpose                                   |
| ------- | ------------------- | ----------------------------------------- |
| `POST`  | `/files/presign`    | Create an upload lease and signed PUT URL |
| `POST`  | `/files`            | Register an uploaded object               |
| `GET`   | `/files/{id}/url`   | Create a signed GET URL                   |
| `POST`  | `/voice/transcribe` | Transcribe a scratch voice file           |
| `POST`  | `/voice/summarize`  | Summarize a transcript                    |
| `GET`   | `/settings/ai`      | Read the current AI selection             |
| `PATCH` | `/settings/ai`      | Update the AI selection                   |

### Short-link resolvers

| Method | Path           | Purpose                      |
| ------ | -------------- | ---------------------------- |
| `GET`  | `/p/{project}` | Resolve a project short link |
| `GET`  | `/r/{report}`  | Resolve a report short link  |

The resolver routes return scoped JSON, not an HTTP redirect. Project
responses contain `{ type: "project", projectId }`. Report responses also
contain `reportId` and `reportNumber`. A missing or cross-user target returns
`404`, and mobile performs the canonical navigation.

### Browser admin routes

The browser admin surface uses a dedicated admin identity and cookie.

| Method | Path                                | Purpose                               |
| ------ | ----------------------------------- | ------------------------------------- |
| `POST` | `/admin/auth/login`                 | Create an admin session               |
| `GET`  | `/admin/auth/session`               | Validate an admin session             |
| `POST` | `/admin/auth/logout`                | Revoke an admin session               |
| `GET`  | `/admin/activity`                   | Read the business-activity feed       |
| `GET`  | `/admin/operations/neon`            | Read bounded Neon inventory data      |
| `POST` | `/admin/operations/report-generate` | Run the fixed synthetic report canary |

`GET /admin/operations/neon` uses `withAdminSession()`. Better Auth and the
legacy application-admin bit cannot authorize it. The route uses the shared
trusted-Fly-IP admin budget and a 12-request-per-minute identity and session
budget. Every response sets `Cache-Control: private, no-store`.

The route accepts the optional `ADMIN_NEON_VIEWER_API_KEY` and
`ADMIN_NEON_ORG_ID` pair at the API runtime. If the pair is absent, it returns
a typed `Unknown` result without a provider call. A configured request lists
at most 20 projects and, for each project, a provider branch count plus at most
100 active branch details. It does not retry Neon requests.

The count endpoint has no deleted-branch selector. The active-detail request
explicitly excludes deleted branches. Clients must not present the bounded
active-detail list as the total count. The route returns no connection data,
provider error body, or billing-credit claim. Neon has no documented
remaining-credit API, so that value stays `Unknown`.

`POST /admin/operations/report-generate` is deliberately separate from the
read-only refresh path. It requires the dedicated admin cookie, an exact
trusted browser `Origin`, a session-derived `X-Admin-CSRF` token, the shared
trusted-IP budget, and a three-run-per-15-minute identity/session budget. It
accepts no target or provider input from the browser and returns
`Cache-Control: private, no-store` on success and rejection.

The route calls the real application HTTP endpoints using one fixed
allowlisted test account and pre-provisioned draft report. One run replaces
that synthetic report body, records one AI usage event, and attempts to revoke
its temporary application session immediately. Cleanup failure is explicit in
the observation. It is a bounded synthetic canary mutation, not a read-only
probe. It never creates an account, project, report, or note, and it never
exposes credentials, prompt content, report content, or raw provider errors. See
[`design-admin-report-generate-diagnostic.md`](design-admin-report-generate-diagnostic.md).

The following programmatic routes still use an application Better Auth
session plus `public.user.is_admin`. They are not part of the browser admin
session boundary or the generated OpenAPI document.

| Method   | Path                                | Purpose                |
| -------- | ----------------------------------- | ---------------------- |
| `GET`    | `/admin/waitlist.csv`               | Export waitlist rows   |
| `PATCH`  | `/admin/users/{id}/plan`            | Change a user plan     |
| `PUT`    | `/admin/users/{id}/limit-overrides` | Set limit overrides    |
| `DELETE` | `/admin/users/{id}/limit-overrides` | Remove limit overrides |

## Wire conventions

### Identifiers and paths

Primary IDs are prefixed slugs such as `usr_*`, `prj_*`, `rpt_*`, and
`not_*`. Reports also have a project-local integer number. Report detail and
report action routes use the project ID plus that number.

The file, note, and voice routes use entity IDs where the route tables show
them. Do not substitute the retired `/reports/{reportId}/generate` shape for
the current report action routes.

### Bodies and timestamps

Documented application bodies use JSON. Shared response schemas serialize
timestamps as ISO-8601 strings. Each route defines its own pagination and
response envelope in `packages/api-contract`.

### Authentication transport

Mobile and CLI clients send a Better Auth token in:

```http
Authorization: Bearer <session-token>
```

The browser admin sends the host-only `__Host-harpa_admin_session` cookie in
production. Local HTTP uses the unprefixed development cookie. The two
session types are not interchangeable.

### Authorization behavior

Authenticated handlers use `withAuth()` and call the scoped accessor from
`c.get('db')`. Content mutation routes commonly return `404` for a missing
project, a non-member, or an insufficient project role. Member-management
routes return `403` for an authenticated non-owner.

See [`arch-auth-and-rls.md`](arch-auth-and-rls.md) for the database boundary.

### Rate limiting

The API applies a global user or IP budget. AI, waitlist, and admin routes
also apply route-specific budgets. See
[`arch-rate-limiting.md`](arch-rate-limiting.md) for current values and
known gaps.

### Idempotency

These routes use the `Idempotency-Key` header:

- report generation and regeneration
- voice transcription
- the voice-note aggregator

Production stores claims in `app.idempotency_keys`. Local and test processes
can use the in-memory store. A completed response remains replayable for 24
hours.

The lease reduces duplicate work during retries. It is not an exactly-once
job system. A process pause or network partition can still allow two external
provider calls.

## Error envelopes

The application error mapper is
`packages/api/src/middleware/errorMapper.ts`. It returns this shape:

```json
{
  "error": {
    "code": "not_found",
    "message": "Not found."
  },
  "requestId": "..."
}
```

Current mapper codes are lowercase:

| Condition                       | Status | Code                   |
| ------------------------------- | -----: | ---------------------- |
| Zod error handled by the mapper |  `400` | `validation_error`     |
| Other bad request               |  `400` | `bad_request`          |
| Missing or invalid session      |  `401` | `unauthorized`         |
| Authenticated but forbidden     |  `403` | `forbidden`            |
| Monthly usage limit             |  `403` | `usage_limit_exceeded` |
| Hidden or missing resource      |  `404` | `not_found`            |
| Conflict                        |  `409` | `conflict`             |
| Rate limit                      |  `429` | `rate_limited`         |
| AI adapter failure              |  `502` | `ai_provider_error`    |
| Unhandled error                 |  `500` | `internal_error`       |

Better Auth owns its route responses. A Better Auth error does not
necessarily use the application mapper envelope.

## OpenAPI and generated clients

Use these commands after a route or shared schema changes:

```bash
pnpm spec:emit
pnpm --filter @harpa/api-contract gen:types
pnpm --filter @harpa/mobile gen:hooks
```

`scripts/check-spec-drift.sh` regenerates these artifacts and fails on a
diff. Commit all generated changes with the route change.

`packages/api/src/__tests__/contract.test.ts` checks three properties:

1. The generated document equals the committed document.
2. Each documented method and path has a registered Hono handler.
3. The document declares security schemes used by protected routes.

The contract test does not validate every live response against its OpenAPI
schema.

## Test gates

- `pnpm --filter @harpa/api test` runs unit tests.
- `pnpm --filter @harpa/api test:integration` runs Testcontainers and scope
  tests.
- `pnpm --filter @harpa/api test:coverage` merges both lanes and enforces 90
  percent line coverage.
- `scripts/check-scope-tests.sh` checks that each protected route module has
  a non-empty matching scope-test file. It does not inspect test behavior.
- `.github/workflows/ai-live.yml` runs selected tests against live AI
  providers. The ordinary API lanes use replay fixtures.

When behavior and this document disagree, use the route, shared schema, and
tests as evidence. Update the document in the same change.
