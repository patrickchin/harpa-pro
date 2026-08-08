# Design — Admin service monitoring

**Status:** Implemented on `dev`; not yet promoted to production as of
2026-08-04.

The R2 capacity and deployment-identity extensions below are drafts for
unmerged stacked pull requests. The R2 change does not provision its observer
credential.

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

The storage values are current snapshots, not remaining GB-month capacity.
The operation headroom is a conservative estimate, not a billing balance.
Unclassified operations, Infrequent Access data, and truncated inventory keep
their explicit caveats.

## Deployment identity extension

The deployment-identity panel is a first-party, read-only extension. See
[Admin deployment identity](design-admin-deployment-identity.md) for its full
contract. On authenticated load and manual Refresh, the browser reads the API
`/healthz`, product `/readyz`, administrator `/admin/readyz`, and its own
`/_cf-pages-deployment.json` marker exactly once each with caching disabled.
There is no polling.

The four cards preserve the evidence boundaries between API build identity,
the two independent migration heads, and the administrator Pages build. They
do not call a SHA difference drift: Fly pull-request previews may run a
synthetic merge commit while Pages reports the pull-request head. Exact release
and promotion proof remains the responsibility of the protected workflows.

`/healthz` remains public and read-only. Its browser CORS allowlist is limited
to the exact configured administrator origins and does not allow credentials.
The two readiness requests retain their credentialed administrator-origin
policy. Strict browser parsers reject extra or unsafe fields, and raw readiness
messages never enter UI state.

## Deliberate limits

- Do not add provider credentials to the browser. Secret-backed provider reads
  require a narrow admin API adapter with a response allowlist; do not add one
  broad aggregation endpoint that can silently gain new credential access.
  The Neon inventory and R2 capacity routes are the only account-specific
  provider endpoints in this design.
- Do not claim that linked providers are healthy. Only first-party build
  identity and the two Harpa readiness probes receive live states.
- Do not poll. Check once on page load and again only when the operator presses
  Refresh.
- Do not add charts, history, alert configuration, arbitrary provider proxies,
  or invoice claims. The bounded Neon inventory is metadata, not quota or
  billing data, and undocumented remaining capacity stays `Unknown`. The R2
  estimates are not provider billing balances. Existing Sentry, provider, and
  budget alerts remain responsible for notification.

These limits keep the page useful without creating another monitoring system
that the solo operator must maintain.

## Phased extensions

The operations page may grow through independent pull requests, but every
value must remain attributable to one of four evidence classes:

1. **Harpa readiness** — customer-facing probes that prove the API and its
   databases are ready.
2. **Public delivery metadata** — advisory public repository or vendor-status
   data. This never proves that a commit is deployed.
3. **Account usage and capacity** — authenticated provider facts with an
   explicit observation time and accounting window. `Used`, `limit`,
   `remaining`, and `credit balance` are different fields; unavailable fields
   render as `Unknown` and are never derived without a documented provider
   contract.
4. **Diagnostic actions** — explicit, audited, rate-limited checks that may
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
- the unauthenticated browser/IP API allowance from GitHub's rate-limit
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

Neon project and branch counts are inventory facts, not remaining credits.
Consumption metrics may be shown with their provider-defined accounting
window. Until Neon exposes a trustworthy balance source and an acceptable
credential boundary, remaining credits stay `Unknown` with a console link.

### Report-generation diagnostic

The existing report generation endpoint authenticates a normal application
account, reads scoped report data, calls the configured AI provider, records
usage, and writes the generated body. The admin site must not gain general
impersonation or write access to exercise it.

The manual diagnostic uses one explicitly provisioned diagnostic account and
one fixed diagnostic report through the existing endpoint. The trigger is
admin-session gated, exact-origin and session-derived-CSRF protected,
separately rate limited, audited, and manually invoked. It is clear that the
action mutates only that test report and may spend provider credit. A synthetic
provider-only smoke test is useful as secondary evidence but must not be
labelled as an end-to-end report endpoint check. See
[Admin report-generation diagnostic](design-admin-report-generate-diagnostic.md)
for the full contract.

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
- R2 capacity tests prove strict redaction, paired configuration, fixed
  provider calls, bounded output, caveats, rate limits, and manual refresh.
- Deployment-identity tests prove the four fixed reads, independent partial
  states, strict redaction, full identifiers, exact CORS policy, and absence of
  polling.
- Report-generation diagnostic tests prove its dedicated-cookie, exact-origin,
  session-derived-CSRF, fixed-target, rate-limit, redaction, and manual-only
  mutation boundaries.
- Run admin lint, typecheck, unit tests, and build plus the focused API CORS
  and observer tests.
