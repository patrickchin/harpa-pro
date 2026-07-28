# 2026-07-28 — AI fixture mode and privacy crossed the request boundary (Pattern R5)

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** An authenticated AI request carrying `fixtureName`
returned checked-in replay data even when `AI_LIVE=1`. Separately,
recorded fixtures could retain a customer name or site address when a
provider repeated private transcript context in its response.

**Root cause.** `pickMode(fixtureName)` treated a request-body field as
authority over runtime wiring, repeating Pitfall 16 in a more dangerous
form. The generic recorder redacted request and response independently,
so identifiers learned from the request were unavailable while walking
the response. The dedicated report recorder bypassed the redactor
entirely.

**Fix.** Select live versus replay solely from parsed server
configuration. Route both recorder paths through one `redactFixture`
boundary that discovers identifiers across request, response, and
non-persisted private context. Sanitize the affected checked-in
scenario and refresh its deterministic hash.

**Test.** The live service test and authenticated route integration
both send a fixture name under `AI_LIVE=1` and assert a provider HTTP
call. Package tests cover structured and free-text customer/site
redaction, cross-request/response propagation, dedicated-recorder
wiring, and privacy scanning across committed fixtures.

**Pattern.** R5 — tests covered replay and isolated redaction helpers
but not the production trust boundary. This is a Pitfall 13
default-wiring gap and a recurrence of Pitfall 16.
