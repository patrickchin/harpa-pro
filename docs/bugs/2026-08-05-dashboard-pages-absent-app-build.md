# 2026-08-05 — Dashboard Pages built an absent application

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** Unrelated pull requests received a failed external
`harpa-pro-dashboard` Cloudflare Pages check even though they did not change a
dashboard application.

**Root cause.** The dormant dashboard Pages project remained Git-integrated
with automatic preview builds enabled for `dev` and `pr-*`. GitHub mirrored an
eligible pull request head to `pr-<number>`, so Cloudflare tried to build
`apps/dashboard`; that path is absent from `dev` and exists only in
[draft PR #211](https://github.com/patrickchin/harpa-pro/pull/211).

**Fix.** In Cloudflare, keep automatic production deployments disabled and set
the preview branch policy to `None` while the dashboard application is absent.
Re-enable an exact dashboard pull request ref only during a refreshed dashboard
rollout, require exact-head green deployment checks, and expand preview branch
coverage only after the application lands on `dev`.

**Test.** Cloudflare's Branch control settings show automatic production
deployments disabled and `Preview branch: None`. Provider configuration is not
available to repository tests, so reactivation is fail-closed: the refreshed
dashboard pull request must prove its exact head SHA through the deployment
marker and dashboard checks before merge.

**Pattern.** This is a provider-state variant of stale CI scope: a configured
deployment target outlived the source tree it expected.
