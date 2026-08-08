# Design — Admin provider quota percentages

**Status:** Proposed. Deliver the Neon, R2, and GitHub changes as separate,
independently reviewable stacked pull requests against `dev`. This document
does not authorize a production deployment, provider-plan change, or provider
credential change.

## Goal

Add percentages to the administrator operations page where the page already
has enough documented evidence to calculate one safely. The operator should be
able to answer:

1. What percentage of each Neon Free project compute and storage allowance is
   used?
2. What percentage of the Neon Free organization's monthly public network
   transfer allowance is used?
3. What estimated percentage of the published R2 Class A and Class B monthly
   free-operation references is used?
4. What percentage of the current unauthenticated GitHub REST request bucket
   remains for this browser/IP?

These percentages are derived operational indicators. They are not invoices,
cash-credit balances, contractual guarantees, or permission to mutate a
provider resource. Unsupported remaining-credit values stay `Unknown`.

## Evidence classes

The UI must label every percentage by its evidence class:

- **Provider usage against a published allowance:** Neon Free compute, storage,
  and public network transfer.
- **Harpa estimate against a published reference:** R2 Class A and Class B
  operations.
- **Current API request budget:** GitHub's primary REST rate-limit bucket for
  this browser/IP.
- **Unknown:** provider cash credit, prepaid balance, invoice headroom, or any
  capacity without a documented read contract.

The page must not place all percentages under a generic `Credits remaining`
heading. The different accounting windows and confidence levels remain
visible.

## Official provider evidence

### Neon

Neon's current Free plan publishes these references:

- 100 CU-hours each month per project;
- 0.5 GB of storage per project; and
- 5 GB of public network transfer each month.

The organization detail endpoint returns the organization's current `plan`.
The project detail endpoint returns current usage metrics, including
`compute_time_seconds`, `synthetic_storage_size`, `data_transfer_bytes`,
`consumption_period_start`, and `consumption_period_end`.

`compute_time_seconds` counts CPU seconds across project computes, including
deleted computes, and resets at the start of each consumption period.
`data_transfer_bytes` counts project egress for the current consumption period,
includes deleted endpoints, may lag, and is available on all plans.
`synthetic_storage_size` is the current Postgres storage occupied by the
project, combining logical data and WAL across its branches. It is a snapshot,
not byte-hours.

References:

- [Neon pricing](https://neon.com/pricing)
- [Retrieve organization details](https://api-docs.neon.tech/reference/getorganization)
- [Retrieve project details](https://api-docs.neon.tech/reference/getproject)
- [Neon OpenAPI specification](https://neon.com/api_spec/release/v2.json)
- [Reduce network transfer costs](https://neon.com/docs/introduction/network-transfer)
- [Neon user permissions](https://neon.com/docs/manage/user-permissions)

The paid-plan consumption-history endpoint is not used. Neon documents that
endpoint for paid plans, while this feature is specifically about the Free
plan and must continue to work without a wider billing credential.

### Cloudflare R2

Cloudflare publishes a monthly Standard-storage free tier of 1,000,000 Class A
operations and 10,000,000 Class B operations. The existing R2 observer derives
successful Class A and Class B request counts from the documented
`r2OperationsAdaptiveGroups` dataset. That dataset can contain unclassified
operations and cannot prove storage-class eligibility, so the percentages are
always labelled `Estimated`.

[R2 pricing](https://developers.cloudflare.com/r2/pricing/) remains the source
for the operation classes and monthly references. The existing
[Admin R2 capacity design](design-admin-r2-capacity.md) remains authoritative
for credentials, query shape, classification, and caveats.

R2 storage does not get a percentage in this change. Current bytes are a
point-in-time snapshot, while the published allowance is GB-month calculated
from average daily peak storage. Dividing one by the other would create a false
remaining-capacity claim. Free operations, bucket count, object count, and
Infrequent Access usage also do not receive free-tier percentages.

### GitHub

GitHub returns `x-ratelimit-limit`, `x-ratelimit-remaining`, and
`x-ratelimit-reset` with REST responses. The value describes a primary request
bucket. Search, GraphQL, secondary limits, Actions minutes, storage, billing,
and plan credit are separate and are not inferred.

References:

- [REST API rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)
- [Rate-limit endpoint](https://docs.github.com/en/rest/rate-limit/rate-limit)

The existing public-repository observer continues to use response headers from
its final successful request. It does not add a `/rate_limit` request, token,
OAuth flow, or backend proxy.

## Percentage math

Use one pure, unit-tested presentation helper. Given non-negative `used` and a
positive `allowance`:

```text
raw used percentage = used / allowance * 100
shown used percentage = round raw used percentage to one decimal place
shown remaining percentage = round max(0, 100 - raw used percentage)
                             to one decimal place
```

The numeric used percentage may exceed 100.0 so an exceeded reference is not
hidden. A visual progress meter clamps only its painted width to 100%; its text
and accessible name retain the actual numeric value. Remaining percentage
floors at 0.0. Do not independently subtract an already-rounded used value.

The helper rejects non-finite values, negative values, a zero allowance, and
unsafe integers before division. The API contracts continue to carry raw usage
and allowance integers; the browser derives the display percentage so Neon,
R2, and GitHub use identical rounding.

## Neon Free-plan observation

### Route and credential boundary

Add a dedicated route:

```text
GET /admin/operations/neon-usage
```

Do not add a general provider-quota aggregation endpoint. The Neon route reuses
the existing paired server-only configuration:

- `ADMIN_NEON_VIEWER_API_KEY`; and
- `ADMIN_NEON_ORG_ID`.

No new Neon credential is introduced. In particular, do not add an
organization administrator key, reuse the CI branch-management key, scrape the
Neon Console, or call an undocumented API.

The route applies, in order:

1. `Cache-Control: private, no-store` before any rejection;
2. the shared trusted-Fly-IP administrator window;
3. the dedicated administrator cookie session; and
4. a separate 12-request-per-minute identity-and-session budget.

Anonymous callers, Better Auth sessions, legacy application-admin Bearer
tokens, and cross-origin requests fail before any Neon call. The browser calls
the route once after the dedicated session is confirmed and again only when
the operator presses **Refresh**. There is no polling, background refresh,
retry, or provider write.

### Fixed upstream plan

One observation uses only `https://console.neon.tech/api/v2`, one shared
10-second abort budget, `redirect: 'error'`, and no retry:

1. `GET /organizations/{orgId}`;
2. `GET /projects?org_id={orgId}&limit=20&timeout=5000`; and
3. `GET /projects/{projectId}` once for each verified returned project, in the
   provider's returned order.

The absolute ceiling is 22 requests. Project details are processed serially.
The route does not follow a project cursor. A cursor, provider-reported
unavailable project, deadline exhaustion, or failed detail makes the
observation partial rather than implying complete organization coverage.

The organization response must repeat `ADMIN_NEON_ORG_ID` and report the exact
normalized plan `free`. Any other plan returns `unknown/unsupported_plan`; the
server must not apply Free-plan references to Launch, Scale, legacy, or an
unrecognized plan.

Before project-detail calls, every discovered project must repeat the
configured organization ID and report
`effective_project_permission=VIEWER`. Missing permission evidence or
`EDITOR`/`ADMIN` fails the whole observation closed as
`unknown/unsafe_permissions`. This preserves the existing Neon inventory
credential contract.

Each detail response must repeat the requested project ID and configured
organization ID. All usage values must be non-negative safe integers.
Consumption timestamps must be valid and ordered. Invalid correlations are
`invalid_response`, never a partially trusted row.

### Neon calculations

For each verified Free-plan project:

- **Compute:** `compute_time_seconds` is used against the published
  100-CU-hour reference, represented as 360,000 CU-seconds.
- **Storage:** `synthetic_storage_size` is used against Neon's published
  0.5-GB-per-project reference, represented as 500,000,000 bytes. The UI labels
  this a published reference, not a provider-returned remaining value.
- **Transfer contribution:** `data_transfer_bytes` is retained as that
  project's contribution to organization public network transfer.

Do not substitute `branch_logical_size_limit_bytes` for the storage
denominator. Neon defines that field as a per-branch logical limit, while
`synthetic_storage_size` is a project value across branches. Those scopes are
not interchangeable.

Organization transfer is available only when all of these are true:

- project discovery is complete and has no continuation cursor;
- Neon reports no unavailable project IDs;
- every returned project detail is valid and available; and
- every project has identical `consumption_period_start` and
  `consumption_period_end` values.

Then sum `data_transfer_bytes` with safe-integer checks and compare the result
with the published 5 GB monthly Free reference, represented as
5,000,000,000 bytes. The UI labels this a `Published-reference percentage`
because Neon publishes the allowance in GB rather than returning an exact
organization allowance in bytes.

If coverage or period alignment is incomplete, organization transfer
percentage is `Unknown`. The page may show each verified project's raw
transfer contribution, but it must not show a remaining organization
percentage or call a partial sum complete.

### Neon response allowlist

The strict response contains only:

- observation time, `available`, `partial`, or `unknown` status, and a finite
  redacted reason;
- configured organization ID and exact `free` plan evidence;
- project count, truncation/unavailable counts, and consumption period;
- project ID and name;
- raw compute seconds and its 360,000-second published reference;
- current synthetic storage bytes and its 500,000,000-byte published
  reference;
- raw project transfer bytes; and
- complete organization transfer used/reference bytes when provable.

Do not return organization name or handle, member data, owner IDs, connection
URIs, proxy hosts, database names, roles, passwords, endpoints, IP allowlists,
settings, annotations, integration maps, application maps, raw provider
responses, response headers, or provider error bodies.

Finite unknown reasons are:

- `not_configured`;
- `unsupported_plan`;
- `unsafe_permissions`;
- `timeout`;
- `rate_limited`;
- `forbidden`;
- `not_found`;
- `invalid_response`; and
- `provider_unavailable`.

Available and partial observations include fixed caveats:

- `provider_values_may_lag`;
- `free_plan_published_reference`;
- `storage_uses_published_reference`;
- `transfer_requires_complete_project_coverage`;
- `not_invoice_or_credit_balance`; and
- `published_allowances_can_change`.

The admin page includes direct Neon pricing and Console links so the operator
can reconcile a surprising percentage with the provider.

## R2 operation percentages

Extend only the existing **R2 capacity** presentation. Do not add a provider
request or credential. For each available operation estimate, derive:

- estimated Class A used and remaining percentages from `estimatedUsed` and
  the literal 1,000,000-operation published reference; and
- estimated Class B used and remaining percentages from `estimatedUsed` and
  the literal 10,000,000-operation published reference.

Keep `Estimated` in the heading, visible text, and accessible name. If
`unclassifiedRequests` is non-zero, retain the existing partial state and state
that the shown used percentage excludes those requests. The UI must not call
the result eligible free-tier balance, exact remaining operations, invoice
headroom, or provider credit.

Do not add an R2 storage percentage. The storage snapshot and GB-month
allowance are intentionally incomparable in this design.

## GitHub request-budget percentage

Extend only the existing **GitHub public repository** presentation. After the
three existing serial public reads, calculate:

```text
remaining percent = remaining / limit * 100
used percent = (limit - remaining) / limit * 100
```

The parser must require integer `limit >= 1`, integer
`0 <= remaining <= limit`, and a valid positive reset timestamp. Missing,
malformed, or contradictory headers render `Request budget: Unknown` without
hiding otherwise valid branch or pull-request data.

Label this value `Primary public REST request budget for this browser/IP`.
Never label it GitHub plan usage, repository capacity, Actions allowance,
storage, billing credit, or account-wide quota. Secondary rate-limit headroom
remains unavailable because GitHub does not expose it.

The existing requests keep `credentials: 'omit'` and `cache: 'no-store'`.
No GitHub token, browser storage, cookie, backend secret, or additional request
is introduced.

## Unsupported credits remain Unknown

This feature does not infer a money or token balance for Neon, R2, Fly,
Cloudflare Pages, OpenAI, Groq, Kimi, Sentry, Resend, EAS, Apple, Google Play,
or any other linked service. The existing `Remaining provider credit: Unknown`
copy stays in place unless a later design identifies both:

1. a documented provider source for the exact value; and
2. a credential whose read scope is acceptable for the administrator API.

Neon Free resource percentages, R2 operation estimates, and GitHub request
budget are not exceptions to that credit rule; they are separately labelled
measurements.

## Administrator presentation

Use compact progress rows inside the existing provider cards. Each row shows:

- the evidence label;
- raw used and reference values with units;
- used and remaining percentages;
- the accounting period or reset time; and
- `Provider`, `Estimated`, `Published reference`, or `Unknown` confidence copy.

The meter must be keyboard-neutral, screen-reader labelled, and usable without
color. Threshold colors may supplement text but never replace it. Suggested
text states are under 75%, 75–89.9%, and at least 90%; these are display
warnings, not provider status changes. No notification, alert, or automatic
provider action is added.

Keep readiness, deployment identity, provider inventory, quota percentages,
and the cost-bearing report diagnostic visually distinct. A high percentage
does not make `/readyz` fail, and green readiness does not make quota healthy.

## TDD and verification

Each provider implementation starts with a valid RED checkpoint and lands its
minimal GREEN implementation in a later commit.

### Neon RED coverage

Tests must prove:

- strict available, partial, and unknown contracts and all field
  correlations;
- exact `free` plan gating and rejection of unsupported or malformed plans;
- `VIEWER` proof before details and rejection before any detail call;
- fixed origin, URLs, headers, redirect mode, shared abort signal, serial
  details, no retry, and the 22-call ceiling through default wiring;
- correct compute, storage, and complete-organization transfer references;
- transfer becomes unknown on pagination, unavailable projects, failed detail,
  period mismatch, overflow, or deadline exhaustion;
- provider lag, values above allowance, zero use, and one-decimal display math;
- rejection of every redacted provider field and raw error body;
- dedicated-cookie access, denial of anonymous/Better Auth/legacy-admin
  callers before provider access, no-store on `200`, `401`, and `429`, and the
  isolated 12-per-minute rate limit; and
- one load request, one request per **Refresh**, `401` sign-out, and no polling.

### R2 RED coverage

Tests must prove exact Class A/B percentage math at zero, fractional, full, and
over-reference values; remaining floors at zero; unclassified operations keep
the estimate partial; and no storage percentage or new provider request is
introduced.

### GitHub RED coverage

Tests must prove header parsing, `remaining <= limit`, fractional and exhausted
buckets, reset-time display, unavailable headers, rate-limit failures with
usable headers, unchanged three-request serial order, credentials omission,
and absence of a `/rate_limit` call.

Run API contract, env, observer unit and coverage, route integration/scope,
OpenAPI drift/codegen, API lint/typecheck, admin unit/coverage/lint/typecheck/
build, documentation links, and the root required gates under the repository's
pinned Node version. Before any merge, required checks and every applicable
`pr-N` Pages marker must name the exact pull-request head SHA.

## Pull-request stack and rollout

Keep the work reviewable as these narrow stacked changes:

1. design checkpoint: this document only;
2. Neon Free-plan usage route, contract, and card percentages;
3. R2 Class A/B presentation percentages only; and
4. GitHub public REST request-budget presentation percentage only.

Do not combine the three evidence classes into one observer or credential.
Each implementation pull request includes its own RED and GREEN checkpoints,
tests, documentation update, exact preview evidence, and rollback note.

Code may land with Neon and R2 observer variables absent; those cards remain
explicitly `Unknown` and make no provider request. No secret is provisioned by
these pull requests. Enabling a credential remains a separate operator action
with environment-specific deployment proof.

Rollback removes the affected percentage rows and, for Neon, its usage route.
It does not change a provider plan, project, branch, bucket, repository, token,
or billing setting. GitHub and R2 rollback requires no secret rotation because
this design adds no credential.
