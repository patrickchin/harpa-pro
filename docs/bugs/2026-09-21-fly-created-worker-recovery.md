# 2026-09-21 — Fly worker repair rejected a created active Machine

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** The exact-SHA development API rollout updated the app and passed
its Fly smoke checks, but CI stopped before readiness and journey tests. The
storage-worker inventory contained one stopped standby watching a current-
release worker whose state was `created`.

**Root cause.** The fail-closed repair helper recognized `stopped`, `starting`,
and `started` candidates, but not Fly's valid `created` post-update state. It
therefore rejected an otherwise exact active/standby pair instead of starting
the known candidate.

**Fix.** Recognize only the narrow two-Machine topology: one current-release,
service-less `created` or `starting` candidate and one current-release stopped
standby that watches that exact id. Re-list before any mutation, start only a
still-`created` candidate, poll the same pair through `created`/`starting`, and
finish only after a fresh inventory proves the normal started/standby topology.
Any identity, count, target, service, or state drift still fails closed.

**Test.** The topology fixture suite covers created-to-starting-to-started,
already-starting, naturally settled, wrong-target, pre-start drift, and bounded
stuck-created paths. It asserts that unsafe paths perform no mutation and that
the successful created path issues exactly one start with no update or clone.

**Pattern.** This is the same narrow, identity-proved Fly recovery family as
the 2026-07-29 worker topology incident; no new recurring-bug pattern is needed.
