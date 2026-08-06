# 2026-08-05 — Dashboard Pages built an absent application

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** Unrelated pull requests received a failed external
`harpa-pro-dashboard` Cloudflare Pages check even though they did not change a
dashboard application.

**Root cause.** The dormant dashboard Pages project remained Git-integrated
with automatic preview builds enabled for `dev` and `pr-*`. GitHub mirrored an
eligible pull request head to `pr-<number>`, so Cloudflare tried to build
`apps/dashboard`; at the time, that path was absent from `dev` and existed only
in [PR #211](https://github.com/patrickchin/harpa-pro/pull/211).

**Fix.** The immediate containment disabled preview branch deployments. During
the refreshed dashboard rollout, previews were re-enabled only for the exact
generated `pr-211` branch. After the application landed on `dev`, the target
preview contract became custom branches `dev` and `pr-*`. The build watch
include remains `*` so each allowed branch head produces its exact-SHA
deployment marker. Automatic production deployments remain disabled.

A 2026-08-07 follow-up found the same provider-state mismatch in
`dashboard-prod.yml`: a qualifying `main` push would verify the intentionally
absent Pages production deployment and custom domain. Both production jobs now
require the repository variable `DASHBOARD_PRODUCTION_ENABLED` to be exactly
`true`. The variable stays unset until production activation is approved and
the configured hostnames are ready.

**Test.** On 2026-08-05, the Cloudflare Pages project API returned automatic
production deployments disabled, preview mode `custom`, preview includes `dev`
and `pr-*`, no preview excludes, build watch include `*`, and no path excludes.
Repository policy tests also require every dashboard pull request to prove its
exact head SHA through the deployment marker and dashboard checks before merge.
They require both production jobs to retain the activation guard.

**Pattern.** This is a provider-state variant of stale CI scope: a configured
deployment target outlived the source tree it expected.
