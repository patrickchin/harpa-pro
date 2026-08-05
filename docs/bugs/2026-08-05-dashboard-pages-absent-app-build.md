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
the refreshed dashboard rollout, previews were re-enabled only for the exact
generated `pr-211` branch. The build watch include remains `*` so each new PR
head produces its exact-SHA deployment marker. Expand the allowlist to `dev`
and `pr-*` only after the application lands on `dev`. Automatic production
deployments remain disabled.

**Test.** Cloudflare's Branch control settings show automatic production
deployments disabled and the custom preview branch `pr-211`. Build watch paths
show the default `*` include. The refreshed dashboard pull request must also
prove its exact head SHA through the deployment marker and dashboard checks
before merge.

**Pattern.** This is a provider-state variant of stale CI scope: a configured
deployment target outlived the source tree it expected.
