# Design — Admin service monitoring

**Status:** Approved for implementation by the 2026-08-04 request

## Goal

Add a read-only operations page to the standalone admin site so a solo operator
can check Harpa Pro's core customer-facing health and open every relevant vendor
console without maintaining a separate bookmark collection.

## First cut

Publish `https://admin.harpapro.com/operations` and link it from the existing
business-activity page. The page uses the existing dedicated administrator
session. A direct unauthenticated visit exposes no service links and points the
operator to the established sign-in flow at `/`.

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

- Do not add provider credentials to the browser or a new backend aggregation
  endpoint.
- Do not claim that linked services are healthy; only the two Harpa readiness
  probes receive live states.
- Do not poll. Check once on page load and again only when the operator presses
  Refresh.
- Do not add charts, history, alert configuration, or account-specific quota
  reads. Existing Sentry, provider, and budget alerts remain responsible for
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
- Run admin lint, typecheck, unit tests, and build plus the focused API CORS
  test.
