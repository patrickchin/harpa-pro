# 2026-11-13 — Website-only production PRs require an API preview

> See [README.md](README.md) for the bugs index.

**Symptom.** Typography PR #524 targeted `main`, but its required `journeys`
check failed before any test ran because `fly-preview` was skipped.

**Root cause.** The main gate always required API preview provenance for
focused PRs, while the preview provisioner intentionally skips website-only
changes. The two workflows disagreed about which deployment was required.

**Fix.** Classify the full PR diff conservatively. Website-only focused PRs
require the exact-head site validation/deployment job plus the live Pages
identity and redirect checks. Mixed changes and all dev promotions retain
API journeys. Land the gate fix through dev's existing protected path.

**Test.** Real Git diff tests cover cumulative changes and a backend file
renamed into the website. Provenance tests reject failed, skipped, missing,
and stale-head preview jobs while verifying the selected workflow/job.
