# Design — Admin service monitoring

**Status:** Implemented on `dev`; not yet promoted to production as of
2026-08-04.

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

## Deliberate limits

- Do not add provider credentials to the browser. Secret-backed provider reads
  require a narrow admin API adapter with a response allowlist; do not add one
  broad aggregation endpoint that can silently gain new credential access.
- Do not claim that linked services are healthy; only the two Harpa readiness
  probes receive live states.
- Do not poll. Check once on page load and again only when the operator presses
  Refresh.
- Do not add charts, history, or alert configuration. Existing Sentry,
  provider, and budget alerts remain responsible for notification.

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

A later pull request may use one explicitly provisioned diagnostic account and
one fixed diagnostic report through the existing endpoint. The trigger must be
admin-session gated, separately rate limited, audited, manually invoked, and
clear that it mutates only that test report and may spend provider credit. A
synthetic provider-only smoke test is useful as secondary evidence but must not
be labelled as an end-to-end report endpoint check.

## Verification

- Component tests cover signed-out redirection, both readiness outcomes,
  refresh, sign-out, the required provider links, the serial public GitHub
  snapshot, its bounded pull-request list, and rate-limit exhaustion.
- Admin smoke tests prove `/operations` is a real static route while unknown
  routes still use the static 404.
- API CORS coverage proves the exact admin origin can read `/readyz` and an
  unrelated origin cannot.
- Run admin lint, typecheck, unit tests, and build plus the focused API CORS
  test.
