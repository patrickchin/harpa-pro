# 2026-10-10 — unavailable MinIO Quay images (Pattern R22)

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** API integration coverage failed before account-deletion tests
could run: Docker reported `unauthorized` while pulling the pinned MinIO
server. A retry failed in the same place. Cached developer images could
hide the failure, as with the September Docker Hub removal.

**Root cause.** MinIO community distribution is now source-only. Fresh
pulls of both the pinned server and the release in the official Compose
example returned 401; the historical binary download service returned 410.
Changing registry tags could not restore a reliable fixture.

**Fix.** Build the official server and client at immutable source commits
in one shared Dockerfile. Build it before bounded integration hooks, use
it in Compose, and run the bundled client for cleanup and screenshot seeds.
Changes to this Dockerfile trigger API checks through changed-paths.

**Test.** Build on a fresh image cache, run the real signed upload and
account-deletion suites, and run full API coverage. The release-confidence
policy checks the source pins and rejects the retired Quay references.

**Pattern.** R22 — verify fresh dependency resolution, not a cached image.

Upstream distribution policy:
[MinIO README](https://github.com/minio/minio#source-only-distribution).
