# Selective preview deployments

## Problem

GitHub preview workflows already filter changed paths, but Cloudflare Pages
watches `*` for all three web projects. Updating the shared `pr-N` ref therefore
builds unrelated applications, including on marketing-only pull requests.
The mobile PR workflow also publishes when only its changed-path action changes.

## Decision

Use Cloudflare's native build-watch includes for each application. Store the
provider include lists in `scripts/ci/cloudflare-pages-watch-paths.json` and
apply them to the existing projects. Keep exclusions empty. Include every path
watched by that application's preview, development, and production verification
workflows so an exact-SHA verifier never waits for a deliberately skipped build.

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
mobile-only, shared-contract, API, and lockfile paths, and checks coverage of
every Pages verification trigger. Verify the saved include lists in each
Cloudflare project. The configuration applies to future pushes; it does not
cancel builds already queued by the provider.

Cloudflare can bypass build-watch matching for empty pushes, pushes with at
least 3,000 changed files, or pushes containing at least 20 commits. See
[Cloudflare build watch paths](https://developers.cloudflare.com/pages/configuration/build-watch-paths/).
