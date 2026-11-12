# Website-only production gate

## Problem

PR #524 changes only public-site typography, but `main-gate` requires a
successful `fly-preview` job. Website-only PRs intentionally do not provision
Fly or Neon, so the required `journeys` check fails before validation.

## Decision

Keep the required `journeys` check. For focused PRs whose entire base-to-head
change contains public-site files and optional documentation, require the
successful exact-head `site-preview` deployment job and verify the site's
commit/branch marker and existing guide redirect. That deployment job already
requires the site's unit, lint, typecheck, browser, redirect, and Lighthouse
checks. No test-account credentials enter this website-only path.

Require at least one `apps/site/` change. Classify the complete three-dot PR
diff with rename detection disabled, so deleting or moving an API file cannot
turn a mixed change into a site-only change. Unknown paths, shared packages,
configuration, and workflow changes retain the existing API gate. Promotions
from `dev` always retain API journeys, even when their content is site-only.
Dependabot's existing direct-production rejection remains in place.

Reuse the existing preview-provenance helper with a configurable job name;
its default remains `fly-preview`. Failed, skipped, absent, or stale-head
site deployment jobs must fail the gate. The Pages identity check independently
proves that the expected branch serves the exact PR head.

Gate wiring remains protected: land this fix through `dev` and promote it
normally before rebasing the website PR onto the updated `main`.

## Verification

Exercise allowlisted, mixed, unknown, docs-only, renamed, and missing-ref
changes. Extend the provenance tests for successful/failed/skipped website
jobs and exact workflow/job selection. Run the existing release, trust,
selective-preview, Pages identity, and shell policy checks.
