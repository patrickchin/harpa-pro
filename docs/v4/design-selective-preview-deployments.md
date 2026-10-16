# Selective preview deployments

## Problem

GitHub preview workflows already filter changed paths, but Cloudflare Pages
watches `*` for all three web projects. Updating the shared `pr-N` ref therefore
builds unrelated applications, including on marketing-only pull requests.
The mobile PR workflow also publishes when only its changed-path action changes.

## Decision

Use Cloudflare's native build-watch includes for each application. Store the
provider include lists in `scripts/ci/cloudflare-pages-watch-paths.json` and
apply them to the existing projects. Keep exclusions empty. These lists contain
application directories, consumed packages, shared build configuration, and the
Pages build wrapper. They do not enumerate tests or verification scripts.

Keep CI triggers broader than deployment triggers. Preview workflows use broad
`scripts/ci/**` and `.github/**` boundaries for local checks. A small
`pages-changes` action derives deployment filters from the same checked-in
provider lists. Only matching build inputs enable automatic exact-SHA deployment
verification, including on dev/main pushes. CI-only edits can therefore test
verification tooling without waiting for a Pages build that was skipped. PR
updates compare the immutable head with the previous head from that push,
rather than reusing the cumulative PR diff. Otherwise, an earlier app change
would make a later CI-only commit wait for a deployment Cloudflare skipped.

Manual verification dispatches remain explicit operator requests. Backend
preview provisioning retains its existing trusted-wiring checks; this policy
separates Pages builds and verification from CI, not the API trust gate.

Keep the existing `main`, `dev`, and `pr-*` branch controls, generated ref
lifecycle, and deployment identity checks. Backend changes still build the
admin/dashboard previews whose browser journeys require a matching API.

Lockfile and root build configuration remain conservative shared triggers.
They can affect hoisted or transitive dependencies across applications. A
dependency-graph-aware lockfile filter is outside this change; do not suppress
those builds by simply dropping the lockfile from the include lists.

Gate the mobile PR publisher on the existing `mobile` changed-path output in
addition to its ownership checks. Changing the detector alone must not publish
a mobile bundle. Keep closed events available to cancel in-flight publication.

## Verification

Run a policy check that exercises marketing-only, admin-only, dashboard-only,
mobile-only, CI-only, shared-contract, API, and lockfile paths, and checks that
every Pages deployment job uses the build-input guard. Verify the saved lists
in each Cloudflare project. The configuration applies to future pushes; it does not
cancel builds already queued by the provider.

Cloudflare can bypass build-watch matching for empty pushes, pushes with at
least 3,000 changed files, or pushes containing at least 20 commits. See
[Cloudflare build watch paths](https://developers.cloudflare.com/pages/configuration/build-watch-paths/).
