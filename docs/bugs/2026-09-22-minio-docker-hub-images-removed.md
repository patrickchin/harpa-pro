# 2026-09-22 — removed MinIO Docker Hub images broke fresh E2E stacks (Pattern R22)

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** `mo up` and fresh `docker compose up` runs failed before the API
started because Docker could not pull `minio/minio:latest` or
`minio/mc:latest`. Machines with an old server image in the local Docker cache
could hide half of the failure.

**Root cause.** The local stack and two fixture scripts still referenced the
retired Docker Hub image names. MinIO publishes the same server and client
images through Quay.

**Fix.** Pin the server to
`quay.io/minio/minio:RELEASE.2025-09-07T16-13-09Z` and the client to
`quay.io/minio/mc:RELEASE.2025-08-13T08-35-41Z` in Compose and every helper
that launches the client image.

**Test.** The release-confidence policy test requires the pinned Quay images
in Compose and both helper scripts, and rejects the removed Docker Hub names.

**Pattern.** R22 — fresh-environment dependency resolution must be exercised;
a developer's local image cache is not evidence that a container reference is
still available.
