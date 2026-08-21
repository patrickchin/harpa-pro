# 2026-08-21 — Error envelope request ID drift

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** Generated clients described `requestId` as an optional field
nested under `error`, while the application error mapper emitted a required
top-level correlation ID. A consumer generated from the contract could drop
the ID that operators need to correlate a client failure with API telemetry.
Five route modules and both well-known manifest routes also redeclared weaker
local error schemas, so fixing only the shared schema left part of the
generated contract stale.

**Root cause.** The shared Zod schema modeled an older nested shape and was
permissive about missing and unknown properties. Its unit test only checked
that the permissive schema accepted one value. The runtime property test used
`safeParse`, but then asserted the top-level ID independently, so it never
proved that the parsed contract required that ID. Separately, OpenAPI route
validators had no shared `defaultHook`, so zod-openapi serialized failed
parses in its own internal shape instead of throwing through the application
error mapper. The dashboard also preferred the legacy nested ID when both
forms were present, and the direct admin invalid-credentials response omitted
the top-level ID entirely.

**Fix.** Make the contract strict at both levels, require a non-empty
top-level `requestId`, regenerate OpenAPI and client types, and configure every
OpenAPI router with one shared validation hook that forwards Zod failures to
the application mapper. Every documented application error imports the shared
schema, including direct admin-auth and well-known responses. Mobile and
dashboard retain nested-field support as explicitly deprecated read
compatibility. When both forms are present, the canonical top-level value
wins.

**Test.** The contract test rejects the retired nested-only shape. The error
mapper property suite now parses every runtime body with the strict schema,
and a malformed request against the registered `/waitlist` OpenAPI route
proves real validator failures take the same path. Mobile and dashboard client
tests pin canonical-over-legacy precedence. The OpenAPI contract suite walks
every documented `4xx`/`5xx` JSON response and requires the canonical schema,
with a narrow allowlist for readiness and report-version state responses.
Admin-auth integration coverage compares credential-failure fields after
removing only the nondiscriminatory per-request correlation ID.

**Pattern.** No existing recurring-bug pattern; this was contract/runtime
drift hidden by a permissive schema assertion.
