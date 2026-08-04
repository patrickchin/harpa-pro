# 2026-08-04 — Dependabot entered privileged PR jobs (Pattern R14)

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** Dependabot pull requests reached Cloudflare, Neon, Fly, EAS, PR
comment, cleanup, and live-journey paths. GitHub withheld ordinary Actions
secrets, so those jobs failed on blank credentials and made otherwise useful
dependency verification red.

**Root cause.** Workflows combined credential-free verification with
publication or treated every same-repository PR as trusted. Dependabot branches
are same-repository branches, and `github.actor` would not be a safe substitute
because a maintainer rerun changes the actor without changing the PR author.

**Fix.** Split admin and public-site verification from deployment. Keep path
and migration guards available, while Cloudflare, Neon, Fly, EAS, cleanup,
comment, and secret-backed journey paths require a non-Dependabot PR author.
Direct Dependabot security PRs to `main` now fail with instructions to recreate
the coordinated update as a human-owned PR through `dev`. No workflow uses
`pull_request_target`, and no deployment credential is copied into Dependabot
secrets.

**Test.** `scripts/ci/__tests__/dependabot-trust-policy.test.sh` statically
checks the update groups, Expo/native ignores, read-only verification jobs,
author guards on every privileged job, fail-closed `main-gate` route, and the
repository-wide absence of `pull_request_target`.

**Pattern.** New pattern R14 — PR verification and privileged publication share
a trust decision; added to `README.md`.
