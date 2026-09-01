# 2026-08-09 — Dashboard live cleanup omitted its trusted Origin

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** PR #313's deployed dashboard journey completed its business
assertions, then failed during fallback cleanup. The direct
`POST /api/auth/sign-out` returned HTTP 403 with
`MISSING_OR_NULL_ORIGIN`.

**Root cause.** Browser-driven sign-out carries the dashboard page's `Origin`
automatically. The failure-path cleanup instead used Playwright's direct
`APIRequestContext` with only the bearer token. Better Auth correctly rejected
that state-changing cross-origin request before revoking the session.

**Fix.** Derive the trusted origin from `DASHBOARD_LIVE_BASE_URL` and include it
only on the direct cleanup sign-out request. Keep the existing JSON body and
bearer token unchanged. Do not weaken Better Auth's origin guard.

**Test.** The dashboard live E2E policy now requires the cleanup request to
include the derived dashboard origin. The deployed preview journey remains the
end-to-end proof because it exercises the exact Pages-to-Fly origin pair.
