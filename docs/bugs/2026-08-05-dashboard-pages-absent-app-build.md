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

**Test.** Final provider verification requires automatic production deployments
disabled, preview mode `custom`, preview includes `dev` and `pr-*`, and build
watch include `*`. Repository policy tests also require every dashboard pull
request to prove its exact head SHA through the deployment marker and dashboard
checks before merge.

**Pattern.** This is a provider-state variant of stale CI scope: a configured
deployment target outlived the source tree it expected.
