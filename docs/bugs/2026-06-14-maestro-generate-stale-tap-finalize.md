# 2026-06-14 - Maestro generate tap can become finalize tap

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** The local Android Maestro regression journey failed in
module 10c at `btn-tab-report`, and later in module 10b while waiting
for `btn-finalize-report`. The failure screenshots showed the Finalize
Report confirmation sheet open on top of the Notes tab.

**Root cause.** After capturing many photo notes, report auto-generation
had already started. The flow matched `btn-generate-.*report` while the
button was disabled and labelled `Generating...`; Maestro then waited
for the tap to settle and finally tapped the same coordinates after the
action row had changed into `Finalize report`, opening the finalize
sheet instead of moving to the Report tab.

**Fix.** In the picker-scroll and finalized-photo flows, make manual
generate/update conditional on the visible text label (`Generate report`
or `Update report`) and otherwise let auto-generation continue before
switching to the Report tab or finalizing. For the write-lock assertion,
cap `waitToSettleTimeoutMs` on regenerate taps so Maestro starts waiting
for the transient updating notice while the mutation is still pending.
Keep the scrolled placement/add-attachment disabled-state contract in the
existing `ReportTabPane` unit test; on-device E2E cannot reliably scroll
to those controls before fixture-mode regeneration finishes.

**Test.** The full `.maestro/regression-journey.yaml` reproduced the
stale-tap path in module 10c after modules 10a and 10b had passed. Rerun
the same full journey from a clean compose stack after the flow changes.

**Pattern.** Maestro stale-coordinate taps around fast-changing action
rows. Prefer conditional text taps for manual-only actions, and avoid
broad testID taps against controls that can transition from disabled
pending state to a different control at the same coordinates.

**Related timing trap.** The same fixture-mode speed can make the
`Updating the draft with your newest notes...` write-lock notice vanish
before Maestro observes it in module 11. Keep deterministic disabled-state
coverage in unit tests and make on-device assertions opportunistic for
the transient notice.

**2026-06-23 follow-up.** Module 10c regressed into the same trap by
hard-requiring the transient update notice after `btn-generate-update-report`.
The failure screenshot already showed the settled report with `Finalize report`
visible. Fix: reuse the opportunistic write-lock helper from module 11 and
target the notice by stable testID instead of matching punctuation-sensitive
copy.
