# 2026-05-14 — Waitlist 202s with empty DB; fake-Turnstile required a magic token shape (Pattern R5)

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** Submitting the marketing waitlist form against the
local `docker compose` stack returned the "Check your inbox" state,
yet `app.waitlist_signups` stayed empty and no confirmation email
was queued. Caught by the human running it; no automated test
flagged it.

**Root cause.** `fakeTurnstile()` in
`packages/api/src/lib/turnstile.ts` accepted only tokens starting
with `tt-`. The Cloudflare test-key widget in the browser emits
real-format tokens (e.g. `XXXX.DUMMY.TOKEN.XXXX`), so the route's
Turnstile check failed and returned the neutral 202 (the deliberate
silent rejection for bots). Every existing integration test
injected `alwaysOkTurnstile()` via `setWaitlistClients({…})`, so
the default factory was never exercised — classic DI-stubs-as-spec.

**Fix.** Loosened `fakeTurnstile()` to accept any non-empty token
(still rejects empty as "widget not wired") and added an integration
test that calls `/waitlist` without injecting a Turnstile stub,
asserting both the DB row and the queued email. The form was also
moved onto the shared `waitlistSignupRequest` schema from
`@harpa/api-contract` (`safeParse` + schema-derived `maxLength`
attrs) so over-length submissions surface as field-level errors
instead of generic 400s.

**Test.** `packages/api/src/__tests__/waitlist.integration.test.ts`
— two new cases: "default fakeTurnstile accepts any non-empty
token end-to-end" and "default fakeTurnstile rejects empty token".
Marketing site Playwright E2E (driving the live form against the
compose stack) is the longer-term gate — tracked as the next step
in `docs/v4/arch-testing.md`.

**Pattern.** R5 (new — added to README).
