# Better Auth 1.7.5 account compatibility

## Context

Harpa Pro deployed Better Auth 1.7.2 with the vendor's then-required
`account.issuer` column and unique `(issuer, account_id)` index. Better Auth
1.7.3 restored the pre-1.7 account identity contract: accounts are selected by
`(provider_id, account_id)`, and new account rows no longer write `issuer`.
Better Auth 1.7.5 validates this at startup and rejects the 1.7.2 Drizzle
schema because a required column that it never writes would make sign-up and
account linking fail.

## Decision

Upgrade the complete Better Auth stack to 1.7.5 and add migration
`0033_relax_better_auth_account_issuer.sql`.

The migration follows the upstream cleanup guidance:

1. Verify that `public.account.issuer` and
   `account_issuer_accountId_uidx` still match the exact 1.7.2 contract.
2. Drop the issuer/account unique index.
3. Make `issuer` nullable.
4. Retain the `local:credential` default and physical column for a bounded
   rollback to 1.7.2. The 1.7.5 Drizzle schema no longer declares the legacy
   field.

Harpa Pro remains credential-only. The seed path identifies a credential by
`(user_id, provider_id, account_id)` and lets the retained database default
populate the legacy column. Adding Google, Apple, or another provider still
requires a separately reviewed identity migration.

## Safety and rollback

The migration runs transactionally with short lock and statement timeouts. It
fails before DDL if the legacy column, index, or existing credential data do
not match the reviewed 1.7.2 shape. Existing account rows and secrets are not
rewritten.

Rolling the application back to 1.7.2 remains possible because the issuer
column and default remain. The dropped uniqueness rule is not needed by the
credential-only deployment, where `account_id = user_id`; restore 1.7.2 only
for a short emergency rollback and roll forward to 1.7.5 after recovery.

## Verification

- Generate the Drizzle auth schema with the pinned 1.7.5 CLI and require a
  clean diff.
- Exercise migration 0032 followed by 0033 against PostgreSQL and verify the
  column is nullable, the legacy default remains, and the issuer index is gone.
- Create and refresh password credentials through the real Better Auth
  adapter, then sign in through the HTTP route.
- Run API integration, CLI integration, unit, typecheck, and lint suites.

## Documentation impact

The auth, database, migration, operations, and testing architecture documents
must describe 0033 as the current head and `(provider_id, account_id)` as the
runtime identity contract. The original 1.7.2 upgrade design remains as a
historical record and is superseded by this document where the contracts
conflict.
