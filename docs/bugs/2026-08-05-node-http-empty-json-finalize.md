# 2026-08-05 — zero-byte JSON finalize failed through Node HTTP (Pattern R5)

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** The deployed API returned `400 Bad Request` when an older client
sent `POST .../finalize` or `POST .../unfinalize` with
`content-type: application/json` and zero body bytes. Cross-user finalize
requests also returned `400` before authorization could preserve the expected
resource-hiding `404`.

**Root cause.** The compatibility middleware only replaced an empty body when
`Request.body === null`. In-process Hono tests use that representation, but
`@hono/node-server` exposes a zero-byte POST as a non-null empty stream. The
OpenAPI JSON validator therefore tried to parse an empty string and rejected
the request as malformed.

**Fix.** Read JSON request text through Hono before OpenAPI validation. Replace
the cached text with `{}` only when its exact length is zero. Leave every
non-empty body untouched so valid optimistic-concurrency payloads and malformed
JSON keep their existing behavior. The curl journeys intentionally retain
zero-byte finalize and unfinalize calls as deployed compatibility canaries.

**Test.** `reports.node-http.integration.test.ts` starts a real
`@hono/node-server` listener and sends requests over a socket. It covers owner
finalize `200`, cross-user finalize `404`, owner unfinalize `200`, non-empty
precondition JSON `200`, and malformed JSON `400` without mutation.

**Pattern.** R5 — in-process dispatch did not exercise the deployed default
HTTP adapter, so a transport-specific request representation stayed hidden.
