# 2026-08-06 — Maestro raced report auto-regeneration

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** Android photo flows observed `Generate report` or `Update report`
and then failed to tap it. The failure screenshot already showed the
finalized-ready action row, proving the report had generated successfully.

**Root cause.** The generate route automatically starts regeneration whenever
the persisted draft becomes dirty. Maestro evaluated a conditional button
selector, but the mutation could finish and replace that button before the
following tap performed its own element lookup.

**Fix.** Active core and photo journeys now delegate to
`.maestro/helpers/wait-for-auto-regeneration.yaml`. The helper waits for the
route-owned `report-generation-current` marker, which requires the generation
timestamp to cover the API's canonical note-change clock. A route-owned
operation counter keeps that marker pending from enqueue through both the notes
and report refetches, closing the pre-refetch and partial-batch windows without
letting overlapping uploads clear each other. A failed completion latches a
synchronization error. Gallery, camera, and inline failed-tile retry paths all
await canonical notes/report refetches; only a successful persisted operation
clears the old operation error, while opening and cancelling a picker does not.
Readiness also derives active and failed photo jobs from the live queue, so one
successful upload cannot hide a different failed or concurrent retry. Dismissing
a failed tile delegates back to the route and resolves only that intentionally
abandoned queue job; aborting an in-flight tile is not reclassified as a
retryable failure. Removing a pending batch item now rejects its queue promise
immediately so serial work cannot leave `Promise.allSettled` hanging, while an
active item's promise settles only after its current collaborator observes the
abort. Queue cancellation exposes that settlement promise to the route, so
direct dismissal and aborted inline retry both refetch canonical report and
note state before clearing synchronization. Completed jobs retain their
canonical `noteId` in persistence; a route completion observer keeps resumed
work pending until both report and notes refetch after that committed write,
without requiring a newest note to appear in the oldest-first first page. The marker also remains pending while the generation or
photo-placement mutation settles, fails closed on placement errors, and uses
the placement response's `updatedAt` before Finalize can consume the new body
version. The helper then requires the stable, enabled
`btn-finalize-report` postcondition and never
interacts with the transient Generate / Update action. Manual-regeneration
coverage uses the same marker before asserting its final controls. Refetches
propagate errors, so a failed active refetch cannot accept stale cached
generation state. Optimistic note mutations, their temporary rows,
report/notes refetches, and synchronization errors also keep the marker
pending; this prevents an earlier clean report generation from being accepted
while a new note is still reaching the server. The legacy core journey waits
for the saved voice title before this readiness gate because voice processing
is owned asynchronously by the screen provider.

**Test.** Release-confidence policy pins the shared helper, its 60-second
bound, all active delegates, the voice-pipeline boundary, counter-based upload
synchronization, queue-derived failure state, and route-owned retry/dismissal.
Focused state/adapter/screen/queue tests cover multiple failures, concurrent
retries, queued and active cancellation, persistence linkage, resumed upload
acknowledgment, and report-write action blocking. Regression modules 11 and 17
now use the same stable helper, and the photo-placement flow repeats it after
the optimistic placement write.
On fresh Android emulators, the corrected legacy core journey passed in 625.3
seconds and the standalone placement flow passed in 416.3 seconds, including
upload, regeneration, placement, finalization, and persisted-photo
verification.

**Pattern.** When application behavior owns an automatic transition, an E2E
test should wait for the transition's stable postcondition. A conditional
visibility check followed by a separate tap is still a race because those are
two independent UI snapshots.
