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

## Deliberate limits

- Do not add provider credentials to the browser. The Neon inventory route is
  the only account-specific provider endpoint in this design.
- Do not claim that linked services are healthy; only the two Harpa readiness
  probes receive live states.
- Do not poll. Check once on page load and again only when the operator presses
  Refresh.
- Do not add charts, history, alert configuration, or account-specific quota
  reads. The bounded Neon inventory is metadata, not quota or billing data.
  Existing Sentry, provider, and budget alerts remain responsible for
  notification.

These limits keep the page useful without creating another monitoring system
that the solo operator must maintain.

## Verification

- Component tests cover signed-out redirection, both readiness outcomes,
  refresh, sign-out, and the required provider links.
- Admin smoke tests prove `/operations` is a real static route while unknown
  routes still use the static 404.
- API CORS coverage proves the exact admin origin can read `/readyz` and an
  unrelated origin cannot.
- Neon inventory tests prove the dedicated-cookie boundary, Viewer-only
  provider access, paired-configuration fallback, fixed bounds, rate limit,
  no-store response, and absence of retries.
- Run admin lint, typecheck, unit tests, and build plus the focused API CORS
  and Neon inventory tests.
