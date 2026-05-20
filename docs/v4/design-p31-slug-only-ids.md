# P3.1 Slug-only IDs — Design

> **Status:** awaiting user approval. No code yet.
> **Supersedes:** parts of [arch-ids-and-urls.md](arch-ids-and-urls.md)
> and [design-p30-ids-slugs.md](design-p30-ids-slugs.md) that retain
> UUID PKs alongside slugs.
> **Pitfalls addressed:** #1 (real API tests for every route),
> #6 (per-request DB scope still works after the cast change),
> #14 (CLI/contract path drift — single source of truth in
> `api-contract`).
> **Hard rules touched:** AGENTS.md "Docs in the same PR",
> Conventional Commits, no env-var assertions weakened.

---

## 1. Goals

1. **One ID per entity.** A single column, a single canonical type
   per resource: a Stripe-style prefixed slug. UUIDs disappear from
   the `app` and `auth` schemas entirely.
2. **Branded type safety.** A `ProjectId` cannot be passed where a
   `ReportId` is expected — TS compile error, not a runtime check.
3. **Growable keyspace, frozen on-disk.** A given prefix's *current*
   length can be increased over time without breaking IDs that were
   minted at the old length. Validators accept a closed range
   `[MIN_LEN, MAX_LEN]` per prefix; generators emit at `CURRENT_LEN`.
4. **Single source of truth.** All ID shapes (prefix, lengths,
   regex, branded type) come from one module in
   `@harpa/api-contract`. The API, CLI, and mobile import from it.
5. **Idempotent, replayable migration.** Dev DBs can be wiped. The
   schema migration must run cleanly against an empty DB and is
   re-runnable without error.

## 2. Non-goals

- **Zero-downtime migration.** We are pre-prod. No expand/contract
  pas-de-deux. Wipe and reseed.
- **Stable IDs across the migration.** Existing dev rows are
  expendable. We do not preserve UUIDs as alternates.
- **Tracking historical lengths in the DB.** The `MIN_LEN` per
  prefix is a constant in code, append-only forever. We never
  *shrink* `MIN_LEN`; that is the contract we owe old IDs.
- **Slugs for entities that have no API surface.** `project_members`
  and `user_settings` are addressed by their composite or FK key and
  do not get their own prefix.
- **Better-auth library adoption.** We continue to hand-manage the
  `auth.*` tables via Drizzle, as documented in
  [arch-auth-and-rls.md](arch-auth-and-rls.md) and confirmed in
  `packages/api/src/auth/service.ts`. The "better-auth" name in
  AGENTS.md refers to the *flow* (phone OTP + session + JWT), not
  the npm package. See §7.

---

## 3. Entity inventory + keyspace

Crockford base32 (`0-9a-hjkmnp-tv-z`, 32 symbols, 5 bits/char).
Birthday-collision 50% threshold ≈ `2^(5·L/2)` rows.

| Table | Prefix | `CURRENT_LEN` | `MIN_LEN` | `MAX_LEN` | Birthday-50% at CURRENT | Rationale |
|---|---|---|---|---|---|---|
| `app.projects`             | `prj` | **8**  | 8 | 16 | ~1.0M     | Already minted at 8. Moderate volume; mostly enumerated, not guessed. |
| `app.reports`              | `rpt` | **8**  | 8 | 16 | ~1.0M     | Already minted at 8. Per-project number is the human address; slug is the global key. |
| `auth.users`               | `usr` | **12** | 8 | 16 | ~1.1B     | Appears in every JWT, every server log, every audit trail. Cheap to make wide; expensive to widen later. Start generous. |
| `auth.sessions`            | `ses` | **12** | 8 | 16 | ~1.1B     | High churn (one per device per 7 days); user-scoped but reasoned about globally in logs. |
| `auth.verifications`       | `vrf` | **10** | 8 | 16 | ~33M      | Short-lived, low value, but high enumeration risk from SMS gateway logs. 10 chars = abundant. |
| `app.notes`                | `not` | **10** | 8 | 16 | ~33M      | Many per report. Will dominate row count. |
| `app.files`                | `fil` | **10** | 8 | 16 | ~33M      | One per upload; mirrors `not` cardinality. |
| `app.waitlist_signups`     | `wls` | **10** | 8 | 16 | ~33M      | Public-form surface; defence against enumeration of who signed up. |

**Hard ceiling**: `MAX_LEN = 16` across the board. With prefix +
underscore + 16 chars = 20 chars total → fits a `varchar(24)` if we
ever want one, but see §5 on column type.

**Not slugged** (no public ID surface):

- `app.project_members` — composite PK `(project_id, user_id)`,
  never addressed alone.
- `app.user_settings` — PK is the FK `user_id`.

**Open for next phase**: `org` (organisations), `aud` (audit log) —
will be added when those features land, following the same template.

### 3.1 Why not all 8 chars?

`prj` and `rpt` already exist in dev DBs at 8 chars; widening them
now wastes a migration. Birthday-50% at ~1M rows is uncomfortable
for high-write tables (`not`, `fil`, `ses`) where retries become
common past ~100k rows; widening *those* now is free.

`usr` and `ses` are deliberately the widest because (a) they appear
in logs/tokens forever, and (b) they are linked to PII — narrow
keyspaces invite enumeration.

---

## 4. Type system + validation

### 4.1 Source of truth

A new file `packages/api-contract/src/schemas/ids.ts` owns the
prefix table and exports per-entity Zod schemas + branded types.
`_shared.ts` keeps the legacy `projectSlug`/`reportSlug` exports as
re-exports for one cycle, then deletes them.

```ts
// packages/api-contract/src/schemas/ids.ts
import { z } from 'zod';

/** Crockford base32 lowercase character class. */
const CB32 = '0-9a-hjkmnp-tv-z';

/**
 * Per-prefix length contract.
 *
 *   currentLen — what the generator emits today.
 *   minLen     — smallest historical length we have *ever* minted for
 *                this prefix. Never decrease this number.
 *   maxLen     — hard upper bound. Never exceed this number without a
 *                CHECK-constraint migration on every column that holds
 *                values of this type.
 *
 * The validator accepts `{minLen, maxLen}`. The generator emits at
 * `currentLen`. To grow the keyspace, bump `currentLen` and leave
 * `minLen` alone.
 */
export const ID_SPEC = {
  prj: { currentLen: 8,  minLen: 8, maxLen: 16, brand: 'ProjectId' },
  rpt: { currentLen: 8,  minLen: 8, maxLen: 16, brand: 'ReportId'  },
  usr: { currentLen: 12, minLen: 8, maxLen: 16, brand: 'UserId'    },
  ses: { currentLen: 12, minLen: 8, maxLen: 16, brand: 'SessionId' },
  vrf: { currentLen: 10, minLen: 8, maxLen: 16, brand: 'VerificationId' },
  not: { currentLen: 10, minLen: 8, maxLen: 16, brand: 'NoteId'    },
  fil: { currentLen: 10, minLen: 8, maxLen: 16, brand: 'FileId'    },
  wls: { currentLen: 10, minLen: 8, maxLen: 16, brand: 'WaitlistSignupId' },
} as const satisfies Record<string, IdSpec>;

export type Prefix = keyof typeof ID_SPEC;

interface IdSpec {
  currentLen: number;
  minLen: number;
  maxLen: number;
  brand: string;
}

function idSchema<P extends Prefix>(prefix: P) {
  const { minLen, maxLen } = ID_SPEC[prefix];
  const re = new RegExp(`^${prefix}_[${CB32}]{${minLen},${maxLen}}$`, 'i');
  return z
    .string()
    .regex(re, `invalid ${prefix}_ id`)
    .transform((s) => s.toLowerCase()) as unknown as
    z.ZodType<Id<P>, z.ZodTypeDef, string>;
}

/** Branded string type per prefix. Compile-time disjoint. */
export type Id<P extends Prefix> = string & {
  readonly __brand: typeof ID_SPEC[P]['brand'];
};

export type ProjectId         = Id<'prj'>;
export type ReportId          = Id<'rpt'>;
export type UserId            = Id<'usr'>;
export type SessionId         = Id<'ses'>;
export type VerificationId    = Id<'vrf'>;
export type NoteId            = Id<'not'>;
export type FileId            = Id<'fil'>;
export type WaitlistSignupId  = Id<'wls'>;

export const projectId         = idSchema('prj');
export const reportId          = idSchema('rpt');
export const userId            = idSchema('usr');
export const sessionId         = idSchema('ses');
export const verificationId    = idSchema('vrf');
export const noteId            = idSchema('not');
export const fileId            = idSchema('fil');
export const waitlistSignupId  = idSchema('wls');
```

### 4.2 Path-param naming

To keep route handlers obvious, path params use the bare name
(Stripe-style: `:project`, `:report`, …) — they *are* the ID now;
"slug" is no longer a distinct concept. Route shapes:

| Before (P3.0)                                          | After (P3.1)                                       |
|---                                                     |---                                                 |
| `GET /projects/:projectSlug`                           | `GET /projects/:project`                            |
| `GET /projects/:projectSlug/reports/:number`           | `GET /projects/:project/reports/:number`            |
| `GET /r/:reportSlug` → 308                             | `GET /r/:report` → 308 to long URL                  |
| `GET /p/:projectSlug` → 308                            | `GET /p/:project` → 308 to long URL                 |

The short-URL resolvers stay. Per-project report number stays.

### 4.3 Where `z.string().uuid()` lives today

`packages/api-contract/src/schemas/_shared.ts` still exports
`uuid = z.string().uuid()` (line 14). Audit: grep for `z.string().uuid()`,
`uuid(` from drizzle imports, and the `UUID_RE` constant in
`packages/api/src/db/scope.ts`. The audit step is the first commit
of the implementation phase (no code changes, just the inventory
emitted to `docs/v4/_work/uuid-audit.md`).

---

## 5. Postgres column type

**Decision: `text`, with a per-column `CHECK` constraint.**

```sql
CREATE DOMAIN app.prj_id AS text
  CONSTRAINT prj_id_format CHECK (
    value ~ '^prj_[0-9a-hjkmnp-tv-z]{8,16}$'
  );
```

Rejected: `varchar(20)`. PG stores `varchar(n)` and `text` identically
on disk (TOAST + varlena); the length cap exists only as a constraint.
A `DOMAIN` is more expressive (it encodes the prefix), and we already
need to express the regex so an `id` column doesn't accidentally hold
the wrong type's value.

Rejected: `char(n)`. Variable-length keyspace incompatible with fixed
width; would right-pad with spaces and break equality.

**Per-entity domains** give us:

- A first line of defence (DB rejects malformed values).
- Self-documenting schema (`owner_id app.usr_id` is unambiguous).
- Clean `ALTER DOMAIN` path when we eventually grow `MAX_LEN` from
  16 to, say, 24 — single DDL touches every column.

Domain list (one per slug-bearing table):
`app.prj_id`, `app.rpt_id`, `app.usr_id`, `app.ses_id`,
`app.vrf_id`, `app.not_id`, `app.fil_id`, `app.wls_id`.

Indexes: B-tree on PKs and FKs (same as today). Slug lookups are
already O(log n) via PK. No need for trigram or hash indexes —
exact-match only.

---

## 6. Generator

**Decision: generate in the API layer (TypeScript), not in SQL.**

Reasons:

1. `app.random_slug()` already exists but ignores prefixes and is
   slow (PL/pgSQL loop). Replacing it with a per-prefix function or
   `gen_random_bytes`-based encoder is non-trivial and duplicates
   logic that already exists in `packages/api/src/lib/slug.ts`.
2. The mapping from a prefix to its `currentLen` lives in
   `@harpa/api-contract` (TS). Mirroring that in SQL would create a
   second source of truth — pitfall 14 in waiting.
3. Generation cost is negligible per request; the round trip to
   Postgres dwarfs nanoid's ~µs cost.

Replacement `lib/slug.ts`:

```ts
import { customAlphabet } from 'nanoid';
import { ID_SPEC, type Prefix, type Id } from '@harpa/api-contract/ids';

const ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz'; // Crockford base32

// One generator per prefix, locked to its currentLen.
const generators = Object.fromEntries(
  (Object.keys(ID_SPEC) as Prefix[]).map(
    (p) => [p, customAlphabet(ALPHABET, ID_SPEC[p].currentLen)] as const,
  ),
) as Record<Prefix, () => string>;

export function newId<P extends Prefix>(prefix: P): Id<P> {
  return `${prefix}_${generators[prefix]()}` as Id<P>;
}
```

### 6.1 Collision retry policy

Carried over from the current `slug.ts`:

- Insert with a freshly generated ID inside a `try { … } catch`.
- On Postgres error code `23505` (`unique_violation`) on the PK
  index, regenerate and retry. **Max 3 attempts**, then rethrow.
- At `currentLen` chosen per §3, the chance of any retry firing is
  bounded by the birthday curve well below 0.1% even at the
  designed row counts. Three attempts is theatre at correct
  keyspace; it exists as defence-in-depth.
- Helper `insertWithGeneratedId(table, prefix, builder)` lives next
  to `lib/slug.ts` and wraps the retry. All inserts of slug-PK rows
  go through it.

```ts
export async function insertWithGeneratedId<P extends Prefix, R>(
  db: ScopedDb,
  prefix: P,
  insert: (id: Id<P>) => Promise<R>,
): Promise<R> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const id = newId(prefix);
    try {
      return await insert(id);
    } catch (err) {
      if (isUniqueViolation(err) && attempt < 2) continue;
      throw err;
    }
  }
  throw new Error('unreachable');
}
```

---

## 7. Better-auth integration

**Decision: keep our hand-managed `auth.*` tables; switch their PKs
to `usr_*`/`ses_*`/`vrf_*` like every other entity. No mapping layer.**

`packages/api/src/auth/service.ts` is a thin wrapper over Drizzle
(`startOtp`, `verifyOtp`). It does not use the `better-auth` npm
package — see the file-level comment ("We deliberately do not pull
in the `better-auth` package"). The "better-auth" stack mention in
AGENTS.md refers to the auth pattern (phone OTP + session + JWT),
not the library.

Concrete changes for auth:

- `auth.users.id` → `app.usr_id` (default `newId('usr')` is set in
  app code, not SQL — the column is `NOT NULL` with no DB default).
- `auth.sessions.id` / `auth.sessions.user_id` typed `ses_id` /
  `usr_id`.
- `auth.verifications.id` typed `vrf_id`.
- JWT `sub` claim is now a `usr_*` string. `JwtClaims.sub: UserId`
  (branded). `signJwt` accepts a `UserId`; `verifyJwt` returns one
  after passing the string through the `userId` Zod schema.
- `packages/api/src/db/scope.ts::assertUuid` is replaced by
  `assertId('usr', sub)` / `assertId('ses', sid)` using the same
  module that built the Zod schemas — single source of truth.
- The `SET LOCAL app.user_id = '<sub>'` interpolation already
  escape-protects via the regex assertion; the new regex is
  *stricter* (no `'`, no spaces, no dashes), so injection risk goes
  down, not up.
- All RLS policies that cast `current_setting('app.user_id')::uuid`
  change to `::app.usr_id`. (`is_member(p uuid)` → `is_member(p
  app.prj_id)`.)

**Why not the `better-auth` library?** Pitfall 5 plus the existing
code comment: the library adds complexity we don't need. Switching
to it now would conflict with this refactor. If we ever migrate, we
configure it with custom `generateId` to emit `usr_*` — the library
supports it via the `advanced.generateId` option — and the wire
shape stays the same.

---

## 8. Schema migration strategy

### 8.1 Approach — collapse history

Since dev DBs can be wiped and no production data exists, **delete
all eight existing migration files and replace them with one new
`202611??0001_init_slug_native.sql`**. This is cheaper than carrying
incremental "drop column / change type / re-add FK" migrations that
would never be exercised against real data.

Rejected: incremental migration. Would mean a single ~400-line
`alter_to_slug_only.sql` that drops every FK, drops every PK,
swaps the column type, regenerates IDs, re-adds FKs. Idempotent
shape would be ugly; replayability against an empty DB is the only
property we need, and the collapsed init gives that for free.

The collapsed init is itself idempotent via the existing patterns
(`CREATE … IF NOT EXISTS`, `DO $$ … EXCEPTION WHEN duplicate_object`).

### 8.2 New init.sql — representative shape

```sql
-- 202611??0001_init_slug_native.sql

CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS app;

-- Roles
DO $$ BEGIN CREATE ROLE app_authenticated NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE app_anonymous NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ID domains. One per prefix. Regex matches @harpa/api-contract.
CREATE DOMAIN app.prj_id AS text CHECK (value ~ '^prj_[0-9a-hjkmnp-tv-z]{8,16}$');
CREATE DOMAIN app.rpt_id AS text CHECK (value ~ '^rpt_[0-9a-hjkmnp-tv-z]{8,16}$');
CREATE DOMAIN app.usr_id AS text CHECK (value ~ '^usr_[0-9a-hjkmnp-tv-z]{8,16}$');
CREATE DOMAIN app.ses_id AS text CHECK (value ~ '^ses_[0-9a-hjkmnp-tv-z]{8,16}$');
CREATE DOMAIN app.vrf_id AS text CHECK (value ~ '^vrf_[0-9a-hjkmnp-tv-z]{8,16}$');
CREATE DOMAIN app.not_id AS text CHECK (value ~ '^not_[0-9a-hjkmnp-tv-z]{8,16}$');
CREATE DOMAIN app.fil_id AS text CHECK (value ~ '^fil_[0-9a-hjkmnp-tv-z]{8,16}$');
CREATE DOMAIN app.wls_id AS text CHECK (value ~ '^wls_[0-9a-hjkmnp-tv-z]{8,16}$');

-- Enums (unchanged from current init)
DO $$ BEGIN CREATE TYPE app.project_role AS ENUM ('owner','editor','viewer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- … etc.

-- auth.users
CREATE TABLE IF NOT EXISTS auth.users (
  id            app.usr_id PRIMARY KEY,
  phone         varchar(32) NOT NULL UNIQUE,
  display_name  text,
  company_name  text,
  is_admin      boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth.sessions (
  id          app.ses_id PRIMARY KEY,
  user_id     app.usr_id NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth.verifications (
  id                       app.vrf_id PRIMARY KEY,
  phone                    varchar(32) NOT NULL,
  twilio_verification_sid  text,
  consumed_at              timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now()
);

-- app.projects
CREATE TABLE IF NOT EXISTS app.projects (
  id                  app.prj_id PRIMARY KEY,
  name                text NOT NULL,
  client_name         text,
  address             text,
  owner_id            app.usr_id NOT NULL,
  next_report_number  integer NOT NULL DEFAULT 1,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- app.reports — slug column gone; id IS the slug.
CREATE TABLE IF NOT EXISTS app.reports (
  id          app.rpt_id PRIMARY KEY,
  project_id  app.prj_id NOT NULL REFERENCES app.projects(id) ON DELETE CASCADE,
  author_id   app.usr_id NOT NULL,
  number      integer NOT NULL,
  status      app.report_status NOT NULL DEFAULT 'draft',
  -- … etc.
  pdf_file_id app.fil_id,
  UNIQUE (project_id, number),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- … notes, files, project_members, user_settings, waitlist_signups
-- following the same pattern (composite PKs unchanged; FKs retyped).

-- RLS policies: identical text to today, with ::uuid casts swapped
-- for ::app.usr_id and helpers (is_member, is_owner) retyped.
CREATE OR REPLACE FUNCTION app.is_member(p app.prj_id)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = app, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM app.project_members pm
    WHERE pm.project_id = p
      AND pm.user_id = current_setting('app.user_id')::app.usr_id
  );
$$;
-- … etc.
```

### 8.3 What gets dropped

- All eight current migration files (`202605120001` …
  `202605170001`).
- `app.random_slug()` function (no longer called).
- The `slug` column from `app.projects` and `app.reports` (id *is*
  the slug now).
- Every `uuid` / `gen_random_uuid()` from app + auth schemas.

### 8.4 FK referential integrity

Every FK that used to reference a `uuid` PK now references the
corresponding `*_id` domain, preserving the existing `ON DELETE`
behaviour from `202605120001_init.sql`:

| FK | Target | ON DELETE |
|---|---|---|
| `sessions.user_id` → `users.id` | `usr_id` | CASCADE |
| `project_members.project_id` → `projects.id` | `prj_id` | CASCADE |
| `reports.project_id` → `projects.id` | `prj_id` | CASCADE |
| `notes.report_id` → `reports.id` | `rpt_id` | CASCADE |
| `notes.file_id` → `files.id` | `fil_id` | SET NULL (new; today the column is just `uuid` with no FK — fixing that bug here) |
| `files.owner_id` → `users.id` | `usr_id` | SET NULL or CASCADE — **DECISION**: CASCADE (files belong to the user) |
| `reports.author_id`, `notes.author_id`, `projects.owner_id` → `users.id` | `usr_id` | no FK today; **add NO ACTION** (do not orphan reports if a user is deleted — admin-only operation will reassign first) |

`files.id` PK referenced by `notes.file_id` and
`reports.pdf_file_id` — both gain proper FKs in this migration
since the type system now lets us name them precisely.

### 8.5 Indexes

PK indexes are sufficient for slug lookups. `project_members_user_idx`
unchanged. `reports_number_unique` (`project_id, number`) unchanged.

---

## 9. Code-touch inventory

### Phase A — contract + generator (no DB yet)

- `packages/api-contract/src/schemas/ids.ts` — new, per §4.1.
- `packages/api-contract/src/schemas/_shared.ts` — remove `uuid`
  export; keep `projectSlug`/`reportSlug` as deprecated aliases
  for one commit then delete.
- `packages/api-contract/src/schemas/{projects,reports,notes,files,auth,resolvers,…}.ts`
  — swap `z.string().uuid()` and `projectSlug`/`reportSlug` for the
  new branded schemas.
- `packages/api-contract/src/index.ts` — re-export `ids.ts`.

### Phase B — API generator + scope

- `packages/api/src/lib/slug.ts` → `lib/ids.ts`. Implements `newId`,
  `insertWithGeneratedId`, `assertId`. Old file deleted.
- `packages/api/src/db/scope.ts` — drop `assertUuid`; use
  `assertId('usr', sub)` / `assertId('ses', sid)`.
- `packages/api/src/auth/jwt.ts` — `JwtClaims.sub: UserId`,
  `sid: SessionId`.
- `packages/api/src/auth/service.ts` — generate `usr_*`, `ses_*`,
  `vrf_*` via `newId`/`insertWithGeneratedId`.

### Phase C — schema + migration

- `packages/api/migrations/*` — delete all eight; add one new
  `202611??0001_init_slug_native.sql` per §8.2.
- `packages/api/src/db/schema.ts` — every `uuid(...)` → `text(...)`
  with `.$type<XxxId>()` brand; defaults removed (app code mints).
- `packages/api/drizzle.config.ts` — verify still emits clean
  introspection.

### Phase D — routes

- `packages/api/src/routes/{projects,reports,notes,files,me,settings,resolvers,voice}.ts`
  — swap path-param parsers, request/response schemas. The
  `:projectSlug` rename to `:projectId` is the visible diff;
  internal handlers stop carrying both a UUID and a slug.
- `packages/api/src/routes/resolvers.ts` — short-URL routes use
  branded IDs; redirect logic unchanged.

### Phase E — OpenAPI + CLI

- `pnpm --filter @harpa/api spec:emit && pnpm --filter @harpa/api-contract gen:types`
  in the same commit as Phase D (per Pitfall 14).
- `apps/cli/**` — audit positional args. The only legacy spot is
  `notes update/delete <noteId>` which today still takes a UUID-shaped
  argument; switch to `not_*` validation. Other commands already
  accept slugs.

### Phase F — mobile

- `apps/mobile/app/**` — Expo Router path params: `[projectId]`,
  `[reportId]`, etc. Replace any remaining `[projectSlug]`,
  `[reportSlug]`. Type-import branded IDs from `@harpa/api-contract`.
- `apps/mobile/lib/uuid.ts` stays (still used for client-side
  optimistic IDs on non-server entities, if any) but no longer
  feeds anything that hits the API.

### Phase G — tests + fixtures

- `packages/api/src/__tests__/integration/**` — every seed factory
  switches to `newId(prefix)`. Per-request scope tests gain an
  "actor-X-cannot-read-actor-Y" pair for the new ID shape (Pitfall 6
  is unchanged in spirit; we re-run the existing pairs against the
  new types).
- `packages/ai-fixtures/fixtures/**` — any fixture JSON that names
  a UUID gets re-recorded. Use `pnpm fixtures:record` against the
  reseeded dev DB.

### Phase H — docs

- `docs/v4/arch-ids-and-urls.md` — rewrite to remove the
  "UUIDv7 PK + slug projection" framing. Becomes "slug-only IDs;
  format and lifecycle".
- `docs/v4/design-p30-ids-slugs.md` — mark superseded.
- `docs/v4/arch-database.md` — note the domain types.
- `docs/v4/arch-auth-and-rls.md` — note that `sub`/`sid` claims are
  now `usr_*`/`ses_*` and the scope wrapper validates accordingly.

---

## 10. Rollout plan (commit-by-commit)

Each phase ends with `pnpm test:api` green (or, for Phases A/B,
build green). Dev DBs are wiped between Phase C and D.

| # | Commit (Conventional) | Stopping point |
|---|---|---|
| 1 | `chore(api-contract): add ids.ts skeleton, no consumers` | Module exists, exported, unused. `pnpm -r build` green. |
| 2 | `refactor(api-contract): replace uuid + slug schemas with branded ids` | All schemas import from `ids.ts`. CLI/API still compile because TS doesn't check at this layer yet. |
| 3 | `refactor(api): replace lib/slug.ts with lib/ids.ts (newId, insertWithGeneratedId)` | New generator in place; old `app.random_slug` still callable but unused. |
| 4 | `refactor(api): drizzle schema → text-typed slug IDs` | `pnpm --filter @harpa/api build` green. Migrations still old; integration tests broken (expected). |
| 5 | `refactor(api): collapse migrations into slug-native init` | Wipe dev DB. `pnpm --filter @harpa/api db:migrate` green. `pnpm test:api:integration` green. |
| 6 | `refactor(api): scope.ts and jwt.ts use usr_/ses_ ids` | Auth integration tests green. |
| 7 | `refactor(api): route params projectSlug→projectId etc.` | API tests green; OpenAPI spec regen committed in same commit. |
| 8 | `refactor(api-contract): regenerate openapi types` | `pnpm --filter @harpa/api-contract gen:types` clean. |
| 9 | `refactor(cli): consume new branded ids; drop uuid arg validators` | CLI builds, smoke commands green. |
| 10 | `refactor(mobile): expo-router params projectId/reportId; types from api-contract` | iOS sim build green; Maestro flows updated. |
| 11 | `docs(v4): rewrite arch-ids-and-urls; mark design-p30 superseded; add this design as accepted` | All cross-links resolve. |

Each commit is reviewable in isolation. Stopping after any commit
≥ 5 leaves the system runnable end-to-end.

---

## 11. Risks + mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Forgetting an RLS policy cast; per-request scope silently fails open | Medium | Critical | Pitfall 6's "X can/cannot read Y" pair runs for every authed route; the collapsed init.sql is reviewed line-by-line against the existing `202605120001_init.sql`'s policy block. |
| Drizzle's `text().$type<Brand>()` brand evaporates at runtime | Low | Low | Brands are compile-time only; runtime safety comes from the DB domain CHECK and the Zod parse at the route boundary. Documented in `ids.ts`. |
| `MIN_LEN` accidentally decreased in a later refactor → existing IDs become invalid in code while still present in DB | Low | High | Lint rule: a `MIN_LEN` decrease in `ID_SPEC` is a CI failure (script reads previous commit's value via git). |
| `MAX_LEN` raised in code without raising the DB domain CHECK → DB rejects new IDs | Low | High | Same lint rule, in reverse: `MAX_LEN` increase requires a migration file matching pattern `*_grow_<prefix>_id.sql`. |
| Better-auth library brought in later, requires UUID PKs | Low | Medium | Library supports `advanced.generateId`. Documented in §7. |
| Birthday collisions in `prj`/`rpt` at 8 chars under heavy seeding | Low | Low | `insertWithGeneratedId` retries 3×; integration test seeds < 1k rows per project — far below threshold. If seeding ever crosses ~50k of a type, bump `currentLen` to 10. |
| SQL injection via `SET LOCAL app.user_id` interpolation | Negligible | Critical | The new regex is *stricter* than the old UUID regex (smaller charset, narrower length). Existing defence-in-depth holds. |
| Dev contributor on PG < 17 | N/A | N/A | We no longer depend on `uuidv7()` or `gen_random_uuid()`. No PG-version constraint from this design. |

---

## 12. Open questions for user approval

1. **Keyspace defaults.** Are the per-prefix `currentLen` values in
   §3 acceptable? Specifically, are 12-char `usr` and `ses` warranted,
   or do you want a flat 10 everywhere?
2. **Domain approach.** Confirm `CREATE DOMAIN app.prj_id` is
   preferable to a single shared `app.id` domain that accepts any
   prefix. (My read: per-prefix domains catch wrong-type FKs at
   `INSERT` time; shared domain doesn't.)
3. **Migration collapse vs incremental.** Confirm you want all eight
   existing migrations deleted and replaced with one (§8.1). The
   only argument for incremental is "preserve git blame on the
   schema file" — weak given no prod data.
4. **Path param naming.** `:projectId` (this design) vs
   `:project` (Stripe-style, e.g. `GET /v1/charges/:charge`).
   Recommend `:projectId` for grep-ability; Stripe's shorter form
   is nicer in docs but worse in code.

---

## 13. Reflected todos (load into SQL todo tracker on approval)

1. Phase A — `chore(api-contract): add ids.ts skeleton`
2. Phase A — `refactor(api-contract): replace uuid + slug schemas`
3. Phase B — `refactor(api): replace lib/slug.ts → lib/ids.ts`
4. Phase C — `refactor(api): drizzle schema → branded text ids`
5. Phase C — `refactor(api): collapse migrations into slug-native init.sql`
6. Phase B/C — `refactor(api): scope.ts + jwt.ts use branded ids`
7. Phase D — `refactor(api): route params projectSlug → projectId`
8. Phase E — `refactor(api-contract): regenerate openapi types`
9. Phase E — `refactor(cli): branded ids; drop uuid arg validators`
10. Phase F — `refactor(mobile): expo-router params projectId/reportId`
11. Phase G — `test(api): per-request scope pairs for new id shape`
12. Phase G — `chore(ai-fixtures): re-record fixtures with new ids`
13. Phase H — `docs(v4): rewrite arch-ids-and-urls; supersede design-p30`
14. (Stretch) — `chore(ci): lint rule for ID_SPEC MIN_LEN decrease / MAX_LEN increase without migration`
