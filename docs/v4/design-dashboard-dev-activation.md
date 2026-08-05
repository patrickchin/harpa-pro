# Dashboard dev activation and public entry

**Status:** Implemented on 2026-08-05; dev deployment verification pending

## Problem

The office dashboard is available on the pull-request Pages branch, but the
public site has no obvious account entry. The dashboard Pages project also
limits previews to `pr-211` while the application is absent from `dev`.

The implementation closes two release blockers before the dashboard merges:

- attachment placement and PDF registration can assign an `updatedAt` value
  that does not advance at millisecond wire precision; and
- native Pages builds do not fail when the public password-account email
  allowlist is missing from a long-lived dashboard environment.

## Decision

### Public-site entry

The shared public-site header adds a `Dashboard` button as its final action on
desktop and in the no-JavaScript mobile menu. It appears on marketing, roadmap,
and documentation pages because the header is the consistent public-product
navigation boundary. The existing App Store action and site styling remain
unchanged.

The button opens in the same tab. Its build-time URL follows the Pages branch:

| Site branch | Dashboard destination                          |
| ----------- | ---------------------------------------------- |
| `pr-<n>`    | `https://pr-<n>.harpa-pro-dashboard.pages.dev` |
| `dev`       | `https://dev.harpa-pro-dashboard.pages.dev`    |
| `main`      | `https://harpa-pro-dashboard.pages.dev`        |

`app.harpapro.com` remains a later production custom-domain activation. The
public site must not link to that hostname until Pages owns it and its TLS
certificate is active.

`PUBLIC_DASHBOARD_URL` is required by the typed public-site environment. The
Cloudflare build wrapper derives it from `CF_PAGES_BRANCH`; local and CI builds
provide it explicitly. No component reads raw environment variables.

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
- Site Playwright covers the desktop header, mobile menu, destination, and
  horizontal overflow.
- The refreshed pull request must pass its mocked browser matrix, deployed
  live dashboard journey, API integration, and Android Maestro smoke.

## Rollout

1. Keep dashboard production deployments disabled.
2. Verify the refreshed `pr-211` dashboard and public-site previews.
3. Expand dashboard preview branches to `dev` and `pr-*` immediately around
   the normal pull-request merge so the merge commit receives a native build.
4. Merge to `dev`, then verify the exact dashboard and site deployment markers,
   SPA routing, the public-site button, and dashboard sign-in.
5. Leave `main` and `app.harpapro.com` unchanged.
