# 2026-10-14 — Unrelated Pages preview builds

> See [`README.md`](README.md) for the recurring-bug index.

**Symptom.** Marketing-only pull requests still built admin and dashboard
previews, adding provider build waves to the queue problem seen on August 5.

**Root cause.** GitHub verification path filters did not control Cloudflare's
native Git publisher. All three projects watched `*` on the shared `pr-N`
branches. The mobile PR publisher also lacked a mobile-output guard when its
shared detector triggered the workflow.

**Fix.** Replace the provider wildcard with application-specific includes in
`scripts/ci/cloudflare-pages-watch-paths.json`. Gate mobile PR publication on
the existing mobile output. Keep lockfiles as conservative shared inputs.

**Test.** `selective-preview-policy.test.cjs` asserts application isolation,
shared-input coverage, compatibility with every Pages verification trigger,
and the mobile publication guard. Saved provider lists are checked in the UI.

**Pattern.** Provider and workflow trigger drift; related to the earlier
[Pages queue timeouts](2026-08-05-cloudflare-pages-queue-timeout.md) and
[unrelated dashboard builds](2026-08-05-dashboard-pages-absent-app-build.md).
