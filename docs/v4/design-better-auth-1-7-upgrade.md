# Better Auth 1.7 upgrade design

- **Status:** Proposed
- **Scope:** API auth schema and adapter, test/demo account tooling, Expo auth
  storage, generated schema, and deployment sequencing
- **Target:** Better Auth `1.7.2` and `@better-auth/expo` `1.7.2`

## Summary

Better Auth 1.7 changes the identity of an account from the 1.6
`(providerId, accountId)` model to `(issuer, accountId)`. Its Drizzle schema
therefore adds a required `account.issuer` column and a unique index over
`(issuer, account_id)`. It also makes Expo cookie access asynchronous and
expects custom storage to expose both synchronous and asynchronous methods.

The upgrade must not be merged as a dependency-only change. It is split into
two protected stages:

1. **Expand:** deploy the 1.7-compatible database shape while all runtimes are
   still on 1.6.28. Inventory and canonicalize credential accounts, add the
   issuer column and uniqueness constraint, and retain a compatibility default.
2. **Adopt and logically contract:** after the expanded schema is proven in
   both dev and production, switch the API, dashboard, and mobile packages to
   1.7.2 and make every writer supply the new identity explicitly. Keep the
   database default during this stage so a 1.6 code rollback remains safe.

Removing the default is a later physical-contract change, outside this
upgrade. It may happen only after the team explicitly closes the 1.6 rollback
window.

Dependabot PR #372 is the Stage 2 vehicle, but it is not mergeable in its
current dependency-only shape. It is behind `dev`, does not contain the
generated schema or SQL migration, and exposes both an API module-load
regression and a mobile async-storage change. After Stage 1 is proven in
production, refresh #372 from `dev` and add the Stage 2 implementation, tests,
and documentation to that branch before merging it.

## Goals

- Preserve all existing users, credential accounts, password hashes, sessions,
  and verification records while adopting Better Auth 1.7.2.
- Preserve the ownership of every existing credential account through the
  one-to-one key change from `(credential, user_id)` to
  `(local:credential, user_id)`.
- Make the database safe for both the old 1.6 writer and the new 1.7 writer
  throughout rollout and rollback.
- Keep API modules, OpenAPI generation, lint, and unit tests importable without
  a configured database.
- Make the Expo storage adapter and bearer-token getter honor the new async
  Better Auth contract without weakening the existing synchronous access path.
- Prove the generated Drizzle schema, raw-SQL fixtures, seed tooling, and auth
  behavior in automated tests.

## Non-goals

- Adding Sign in with Apple, Google Sign-In, or any other external provider.
- Choosing or migrating the identity of any future external provider.
- Replacing the repository's SQL migration runner with the Better Auth CLI or
  Drizzle Kit.
- Removing `provider_id`, changing public auth routes, or rotating cookies.
- Removing the transitional `issuer` default in either protected stage.

## Current evidence and constraints

The 1.7.2 generator changes only the logical `account` declaration:

```ts
import { index, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

export const account = pgTable(
  'account',
  {
    // Existing fields are unchanged.
    issuer: text('issuer').notNull(),
  },
  (table) => [
    index('account_userId_idx').on(table.userId),
    uniqueIndex('account_issuer_accountId_uidx').on(table.issuer, table.accountId),
  ],
);
```

The physical column remains `account_id`; no table, column, relation, or
foreign-key rename is part of the upgrade. The existing generated index name
`account_userId_idx` differs from the historical SQL name
`account_user_id_idx`; that mismatch predates 1.7 and must not be bundled into
this migration.

Better Auth 1.7.2's Drizzle adapter reads `db._?.schema` while it is being
constructed. The API's lazy database `Proxy` currently forwards that `_`
property read to `rawDb()`. Importing the auth module without `DATABASE_URL`
then fails before any request or database operation. The adapter is already
given the complete auth schema explicitly and relational joins are disabled,
so `_` must be treated as adapter metadata rather than a reason to initialize
the database.

The installed 1.7.2 `linkAccount` contract requires `issuer`. Its runtime
implementation spreads the supplied object and does not derive the field for
custom calls. Better Auth's built-in credential path uses
`createLocalAccountIssuer('credential')`, which returns
`local:credential`. Our handwritten internal-context type currently masks this
requirement.

The 1.7.2 CLI cannot migrate this repository's Drizzle database. It directs
Drizzle users to generate a schema and use their own migration tooling. The
repository must therefore use `packages/api/src/db/migrate.ts` and a reviewed
SQL file. `auth generate` remains a schema-verification tool, not a deployment
tool.

## Account identity decision and artifact mismatch

The current 1.7 upgrade guide documents
`account: { identityStrategy: 'provider-id' }` for a populated 1.6 database.
However, the exact npm `better-auth@1.7.2` and `@better-auth/core@1.7.2`
artifacts resolved by PR #372 neither declare nor read `identityStrategy`.
Adding it produces an excess-property type error, and bypassing the type would
leave an unknown option that the runtime ignores. Stage 2 must not add or cast
through that unsupported setting.

The 1.7.2 artifact unconditionally keys account-owner lookups by
`(issuer, accountId)`. Its built-in credential paths additionally constrain
`providerId = 'credential'` and supply `createLocalAccountIssuer('credential')`
with the linked user ID as `accountId`. For the only currently supported
account provider, the canonical identity is therefore:

```text
issuer     = local:credential
account_id = user_id
```

This is a one-to-one re-key for a credential-only database, so it preserves
account ownership despite the package/documentation mismatch. The codebase does
not prove what rows are present in each live Neon database, however. Live
provider inventory is therefore **unknown until queried**. The migration must
fail on any provider other than `credential`; it must not guess an issuer,
derive one from an email address, or silently rewrite an unrecognized account.

Any external-provider row blocks Stage 1 and Stage 2. Adding an external
provider later, or upgrading to a Better Auth release that genuinely implements
a configurable identity strategy, requires a new design that reevaluates and,
if necessary, re-keys every account namespace. The published artifact is the
runtime source of truth for this pinned upgrade; guide text alone is not a
reason to install a configuration the artifact does not support.

## Stage 1: expand the schema on Better Auth 1.6.28

Stage 1 contains no Better Auth package upgrade. It adds migration
`packages/api/migrations/0032_better_auth_account_issuer.sql`, updates the
checked-in Drizzle auth schema to the independently generated 1.7.2 shape, and
adds migration and seed assertions.

### Pre-deploy inventory

Run a read-only inventory first against dev and again against production before
promoting Stage 1. Record aggregate counts in the deployment evidence, but do
not copy account IDs, email addresses, password hashes, tokens, or session
values into logs or a PR.

The inventory must answer:

```sql
SELECT provider_id, count(*)
FROM public.account
GROUP BY provider_id
ORDER BY provider_id;

SELECT count(*) AS noncanonical_credentials
FROM public.account
WHERE provider_id = 'credential'
  AND account_id IS DISTINCT FROM user_id;

SELECT count(*) AS projected_collision_keys
FROM (
  SELECT user_id
  FROM public.account
  WHERE provider_id = 'credential'
  GROUP BY user_id
  HAVING count(*) > 1
) AS collisions;
```

Inspect `information_schema.columns`, `pg_indexes`, and `pg_constraint` as
well. `issuer` and `account_issuer_accountId_uidx` should not already exist.
Any unexpected provider, projected duplicate, partially applied schema, or
unexplained constraint blocks the deployment and requires a new reviewed
plan. A clean human inventory does not replace the guards in the migration;
rows can change between inspection and release.

### Transactional migration

The repository migration runner applies ordinary `.sql` files in a transaction
under its advisory lock. The migration must also acquire an explicit
`ACCESS EXCLUSIVE` lock on `public.account` before inspecting or rewriting it,
with a short `SET LOCAL lock_timeout`. This closes the race in which a 1.6
writer could insert a conflicting row after the guard but before the unique
index is created. A lock timeout is a safe failed release, not a reason to
bypass the guard.

Within that transaction, in order:

1. Assert that `public.account` has the expected pre-1.7 shape and that neither
   the `issuer` column nor the new index exists.
2. Assert that every row has `provider_id = 'credential'`.
3. Assert that projecting credential rows to
   `(local:credential, user_id)` creates no duplicate identity. Report only a
   count in an exception, never row values.
4. Add `issuer text` with `DEFAULT 'local:credential'`. The default is required
   for 1.6 writers, which do not include this column.
5. Set every credential row to `issuer = 'local:credential'` and
   `account_id = user_id`. Do not change the account primary key, `user_id`,
   password, token fields, timestamps, or any session/verification row.
6. Recheck that `issuer` and `account_id` are non-null and non-empty, all
   credential identities are canonical, and no duplicate identity exists.
7. Set `issuer` to `NOT NULL` and create the exact unique index
   `"account_issuer_accountId_uidx"` on `(issuer, account_id)`.
8. Assert the final column nullability/default and index definition before the
   migration ledger entry can commit.

The physical default is intentionally not represented in the generated
Drizzle declaration. It is a database compatibility extension, not an
application-side default. Schema generation must not be used to emit or apply
SQL, because doing so could propose removing that compatibility default.

### Stage 1 verification

Integration coverage must exercise the real migration runner against
Testcontainers:

- an empty database and a legacy database both migrate successfully;
- a noncanonical credential row is rewritten while its row ID, user link,
  password hash, tokens, and timestamps are preserved;
- a non-credential provider aborts the transaction and leaves both the schema
  and migration ledger unchanged;
- two rows that collide after canonicalization abort in the same way;
- the final column is non-null, has the compatibility default, and the exact
  unique index is valid;
- an old-style 1.6 insert that omits `issuer` still succeeds and receives
  `local:credential`; and
- the test-account seed remains idempotent and now asserts the stored issuer
  and canonical account ID.

Merge Stage 1 to `dev`, allow the Fly release command to run the migration,
then validate readiness and the inventory postconditions in dev. Promote that
exact `dev` state to `main`, allow the production release command to migrate,
and repeat the postchecks. Stage 2 must not enter `dev` until production is
confirmed healthy on 1.6.28 with the expanded schema.

## Stage 2: adopt Better Auth 1.7.2

Stage 2 updates the coordinated Better Auth versions in the API, dashboard,
mobile app, and lockfile. It contains no destructive database migration and
does not remove the issuer default.

### API adapter and generated schema

- Do not add the guide's unsupported `identityStrategy` option. Pin the
  credential-only assumption in auth integration coverage and fail the rollout
  if inventory finds any other provider.
- Teach the lazy database proxy to return `undefined` for the `_` metadata
  property without calling `rawDb()`. Keep a nearby comment that the adapter is
  passed `authSchema` explicitly and joins are disabled. If Better Auth joins
  are enabled later, this guard must be revisited rather than removed casually.
- Update the handwritten `AuthInternalContext.linkAccount` input type to
  include the required camel-case `issuer` field.
- Update direct account creation and mutation in the test-account seed and demo
  helper to use `createLocalAccountIssuer('credential')` from
  `better-auth/db`, canonical `accountId: userId`, and
  `providerId: 'credential'`. Update lookups with the same identity where
  needed; do not rely only on the old provider pair.
- Update the account-deletion raw-SQL fixture and assertions to include issuer
  and use the canonical account ID.
- Run `pnpm --filter @harpa/api auth:schema:generate` under 1.7.2. The command
  must leave `packages/api/src/db/auth-schema.ts` byte-for-byte unchanged from
  the Stage 1 checked-in shape. Review any difference; do not accept a
  generator-driven rename or drop as incidental formatting.

The proxy fix needs a regression test that imports the real auth/app wiring
with `DATABASE_URL` absent and proves no database initialization occurs. The
existing boot/spec cases should remain, but at least one test must specifically
pin the Better Auth adapter construction path so a future metadata probe cannot
silently reintroduce import-time I/O. `spec:emit` and the spec-drift check are
part of the same gate.

### Expo storage and bearer tokens

Better Auth 1.7's Expo plugin can use asynchronous cookie storage. The custom
development storage in `apps/mobile/lib/auth/client.ts` must expose all four
operations expected by the plugin:

- `getItem` and `setItem` for synchronous callers;
- `getItemAsync` and `setItemAsync` for asynchronous callers; and
- the existing in-memory fallback for SecureStore failures in both paths.

Production continues to pass Expo SecureStore directly. The fallback remains
development-only; production storage errors must not silently downgrade to
memory.

`authClient.getCookie()` is asynchronous in 1.7. Make
`readBearerToken(): Promise<string | null>`, await the cookie result, preserve
the existing session-token parsing, and treat a rejected read according to the
current signed-out/error behavior. The API client already awaits its token
getter, so no new request abstraction is needed.

Tests must capture the storage object given to the Expo plugin and cover the
sync and async happy paths plus SecureStore rejection/fallback behavior. Session
tests must mock resolved and rejected cookie promises and await the bearer
getter. Retain the existing API-client test proving an async token getter is
awaited before the Authorization header is constructed.

### Auth behavior regressions

The focused auth suite must cover:

- email-OTP account creation and sign-in;
- password sign-in for the seeded smoke-test account;
- demo-account credential creation/update and password sign-in;
- seed create, update, and repeat/idempotence paths with the new identity;
- an existing bearer session before the upgrade remaining usable afterward;
- sign-out revoking the session as before; and
- the demo OTP fallback not deleting a credential that is expected to remain.

Better Auth 1.7 may clean up unproven linked credentials during email-OTP
verification. The implementation must review the `emailVerified` policy of the
test and demo seed paths explicitly. Do not change it as an incidental package
upgrade: either prove the current intended flows in tests or make a separately
documented product decision.

### Documentation and recurring-bug record

The implementation PR updates:

- `docs/v4/arch-auth-and-rls.md` for the actual 1.7.2 credential identity, the
  unsupported guide option, and the external-provider upgrade gate;
- `docs/v4/arch-database.md` for the physical issuer column, index, and retained
  compatibility default;
- `docs/v4/arch-mobile.md` for async Expo cookie storage and bearer reads;
- `docs/v4/arch-cicd-and-migrations.md` if any release check or migration
  evidence step changes; and
- `docs/bugs/README.md` plus a dated bug entry for the Better Auth Drizzle
  metadata probe triggering lazy database initialization.

The bug entry should cross-reference the earlier route/module-load boot crash.
The recurring rule is that construction and import-time reflection must not
cross an environment or network boundary; only a request or an explicit
operation may initialize the database.

## Rollout order

Each numbered boundary is protected: required checks must be green, the base
must be current, and branch protection must not be bypassed.

1. Open Stage 1 against `dev`; run the dev inventory before merge.
2. Merge Stage 1 to `dev`; verify the release migration, `/readyz`, auth smoke
   tests, ledger head, and post-migration aggregate checks.
3. Make the **intermediate promotion** of Stage 1 from `dev` to `main`; verify
   the same production evidence while production still runs Better Auth
   1.6.28. This promotion establishes the rollback-compatible schema in
   production and contains no 1.7 runtime.
4. Only after that production verification, refresh Dependabot PR #372 from
   the Stage 1 `dev` head. Add all Stage 2 adapter, mobile, generated-schema,
   fixture, test, and documentation repairs to #372 and rerun every gate.
5. Merge the repaired #372 to `dev`; verify existing sessions, OTP, password
   smoke, API readiness, OpenAPI, and mobile dev-client behavior.
6. Make the **final promotion** of the exact tested Stage 2 state from `dev` to
   `main`. The API deploy precedes any production mobile OTA/release under the
   existing workflow. Continue to treat the lockfile change as
   native-sensitive; do not bypass the mobile readiness/tag policy.

Old installed mobile clients remain compatible because the public auth routes,
cookie names, session schema, and bearer contract do not change. The new API is
also compatible with the expanded schema before newer mobile code ships.

## Rollback and recovery

### Stage 1

Every guard and DDL/backfill statement is transactional. A failed migration
must roll back the schema change and omit the ledger entry, leaving 1.6.28
running unchanged. If Stage 1 commits, do not down-migrate it during an incident:
the extra column, index, and default are compatible with 1.6.28.

### Stage 2

For a code or package regression, revert through the normal protected branch
flow or deploy the last known-good 1.6.28 image under the documented emergency
authority. Keep the expanded schema and issuer default. No data restoration is
needed for a code-only rollback, and dropping the column/index would make the
incident riskier.

If evidence suggests account data was incorrectly rewritten after writers were
enabled, stop affected writers and follow the complete Neon recovery procedure.
Do not restore only selected auth tables: accounts, users, sessions, and
verification state are related. After traffic is safe, prefer a reviewed
forward reconciliation when it avoids discarding valid post-backup auth data.

## Deferred physical contract

A later, separately reviewed migration may remove only the database default
from `account.issuer`. Its prerequisites are:

- at least one healthy production release on 1.7.2;
- confirmation that every operational writer and seed path supplies issuer;
- explicit owner acceptance that rolling back to 1.6.28 is no longer supported;
- a fresh live inventory and rollback plan; and
- green integration coverage for inserts with the default absent.

`NOT NULL` and the compound unique index remain. Removing the default is not a
reason to remove `provider_id`, `account_id`, or any legacy account data.

## Verification matrix

| Area             | Required evidence                                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Generated schema | Run the 1.7.2 auth generator, inspect its output, and require `git diff --exit-code` afterward.                           |
| API static gates | Root lint, API lint, root typecheck, API build, OpenAPI emit, and spec-drift check.                                       |
| API unit         | Full API unit suite, including no-`DATABASE_URL` adapter import and seed/internal-adapter type coverage.                  |
| API integration  | Full Testcontainers suite, migration guards/rollback, seed CLI, OTP/password/session flows, and raw-SQL account deletion. |
| CLI              | Build and run the repository CLI checks that consume the generated API contract.                                          |
| Mobile           | Mobile lint, typecheck, unit suite, async storage/token tests, and bundle smoke.                                          |
| Dashboard        | Dashboard lint, typecheck, tests, and build after the coordinated dependency bump.                                        |
| Deployment       | Dev and production inventories, migration ledger head, `/readyz`, auth smokes, and session continuity.                    |

Local Docker unavailability does not waive integration or CLI evidence. Those
required checks must complete in CI before either stage merges.

## Acceptance criteria

- Stage 1 reaches production and is verified before Stage 2 reaches `dev`.
- Live dev and production inventories contain only understood credential rows,
  or rollout stops without changing data.
- Every credential account ends with issuer `local:credential`, canonical
  `account_id = user_id`, and no projected collision.
- The physical schema has a non-null issuer, the exact compound unique index,
  and the compatibility default throughout both protected stages.
- The checked-in auth schema is exactly reproducible by Better Auth 1.7.2.
- Importing API/spec tooling without `DATABASE_URL` performs no database I/O.
- Custom Expo storage works through both sync and async methods, and bearer
  token acquisition awaits Better Auth's cookie promise.
- Existing OTP, password, session, sign-out, seed, demo, raw-SQL fixture, API,
  dashboard, and mobile tests are green.
- Architecture docs and the recurring module-load bug record ship with the
  implementation.
- Dependabot PR #372 is refreshed and repaired as the Stage 2 vehicle rather
  than merged in its dependency-only form, and both production promotions use
  the exact state already proven on `dev`.

## References

- [Better Auth 1.7 upgrade guide](https://www.better-auth.com/docs/guides/1-7-upgrade-guide)
- [Better Auth v1.7.2 release](https://github.com/better-auth/better-auth/releases/tag/v1.7.2)
- [Auth and RLS architecture](./arch-auth-and-rls.md)
- [Database architecture](./arch-database.md)
- [Mobile architecture](./arch-mobile.md)
- [CI/CD and migration architecture](./arch-cicd-and-migrations.md)
- [Testing architecture](./arch-testing.md)
- [Known recurring bugs](../bugs/README.md)
