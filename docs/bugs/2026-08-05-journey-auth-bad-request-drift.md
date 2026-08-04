# 2026-08-05 — Journey auth error expectation drift (Pattern R13)

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** The exact post-merge `dev` deployment was healthy and its core and
extended journeys passed, but `journey-stress` reported one failure when the
email sign-in route rejected invalid JSON with HTTP 400 `BAD_REQUEST`.

**Root cause.** `scripts/journeys/stress.sh` still encoded the earlier
`500|429` behavior for empty and malformed JSON. The API now classifies both as
client errors. Shellcheck proved the script was valid shell, but no pull-request
test pinned these black-box status expectations, so the stale assertion was
first exercised after merge.

**Fix.** Accept `400|429` for both invalid-body cases, retaining 429 because the
auth-route limiter can reject the request first, and document the distinction
in the journey guide.

**Test.** `scripts/ci/__tests__/stress-auth-error-policy.test.sh` asserts both
status sets and verifies that `lint-typecheck.yml` runs the policy on pull
requests.

**Pattern.** R13 — black-box journey expectations drift after API policy
changes.
