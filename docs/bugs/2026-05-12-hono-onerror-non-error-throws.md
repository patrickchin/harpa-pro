# 2026-05-12 — Hono v4 onError ignores non-Error throws (Pattern R1)

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** A handler that does `throw 'oops'` (or any non-Error
value) crashes the worker with an unhandled exception instead of
returning a 500 envelope. Discovered while writing the P1.10
property tests for `errorMapper`; not (yet) seen in production.

**Root cause.** Hono v4's dispatch loop only invokes `app.onError`
for `Error` instances; non-Error throws propagate out of
`app.fetch`. Our `errorMapper` therefore can't enforce the envelope
or leak guarantees on those throws — they never reach it.

**Fix.** No code change. Documented as Pattern R1; the property
test (`packages/api/src/__tests__/errorMapper.property.test.ts`)
narrows its "unhandled error" arbitrary to Error subclasses
(Error, TypeError, RangeError, custom-name Error) — the realistic
universe given our codebase only throws Error subclasses (mostly
HTTPException / ZodError / AiProviderError). If we ever need to
cover this, the fix is a tiny outermost middleware that wraps
`await next()` in `try { … } catch (e) { throw e instanceof Error
? e : new Error(String(e)); }` — explicitly carved out of P1.10.

**Test.** `errorMapper.property.test.ts` — the narrowed unhandled-
error property + comment pinning the limitation.

**Pattern.** R1 (new — added to README).
