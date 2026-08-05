# P5 — Beta and GA

> Goal: ship to TestFlight + Play internal track, monitor a gradual
> rollout, then GA.
>
> **Status:** audited on 2026-08-04. Repository automation is largely in
> place. Store-console distribution, tester coverage, monitoring results, and
> Android GA remain unverified unless a link is recorded below.

Uploading a native build, distributing it to testers, submitting it for
review, receiving approval, and making it public are separate milestones. An
EAS or Fastlane command proves only the stage shown in its result.

## Exit gate

- [ ] TestFlight and Play internal-track distribution verified with current
      build links and tester smoke results.
- [x] Preview and production EAS Update workflows and native-runtime gates are
      implemented.
- [ ] Record a successful production OTA publication against the currently
      distributed native runtime.
- [ ] Rollout monitor: Sentry crash-free sessions ≥ 99.5% over 7
      days at full rollout.
- [ ] Both GA listings live. The
      [iOS App Store listing](https://apps.apple.com/us/app/harpa-pro/id6776759817)
      is public; the Play Store listing is unverified.
- [ ] Cutover documentation in `docs/runbooks/cutover.md`.

## Tasks

### P5.1 TestFlight / Play internal

- [x] Fastlane metadata files + EAS release lanes added.
- [x] App Store Connect application exists; the iOS listing is public.
- [ ] Verify Play Console application and package ownership.
- [ ] Record the current TestFlight and Play internal build links.
- [ ] Record five internal testers and a dated smoke result for each platform.

### P5.2 Beta widening

- [ ] Record 50 external TestFlight testers and the tested build.
- [ ] Record the closed Play track, build, and tester count.
- [ ] Record the feedback channel and its owner.

### P5.3 Rollout monitor

- [x] API and mobile Sentry capture are implemented in code.
- [ ] Link a dashboard for crash-free sessions, API 5xx rate, authentication
      success rate, and AI provider error rate.
- [ ] Verify alert destinations and send a test event. PagerDuty and Slack
      routing are not configured in this repository; see
      [arch-ops.md](arch-ops.md#alerts).
- [ ] Record seven full-rollout days at or above 99.5% crash-free sessions.

### P5.4 GA

- [x] iOS App Store listing is publicly reachable.
- [ ] Verify the public Play Store listing and its production build.
- [ ] Record store screenshots against the released binaries.
- [ ] Record each phased rollout decision (1% → 10% → 50% → 100%)
      with monitoring evidence.
- [ ] Cutover doc `docs/runbooks/cutover.md`.

### P5.5 Post-GA

- [ ] Retro doc `docs/v4/retro.md`.
- [ ] Update `docs/v4/pitfalls.md` with anything new learned.
