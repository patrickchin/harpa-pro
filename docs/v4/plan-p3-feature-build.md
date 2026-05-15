# P3 — Feature Build

> Goal: every screen in `../haru3-reports/apps/mobile` on branch
> `dev` ported into v4 with full behaviour and a Maestro flow.
> The canonical source IS the **acceptance contract** — read JSX +
> Tailwind classes from there and port them directly (both apps run
> NativeWind v4). Visual review is manual against that source.
>
> Resolves [Pitfall 4](pitfalls.md#pitfall-4--big-features-stubbed-then-forgotten):
> no screen is "stubbed" or "TODO redesign" — features are either in
> scope or feature-flagged behind a fully exercised code path.

## Exit gate (`p3-exit-gate.yml`)

- [ ] Every screen in `../haru3-reports/apps/mobile/app/` (excluding
      `e2e/` test scaffolds) has a v4 port with manual visual review
      against the canonical source.
- [ ] Every shipped screen has its `screens/<name>.tsx` body plus
      its `(dev)/<name>.tsx` mirror (consistent with P2.0b).
- [ ] Maestro full-journey flow `core-end-to-end` green on iOS + Android.
- [ ] Mobile coverage ≥ 80% lines.
- [ ] Upload pipeline integration test green for `image`, `voice`, `document` (Pitfall 8).
- [ ] No `// TODO` / "Coming soon" / `Alert.alert` outside dialogs.

## Scope (canonical source: `../haru3-reports/apps/mobile/app/`)

Enumerate the screens to port from the canonical source's `app/`
tree at the start of P3 and check them off here. Each row maps a
canonical-source path → v4 destination (`screens/<name>.tsx` body +
`app/(app|auth)/<route>.tsx` real route + `app/(dev)/<name>.tsx`
mirror). Suggested grouping (one screen per commit):

- new project / edit project
- project home
- members
- reports list
- generate — notes / report / edit tabs (the big one)
- saved report + actions menu + PDF preview
- files
- camera
- profile / account / usage

## Section card port

All components import from `../haru3-reports/apps/mobile/components/`
on branch `dev`. NativeWind classes copy directly — no Unistyles to
translate (Pitfall 3 — we chose NativeWind specifically so the port
is a copy, not a translation). Map per component, e.g.:

| Card | Canonical source | v4 destination |
|---|---|---|
| `StatBar` | `components/reports/sections/StatBar.tsx` | same path |
| `WeatherStrip` | `components/reports/sections/WeatherStrip.tsx` | same path |
| `SummarySectionCard` | `components/reports/sections/SummarySectionCard.tsx` | same |
| `IssuesCard` | `components/reports/sections/IssuesCard.tsx` | same |
| `WorkersCard` | `components/reports/sections/WorkersCard.tsx` | same |
| `MaterialsCard` | `components/reports/sections/MaterialsCard.tsx` | same |
| `NextStepsCard` | `components/reports/sections/NextStepsCard.tsx` | same |
| `CompletenessCard` | `components/reports/sections/CompletenessCard.tsx` | same |
| `ReportView` | `components/reports/ReportView.tsx` | same |
| `PdfPreviewModal` | `components/reports/PdfPreviewModal.tsx` | same |
| `ReportActionsMenu` | `components/reports/ReportActionsMenu.tsx` | same |
| `SavedReportSheet` | `components/reports/SavedReportSheet.tsx` | same |
| `ReportDetailTabBar` | `components/reports/ReportDetailTabBar.tsx` | same |
| `useReportPdfActions` | `features/reports/useReportPdfActions.ts` | same |

(Confirm exact paths against the canonical source at port time —
this table is illustrative.)

## Tasks (one screen per commit)

For each screen in the scope list:

1. Read the matching file(s) under `../haru3-reports/apps/mobile/app/`
   and `components/` on `dev`.
2. Build the screen body in `apps/mobile/screens/<name>.tsx`,
   plus the components it needs (port classes verbatim where the
   primitive matches).
3. Wire the real route under `(auth)/` or `(app)/` with hooks +
   navigation params.
4. Add the `(dev)/<name>.tsx` mirror with mock props.
5. Behaviour tests for every interaction the canonical source
   exercises.
6. Maestro flow exercising it.
7. Manual visual review side-by-side with the canonical source on
   the iOS sim.
8. Commit: `feat(mobile): <screen> ported from canonical source with tests + flow`.

Suggested order (parallelisable across agents once primitives lock):

```
P3.0  IDs/slugs migration (BLOCKS every other P3 task)
P3.1  Project list (visual confirm)
P3.2  New / Edit project           ┐ Agent A
P3.3  Project home                 ┘
P3.4  Members
P3.5  Reports list
P3.6  Generate – Notes tab          ┐ Agent B (the big one)
P3.7  Generate – Report tab         │
P3.8  Generate – Edit tab           ┘
P3.9  Saved report + actions + PDF  ┐ Agent C
P3.10 Files screen                  │
P3.11 Camera                        ┘
P3.12 Profile / Account / Usage
P3.13 Maestro full-journey
```

### P3.0 — IDs/slugs migration

Full design: [arch-ids-and-urls.md](arch-ids-and-urls.md). Lands
**before** any screen-port commit so URLs the app constructs are
immediately on the final scheme — no rewriting share links later.

- [ ] Drizzle schema: add `slug text` + (reports) `number int` +
      `projects.next_report_number int`. Backfill nullable, then
      flip `NOT NULL` + `UNIQUE` (4-step expand/contract).
- [ ] UUIDv7 default on new rows (`uuidv7()` on PG ≥ 17 or
      `pg_uuidv7` extension — verify on Neon at migration time).
      Existing UUIDv4 rows untouched.
- [ ] `packages/api/src/lib/slug.ts` — nanoid Crockford-base32
      generator + retry-on-collision wrapper.
- [ ] `packages/api-contract`: `projectSlug`, `reportSlug`,
      `reportNumber` Zod schemas + branded TS types. Path params
      switch from `:id`/`:reportId` to `:projectSlug` /
      `:projectSlug/:number`. OpenAPI spec regenerated.
- [ ] New routes: `GET /p/:projectSlug` + `GET /r/:reportSlug` →
      `308` redirect to canonical long URL. Scope test for each.
- [ ] Per-request scope tests cover slug-based lookups (Pitfall 6).
- [ ] Mobile: `lib/api/hooks.ts` regenerated; `router.push` call
      sites updated; `app/(app)/p/[projectSlug].tsx` +
      `app/(app)/r/[reportSlug].tsx` resolver screens added
      (each does `router.replace` after slug → canonical resolve).
- [ ] Commit: `feat(api,mobile): P3.0 IDs/slugs migration —
      prefixed slugs + per-project report numbers`.

### P3.6 — Generate – Notes tab

First of three commits that together port the Generate Report screen.
P3.6 ships the Notes pane as a *visually complete* surface; Report
(P3.7) and Edit (P3.8) mount as empty placeholders.

- [x] `GenerateReportProvider` scaffold — owns tab state, text-note
      input, dialog visibility, attachment sheet. Report-tab / Edit-tab
      fields (`generation`, `draft`, `voice`, `photo`) present as
      structurally-stable no-op defaults with `TODO(P3.7/P3.8)` markers.
- [x] `NoteTimeline` (text-only) + `EmptyState` wired into
      `NotesTabPane`. Voice / photo / pending-upload rows deferred.
- [x] Shared shell: `GenerateReportTabBar`, `GenerateReportActionRow`,
      `GenerateReportInputBar` (text input + voice + photo + attach
      buttons, voice/photo wired to provider no-ops),
      `GenerateReportDialogs` (delete-note, finalize-confirm,
      attachment sheet, upload error).
- [x] Real route at
      `apps/mobile/app/(app)/projects/[projectSlug]/reports/[number]/generate.tsx`
      using `useProjectQuery` + `useReportQuery`. Notes live in
      route-local React state for P3.6 (TODO marker for the
      `useReportNotesQuery` swap in P3.7).
- [x] Dev mirror `(dev)/generate-notes.tsx` with empty / populated /
      loading toggles + registry entry.
- [x] Vitest unit tests for the screen body covering each state +
      one snapshot.
- [x] Commit: `feat(mobile): P3.6 — Generate Notes tab + provider scaffold`.

### P3.7 — Generate – Report tab

Second of the three Generate-screen commits. Brings the Report tab
from a placeholder `<View />` to a visually complete, read-only
surface that renders a `GeneratedSiteReport` with empty / generating
/ live / generation-error / finalize-error states. Same pattern as
P3.6: provider takes orchestration state as props; route + dev
mirror + tests pass canned values. Real `useReportGeneration` hook
+ ReportPhotos rendering remain deferred (see TODO markers).

- [x] New shared package `packages/report-core` — Zod schemas +
      `normalizeGeneratedReportPayload` + helpers (`getReportCompleteness`,
      `getWorkersLines`, `getWeatherLines`, …). Mobile + api both
      depend on it via `@harpa/report-core`.
- [x] Nine rendering primitives ported verbatim from canonical
      under `apps/mobile/components/reports/`: `StatBar`,
      `WeatherStrip`, `SummarySectionCard`, `IssuesCard`,
      `WorkersCard`, `MaterialsCard`, `NextStepsCard`,
      `CompletenessCard`, `ReportView`. Plus `SectionHeader`
      primitive and `mobile-ui` / `section-icons` helpers.
- [x] `GenerateReportProvider` extended: real `generation`
      (`report`, `isUpdating`, `error`, `notesSinceLastGeneration`,
      `hasReport`), `draft` (`isFinalizing`, `finalizeError`,
      finalize-confirm visibility), `tabs.editManually`,
      `preview.openFile`, `handleRegenerate` — all driven by new
      provider props. `initialTab` prop added for dev mirror.
- [x] `ReportTabPane` body fully ported: error banner + Retry,
      empty state (CompletenessCard skeleton + Edit manually CTA),
      generating shimmer, live ReportView + finalize-error banner.
      ReportPhotos slot reserved with a TODO marker (lands once
      upload pipeline + `useLocalReportNotes` port).
- [x] Real route forwards report state via new
      `report`/`isGeneratingReport`/`generationError`/`onRegenerate`
      props; fixture-mode seeds `SAMPLE_GENERATED_REPORT` so the
      tab renders without the API generate endpoint. TODO marker
      for the real `useReportGeneration` hook (lands with the API
      endpoint).
- [x] Dev mirror `(dev)/generate-report.tsx` with state toggles
      (no-report / generating / live-report / generation-error /
      finalize-error) + registry entry.
- [x] Vitest unit tests for the Report tab covering each state +
      smoke render of populated layout. Reanimated mock extended
      with chainable entering-preset proxy so `FadeIn.duration(…)`
      works under test.
- [x] Commit: `feat(mobile,report-core): P3.7 — Generate Report tab + read-only ReportView`.

## Pipelines exercised

- **Upload**: presign → R2 PUT → registerFile → createNote
  (always — Pitfall 8). Tested for image/voice/document via
  `upload-creates-timeline-note.test.ts`.
- **Voice note**: record → live interim transcript → upload →
  transcribe (fixture) → summarise (fixture) → createNote.
  Tested via `voice-note-pipeline.test.ts`.
- **Camera**: capture → session → commit to report. Tested via
  `camera-session-roundtrip.test.ts`.
- **Report generation**: notes change counter → generate (fixture)
  → CompletenessCard → finalize → PDF (fixture). Maestro
  `core-end-to-end` exercises the whole arc.

## P3 exit
- [ ] All boxes ticked. Tag `v0.3.0-features`.
- [ ] `pnpm --filter @harpa/mobile bundle:smoke` green on the tag SHA
  (see `overnight-protocol.md` §5 — also run per-commit through P3).
