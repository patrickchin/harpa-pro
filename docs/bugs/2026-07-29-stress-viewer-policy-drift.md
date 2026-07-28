# 2026-07-29 — Stress journey retained the old viewer policy (Pattern R13)

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** The stress journey expected a viewer to rename a project with
HTTP 200 after the API had made viewers read-only. Its post-deploy run would
therefore report the correct HTTP 404 as a failure.

**Root cause.** The role-authorization fix updated the API, integration tests,
and architecture contract, but not the black-box journey or its README.
PR checks only shellchecked journey syntax, so the stale status expectation
remained valid shell and passed.

**Fix.** Update the viewer rename assertion and journey documentation to the
reviewed 404 contract, then run a focused policy test from the PR-gated
`lint-typecheck` workflow.

**Test.** `scripts/ci/__tests__/stress-viewer-policy.test.sh` requires the
viewer project PATCH to expect 404 and rejects the former 200 expectation.

**Pattern.** New pattern **R13 — black-box journey expectations drift after
API policy changes**.
