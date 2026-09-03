# 2026-09-03 — Better Auth metadata probe initialized Postgres (Pattern R20)

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** Updating to Better Auth 1.7.2 made API boot and OpenAPI tooling
fail with `[db] DATABASE_URL is not set; cannot create pool` while merely
importing the application or auth configuration.

**Root cause.** Better Auth's Drizzle adapter reads `db._?.schema` while it is
constructed. The API's lazy database `Proxy` forwarded every property read to
`rawDb()`, so the `_` reflection probe opened the pool during module
evaluation. This repeated the import-time failure shape from the earlier
[`routes/dev.ts` boot crash](2026-06-06-routes-dev-boot-crash.md): construction
crossed a runtime boundary before any request existed.

**Fix.** Dependabot PR #372 makes the proxy return `undefined` for `_`. The
adapter already receives the complete auth schema explicitly and relational
joins remain disabled, so no metadata is lost. If joins are enabled later,
this boundary must be redesigned rather than deleting the guard.

**Test.** `packages/api/src/__tests__/app.boot.test.ts` imports the real Better
Auth configuration with `DATABASE_URL` absent and proves adapter construction
does not initialize Postgres. OpenAPI emission and the spec-drift gate exercise
the same module graph.

**Pattern.** R20 — import-time reflection crosses an external boundary.
Construction and module import must remain local; only a request or explicit
operation may initialize a database or network client.
