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
