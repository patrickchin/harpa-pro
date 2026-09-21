# 2026-09-21 — MinIO Docker Hub image removal blocked API CI (Pattern R22)

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** Required API integration checks failed across unrelated pull
requests before the live R2 tests could run. Testcontainers reported HTTP 404
and pull-access-denied errors for `minio/minio:latest`.

**Root cause.** The shared MinIO helper used a floating Docker Hub alias. MinIO
publishes its container through Quay, and Docker Hub stopped serving the alias.

**Fix.** Point the helper at the verified official Quay registry and pin the
multi-architecture `RELEASE.2025-09-07T16-13-09Z` tag.

**Test.** The existing live R2 Testcontainers suites pull and boot that exact
image before exercising the default-wired signed-PUT and account-deletion
flows.

**Pattern.** R22 — floating external container aliases can disappear beneath
otherwise unrelated CI.
