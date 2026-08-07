# Design — Admin Neon inventory

**Status:** Implemented in this independent pull request against `dev`. Live
provider access remains disabled until the optional credential pair is
separately provisioned.

## Goal

Extend the standalone admin operations page with read-only Neon inventory for
the Harpa Pro organization. An administrator should be able to see every
project visible to the configured observer, the exact current branch count for
each project, and a bounded list of branch metadata without opening the Neon
console.

This is provider metadata, not Harpa readiness and not billing evidence. The
page must keep `/readyz` and `/admin/readyz` visually separate. Neon does not
document a remaining-credit API, so remaining Neon credit stays `Unknown` and
the existing console link remains the billing source.

## Credential boundary

The API uses two optional server-only variables:

- `ADMIN_NEON_VIEWER_API_KEY` is a personal API key for a dedicated Neon user.
- `ADMIN_NEON_ORG_ID` restricts discovery to the Harpa Pro organization.

They must be set together. The API must never reuse the GitHub Actions
`NEON_API_KEY`; that key manages preview branches and connection URIs and is
intentionally absent from the Fly runtime.

Neon documents that a personal key inherits its user's permissions and that a
`Viewer` has read-only access to organization and project metadata. The
observer must therefore have organization role `Viewer`, or role
`Collaborator` plus explicit project-level `Viewer` grants. Neon does not
document a viewer-only service-account key, so provisioning the dedicated user
and personal key remains an explicit operator action.

The route verifies the provider response before returning inventory:

- every project must belong to `ADMIN_NEON_ORG_ID`; and
- every project must report `effective_project_permission=VIEWER`.

If Neon omits that evidence or reports `EDITOR` or `ADMIN`, the route fails
closed as `Unknown` and performs no branch calls. Intentional use of `GET`
alone is not accepted as proof that a credential is read-only.

References:

- [Neon user permissions](https://neon.com/docs/manage/user-permissions)
- [Neon API keys](https://neon.com/docs/manage/api-keys)
- [List projects](https://api-docs.neon.tech/reference/listprojects)
- [List branches](https://api-docs.neon.tech/reference/listprojectbranches)
- [Count branches](https://api-docs.neon.tech/reference/countprojectbranches)

## API contract

Add `GET /admin/operations/neon` to the existing dedicated browser-admin
surface. It uses:

1. the shared trusted-Fly-IP admin budget;
2. `withAdminSession()`; and
3. a per-identity/session budget of 12 requests per minute.

The response always sets `Cache-Control: private, no-store`. There is no
server cache, background refresh, polling, retry loop, or write path. Page load
and the existing manual Refresh button are the only callers.

The route is exempt from the application-wide limiter because its two budgets
use the physically separate admin limiter/database. The no-store middleware
runs before both admin budgets and session authentication, so successful,
unauthorized, and rate-limited responses retain the same cache policy.

An available or partial response contains only this allowlist:

- observation time, provider status, truncation flags, and unavailable counts;
- project ID, name, region, Postgres version, timestamps, and confirmed
  effective permission; and
- Neon-reported total branch count plus branch ID, name, parent ID, current state,
  default/protected flags, and timestamps for a bounded detail list.

Do not return connection URIs, endpoints, proxy hosts, owner IDs, database
roles, passwords, annotations, integration maps, application maps, raw provider
responses, or raw provider error bodies.

When the observer is not configured, top-level discovery fails, or the
credential is not proven viewer-only, return a typed `Unknown` observation.
When project discovery succeeds but one project's branch calls fail, retain
the safe project facts and return a typed partial observation with a redacted
reason code.

A branch detail must repeat the project ID that was requested. A missing or
different `project_id` is an invalid provider response for that project's
detail observation and is never mapped into the outward contract.

## Upstream bounds

Use the official `https://console.neon.tech/api/v2` origin only:

- list at most 20 projects for the configured organization with Neon's
  five-second provider timeout;
- for each project, retrieve Neon's exact reported branch count and at most 100
  active branch details, explicitly excluding deleted branches from the detail
  request; and
- enforce one ten-second overall abort budget, process projects serially, and
  make at most the count and list calls concurrently within one project.

Neon's count endpoint does not expose the detail endpoint's `include_deleted`
selector, so the UI must not imply that the count and active-detail list use
identical deleted-branch semantics. If Neon returns a project cursor or a
branch cursor after those limits, mark that list as truncated rather than
implying completeness. A `429`, timeout,
forbidden response, invalid provider shape, or other upstream failure maps to a
small enumerated reason. No provider text crosses the API boundary.

## Admin presentation

Add a distinct **Neon inventory** section to `/operations` with these states:

- loading;
- available, including total visible projects and one project card each;
- partial, preserving verified facts and identifying unknown branch detail;
- empty; and
- `Unknown`, with a safe configuration/provider explanation and the Neon
  console link.

Each project card shows its ID, creation and update times, the
provider-reported branch-count badge, and a bounded scrolling list of the
returned active branch details. Each branch row includes its own ID and
timestamps so the operator can reconcile it with the provider console. The UI
labels a truncated detail list, keeps the count/list semantics explicit, and
shows the observation time. It does not label project or branch metadata as
deployment proof, health, quota, or remaining credit.

## Verification

Tests must prove:

- the API contract schemas accept available, partial, and unknown observations
  and reject leaked provider fields;
- a real dedicated admin cookie can call the route, while anonymous, Better
  Auth, and legacy app-admin sessions cannot;
- default route wiring performs the expected outbound Neon `GET` calls with
  the viewer key in the authorization header, while the response omits it;
- missing configuration and non-`VIEWER` permission fail closed before branch
  calls;
- upstream failures are redacted and partial branch failures preserve only
  verified project facts;
- rate limiting, overall bounds, no-store headers, and pagination truncation
  remain enforced; and
- the admin component covers loading, available, partial, empty, unknown,
  refresh, sign-out, expired-session rejection, identifiers and timestamps,
  and credentialed/no-store request behavior.

Run the API unit, integration, scope, contract, lint, typecheck, and coverage
lanes plus the admin unit, lint, typecheck, build, and coverage lanes. Before
merge, the protected checks and the `pr-N` admin deployment marker must both
name the exact pull-request head SHA.

## Rollout and rollback

The code may merge while the observer variables are absent; the feature then
renders an explicit `Unknown` state and makes no Neon request. Enabling live
inventory requires separately creating the viewer principal/key and adding the
two variables to the intended Doppler configurations. Do not copy the CI key.

Rollback removes the route, UI section, and two optional variables. It does
not change a Neon project, branch, database, or migration. Revoke the dedicated
personal key separately if the feature is retired.
