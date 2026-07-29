# 2026-07-30 — query cache crossed auth sessions (Pattern R14)

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** After a session expired or another account signed in on the same
device, screens could briefly render projects, reports, members, notes, or
profile data from the previous account before the background refetch replaced
it.

**Root cause.** The root `PersistQueryClientProvider` restored one global
`rq-cache-v1` MMKV snapshot before better-auth had resolved the active user.
Explicit sign-out and API 401 paths removed that blob, but passive session loss
and direct user-id transitions did not cross either callback before hydration.

**Fix.** Auth now resolves before `SessionQueryProvider` mounts React Query.
Snapshots use `rq-cache-v2:<encoded-user-id>` keys, the legacy key is discarded,
and every settled identity receives a fresh in-memory `QueryClient`. Descendants
are withheld during transitions, so an old asynchronous restore can mutate only
an unreachable old client. Unauthenticated boundaries clear all query snapshots.

**Test.** Persister tests prove one account cannot cold-restore or overwrite
another account's snapshot. A provider regression switches Alice to Bob and
asserts that no Bob-session render observes Alice's data before Bob's own cache
is restored; a delayed-restore regression releases Alice's restore after Bob is
mounted and proves Bob's client remains unchanged.

**Pattern.** R14 — durable client state must be scoped to the authenticated
principal and must not hydrate before that principal is known.
