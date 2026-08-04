# 2026-07-28 — upload jobs crossed auth sessions

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** A pending or failed mobile upload could remain visible and
resume after the original user signed out and another account signed in
on the same device.

**Root cause.** `QueueProvider` owned one app-lifetime in-memory queue and
persisted every job to the same `upload-queue` MMKV `v1` key. Explicit
sign-out and the global 401 path reset auth and query state but neither
aborted nor cleared uploads. The provider also rehydrated immediately,
before better-auth had resolved which user owned the session.

**Fix.** `fix(mobile): isolate uploads by session` adds a whole-queue
abort/clear operation, keys persisted snapshots by user id, waits for a
stable authenticated identity before hydration, and clears the active
queue on explicit sign-out, 401, passive session loss, or user-id change.
The unattributable legacy `v1` blob is discarded.

**Test.** Focused queue, persistence, and root-provider tests assert that
clear aborts active work, users cannot read each other's persisted jobs,
and sign-out, 401, and account switching all clear the active queue.

**Pattern.** R15 — persisted client state that can outlive a screen must be
scoped to the authenticated principal and participate explicitly in auth
teardown.
