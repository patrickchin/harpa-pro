# P5 — Beta + GA

> Goal: ship to TestFlight + Play internal track, monitor a gradual
> rollout, then GA.

## Exit gate

- [ ] TestFlight + Play internal track distribution working.
- [ ] EAS Update channel for OTA hotfixes.
- [ ] Rollout monitor: Sentry crash-free sessions ≥ 99.5% over 7
      days at full rollout.
- [ ] GA App Store + Play Store listings live.
- [ ] RevenueCat monthly/annual subscription sandbox smoke passes on iOS and
      Android; server entitlement verification and webhook evidence recorded.
- [ ] Hosted Privacy Policy and Terms disclose the shipping subscription flow,
      and store privacy/data-safety answers have legal approval.
- [ ] Cutover documentation in `docs/runbooks/cutover.md`.

## Tasks

### P5.1 TestFlight / Play internal
- [x] Fastlane metadata files + EAS release lanes added.
- [ ] App Store Connect + Play Console set up.
- [ ] Production build uploaded to both.
- [ ] 5 internal testers added; smoke test on each.
- [ ] RevenueCat `pro` entitlement, current offering, monthly/annual packages,
      products, webhook, and EAS/API secrets configured.
- [ ] Purchase, cancel, restore, transfer, grace-period, and account-hold paths
      tested without using mobile CustomerInfo as API authorization.
- [ ] Commit: `chore(mobile): TestFlight + Play internal distribution`.

### P5.2 Beta widening
- [ ] 50 external testers via TestFlight.
- [ ] Closed Play track.
- [ ] Telegram / Slack feedback channel.

### P5.3 Rollout monitor
- [ ] Dashboard: Sentry crash-free sessions, API 5xx rate, auth
      success rate, AI provider error rate.
- [ ] Slack alerts wired (per [arch-ops.md](arch-ops.md)).
- [ ] Commit: `chore(ops): rollout monitor dashboards + alerts`.

### P5.4 GA
- [ ] App Store + Play Store listings filled (screenshots captured
      from the running v4 app on iOS sim / Android emu).
- [ ] Subscription products and localized storefront prices reviewed in both
      consoles; no fixed non-US price appears in source-controlled copy.
- [ ] App Privacy, Play Data safety, Privacy Policy, Terms, review notes, and
      cancellation/support instructions approved and live.
- [ ] Freemium enforcement scheduled for the next UTC month boundary with the
      kill-switch owner and rollback command recorded.
- [ ] Phased rollout (1% → 10% → 50% → 100%) over 7 days.
- [ ] Cutover doc `docs/runbooks/cutover.md`.
- [ ] Freemium release evidence complete in
      [`docs/runbooks/freemium-release.md`](../runbooks/freemium-release.md).
- [ ] Commit: `chore: GA cutover runbook`.

### P5.5 Subscription release gate

- [ ] Complete every blocking checkbox in the freemium release runbook.
- [ ] Verify Free voice recording/upload and the native localized paywall on
      physical iOS and Android sandbox devices.
- [ ] Verify server sync, webhook renewal/cancellation, downgrade-at-expiry,
      restore, and account deletion behavior.
- [ ] Commit: `chore(release): record freemium launch evidence`.

### P5.6 Post-GA
- [ ] Retro doc `docs/v4/retro.md`.
- [ ] Update `docs/v4/pitfalls.md` with anything new learned.
