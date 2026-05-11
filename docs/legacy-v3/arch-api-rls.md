# ADR: Per-request RLS-scoped Postgres connections in `packages/api`

Status: Proposed
Date: 2026-05-11
Authors: API architecture
Related: [docs/01-architecture.md](../01-architecture.md), [docs/02-deployment.md](../02-deployment.md), [supabase/tests/README.md](../../supabase/tests/README.md)

---

## 1. Context

The Hono REST API at `packages/api` currently talks to Postgres through one shared `postgres()` pool created in `packages/api/src/db/client.ts` and exposed as a singleton by `packages/api/src/db/instance.ts`. `DATABASE_URL` resolves to the `postgres` superuser in all environments (local supabase, hosted dev, prod). That means:

- **Every** SQL statement run in a request handler bypasses RLS. The handlers themselves enforce authorization by JOIN-ing `project_members` and checking `user_project_role` in code (see `packages/api/src/routes/projects.ts`, `reports.ts`, `report-notes.ts`, `files.ts`).
- The JWT verified in `packages/api/src/middleware/auth.ts` populates `c.set('user', …)` but is never propagated to Postgres, so `auth.uid()` / `auth.jwt()` inside SECURITY INVOKER queries would be `NULL`.
- Integration tests in `packages/api/src/routes/__tests__/integration/*.integration.test.ts` and helpers in `packages/api/src/test-utils/integration.ts` connect with the same superuser URL, so they cannot catch a policy bug — a missing or wrong policy passes green.

This creates two problems:

1. **Defense-in-depth gap.** A bug in a handler's join (e.g. forgetting `isNull(deletedAt)`, mistyping a role check, or copy-pasting a query into a new route) exposes other tenants' rows. The mobile client goes through Supabase Anon Key + RLS and gets that defense for free; the REST API does not.
2. **Drift between RLS and code.** Mobile and API serve the same tables but enforce access through two different mechanisms. New mobile features that hit a previously-mobile-only table (R8 / R9 in `docs/bugs/README.md`) end up with RLS as the only authoritative spec; the API's hand-rolled checks lag.

## 2. Decision

For every authenticated request, the API will execute all SQL on a **dedicated connection** (or transaction) where:

- `role` is set to `authenticated` (or `anon` for unauthenticated routes),
- `request.jwt.claims` is set to the verified JWT payload as JSON,

…using transaction-local `set_config(..., true)` so the settings reset at `COMMIT`/`ROLLBACK` and are safe under Supavisor transaction-mode pooling.

A separate, **explicitly-named** `getServiceDb()` pool — connected as the existing `postgres` role (or, preferably, the dedicated `service_role` role) — remains available for a narrow allow-list of operations that legitimately must bypass RLS.

Authorization-in-code (`getUserMembership` joins) becomes a fast-fail pre-check only; **RLS is the source of truth.**

## 3. Detailed design

### 3.1 Connection topology

Two pools, instantiated lazily in `packages/api/src/db/instance.ts`:

```
getRawPool()      → postgres('DATABASE_URL', { max: 20 })       // role = postgres/authenticator-equivalent
getServicePool()  → postgres('DATABASE_URL', { max: 5 })        // role = service_role (set via SET ROLE in middleware)
```

In hosted Supabase the connection string already authenticates as the `authenticator` role, which has `GRANT authenticated, anon, service_role TO authenticator`, so the *connection identity* is fixed and we switch effective role per transaction with `SET LOCAL ROLE`. Locally (`DATABASE_URL` → `postgres` superuser) the same `SET LOCAL ROLE` calls work because `postgres` is a member of (or superuser over) `authenticated`/`service_role`. Two separate URLs are **not** required; the role switch happens at the SQL layer.

We will, however, run them as **two distinct postgres-js pools** so:

- service-role work cannot leak into a user request via a pool-shared client,
- `max` can be tuned independently,
- observability (slow-query logs, `pg_stat_activity` `application_name`) tells the two apart. Set `connection: { application_name: 'harpa-api/auth' }` and `'harpa-api/svc'`.

### 3.2 Per-request handle

Postgres-js exposes `sql.begin(async (tx) => { ... })` which acquires a connection from the pool, opens a transaction, and releases the connection at the end. Drizzle's `drizzle(client, { schema })` accepts a `postgres-js` `Sql`-like, *including* a transaction handle. Concretely:

```ts
// db/scoped.ts (new)
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema.js';

export async function withUserDb<T>(
  pool: Sql,
  claims: Record<string, unknown> | null,
  fn: (db: Database) => Promise<T>,
): Promise<T> {
  return pool.begin(async (tx) => {
    if (claims) {
      // Order matters: set claims FIRST (postgres role can write any GUC),
      // THEN switch role. After SET LOCAL ROLE authenticated, further
      // set_config calls on request.jwt.* still work (authenticated has
      // USAGE on those custom GUCs), but switching the other direction is
      // restricted, so do role last.
      await tx`select set_config('request.jwt.claims', ${JSON.stringify(claims)}::text, true)`;
      await tx`select set_config('role', 'authenticated', true)`;
    } else {
      await tx`select set_config('role', 'anon', true)`;
    }
    return fn(drizzle(tx as any, { schema }));
  });
}
```

Notes:

- `set_config(name, value, true)` is the textual form of `SET LOCAL`. We prefer it over `SET LOCAL request.jwt.claims = '...'` because the value is a single bind parameter and we don't have to worry about string-escaping a JSON object that may contain quotes.
- `set_config('role', 'authenticated', true)` is equivalent to `SET LOCAL ROLE authenticated` but, again, parameter-safe.
- Supabase's `auth.uid()` is defined as `nullif(current_setting('request.jwt.claim.sub', true), '')::uuid` with a fallback to `current_setting('request.jwt.claims', true)::jsonb->>'sub'`. Setting `request.jwt.claims` is sufficient on current Postgres 15+ Supabase.
- The JSON payload we serialize is exactly what `verifyToken` returned in `packages/api/src/middleware/auth.ts` (sub, role, email, phone, aud, exp, iat, …). We deliberately do **not** synthesize a stripped-down object — RLS policies sometimes read `auth.jwt() ->> 'role'` and similar.

### 3.3 Hono middleware

A new middleware `withRequestDb` mounted *after* `auth` opens the per-request transaction and stashes the Drizzle handle on the context:

```ts
declare module 'hono' {
  interface ContextVariableMap {
    user: AuthUser;
    db: Database;          // RLS-scoped Drizzle handle
  }
}

export const withRequestDb: MiddlewareHandler = async (c, next) => {
  const claims = c.get('jwtPayload') ?? null;       // set by auth middleware
  await withUserDb(getRawPool(), claims, async (db) => {
    c.set('db', db);
    await next();
  });
};
```

Two consequences:

1. **`next()` runs inside the transaction.** Anything the handler does — `db.select(...)`, `db.insert(...)`, even `db.transaction(...)` for nested work — runs inside the same SQL transaction with the GUCs set. postgres-js supports `tx.savepoint(...)` for nested needs; Drizzle's `.transaction()` on top of a transaction handle issues savepoints.
2. **Response body must be produced before the transaction closes.** For JSON-response routes this is already true. For any future streaming endpoint we either (a) buffer the result, (b) materialize a temp table inside the txn and stream from a service-role connection after, or (c) accept that the txn stays open for the stream's lifetime. See §7.

The auth middleware is updated to also stash the verified payload:

```ts
c.set('user', { sub, email, phone, role });
c.set('jwtPayload', payload);   // full JWT for RLS
```

### 3.4 Service-role escape hatch

A second helper:

```ts
export async function withServiceDb<T>(fn: (db: Database) => Promise<T>): Promise<T> {
  return getServicePool().begin(async (tx) => {
    await tx`select set_config('role', 'service_role', true)`;
    return fn(drizzle(tx as any, { schema }));
  });
}
```

Used **only** at explicit, audited call sites — never via middleware. Naming convention: any handler that calls `withServiceDb` must include a one-line comment justifying why RLS is bypassed.

Route handlers reach the user DB via `c.get('db')`. They never call `getDb()`; that function is deleted in Phase 4. ESLint rule (custom) forbids `getDb` and `getServicePool` imports outside `packages/api/src/db/**` and a `service-only/` folder.

### 3.5 Per-route audit

Source of truth: existing route files. Columns: **A** = "needs `authenticated`-scoped read/write", **S** = "needs `service_role` for a specific step", with the reason.

| File / handler | A | S — why |
|---|---|---|
| `routes/health.ts` GET `/health` | n/a (no DB) | – |
| `routes/auth.ts` | currently empty | – |
| `routes/profiles.ts` GET `/profile` | ✅ | – |
| `routes/profiles.ts` PATCH `/profile` | ✅ | – |
| `routes/profiles.ts` GET `/profile/usage` (sum from `token_usage`) | ✅ — RLS `Users can view own token usage` covers this | – |
| `routes/profiles.ts` GET `/profile/usage/history` | ✅ | – |
| `routes/projects.ts` GET `/projects` | ✅ — `Users can view accessible projects` | – |
| `routes/projects.ts` POST `/projects` | ✅ — `projects` INSERT policy `owner_id = auth.uid()`, then `project_members` INSERT works because `user_project_role` returns `'owner'` for the just-inserted row inside the same xact | – |
| `routes/projects.ts` GET/PATCH/DELETE `/projects/{id}` | ✅ | – |
| `routes/projects.ts` `/projects/{id}/members` (list/add/update/remove) | ✅ — admin-only INSERT/UPDATE/DELETE policies already enforce this | – |
| `routes/reports.ts` list/get/create/update | ✅ | – |
| `routes/reports.ts` DELETE `/reports/{id}` (soft-delete) | ✅ — soft-delete via UPDATE; verify `Users can update accessible reports` matches the admin-only app check | – |
| `routes/reports.ts` POST `/reports/{id}/generate` | ✅ for the report read + `reportData` write | **S** — `INSERT INTO token_usage`. Policy restricts INSERT to `service_role` |
| `routes/reports.ts` POST `/reports/{id}/finalize` | ✅ | – |
| `routes/reports.ts` GET `/reports/{id}/pdf` | ✅ for the report row; signed URL is a Storage call (orthogonal) | – |
| `routes/report-notes.ts` list/create/update/delete | ✅ | – |
| `routes/report-notes.ts` reorder | ✅ | – |
| `routes/files.ts` GET `/projects/{id}/files`, GET `/files/{id}`, DELETE `/files/{id}`, POST `/files` | ✅ | – |
| `routes/files.ts` POST `/uploads/presign` | ✅ for membership read | – on DB side; the storage presign uses the Supabase admin client (already service-role outside DB) |
| `routes/files.ts` POST `/voice-notes/{id}/transcribe` | ✅ for `file_metadata` read/write | **S** — `INSERT INTO token_usage` for STT units, if/when recorded |
| `routes/files.ts` POST `/voice-notes/{id}/summarize` | ✅ for `file_metadata` read/write | **S** — `INSERT INTO token_usage` for the LLM call |
| `routes/ai.ts` GET `/ai/providers` | n/a (static) | – |
| `routes/ai.ts` GET `/ai/settings`, PUT `/ai/settings` | ✅ — reads/writes `profiles.ai_provider` / `ai_model` for `auth.uid()` | – |

Pattern: only `token_usage` inserts genuinely need service-role today. Everything else either (a) runs as the user and is covered by an existing policy, or (b) is mediated by an already-service-role external client (Supabase Storage admin).

### 3.6 Authorization-in-code

**Decision: keep `getUserMembership` checks as cheap pre-flight guards; treat RLS as the authoritative gate.**

Rationale:

- Removing the in-code checks now would couple the migration to a behavioral change in error responses (404-from-RLS-empty-rowset vs. 403-from-in-code), making rollback messier. Keep them.
- A pre-check on `project_members` is one indexed lookup; it lets us return a clear 403 with a specific message before issuing the actual mutation, which gives nicer error UX and avoids ambiguous "0 rows updated" semantics. RLS denials silently produce 0 rows on UPDATE/DELETE.
- New routes added under this design must *still* assume RLS will catch them; reviewers enforce that in PRs.

Where the in-code check is the only check (e.g. requiring `role === 'admin'` for member changes), the RLS policy is also admin-only. So removing the in-code check would not relax security; we keep it for UX/observability.

### 3.7 Test harness

- **Fixture setup runs service-role.** `packages/api/src/test-utils/integration.ts` already uses a raw `postgres()` client for `auth.users` / `profiles` / `projects` / `project_members` inserts. That `rawSql()` stays as-is, but is renamed to `serviceSql()` to make intent clear. It is **not** the same connection the API uses.
- **API requests go through the new RLS middleware**, so the integration tests now exercise the same `authenticated`-role path as production. A bug like "viewer can soft-delete a report" will be caught by the existing matrix tests instead of relying solely on `supabase/tests/rls_*.test.ts`.
- **`supabase/tests/rls_*.test.ts` stays.** Threat model: direct supabase-js access from mobile with the anon key + user JWT. That's a different ingress than the REST API and a different set of policies engages (no `set_config` from our side; PostgREST does it). Keeping both suites is correct; documenting the distinction in `supabase/tests/README.md` is part of this change.

### 3.8 Mechanics: postgres-js, Drizzle, Supavisor

- **postgres-js `sql.begin`** returns the result of the callback; on throw it `ROLLBACK`s. We keep the entire request inside the callback so a thrown `HTTPException` triggers `ROLLBACK` — desirable.
- **`sql.reserve()`** (session pinning) is an alternative; we **reject** it because it does not give us automatic rollback on error and because we want transaction semantics.
- **Drizzle**: `drizzle(tx, { schema })` is supported. Drizzle's `.transaction(async tx2 => …)` on top issues `SAVEPOINT`, which postgres-js supports. So nested `db.transaction(...)` in the existing `createProject` handler continues to work — though we should review whether we still want a nested transaction now that the outer middleware already wraps everything.
- **Supavisor transaction mode**: `SET LOCAL` (and `set_config(..., true)`) are scoped to the current transaction and therefore safe — Supavisor will not lease the same backend to a different client mid-transaction. **`SET` (without `LOCAL`) is forbidden** under transaction pooling; we never use it.
- **Cost**: `BEGIN; SET LOCAL ...; SET LOCAL ...; <queries>; COMMIT;` adds three extra round-trips per request. For a typical handler doing 1–2 SELECTs this is ~0.5–2 ms each in-region. Acceptable; revisit if p95 regresses. Optimization: batch as one `select set_config(...), set_config(...)` if profiling shows it matters.

### 3.9 Connection pool sizing

Each request now holds a connection for its entire lifetime, not just per-query. With `max: 20` and p95 handler runtime of ~200 ms, peak concurrent throughput is ~100 req/s. For LLM routes (`/generate`, `/voice-notes/*/summarize`) the request can sit on a connection for 10+ seconds, which would exhaust the pool at very low concurrency.

Mitigations:

- Raise `max` for the user pool to 40 (still well below Supavisor defaults).
- LLM-bound work: open the txn, read the report row, **commit before the LLM call**, then open a *second* txn (also RLS-scoped) for the post-LLM write. Pattern: a `withUserDb` helper that the handler can call explicitly twice instead of relying on the middleware. The middleware still wraps the *default* flow; long handlers opt out.
- The service-role pool for `token_usage` inserts is small (`max: 5`).

### 3.10 SECURITY DEFINER functions

`user_has_project_access` and `user_project_role` are `SECURITY DEFINER` with fixed `search_path = public`. They are referenced by RLS policies, not by API code, so they keep working unchanged. Worth a note: do not add `SECURITY DEFINER` functions casually — every one is an RLS bypass.

## 4. Alternatives considered

### 4.1 Use the Supabase JS client (PostgREST) from the API

Proxy to PostgREST passing through the user's JWT. PostgREST already does role-and-claims setup natively.

- **Pros**: zero new infra; identical semantics to mobile.
- **Cons**: throws away the typed Drizzle layer; PostgREST filter syntax awkward for complex joins; extra HTTP hop; would need RPCs for several handlers. Significant rewrite. **Rejected.**

### 4.2 Drop RLS for tables the API owns, double down on in-code checks

Mark certain tables as "API-only" and disable RLS on them.

- **Pros**: simplest mental model on the server.
- **Cons**: mobile already reads several of these tables directly via supabase-js. Disabling RLS would either break mobile or require a full client rewrite. **Rejected.**

### 4.3 Session-pinned connection with `SET ROLE` (no transaction)

Use `sql.reserve()` to pin a connection per request and `SET LOCAL` inside a manually-issued `BEGIN`, or `SET` (non-local) on a session-pinned connection.

- **Cons**: incompatible with Supavisor transaction mode; worse error semantics. **Rejected.**

### 4.4 Per-request short-lived `authenticated`-role JWT into a separate connection string

Over-engineered; same outcome as 4.3 with extra moving parts. **Rejected.**

## 5. Consequences

### Good

- API enforces RLS in depth; mobile and REST share the same authoritative authorization layer.
- Integration tests now catch policy bugs that previously slipped to manual QA or to the mobile-only RLS suite.
- Clearer mental model: any code that says `c.get('db')` is the user; any code that says `withServiceDb` is explicitly elevated and grep-able.
- A whole class of regressions (R7/R8 in `docs/bugs/README.md`, tenant-spillover) becomes much harder to introduce.

### Bad / costs

- One extra `BEGIN/COMMIT` and two `set_config` calls per request — small but real latency.
- Pool saturation risk for LLM-bound handlers (mitigated in §3.9).
- Long-running / streaming handlers must opt out of the wrapping middleware.
- Test fixtures need to keep a separate raw-SQL channel; conceptual overhead for new contributors.

## 6. Migration plan

### Phase 1 — Service pool + helpers, no behavior change

- Add `getServicePool()`, `withServiceDb`, `withUserDb` under `packages/api/src/db/`. Do **not** wire any middleware yet.
- Leave `getDb()` unchanged.
- Tests: unit-test `withUserDb` against the local DB: assert `select auth.uid()` returns the claim's `sub`, and `select current_user` returns `authenticated`.
- Rollback: revert the new files.

Files touched:
- `packages/api/src/db/instance.ts` (add functions)
- `packages/api/src/db/scoped.ts` (new)
- `packages/api/src/db/__tests__/scoped.test.ts` (new)

### Phase 2 — Convert `profiles` route end to end (pilot)

Why `profiles`: smallest surface, no joins to `project_members`, no service-role steps.

- Update `packages/api/src/middleware/auth.ts` to also set `c.set('jwtPayload', payload)`.
- Add `withRequestDb` middleware in `packages/api/src/middleware/db.ts`.
- In `routes/profiles.ts`, replace `const db = getDb()` with `const db = c.get('db')`, and mount `withRequestDb` immediately after `auth` on `/api/v1/profile*`.
- Tests: existing `profiles.integration.test.ts` should pass unmodified. Add one negative test: query as user A, assert that selecting profiles where `id = userB.id` returns empty (RLS-enforced).
- Update `supabase/tests/README.md` and this ADR.
- Rollback: remove the middleware mount, restore `getDb()` calls.

### Phase 3 — Convert remaining routes, one PR each

Order (cheapest → riskiest):

1. `routes/ai.ts` (profile-only).
2. `routes/projects.ts` (membership + project-create double-insert).
3. `routes/report-notes.ts`.
4. `routes/reports.ts` — split `POST /reports/{id}/generate`: user-db reads the report, user-db writes `reportData`, `withServiceDb` writes `token_usage`.
5. `routes/files.ts` — same split for voice-notes transcribe/summarize.

Per-route checklist (enforced in PR template):

- [ ] Handler uses `c.get('db')` everywhere except clearly-marked service-role blocks.
- [ ] All service-role blocks have a one-line justification comment.
- [ ] An integration test exists that, with a JWT for a user **without** access, the endpoint returns 403/404 — and remains green if the in-code membership check is temporarily removed (proving RLS is the real gate).
- [ ] If the route inserts/updates/deletes, a corresponding `supabase/tests/rls_*.test.ts` exists for the same table.

Rollback per phase: revert the single route's PR; infra and other converted routes stay.

### Phase 4 — Remove the legacy path

- Delete `getDb()` from `packages/api/src/db/instance.ts`.
- Replace any remaining call sites flagged by the compiler.
- Add ESLint / CI grep banning `getDb` and direct `db/client.ts` imports outside `db/scoped.ts` and a service-role allow-list.
- Document the model and link from `docs/01-architecture.md`.

## 7. Risks and open questions

1. **Connection saturation on LLM routes.** Mitigation in §3.9 (commit before LLM call). Action: opt those routes out of the wrapping middleware in the same PR that converts them, and add a load test scenario.
2. **Supavisor + savepoints.** Drizzle nested `.transaction()` issues `SAVEPOINT` on top of an existing txn. Supabase Supavisor transaction mode supports savepoints, but smoke-test against hosted dev before flipping production.
3. **`auth.uid()` cost.** Per-row evaluation; our policies already use the `(SELECT auth.uid())` wrap idiom. Good.
4. **Streaming responses.** None today. Any future streaming endpoint must commit before opening the stream.
5. **Policies that assumed "API runs as superuser".** Audit before Phase 3 per table: `\d+ <table>` and `select * from pg_policies where tablename = '<table>'`; confirm a matching policy exists for each handler op, otherwise add one in the same PR. Spot check first: `file_metadata`, `report_notes`, `reports.lastGeneration`.
6. **Test fixture profile inserts.** `insertProfileLoose` writes to `auth.users` and `public.profiles` as superuser. That stays — fixture setup is by definition service-role. Rename `rawSql` → `serviceSql` in `packages/api/src/test-utils/integration.ts`.
7. **Hosted dev permissions.** Confirm hosted Supabase `authenticator` can `SET ROLE authenticated/anon/service_role`. Test in hosted dev during Phase 2.
8. **OpenAPI / contract tests.** No drift expected.

## 8. Test strategy

- **Unit (Vitest, `pnpm test:api`)**: `db/__tests__/scoped.test.ts` covers `withUserDb` (claims propagated, role is `authenticated`, rollback on throw, nested savepoints) and `withServiceDb`.
- **Integration (`*.integration.test.ts`)**: same matrix as today but now hitting the RLS-scoped path. Add explicit negative tests per route (`viewer cannot soft-delete report`, `outsider cannot read any report`) that *would have passed under the old superuser path*.
- **RLS DB tests (`supabase/tests/rls_*.test.ts`)**: unchanged; they cover direct supabase-js access. Cross-reference added in `supabase/tests/README.md`.
- **Maestro E2E**: unchanged.

## 9. Documentation impact

- New: `docs/v3/arch-api-rls.md` (this ADR).
- Update: `docs/01-architecture.md` — replace "API connects as superuser and enforces auth in code" with the new dual-pool model.
- Update: `supabase/tests/README.md` — clarify the two-ingress threat model.
- Update: `docs/09-testing.md` — note that `*.integration.test.ts` now exercises RLS via the API path.
- Cross-link from `docs/bugs/README.md` under R8/R9: tenant-spillover via missing in-code check, closed by this change.
