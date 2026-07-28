# 2026-07-29 — reusable workflow permission ceiling

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** The first `api-dev` push after PR #202 ended with
`startup_failure` before GitHub created any jobs. The
[failed run](https://github.com/patrickchin/harpa-pro/actions/runs/30402107170)
reported that nested job `register-native-runtime` requested
`contents: write` while the caller allowed only `contents: read`.

**Root cause.** Reusable workflows cannot elevate `GITHUB_TOKEN` beyond the
calling job's permission ceiling. The API workflows called the OTA workflows
without granting the `mobile-ota` caller jobs write access. The called
workflows correctly kept a read-only default and elevated only their manual
tag-registration jobs, but GitHub rejected the graph before evaluating job
conditions.

**Fix.** Grant `contents: write` only to the `mobile-ota` reusable-call jobs in
`api-dev.yml` and `api-prod.yml`. Keep the called OTA workflows at
`contents: read` by default so release-policy and publication jobs cannot
write repository contents.

**Test.** `scripts/ci/__tests__/mobile-ota-release-policy.test.sh` scopes the
caller permission to `mobile-ota`, requires exactly one write grant in each API
workflow, and proves each called workflow keeps one read-only default plus one
registration-only write grant.

**Pattern.** GitHub validates reusable-workflow permissions across the full
caller/callee graph at dispatch time. Static policy tests must cover both sides
of that boundary, not merely the permissions declared by the called workflow.
