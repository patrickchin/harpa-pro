# 2026-09-01 — dashboard preview expected a synthetic SHA

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** PR #366 deployed a healthy Fly preview whose `/healthz` marker
matched the immutable pull-request head, but the dashboard deployment job
rejected it for all 60 compatibility attempts and never reached its Pages or
live-browser checks.

**Root cause.** `pr-preview.yml` explicitly checks out and deploys
`github.event.pull_request.head.sha`. `dashboard-preview.yml` retained the old
`github.sha` contract, which is GitHub's synthetic merge commit for a
`pull_request` workflow. Exact API-input verification correctly refused to
treat those two different releases as interchangeable.

**Fix.** PR #366 makes dashboard API verification expect the immutable
pull-request head. Fly and the mirrored `pr-N` Pages branch now use one SHA
identity before the deployed browser journey runs.

**Test.** `dashboard-live-e2e-policy.test.sh` and
`dashboard-pages-policy.test.sh` require the head-SHA expression. Both tests
failed against the stale workflow before the fix and pass with the aligned
contract.

**Pattern.** Exact-SHA proof consumers must follow the deployment workflow's
checkout contract. A synthetic merge SHA is not a substitute for an explicitly
deployed pull-request head.
