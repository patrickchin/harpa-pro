# Recurring bugs log

> Catalogue of bugs that have bitten us more than once and the
> patterns (R1, R2, …) that produce them. When you ship a fix for a
> bug that recurred, that almost-recurred, or that only got caught
> by manual QA / E2E despite green tests, add an entry below in
> the same PR.
>
> See also:
> - [`AGENTS.md`](../../AGENTS.md) — hard rules + recurring-bugs reminder.
> - [`docs/v4/pitfalls.md`](../v4/pitfalls.md) — design-level lessons from the v3 attempt that map 1:1 to the hard rules.
> - [`docs/v4/architecture.md`](../v4/architecture.md) — system overview.

## Entry template

```
### YYYY-MM-DD — short title (Pattern Rn if applicable)

**Symptom.** What went wrong (user-visible).
**Root cause.** Why.
**Fix.** PR/commit + the change in one sentence.
**Test.** The new automated test that would have caught it.
**Pattern.** Which Rn this maps to (or "new pattern Rn — added below").
```

## Patterns

### R1 — Framework swallow: thrown non-Error values bypass middleware

A try/catch in a framework's dispatch loop that does
`if (err instanceof Error) onError(err, c)` will silently re-throw
(or propagate up to the runtime as an uncaught exception) for any
non-Error throw — `throw 'oops'`, `throw 42`, `throw null`,
`throw { foo: 'bar' }`. The mapper / error-handling middleware
never runs, so the wire response shape and any leak guarantees
the mapper enforces are bypassed too. Lint cannot catch this:
TypeScript permits `throw <unknown>`. Mitigation: keep the codebase
disciplined to throw Error subclasses, and assert this contract
narrowly in property tests (don't pretend the framework will save
you).

## Entries

### 2026-05-12 — Hono v4 onError ignores non-Error throws (Pattern R1)

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

**Pattern.** R1 (new — added above).
