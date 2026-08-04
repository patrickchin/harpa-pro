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

**Fix.** The immediate containment disabled preview branch deployments. During
the refreshed dashboard rollout, build watch paths were then scoped to the
same source, dependency, and deployment-wiring paths that trigger the
dashboard preview workflow. Preview branches could therefore be re-enabled for
`dev` and `pr-*` without rebuilding absent dashboard code for unrelated refs.
Automatic production deployments remain disabled.

**Test.** Cloudflare's Branch control settings show automatic production
deployments disabled and custom preview branches `dev` and `pr-*`. Build watch
paths mirror the dashboard preview workflow triggers. The refreshed dashboard
pull request must also prove its exact head SHA through the deployment marker
and dashboard checks before merge.

**Pattern.** This is a provider-state variant of stale CI scope: a configured
deployment target outlived the source tree it expected.
