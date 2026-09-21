# 2026-09-21 — Better Auth patch reversed the account schema

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** Updating Better Auth from 1.7.2 to 1.7.5 made every auth-backed
request return 500. Startup validation reported that `account.issuer` was a
required column the runtime never writes.

**Root cause.** Better Auth 1.7.0–1.7.2 required issuer-keyed accounts, and
Harpa Pro deployed that schema. Version 1.7.3 restored
`(provider_id, account_id)` identity, so the previously correct `NOT NULL`
column and issuer index became incompatible with new account writes.

**Fix.** PR #416 adds migration
`0033_relax_better_auth_account_issuer.sql`, removes issuer from the generated
Drizzle contract and seed inputs, and retains only a nullable physical column
plus default for a bounded 1.7.2 rollback.

**Test.** The migration integration suite now applies 0032 followed by 0033,
asserts the nullable/default/index contract and preserved credential data, and
proves drift fails atomically. Default-wired password sign-in and seed tests
exercise the 1.7.5 adapter.

**Pattern.** Dependency patch releases can reverse a recently introduced
database contract. Treat auth-stack patches as schema changes until generated
schema and real adapter initialization prove otherwise.
