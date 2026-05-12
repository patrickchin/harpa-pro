# P5 — Beta + GA

> Goal: ship to TestFlight + Play internal track, monitor a gradual
> rollout, then GA.

## Exit gate

- [ ] TestFlight + Play internal track distribution working.
- [ ] EAS Update channel for OTA hotfixes.
- [ ] Rollout monitor: Sentry crash-free sessions ≥ 99.5% over 7
      days at full rollout.
- [ ] GA App Store + Play Store listings live.
- [ ] Cutover documentation in `docs/runbooks/cutover.md`.

## Tasks

### P5.1 TestFlight / Play internal
- [ ] App Store Connect + Play Console set up.
- [ ] Production build uploaded to both.
- [ ] 5 internal testers added; smoke test on each.
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
- [ ] Phased rollout (1% → 10% → 50% → 100%) over 7 days.
- [ ] Cutover doc `docs/runbooks/cutover.md`.
- [ ] Commit: `chore: GA cutover runbook`.

### P5.5 Post-GA
- [ ] Retro doc `docs/v4/retro.md`.
- [ ] Update `docs/v4/pitfalls.md` with anything new learned.
