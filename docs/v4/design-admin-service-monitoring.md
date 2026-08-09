# Design — Admin service monitoring

**Status:** Implemented on `dev`; not yet promoted to production as of
2026-08-04.

The Fly inventory and Harpa-recorded AI usage extensions below are drafts for
unmerged stacked pull requests. The Fly change does not provision its observer
credential. The AI usage change does not add a provider administrator
credential. The Neon usage route reuses the existing observer pair. The R2
code does not provision its observer credential. The Sentry observer does not
provision its credential. The storage lifecycle observer remains a separate
read-only stacked draft and adds no credential.

## Goal

Add a read-only operations page to the standalone admin site so a solo operator
can check Harpa Pro's core customer-facing health and open every relevant vendor
console without maintaining a separate bookmark collection.

## First cut

The `apps/admin` workspace contains `/operations` and links it from the
business-activity page. The page uses the dedicated administrator session. A
direct unauthenticated visit exposes no service links and points the operator
to the established sign-in flow at `/`. Production returns 404 until the
change is promoted from `dev`.

The page performs two explicit, manually refreshable checks:

- `GET /readyz` verifies the product API, application Neon connection, and
  application migration head.
- `GET /admin/readyz` verifies the API path, separate admin Neon connection, and
  admin migration head.

Both endpoints already exist and remain read-only. `/readyz` gains CORS access
for the exact configured admin origins so the static admin application can read
its response. No other public origin is added.

Below the live checks, group links to the provider consoles and public status
pages used by Harpa Pro: Fly.io, Neon, Cloudflare, Sentry, Better Stack, GitHub
Actions, Doppler, Expo/EAS, Resend, Zoho Mail, App Store Connect, Google Play,
OpenAI, Groq, Kimi/Moonshot, and Firecrawl.

## Neon inventory extension

The Neon inventory is a narrow server-side extension to this page. See
[Admin Neon inventory](design-admin-neon-inventory.md) for the full contract.
`GET /admin/operations/neon` uses the dedicated browser-admin session, the
shared trusted-Fly-IP admin budget, and a 12-request-per-minute identity and
session budget. Every response sets `Cache-Control: private, no-store`.

The API accepts `ADMIN_NEON_VIEWER_API_KEY` and `ADMIN_NEON_ORG_ID` only as an
optional pair. The key belongs to a fixed, dedicated Neon observer. Every
visible project must belong to the configured organization and report an
effective `VIEWER` permission. The API never reuses the CI `NEON_API_KEY` or
sends either observer variable to the browser.

When the pair is absent, the route returns a typed `Unknown` state and makes no
Neon request. A configured route lists at most 20 projects and at most 100
active branch details per project. It does not retry provider requests. The
count endpoint has no deleted-branch selector. The active-detail request
explicitly excludes deleted branches, so the UI labels these values separately.

Neon does not document an API for remaining billing credit. Remaining credit
stays `Unknown`, and the Neon console remains the billing source. A code
deployment does not prove that live credentials are active. Live proof requires
the dedicated Viewer principal and key, the paired variables in the intended
environment, the exact deployed API and admin-site SHAs, and an authenticated
response that confirms `VIEWER` for every returned project.

## Provider quota percentage extension

See
[Admin provider quota percentages](design-admin-provider-quota-percentages.md)
for the full evidence and calculation contract. The Neon stack adds
`GET /admin/operations/neon-usage`. The route reuses the existing optional
`ADMIN_NEON_VIEWER_API_KEY` and `ADMIN_NEON_ORG_ID` pair. It uses the dedicated
browser-admin session, shared trusted-Fly-IP budget, and a separate
12-request-per-minute identity and session budget. Every response sets
`Cache-Control: private, no-store`.

One observation makes at most 22 fixed Neon `GET` requests under one shared
10-second deadline. It reads the configured organization, at most 20 projects,
and one detail response per verified project. It does not retry, follow a
project cursor, or use a provider write method. The organization must report
the exact `free` plan. Every discovered project must report effective
permission `VIEWER` before any project-detail request.

The UI derives one-decimal used and remaining percentages from raw safe
integers. Per-project compute uses the published 360,000-CU-second reference.
Per-project storage uses the published 500,000,000-byte reference.
Organization public transfer uses the published 5,000,000,000-byte reference
only when project coverage is complete and every consumption period matches.
Incomplete coverage or different periods make organization transfer
`Unknown`. Text can exceed 100.0%, but the painted meter stops at 100%.

The existing R2 card derives estimated Class A and Class B percentages against
the published 1,000,000-operation and 10,000,000-operation references. It does
not show a storage percentage because a current byte snapshot is not a
GB-month value. The public GitHub card derives the primary REST request-budget
percentage for this browser and IP from existing response headers. Missing,
invalid, or contradictory headers make only that budget `Unknown`. No R2 or
GitHub request, token, or credential is added.

Provider money, token, invoice, and credit balances remain `Unknown`. These
usage and request-budget percentages are not provider billing balances. A
successful full-stack load makes 16 fixed GET reads after session confirmation.
One successful manual **Refresh** makes another 16, for 32 total. The page does
not poll. The report generation live canary remains a separate manual POST.

## R2 capacity extension

The R2 capacity observer is a second narrow server-side extension. See
[Admin R2 capacity](design-admin-r2-capacity.md) for the full contract.
`GET /admin/operations/r2-capacity` uses the dedicated browser-admin session,
the shared trusted-Fly-IP budget, and its own 12-request-per-minute identity
and session budget. Every response sets `Cache-Control: private, no-store`.

The API accepts `ADMIN_CLOUDFLARE_ACCOUNT_ID` and
`ADMIN_CLOUDFLARE_R2_OBSERVER_API_TOKEN` only as an optional pair. An absent
pair returns `Unknown` without a Cloudflare request. The dedicated token has
only `Workers R2 Storage Read` and `Account Analytics: Read` for the intended
account. The token never reaches the browser.

One observation makes at most three fixed provider requests under one
10-second timeout. It does not retry or follow bucket pagination. The card
shows a bounded bucket inventory, current Standard and Infrequent Access
snapshots, and month-to-date operation estimates against published references.

The card also shows **Published stored now**. The browser adds the published
payload and metadata bytes for Standard and Infrequent Access storage. Pending
uploads do not contribute. The card shows a human-readable IEC value and the
exact byte count.

Ingress and egress volume stay `Unknown`. The documented R2 metrics do not
expose transferred bytes. Cloudflare lists direct R2 egress as free, but
the observer cannot measure bytes served. Harpa uploads and downloads use
signed R2 URLs, so the application API does not carry the object bytes.

The storage values are current snapshots, not remaining GB-month capacity.
The operation headroom is a conservative estimate, not a billing balance.
Unclassified operations, Infrequent Access data, and truncated inventory keep
their explicit caveats. The Class A and Class B percentage rows remain
explicit estimates against published operation references.

This presentation adds no API route, response schema field, credential, or
provider request. The three-request R2 ceiling stays unchanged. The full page
still makes 16 fixed GET reads after session confirmation. One manual
**Refresh** adds 16 reads, for 32 total.

## Sentry observer extension

The Sentry observer is another narrow server-side extension. It remains an
unmerged draft. See [Admin Sentry observer](design-admin-sentry-observer.md)
for the full contract. `GET /admin/operations/sentry` uses the dedicated
browser-admin session, the shared trusted-Fly-IP budget, and a separate
12-request-per-minute identity and session budget. Every response sets
`Cache-Control: private, no-store`.

The API accepts `ADMIN_SENTRY_ORG_SLUG`, `ADMIN_SENTRY_READ_TOKEN`,
`ADMIN_SENTRY_PROJECT_SLUGS`, `ADMIN_SENTRY_MOBILE_PROJECT_SLUG`, and
`ADMIN_SENTRY_ENVIRONMENT` as one optional set. `ADMIN_SENTRY_REGION` is
optional and defaults to `global`. The first five values must be absent or
present together. The token never reaches the browser and uses only
`event:read` and `org:read`.

One configured observation makes exactly two fixed Sentry `GET` requests. They
run in parallel under one shared 10-second deadline. The observer never
retries, never follows pagination, and never writes to Sentry. One request
counts unresolved error issue groups for the configured projects and
environment. The other request reads last-24-hour mobile session totals for one
configured mobile project.

The response exposes only aggregate counts, fixed caveats, and reviewed unknown
reasons. It does not expose issue titles, event data, people, project names, or
provider diagnostics. A zero issue-group count is not proof that every Harpa
path is healthy. Missing or zero session data is `Unknown`, not zero crashes.

The browser calls the route once after session confirmation and again only on
manual **Refresh**. It never polls. A successful full-stack load makes 16 fixed
GET reads. One successful Refresh makes another 16, for 32 total. The report
generation live canary remains a separate manual POST.

## Fly inventory extension

The Fly inventory observer is another narrow server-side extension. It remains
an unmerged draft. See [Admin Fly inventory](design-admin-fly-inventory.md) for
the full contract. `GET /admin/operations/fly-inventory` uses the dedicated
browser-admin session and shared trusted-Fly-IP budget. It also uses a separate
12-request-per-minute identity and session budget. Every response sets
`Cache-Control: private, no-store`.

The API accepts `ADMIN_FLY_ORG_SLUG`, `ADMIN_FLY_READ_ONLY_API_TOKEN`, and
`ADMIN_FLY_APP_NAMES` as one optional triplet. All three values must be absent
or present together. The app list contains one to ten unique, exact names. The
dedicated token must have read-only access to the configured Fly organization.
The token and configuration never reach the browser.

One observation uses only fixed `GET` requests to
`https://api.machines.dev`. It has one 10-second deadline and at most 31
provider calls. Apps run serially, while three fixed reads for one app may
overlap. The observer does not follow redirects or pagination, and it does not
retry or write to Fly.

The response contains at most ten allowlisted apps, 50 Machines per app, and
50 Volumes per app. A strict field allowlist removes raw Machine configuration,
image and service details, Volume internals, and provider error text. The
nullable `processGroup` value comes only from the reviewed Machine metadata
field.

Machine state and process group do not prove Harpa readiness or worker
liveness. Volume size shows allocated capacity, not used or free storage. Fly
does not document a stable remaining-credit REST field, so that value stays
`Unknown` with a dashboard link.

The browser calls the route once after session confirmation and again only on
manual **Refresh**. It never polls. A successful full-stack load makes 16 fixed
GET reads. One successful Refresh makes another 16, for 32 total. The report
generation live canary remains a separate manual POST.

## Harpa-recorded AI usage extension

The AI usage observer is a first-party aggregate extension. It remains an
unmerged draft. See [Admin AI usage ledger](design-admin-ai-usage.md) for the
full contract. `GET /admin/operations/ai-usage` uses the dedicated
browser-admin session and shared trusted-Fly-IP budget. It also uses a separate
12-request-per-minute identity and session budget. Every response sets
`Cache-Control: private, no-store`.

One observation runs one application-database query over a fixed current UTC
month window and fixed previous-24-hour window. It groups only normalized
provider category, operation, fixture mode, and status. The result contains at
most 72 aggregate query rows and at most four provider summaries per window.
It never returns user, project, report, model, prompt, transcript, raw vendor,
or error details.

`live` and `record` events are provider-attributable. Replay activity remains
separate and is not presented as provider consumption. Token and transcription
totals include only successful provider-attributable calls. Unknown vendor
labels become `other`, and missing historical transcription duration stays an
explicit warning.

The data source is Harpa's retained, best-effort `app.llm_usage_events` ledger.
Recording failures and account deletion can remove activity from the summary,
so it is not provider billing or an immutable audit ledger. The route makes no
OpenAI, Groq, or Kimi request and adds no provider administrator credential.
Provider balance, free tier, rate-limit headroom, and remaining credit stay
`Unknown` with provider-dashboard links.

The browser calls the route once after session confirmation and again only on
manual **Refresh**. It never polls. A successful full-stack load makes 16 fixed
GET reads. One successful Refresh makes another 16, for 32 total. The
manual report generation live canary remains a separate POST. It does not run
during either cycle.

## Deployment identity extension

The deployment-identity panel is a first-party, read-only extension. See
[Admin deployment identity](design-admin-deployment-identity.md) for its full
contract. On authenticated load and manual **Refresh**, the browser reads six
fixed URLs with caching disabled. These URLs are `/healthz`, `/readyz`,
`/admin/readyz`, and one Pages marker for each browser application.

The admin build maps `PUBLIC_SITE_BASE_URL` and `PUBLIC_DASHBOARD_URL` to the
exact `main`, `dev`, or `pr-<n>` public origins. The administrator marker stays
on the current origin. The browser does not accept marker origins from input or
responses. The public-site and dashboard marker requests omit credentials.
The administrator marker uses same-origin credentials. The page does not poll.

Six cards keep API build identity, both migration heads, and the three Pages
builds independent. The UI does not compare the SHAs or label a difference as
drift. Fly pull-request previews can run a synthetic merge commit while Pages
reports the pull-request head. A successful full-stack load makes 16 fixed GET
reads. One successful manual Refresh makes another 16, for 32 total.

`/healthz` remains public and read-only. Its browser CORS allowlist contains
only the exact configured administrator origins and does not allow credentials.
The readiness requests retain their credentialed administrator-origin policy.
The public Pages markers keep wildcard CORS because they contain only commit
and branch identity. Strict browser parsers reject extra or unsafe fields.
Raw readiness messages never enter UI state.

The panel supplies corroborating evidence. Protected CI and release workflows
still prove the exact API and Pages deployments before promotion.

## Storage lifecycle extension

The storage lifecycle observer is a first-party database extension. See
[Admin storage lifecycle observer](design-admin-storage-lifecycle-observer.md)
for the full contract. `GET /admin/operations/storage-lifecycle` uses the
shared trusted-Fly-IP budget, dedicated admin session, and a separate
12-request-per-minute identity and session budget. Every response sets
`Cache-Control: private, no-store`.

One observation runs exactly one fixed application-database statement under a
five-second deadline. It reads the singleton lifecycle rollout row, calls the
lease-enforcement function, and aggregates durable cleanup jobs. The route
accepts no body or query. It does not retry, mutate state, or call a provider.

The card shows lifecycle arming, the exact account-deletion availability gate,
and bounded queue counts. It excludes payloads, user IDs, object keys, raw
errors, and Fly identifiers. A recorded rollout row does not prove that a
worker is live. An empty queue does not prove that delayed cleanup can execute.

The browser calls this route once after session confirmation and once on
shared **Refresh**. It does not poll. A failure affects only the storage
lifecycle card.

## Deliberate limits

- Do not add provider credentials to the browser. Secret-backed provider reads
  require a narrow admin API adapter with a response allowlist; do not add one
  broad aggregation endpoint that can silently gain new credential access.
  The Neon inventory, Neon usage, R2 capacity, Sentry observer, and draft Fly
  inventory routes are the only account-specific provider endpoints in this
  design.
- Do not claim that linked providers are healthy. Only first-party build
  identity and the two Harpa readiness probes receive live states.
- Do not poll. Check once on page load and again only when the operator presses
  Refresh.
- Do not add charts, history, alert configuration, arbitrary provider proxies,
  or invoice claims. The Neon usage percentages compare documented Free-plan
  values with published references. They are not billing credit. Undocumented
  remaining capacity stays `Unknown`. The R2 estimates are not provider
  billing balances. Fly Machine and Volume values are inventory, and remaining
  Fly credit stays `Unknown`. The AI ledger is a
  best-effort Harpa aggregate, not provider capacity, and every remaining AI
  provider credit stays `Unknown`. Existing Sentry, provider, and budget alerts
  remain responsible for notification.

These limits keep the page useful without creating another monitoring system
that the solo operator must maintain.

## Phased extensions

The operations page may grow through independent pull requests, but every
value must remain attributable to one of five evidence classes:

1. **Harpa readiness** — customer-facing probes that prove the API and its
   databases are ready.
2. **Public delivery metadata** — advisory public repository or vendor-status
   data. This never proves that a commit is deployed.
3. **Account inventory, usage, and capacity** — authenticated provider facts
   with an explicit observation time and accounting window. `Inventory`,
   `used`, `limit`, `remaining`, and `credit balance` are different fields.
   Unavailable fields render as `Unknown` without a documented provider
   contract.
4. **Lifecycle database state:** bounded rollout and durable queue facts. This
   state does not prove worker liveness or provider health.
5. **Canary actions:** explicit, audited, rate-limited checks that may
   incur provider cost. They must not mutate infrastructure or ordinary user
   data.

Requested additions ship as separate pull requests that may merge into `dev`
after required checks and exact admin preview evidence pass. Improvements not
explicitly requested remain unmerged stacked draft pull requests for review.

### Public GitHub snapshot

The first extension reads only public metadata for
`patrickchin/harpa-pro` directly from GitHub REST after the administrator
session is confirmed:

- latest commit metadata for `dev` and `main`;
- at most 30 open pull requests in a bounded scrolling list; and
- the used and remaining percentages for the unauthenticated primary REST
  request budget for this browser and IP, derived from GitHub's rate-limit
  response headers.

The browser sends no token and performs the three requests serially on page
load or manual Refresh. There is no polling, retry loop, OAuth flow, backend
proxy, or persisted cache. A rate-limit response renders an unavailable state
while the static repository links remain usable. If the repository becomes
private, the feature fails closed; a browser credential is not an acceptable
fallback.

The branch heads and pull-request list are advisory source-control state only.
Exact-SHA Pages/Fly markers, workflow checks, `/readyz`, and `/admin/readyz`
remain the deployment and runtime evidence.

GitHub documents both browser CORS support and unauthenticated REST limits:

- [Cross-origin requests](https://docs.github.com/en/rest/using-the-rest-api/using-cors-and-jsonp-to-make-cross-origin-requests)
- [REST API rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)

### Provider capacity and Neon inventory

Secret-backed reads belong behind dedicated admin-session API routes. Each
provider adapter must use a read-only credential when the provider supports
one, enforce a short timeout, return a field allowlist, set `private,
no-store`, and redact provider error bodies. A credential that can mutate
infrastructure is not installed merely because the adapter intends to use
`GET` requests.

Neon project and branch counts are inventory facts, not remaining credits. The
Free-plan usage route reuses the existing Viewer observer pair. It makes at
most 22 fixed read requests and no provider write. It shows compute, storage,
and complete organization transfer against published references. Until Neon
exposes a trustworthy balance source and an acceptable credential boundary,
remaining credits stay `Unknown` with a console link.

Fly Machine and Volume facts use the same narrow adapter rule. The adapter
returns only configured apps and reviewed fields from Fly's public REST API.
An absent Machine process-group field stays `null`. Machine state and process
group do not prove Harpa readiness or worker liveness. The adapter does not use
internal GraphQL, scrape the dashboard, or infer remaining credit. The
dashboard remains the billing source.

Sentry uses the same narrow adapter rule. It makes two fixed read-only requests
with one reviewed token and returns only aggregate issue-group and mobile
session facts. It does not expose project names, issue details, people, or
provider diagnostics. It does not claim quota balance or provider health.

Harpa-recorded AI usage does not need a provider adapter. It reads only the
application usage ledger through one bounded cross-user aggregate service.
The heading and caveats preserve that source distinction. No ledger value
becomes provider spend, balance, free-tier capacity, or remaining credit.

### Report generation live canary

The report generation endpoint authenticates an application account, reads
scoped data, calls the AI provider, records usage, and replaces the generated
report body. The admin site does not get general impersonation or write
access.

The live canary uses one fixed synthetic account and one fixed draft report.
`ADMIN_REPORT_LIVE_CANARY_ENABLED` defaults to `0`. The parser accepts `1`
only for the exact non-preview development deployment with live AI mode and a
complete target. Production and pull-request previews cannot enable it.

One explicit click sends an empty POST with the dedicated admin cookie and
session-derived CSRF token. The route permits three runs per administrator
identity and session in 15 minutes. The fixed account also keeps the normal AI
and report usage limits. Page load, shared **Refresh**, timers, and background
work never run or clear the canary.

A pass requires live mode, one fresh matching usage row, a valid report body,
and exact temporary-session cleanup. The card shows bounded usage, limits,
structural counts, a report hash, and escaped synthetic fields. It never shows
prompts, source notes, raw responses, credentials, or arbitrary errors. See
[Admin live report-generation canary](design-admin-report-live-canary.md) for
the full contract.

## Verification

- Component tests cover signed-out redirection, both readiness outcomes,
  refresh, sign-out, the required provider links, the serial public GitHub
  snapshot, its bounded pull-request list, and rate-limit exhaustion.
- Admin smoke tests prove `/operations` is a real static route while unknown
  routes still use the static 404.
- API CORS coverage proves the exact admin origin can read `/readyz` and an
  unrelated origin cannot.
- Neon inventory tests prove the dedicated-cookie boundary, Viewer-only
  provider access, paired-configuration fallback, fixed bounds, rate limit,
  no-store response, and absence of retries.
- Neon usage tests prove exact Free-plan and Viewer gates, the 22-call read-only
  ceiling, strict redaction, fixed references, transfer completeness, and the
  separate 12-request budget.
- R2 capacity tests prove strict redaction, paired configuration, fixed
  provider calls, bounded output, caveats, rate limits, and manual refresh.
- Fly inventory tests prove triplet validation, fixed read-only requests,
  allowlist filtering, strict redaction, nullable process-group inventory,
  bounds, rate limits, 16/32 browser reads, and no polling.
- Sentry observer tests prove the all-or-none configuration gate, fixed two-call
  request plan, manual refresh only, strict redaction, generic external link,
  12-request budget, and 16/32 browser reads.
- AI usage tests prove the one-query aggregate, fixed UTC windows, normalized
  providers, replay separation, warning correlations, strict redaction,
  12-request budget, 16/32 read counts, and absence of polling or provider
  calls.
- Deployment-identity tests prove the six fixed reads, three independent Pages
  cards, strict redaction, full identifiers, exact CORS policy, and no polling.
- Storage lifecycle tests prove one fixed statement, the five-second deadline,
  separate 12-request budget, strict redaction, 16/32 reads, and the explicit
  worker-liveness caveat.
- Report live-canary tests prove its development-only gate, dedicated cookie,
  exact Origin, session-derived CSRF, fixed target, live usage proof, bounded
  preview, exact cleanup, rate limit, redaction, and manual-only mutation.
- Run admin lint, typecheck, unit tests, and build plus the focused API CORS
  and observer tests.
