# Dashboard dev activation and deferred public entry

**Status:** Dashboard dev deployment implemented; public entry deferred on
2026-08-05

## Problem

The office dashboard is available on Cloudflare Pages, but it is not ready for
public discovery from the marketing and documentation site. Its deployment
and test infrastructure must remain available without advertising the product
to public-site visitors.

The implementation closes two release blockers before the dashboard merges:

- attachment placement and PDF registration can assign an `updatedAt` value
  that does not advance at millisecond wire precision; and
- native Pages builds do not fail when the public password-account email
  allowlist is missing from a long-lived dashboard environment.

## Decision

### Public-site entry

The shared public-site header does not render a `Dashboard` action on desktop
or in the no-JavaScript mobile menu. This applies consistently to marketing,
roadmap, and documentation pages. The existing App Store action and site
styling remain unchanged.

The reserved build-time URL continues to follow the Pages branch:

| Site branch | Dashboard destination                          |
| ----------- | ---------------------------------------------- |
| `pr-<n>`    | `https://pr-<n>.harpa-pro-dashboard.pages.dev` |
| `dev`       | `https://dev.harpa-pro-dashboard.pages.dev`    |
| `main`      | `https://harpa-pro-dashboard.pages.dev`        |

`app.harpapro.com` remains a later production custom-domain activation. The
public site must not link to the dashboard until the product is approved for
public discovery and the intended hostname is active.

`PUBLIC_DASHBOARD_URL` is required by the typed public-site environment. The
Cloudflare build wrapper derives it from `CF_PAGES_BRANCH`; local and CI builds
provide it explicitly. It is retained as dormant rollout configuration so the
entry can be restored deliberately without changing deployment routing. No
component reads raw environment variables.

### Password-account build contract

The dashboard keeps email OTP as the normal path and its fixed demo addresses
as the public password path. `VITE_PASSWORD_ACCOUNT_EMAILS` adds the configured
non-demo test accounts that the API already permits.

Native Cloudflare dashboard builds require that public allowlist rather than
silently compiling an OTP-only artifact. Preview and development use the Pages
preview value; production uses the Pages production value. Passwords remain
server-side secrets and never enter a Pages artifact.

### Monotonic report versions

Every report-row write that can race a browser or mobile editor must advance
`updatedAt` by at least one millisecond. The existing monotonic SQL expression
is reused for attachment placement. A forward-only migration replaces
`app.attach_report_pdf()` so PDF registration applies the same rule.

`expectedUpdatedAt` remains optional during the mobile compatibility window.
This change does not alter the API schema; it makes the existing timestamp
precondition reliable under same-millisecond writes and clock skew.

## Verification

- API integration tests pin monotonic attachment and PDF writes against a
  future millisecond value, which also covers clock skew deterministically.
- The Pages build-wrapper test pins all three public-site destinations and
  rejects a dashboard build without `VITE_PASSWORD_ACCOUNT_EMAILS`.
- Site Playwright proves the dashboard is absent from the desktop header and
  mobile menu while retaining the horizontal-overflow check.
- The refreshed pull request must pass its mocked browser matrix, deployed
  live dashboard journey, API integration, and Android Maestro smoke.

## Rollout

1. Keep dashboard production deployments disabled.
2. Keep dashboard preview branches available for `dev` and `pr-*` testing.
3. Do not expose a public-site dashboard action until product readiness is
   approved separately.
4. Before restoring the action, verify the exact dashboard deployment marker,
   SPA routing, sign-in, and intended production hostname.
5. Leave `main` and `app.harpapro.com` unchanged.
