# Admin report-generation diagnostic

> Status: design approved for implementation on the
> `codex/admin-report-diagnostic` stack. The diagnostic is disabled until an
> operator separately provisions its synthetic account and report target.

## Goal

Give a dedicated administrator one manual, bounded check that proves the real
report-generation API path still works. The check must exercise application
authentication, project write authorization, usage limits, AI generation,
report persistence, and cleanup without exposing credentials, prompts,
responses, or customer data in the browser-admin surface.

This is not a general API console. The browser cannot choose an account,
project, report, provider, model, fixture, URL, request body, or header.

## Important write boundary

The infrastructure inventory remains read-only. Report generation itself is
not read-only: the real endpoint updates a report and inserts an AI usage row.
The diagnostic is therefore a bounded synthetic canary mutation, not a
read-only observation.

Each deliberate run may write only:

- one temporary Better Auth application session, revoked at the end;
- one replacement body and generation-debug record on one pre-provisioned
  draft canary report; and
- one `app.llm_usage_events` row.

The route never creates projects, reports, notes, files, or accounts. It never
touches a customer-selected target. It does not run on page load, on the shared
operations refresh, on a timer, or in the background.

## User journey

As a dedicated administrator, I can click **Run diagnostic** and receive a
sanitized pass, warning, failure, or not-configured result so that I can tell
whether the real report-generation endpoint is operational without learning
or transmitting the canary credential or synthetic report content.

## Target identity and report

Use one dedicated application test identity, recommended as
`report-canary@e2e.harpapro.com`. It must be an exact member of
`TEST_ACCOUNT_EMAILS`, use the existing `TEST_ACCOUNT_PASSWORD`, and own or
edit one synthetic project. Do not reuse a demo identity, administrator
identity, operator account, or customer account.

The operator separately provisions one fixed draft report with one or more
short synthetic text notes. The report must remain a draft. Steady-state runs
reuse that row and never add setup data.

The observer is enabled only when all three non-secret target values are
present and valid:

- `ADMIN_REPORT_DIAGNOSTIC_EMAIL`;
- `ADMIN_REPORT_DIAGNOSTIC_PROJECT_ID`; and
- `ADMIN_REPORT_DIAGNOSTIC_REPORT_NUMBER`.

The email must be present in `TEST_ACCOUNT_EMAILS`; the existing paired
`TEST_ACCOUNT_PASSWORD` supplies the server-only password. Partial target
configuration or a non-test email fails API boot. When the three target values
are absent, the route returns typed `unknown/not_configured` and makes no
outbound request.

## Endpoint

Add:

```text
POST /admin/operations/report-generate
```

The body is empty. Target selection is server-owned configuration. The route
returns `Cache-Control: private, no-store` on success and every rejection.

Middleware order is:

1. private/no-store response policy;
2. exact configured admin `Origin` check;
3. trusted Fly client-IP admin budget;
4. `withAdminSession()` using the dedicated admin cookie;
5. per-session CSRF validation; and
6. a dedicated three-runs-per-15-minutes identity/session budget.

Application Bearer tokens, Better Auth cookies, legacy application-admin
claims, missing origins, and untrusted origins do not authorize this route.
The application-wide limiter continues to skip `/admin/operations`; the
dedicated admin limiter and the real report endpoint's own user/AI budgets are
authoritative.

## CSRF contract

This is the first admin state-changing route other than logout, so exact
origin validation is necessary but not sufficient for the reviewed design.
Add a per-session custom-header token.

The API derives a 32-byte HMAC token from the opaque 256-bit admin session
token using a fixed, versioned domain string. The raw HttpOnly session token
is the HMAC key and never leaves the cookie boundary. Successful admin login
and session lookup return only the base64url HMAC value as `csrfToken`.

The browser keeps `csrfToken` in memory and sends it only as
`X-Admin-CSRF` on the diagnostic request. The server validates its exact shape
and uses a constant-time comparison against a fresh derivation from the admin
session cookie. Session rotation, revocation, expiry, or cookie removal also
invalidates the CSRF token. No new database column or long-lived browser
storage is needed.

Admin CORS adds only `X-Admin-CSRF` to its existing exact-origin custom-header
allowlist. The value must never be logged.

## Execution sequence

The API uses `BETTER_AUTH_URL` as the fixed origin and one overall abort
deadline. It performs no retry.

1. `POST /api/auth/sign-in/email` with the configured test email and existing
   server-only test password.
2. Read `set-auth-token`; reject any missing or malformed token.
3. `GET /projects/{project}/reports/{number}` with the Bearer token. Require
   the configured project ID, report number, and `draft` state. Capture the
   current `updatedAt` precondition.
4. `POST /projects/{project}/reports/{number}/generate` with the Bearer token,
   `expectedUpdatedAt`, and an idempotency key derived from the fixed target
   and captured version. Do not send `fixtureName`; `AI_LIVE` remains
   server-owned.
5. `GET /projects/{project}/reports/{number}/debug`. Strictly validate the
   response, confirm a matching persisted generation, retain only vendor,
   model, fixture mode, and timestamps, then discard all prompt, note, report,
   and response content.
6. `GET /me/limits` and retain only `report_generate`, `ai_input_tokens`, and
   `ai_output_tokens` bucket metadata.
7. In `finally`, `POST /api/auth/sign-out` with `{}` and the Bearer token.

The overall deadline is 75 seconds. It covers login through cleanup. A single
`AbortController` owns the deadline. There is no per-step retry, fallback
target, or direct service call. Calling the real HTTP routes is the point of
the diagnostic.

## Observation contract

Add a strict `operations.reportGenerateDiagnosticObservation` union.

Common fields:

- `observedAt` — ISO timestamp produced by the admin route;
- `status` — `pass | warning | fail | unknown`; and
- `durationMs` — bounded whole-run duration when execution started.

`unknown` contains only `reason: not_configured`.

`pass` and `warning` contain:

- `target`: configured test email, project ID, returned report ID, and report
  number;
- `generation`: HTTP status, request ID when present, generation latency,
  persisted request/finish/report timestamps, vendor, model, fixture mode,
  and whether the report endpoint replayed its idempotency result;
- `limits`: plan plus the three allowlisted effective usage buckets; and
- `cleanup`: whether sign-out succeeded.

`warning` also contains a non-empty, unique array drawn from:

- `replay_only` — endpoint/persistence worked but no live provider was called;
- `limits_unavailable` — generation proof passed but limit readback failed;
  and
- `sign_out_failed` — generation proof passed but session cleanup was not
  confirmed.

`fail` contains the failed phase, redacted reason, duration, and cleanup state.
Allowed phases are `sign_in`, `target_read`, `generate`, `proof_read`,
`limits`, and `sign_out`. Allowed failure reasons are:

- `sign_in_failed`;
- `target_not_found`;
- `target_not_draft`;
- `conflict`;
- `usage_limit_exceeded`;
- `rate_limited`;
- `provider_error`;
- `timeout`;
- `invalid_response`; and
- `upstream_unavailable`.

Provider bodies and arbitrary exception text never become a reason.

## Redaction and logging

Neither the response nor structured logs may contain:

- the test password, Bearer token, application session cookie, admin cookie,
  or CSRF token;
- prompt text, notes, transcripts, report body, raw model response, or debug
  payload;
- provider error bodies or arbitrary upstream messages;
- any `Set-Cookie` or `set-auth-token` value; or
- user/profile details beyond the configured synthetic email and fixed target
  identifiers.

Audit output is metadata-only: admin request ID, admin identity/session IDs,
phase, sanitized outcome, duration, target project/report number, and provider
metadata only after strict validation. It must not serialize response objects.

## UI

Add a separate **Report generation diagnostic** card to `/operations`.

- Initial state: `Not run yet in this browser session.`
- Button: `Run diagnostic`.
- Running state disables the button and announces progress with
  `aria-live="polite"`.
- Pass shows live/replay mode, provider/model, timestamps, latency, target,
  effective test-account quota, and confirmed sign-out.
- Warning preserves successful generation proof and lists only reviewed
  warning copy.
- Failure shows the failed phase and reviewed reason copy, never a raw error.
- `401` returns the whole page to its signed-out state.
- `403` distinguishes rejected CSRF/origin from a provider failure without
  exposing which check rejected it.

The shared **Refresh** button continues to refresh only read-only health and
inventory data. It must not run or clear this canary.

The card states that each click updates one synthetic report and may consume
AI quota. It must not describe the action as read-only.

## Test contract

### Shared contract and environment

- Accept every valid pass, warning, fail, and unknown variant.
- Reject extra fields, raw content, credentials, invalid enums, duplicate
  warnings, malformed IDs/timestamps, and inconsistent pass/warning states.
- Accept all-absent target config.
- Accept a complete target only when its email is in `TEST_ACCOUNT_EMAILS`.
- Reject every partial target, blank value, malformed project ID/report number,
  and non-test-account email.

### API client and route

- Unknown/unconfigured makes zero outbound requests.
- Default wiring uses `BETTER_AUTH_URL`, global `fetch`, the existing test
  password, exact HTTP methods/paths, Bearer token, version precondition, and
  scoped idempotency key.
- The real route path is exercised without replacing the runner factory.
- Anonymous, application Bearer, Better Auth cookie, legacy app-admin, missing
  origin, untrusted origin, missing CSRF, and invalid CSRF are rejected.
- Dedicated admin cookie plus trusted origin plus valid CSRF is accepted.
- Each upstream status maps to the reviewed reason; raw bodies never escape.
- Timeout aborts the whole run once and never retries.
- Sign-out is attempted after every post-login result.
- Replay, limit-read failure, and sign-out failure produce reviewed warnings.
- Console-capture tests use sentinel secrets/content and prove no leak.
- The dedicated 3/15-minute budget is isolated from Neon reads and the global
  application limiter.

### Admin browser

- Initial state makes no diagnostic request.
- Shared refresh makes no diagnostic request.
- Manual click sends credentialed/no-store `POST` with the current
  `X-Admin-CSRF` token and no body-selected target.
- Button disables while running and cannot double-submit.
- Pass, warning, fail, unknown, rate-limit, and session-expiry states render
  reviewed copy.
- No response content, credential, or raw provider message is rendered or
  stored.

Coverage for changed executable files must remain above 80%, and the API's
merged line coverage must remain above its 90% repository gate.

## Rollout

1. Merge code with target variables absent. The card remains manual and
   reports `Not configured`; no application request is made.
2. Separately create the synthetic user/project/report/note and add the user
   to `TEST_ACCOUNT_EMAILS`.
3. Provision the three target values in development only.
4. Run once on development and prove the route observation, application usage
   row/report timestamps, no secret/content logs, and exact deployed SHA.
5. Decide separately whether production should have a live canary target.

This PR does not create accounts, application rows, or secrets and does not
enable the canary in any environment.
