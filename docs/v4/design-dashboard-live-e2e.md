# Dashboard live E2E parity gate

## Problem

The dashboard Playwright suite covers the UI broadly, but every request is
intercepted by `MockDashboardApi`. It proves browser behaviour without proving
Cloudflare Pages, credentialed CORS, Better Auth, Fly, Neon, or the live AI
provider wiring. The mobile Maestro regression is also partly fixture-backed,
but its release journey covers a wider real application surface.

The dashboard therefore needs two complementary browser lanes rather than a
replacement for the existing suite.

## Decision

Keep the existing `test:e2e` four-browser mock suite for cheap UI breadth. Add
`test:e2e:live`, a serial Chromium-only journey against the exact deployed
dashboard and an isolated Fly/Neon backend for the same pull request.

Every dashboard pull request gets that backend, including frontend-only
changes. The backend release command migrates both databases and seeds the
existing password-gated demo accounts. The dashboard workflow then waits for
the exact merge SHA before deploying and testing Pages.

The live lane runs after:

1. the matching Fly API reports the expected merge SHA and passes readiness;
2. the dashboard build is deployed to its immutable Pages URL; and
3. direct client-side routing on that deployment passes the SPA check.

## Dashboard-capable parity

The live journey covers the parts of the Maestro regression that the desktop
product owns:

- demo password sign-in and conditional onboarding;
- project create, update, and delete;
- member add, editor access, downgrade to viewer, removal, and access loss;
- report create and delete;
- one real AI report generation from a short text-note setup payload;
- keyboard save and stale-write conflict preservation;
- owner-only finalize, reopen, and re-finalize;
- viewer read-only behaviour and finalized review comments; and
- sign-out.

Responsive layout, fallback OTP, and browser-engine compatibility remain in the
mock suite. Voice, camera, gallery, document capture, native permissions,
account, usage, profile, and the developer debug screen are mobile-only or not
dashboard routes, so they are not duplicated here.

## Proving a real AI call

Generated wording is not evidence of provider mode because replay fixtures also
produce valid prose. After the browser clicks **Generate report**, the harness
reads the authenticated public report-debug endpoint and asserts:

```text
lastGeneration.fixtureMode == "live"
```

That value is persisted by the API from the provider result. The test sends no
`fixtureName`, makes exactly one generation call, and also asserts a non-empty
structured report. This is the release proof that `AI_LIVE=1` selected live
provider wiring.

## Auth and secret handling

The browser signs in through the reviewer-visible demo password form. CI loads
only `DEMO_ACCOUNT_PASSWORD` from the existing Doppler dev configuration after
deployment. Demo email addresses are public configuration.

The live Playwright config uses one worker, zero retries, no trace, and no video.
It never writes storage state. Failure screenshots may be uploaded, but no
secret-bearing request archive is produced. The sign-in response's bearer token
is retained only in memory for black-box API setup and cleanup.

## State setup and cleanup

Each run uses a unique `pw-pr-<number>-<run>` project name. Project, membership,
and report mutations go through the browser UI. The dashboard intentionally does
not create source notes, so the harness uses the authenticated public API for
one setup action:

```text
POST /reports/{reportId}/notes
{ "kind": "text", "body": "...short site observation..." }
```

The harness also uses public API reads to discover generated identifiers and to
verify `fixtureMode`. A `finally` cleanup deletes the unique project through the
API if the UI journey exits early; the success path deletes it through the UI.
No test writes directly to Neon.

## Cost and flake controls

- Chromium only for live wiring; the mock lane keeps four-browser coverage.
- `workers: 1`, `retries: 0`, and one AI generation per workflow run.
- Short deterministic notes minimize tokens; assertions target schema and
  invariants rather than exact prose.
- A bounded test timeout accommodates Fly cold starts and provider latency.
- Unique project data and best-effort cleanup keep reruns isolated.

## Acceptance

The gate is complete when static policy tests require the isolated preview,
account seeding, safe Playwright config, live-provider assertion, and post-deploy
workflow order; the local mock suite still passes; and the deployed PR workflow
passes the live journey against the current merge SHA.
