# 2026-08-21 — compatible dependency patches were absent from the lockfile

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** `pnpm audit --prod` reported eleven findings, including patched
advisories in the API's direct `nanoid` dependency and in transitive
`nanoid@3` and `js-yaml@3` releases. The available fixes did not require a
framework or native dependency upgrade.

**Root cause.** The API manifest allowed an older `nanoid` patch and the
frozen lockfile retained advisory-affected transitive releases even though
compatible patched versions existed.

**Fix.** Raise the API dependency to `nanoid@^5.1.16` and add range-scoped pnpm
overrides for `nanoid@3.3.18` and `js-yaml@3.15.1`. The refreshed production
audit reports four remaining toolchain findings; the current graph has no
compatible patched resolution for those edges, so they remain visible rather
than being suppressed.

**Test.** `dependency-advisory-policy.test.cjs` checks secure manifest and
override floors, then rejects the complete affected `nanoid` range and the
remediated `js-yaml@3` range without requiring test rewrites for later safe
patch targets. The PR
`lint-typecheck` workflow runs it alongside the existing dependency policy
checks.

**Pattern.** As with the earlier `shell-quote` incident, a frozen lockfile can
strand security patches within already-compatible dependency ranges. Pin the
smallest safe edge, make the resolved graph reviewable, and remove an override
when its parent declares the secure floor.
