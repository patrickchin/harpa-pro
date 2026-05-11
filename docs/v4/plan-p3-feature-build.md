# P3 — Feature Build

> Goal: every screen in
> [`docs/legacy-v3/realignment/pages/`](../legacy-v3/realignment/pages/)
> ships with full behaviour, full visual parity, and a Maestro flow.
> The per-page docs are the **acceptance contract**.
>
> Resolves [Pitfall 4](pitfalls.md#pitfall-4--big-features-stubbed-then-forgotten):
> no screen is "stubbed" or "TODO redesign" — features are either in
> scope or feature-flagged behind a fully exercised code path.

## Exit gate (`p3-exit-gate.yml`)

- [ ] Every page in `docs/legacy-v3/realignment/pages/` has its
      "Acceptance checklist" ticked, copied into
      `docs/v4/pages/<NN>-<slug>.md`.
- [ ] Visual diff ≤ 2% per screen against `docs/legacy-v3/screenshots/`.
- [ ] Maestro full-journey flow `core-end-to-end` green on iOS + Android.
- [ ] Mobile coverage ≥ 80% lines.
- [ ] Upload pipeline integration test green for `image`, `voice`, `document` (Pitfall 8).
- [ ] No `// TODO` / "Coming soon" / `Alert.alert` outside dialogs.

## Scope (per the realignment page inventory)

| # | File | Owner |
|---|---|---|
| 03 | projects-list.md (already in P2) | confirm screenshots after primitives finalised |
| 04 | new-project.md | P3 |
| 04b | edit-project.md | P3 |
| 05 | project-home.md | P3 (last-report card, Documents/Materials Soon rows, copy chips) |
| 06 | members.md | P3 |
| 06b | reports-list.md | P3 |
| 07 | notes-tab.md | P3 (the big one — composer states, voice live transcript) |
| 08 | report-tab.md | P3 (CompletenessCard, regenerate, errors) |
| 09 | report-edit-tab.md | P3 (we DO ship this in v4 — no "stripped" — Pitfall) |
| 10 | saved-report.md | P3 (ReportActionsMenu, all section cards) |
| 11 | pdf-preview.md | P3 (PdfPreviewModal, SavedReportSheet) |
| 12 | files.md | P3 |
| 13 | camera.md | P3 |
| 14 | profile.md | P3 |
| 14b | account.md | P3 |
| 14c | usage.md | P3 (UsageBarChart) |

## Section card port

| Card | Source | Destination |
|---|---|---|
| `StatBar` | mobile-old dump §1562 | `components/reports/sections/StatBar.tsx` |
| `WeatherStrip` | §1591 | `…/sections/WeatherStrip.tsx` |
| `SummarySectionCard` | §1654 | `…/sections/SummarySectionCard.tsx` |
| `IssuesCard` | §1683 | `…/sections/IssuesCard.tsx` |
| `WorkersCard` | §1792 | `…/sections/WorkersCard.tsx` |
| `MaterialsCard` | §1859 | `…/sections/MaterialsCard.tsx` |
| `NextStepsCard` | §1909 | `…/sections/NextStepsCard.tsx` |
| `CompletenessCard` | §1949 | `…/sections/CompletenessCard.tsx` |
| `ReportView` | §2028 | `components/reports/ReportView.tsx` |
| `PdfPreviewModal` | §2101 | `components/reports/PdfPreviewModal.tsx` |
| `ReportActionsMenu` | §2314 | `components/reports/ReportActionsMenu.tsx` |
| `SavedReportSheet` | §2447 | `components/reports/SavedReportSheet.tsx` |
| `ReportDetailTabBar` | §2700 | `components/reports/ReportDetailTabBar.tsx` |
| `useReportPdfActions` | (search dump) | `features/reports/useReportPdfActions.ts` |

NativeWind classes from mobile-old port directly (Pitfall 3 — we
chose NativeWind specifically so the port is a copy, not a translation).

## Tasks (one screen per commit)

For each row in the page inventory:

1. Copy the `pages/<NN>-<slug>.md` doc into `docs/v4/pages/`.
2. Build the screen + the components it needs.
3. Behaviour tests for every interaction in the doc.
4. Maestro flow exercising it.
5. Tick the acceptance checklist.
6. Commit: `feat(mobile): <screen> matching design with tests + flow`.

Suggested order (parallelisable across agents once primitives lock):

```
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
