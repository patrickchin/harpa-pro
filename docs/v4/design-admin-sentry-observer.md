# Design — Admin Sentry observer

**Status:** Draft for an unmerged stacked pull request. This change does not
provision or enable a Sentry observer credential.

## Goal

Add a bounded, read-only Sentry card to the dedicated administrator operations
page. The card answers two questions:

1. How many unresolved Sentry error issue groups are visible for the reviewed
   Harpa projects and environment?
2. How many mobile sessions did Sentry classify as healthy, errored, abnormal,
   or crashed during the last 24 hours?

The card must not call an issue group a single error event. It must not call a
crashed session an unresolved issue. It must not expose issue details, event
data, people, project names, or provider diagnostics.

## Provider evidence and limits

This design uses only documented Sentry API surfaces:

- [List an organization's issues](https://docs.sentry.io/api/events/list-an-organizations-issues/)
  returns issue groups. The endpoint supports project, environment, query,
  sort, limit, collapse, and cursor values.
- [Retrieve release health session statistics](https://docs.sentry.io/api/releases/retrieve-release-health-session-statistics/)
  returns session totals and supports `session.status` grouping.
- [Pagination](https://docs.sentry.io/api/pagination/) defines the `Link`
  header and its `rel="next"; results="true"` signal.
- [Permissions and scopes](https://docs.sentry.io/api/permissions/) assigns
  `event:read` to issue GET requests and `org:read` to organization GET
  requests.
- [The API reference](https://docs.sentry.io/api/) documents the global, US,
  and DE API domains.

The issue endpoint returns issue groups, not events. One group can contain many
events. A zero group count is not proof that every Harpa failure path is
healthy. SDK installation, environment filters, project selection, sampling,
quotas, and Sentry ingestion affect the evidence.

Only the mobile app enables native crash handling and automatic session
tracking in the current repository. The release-health result covers one
configured mobile project. It does not cover the API or browser applications.

These endpoints do not provide a reviewed free-plan allowance or remaining
quota balance. This observer does not derive a Sentry quota percentage.

## Credential boundary

The API accepts this optional server-only configuration:

- `ADMIN_SENTRY_ORG_SLUG`.
- `ADMIN_SENTRY_READ_TOKEN`.
- `ADMIN_SENTRY_PROJECT_SLUGS`.
- `ADMIN_SENTRY_MOBILE_PROJECT_SLUG`.
- `ADMIN_SENTRY_ENVIRONMENT`.
- optional `ADMIN_SENTRY_REGION`, which is `global`, `us`, or `de` and
  defaults to `global`.

The first five values must be absent or present together. Empty or
whitespace-only values are invalid. Setting only `ADMIN_SENTRY_REGION` is also
invalid. A partial configuration fails API boot. If the whole configuration is
absent, the observer returns `unknown/not_configured` without an outbound
request.

Organization and project slugs use a conservative lowercase slug allowlist.
`ADMIN_SENTRY_PROJECT_SLUGS` contains one to three unique comma-separated
projects. The mobile project must be one of those projects.
`ADMIN_SENTRY_ENVIRONMENT` is exactly `production`, `preview`, or
`development`.

Provision a dedicated Sentry organization integration token with only:

- `event:read` for the issue request.
- `org:read` for the session request.

The token can read sensitive provider responses. Those responses can contain
titles, culprits, metadata, assignments, and user details. The implementation
discards these fields, but the token scope remains a residual risk. Restrict
the integration to the reviewed organization and projects when Sentry permits
it. Record the owner and rotation date during enablement.

Do not reuse a DSN, the source-map upload `SENTRY_AUTH_TOKEN`, a personal token,
or a token with write or admin permission. The observer token never reaches the
browser, logs, response contract, OpenAPI examples, or committed fixtures.

The region selects one fixed API origin:

- `global` → `https://sentry.io`.
- `us` → `https://us.sentry.io`.
- `de` → `https://de.sentry.io`.

No environment value can supply an arbitrary origin or path.

## Route boundary

Add:

```text
GET /admin/operations/sentry
```

The route uses the existing administrator observer boundary in this order:

1. Set `Cache-Control: private, no-store` before any rejection.
2. Apply the shared trusted-Fly-IP administrator window.
3. Require the dedicated administrator cookie session.
4. Apply a separate 12-request-per-minute identity-and-session limit.

Application Bearer tokens, including the retired application `is_admin` bit,
must fail before any Sentry request. The route has no request body, query
parameters, write method, polling path, or arbitrary provider proxy. A browser
`401` returns the complete operations page to signed-out state.

## Upstream request plan

One configured observation makes exactly two fixed `GET` requests. They run in
parallel under one 10-second abort budget. They use `redirect: 'error'`, never
retry, and never follow pagination.

The API's local provider-observer transport helper owns that shared deadline,
HTTP setup, and bounded JSON reading. This Sentry observer retains the fixed
URLs, status mapping, response schemas, byte limits, and `Link` interpretation.

Each response body uses a bounded JSON reader. The issue body limit is 1 MiB.
The session body limit is 256 KiB. A declared or observed body above its limit
is `invalid_response`. Raw bodies are discarded after parsing.

### Unresolved issue groups

The first request is:

```text
GET {fixedOrigin}/api/0/organizations/{organizationSlug}/issues/
```

It sends these fixed query values:

- one `project` value for each configured project, in configured order.
- the configured `environment`.
- `query=is:unresolved`.
- `sort=date`.
- `limit=100`.
- `shortIdLookup=0`.
- the documented `filtered`, `lifetime`, `stats`, and `unhandled` collapse
  values.

The observer does not use an inferred `issue.category:error` search token. It
reads the documented `issueCategory` field and counts only exact `error` rows.
Every row must contain a bounded category string. Other categories are
ignored.

The response array is limited to 100 rows. The observer parses the documented
`Link` header but does not follow it. A next page makes the count a lower bound
and the overall observation partial. Otherwise the count is exact for the
configured projects and environment. An absent or malformed pagination header
is `invalid_response`.

### Mobile sessions

The second request is:

```text
GET {fixedOrigin}/api/0/organizations/{organizationSlug}/sessions/
```

It sends these fixed query values:

- `project={mobileProjectSlug}`.
- `environment={configuredEnvironment}`.
- `statsPeriod=24h`.
- `interval=1h`.
- `field=sum(session)`.
- `groupBy=session.status`.
- `includeTotals=1`.
- `includeSeries=0`.

It does not send `start`, `end`, `cursor`, or an arbitrary query. The response
must contain unique status groups, a bounded interval list, and valid provider
`start` and `end` timestamps. The end must follow the start. The rounded
provider window must be between 23 and 25 hours.

Each `sum(session)` value must be a non-negative safe integer. The observer
accepts only `healthy`, `errored`, `abnormal`, and `crashed` status groups.
Missing known groups become zero. A duplicate or unknown group is
`invalid_response`.

The observer sums all four groups with safe-integer checks. A zero total
produces `unknown/no_session_data`. It does not produce an available row with
zero crashes.

## Response contract

`operations.sentryObservation` is a strict discriminated union.

An unconfigured or wholly unavailable observation is:

```ts
{
  observedAt: string;
  status: 'unknown';
  reason:
    | 'not_configured'
    | 'forbidden'
    | 'not_found'
    | 'rate_limited'
    | 'timeout'
    | 'invalid_response'
    | 'provider_unavailable'
    | 'no_session_data';
}
```

Available and partial observations contain:

```ts
{
  observedAt: string;
  status: 'available' | 'partial';
  unresolvedErrors:
    | {
        status: 'available';
        count: number;
        countKind: 'exact' | 'lower_bound';
        cap: 100;
      }
    | { status: 'unknown'; reason: SentryObservationReason };
  mobileSessions:
    | {
        status: 'available';
        window: 'last_24_hours';
        windowStart: string;
        windowEnd: string;
        totalSessions: number;
        healthySessions: number;
        erroredSessions: number;
        abnormalSessions: number;
        crashedSessions: number;
      }
    | { status: 'unknown'; reason: SentryObservationReason };
  caveats: SentryObservationCaveat[];
}
```

All counts are non-negative safe integers. The four session counts must sum to
`totalSessions`, which must be greater than zero.

The finite caveat set is:

- `issue_groups_not_events`.
- `mobile_sessions_only`.
- `telemetry_coverage_applies`.
- `issue_count_truncated`.

Every non-unknown observation includes the first three caveats.
`issue_count_truncated` is present if and only if the issue slice is available
with a lower-bound count. An exact or unavailable issue slice forbids it.
Caveats are unique.

An observation is `available` only when both nested values are available and
the issue count is exact. One unavailable nested value or a lower-bound count
makes the observation `partial`. If both provider reads are unavailable, the
top-level result is `unknown`.

The schema rejects issue IDs, short IDs, titles, culprits, messages, stack
traces, tags, users, email addresses, URLs, organization or project
identifiers, tokens, provider headers, raw errors, raw session groups, and all
other non-allowlisted fields.

## Failure policy

HTTP `401` or `403` maps to `forbidden`. HTTP `404` maps to `not_found`. HTTP
`429` maps to `rate_limited`. HTTP `408` or `504`, an observation abort, and an
`AbortError` map to `timeout`. HTTP `400`, malformed JSON, an oversized body,
or a shape that violates the provider allowlist maps to `invalid_response`.
Other network and non-success failures map to `provider_unavailable`.

If both reads fail, the top-level reason uses this priority:

1. `timeout`.
2. `rate_limited`.
3. `forbidden`.
4. `not_found`.
5. `invalid_response`.
6. `provider_unavailable`.
7. `no_session_data`.

If one read succeeds, preserve it and return `partial` with the other nested
value `unknown`. Provider error bodies, response headers, and thrown messages
are never returned or logged.

## Administrator presentation

Add a **Sentry errors and mobile crashes** card to the operations page. It
shows:

- observation time and Available, Partial, or Unknown state.
- **Unresolved error issue groups**, with an exact count or `N+` lower bound.
- **Mobile sessions · last 24 hours**.
- the healthy, errored, abnormal, and crashed mobile session counts.
- a generic Sentry issues link with no organization or project identifier.

Required copy states:

- an issue group can contain many error events.
- issue details stay in Sentry.
- mobile release health does not cover the API or browser applications.
- zero groups is not proof that all systems have no errors.
- a crashed session is recent activity, not an unresolved issue.
- missing or zero session data is Unknown, not zero crashes.

Loading, available, partial, unknown, and route-error states are independent
from every other operations card. Raw provider text must not appear in visible
text, accessible text, element attributes, or serialized DOM.

## Browser and provider budgets

The browser calls the route once after a dedicated admin session is
established. It calls the route again only after the shared **Refresh** action.
It does not poll and does not couple to the report live-canary button.

The current successful page cycle performs 15 fixed `GET` requests. This card
changes the total to 16 on initial load and 32 after one shared Refresh. The
single browser `GET` can produce at most two Sentry `GET` requests. Initial load
plus one Refresh can produce at most four Sentry requests.

## Tests and generated artifacts

The change requires:

- strict shared-contract tests for every status, correlation, bound, and
  rejected sensitive property.
- API env tests for absent, complete, partial, malformed, duplicate, and
  cross-field configurations.
- observer tests for the exact two-call plan, shared abort signal, bounded
  bodies, pagination, session aggregation, partial results, reason priority,
  and redaction.
- a default-wired route integration test that uses `globalThis.fetch` and
  proves the fixed URLs, headers, no body, no retry, no pagination, and no call
  before authentication or rate-limit rejection.
- scope and OpenAPI tests for the exact route and middleware boundary.
- admin UI tests for all states, strict parsing, `401` sign-out, redaction,
  16/32 reads, no timer, and no live-canary coupling.
- regenerated OpenAPI and contract types, with an explicit mobile hook skip
  for the admin-only route.

No database migration or application-database query is part of this observer.

## Activation boundary

Code, tests, and documentation do not authorize creation or installation of a
Sentry token. They do not authorize a provider call from development or
production.

Before enablement, an operator must review the token's organization, project
access, scopes, owner, expiry, and rotation record. Activation then needs a
separate live proof of the fixed requests, aggregate-only response, route
budget, and browser presentation.

## Excluded work

This slice does not:

- return issue or event details.
- resolve, assign, archive, or mutate a Sentry issue.
- fetch more than the first issue page.
- calculate an error-event count from issue groups.
- calculate a Sentry quota percentage.
- enable Sentry on a new application surface.
- change SDK sampling, retention, alerts, or release configuration.
- reuse a DSN or source-map token.
- provision or rotate a credential.
