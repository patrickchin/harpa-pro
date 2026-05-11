# V3 Realignment Plan

After the v3 rewrite (`apps/mobile-v3`) and the removal of `apps/mobile-old`
(commit [`6305cbf`](../../../README.md)), there is a large discrepancy
between the current UI/functionality and what the app used to do. This
document is the master plan for closing that gap.

It also explicitly **strips the manual-edit feature** from the v3 report
flow as a temporary simplification — the Edit tab will be removed in
P1 and revisited later under a new design.

## Source-of-truth artifacts

Use these as the ground truth when writing or reviewing this work.

- **Target visual design**: PNG screenshots in
  [`apps/docs/public/screenshots/`](../../../apps/docs/public/screenshots).
  These are the canonical look-and-feel for every page.
- **Target functionality**: the in-app text in
  [`apps/docs/content/guides.ts`](../../../apps/docs/content/guides.ts).
  Every step in those guides describes a control or screen that the user
  expects to find in the app.
- **Old implementation**: deleted in `6305cbf` from `apps/mobile-old`.
  All source is dumped at
  [`docs/v3/_work/mobile-old-source-dump.md`](../_work/mobile-old-source-dump.md)
  (5,837 lines covering 35 critical files). Use that for ports.
- **Current v3 implementation**: `apps/mobile-v3/**`.

## Top-level summary of the gap

The current v3 app has the *navigation skeleton* and the *data layer*
working, but the **report rendering, the Notes-tab composer, and the
report actions menu are stubbed**, and several entire screens are
missing the rich card components the screenshots show.

The three biggest visible regressions are:

1. **Report tab is a flat dump.** Mobile-old had dedicated cards —
   `StatBar`, `WeatherStrip`, `SummarySectionCard`, `IssuesCard`,
   `WorkersCard`, `MaterialsCard`, `NextStepsCard`, free-form section
   cards, and a "Source notes: N" footer — none of which exist in v3.
   See screenshot [`10-saved-report.png`](../../../apps/docs/public/screenshots/10-saved-report.png).

2. **Notes-tab composer is wrong.** Mobile-old's input bar inlined the
   Photo and Voice buttons next to a paperclip when the field was
   empty, and collapsed them to an orange "Add" button when typing.
   See screenshot [`07-notes.png`](../../../apps/docs/public/screenshots/07-notes.png).
   v3 always shows mic/camera icon buttons next to the input.

3. **PDF actions menu is missing.** The "⋯ Actions" labeled button on
   saved reports used to open a sheet with View PDF / Save PDF / Share
   PDF / Delete Report. v3 has only Delete. The whole `PdfPreviewModal`
   and `useReportPdfActions` hook are gone.

A full per-page gap list lives in
[`docs/v3/realignment/01-investigation.md`](./01-investigation.md).

## Out of scope (deferred / stripped)

- **Manual Edit tab** — temporarily stripped from both the draft and
  saved-report screens in P1. The "Edit a report manually" guide in
  `apps/docs` will get a `// TODO redesign` banner. To re-add later,
  resurrect `ReportEditForm` from `mobile-old-source-dump.md`.
- **Debug tab** — already absent in v3 and stays absent.
- **Documents / Materials & Equipment** project sub-screens — keep as
  "Soon" rows per screenshot `05-project-home.png`.
- **Avatar upload** — keep initials-only for now.

## Phases

### P0 — Plan + per-page design docs (this PR)

- Write this plan.
- Write [`docs/v3/realignment/01-investigation.md`](./01-investigation.md)
  grounded in `mobile-old-source-dump.md` (not speculation).
- Write a per-page design doc for **every** screen in
  [`docs/v3/realignment/pages/`](./pages/), each one structured so the
  user can paste it as a prompt into Google Sketch / Stitch / Figma
  alongside the matching screenshot to generate a UI design.
- Acceptance: every page in the app has a `pages/<NN>-<slug>.md`
  design doc; running `ls docs/v3/realignment/pages/ | wc -l` matches
  the [page inventory](#page-inventory) below.

### P1 — Strip manual-edit, restore core report rendering

Order matters; each step should be a separate commit.

1. **Strip Edit tab.** Remove the `'edit'` `TabKey`, the Edit-tab
   render branch in `generate.tsx` and `[reportId].tsx`, and the
   `ReportEditForm`-related state/handlers in `GenerateReportProvider`.
   Leave the `ReportEditForm.tsx` component file in place but
   unreferenced. Update `apps/docs/content/guides.ts` to add a
   "(temporarily removed — redesign in progress)" note to the
   "Edit a report manually" guide.
   Commit: `refactor(mobile-v3): strip manual edit tab pending redesign`.

2. **Port report cards from mobile-old.** Re-create `StatBar`,
   `WeatherStrip`, `SummarySectionCard`, `IssuesCard`, `WorkersCard`,
   `MaterialsCard`, `NextStepsCard`, free-form section card,
   "Source notes: N" footer. Wire them into `ReportView`.
   Commit: `feat(mobile-v3): port rich report cards`.

3. **Project home: last-report card + Documents/Materials Soon rows.**
   Match `05-project-home.png` exactly.
   Commit: `feat(mobile-v3): align project home with target design`.

### P2 — Fix camera + voice note flows

1. **Notes-tab composer rework.** Match `07-notes.png`: empty-state
   shows paperclip + inline Photo + Voice buttons; typing collapses
   them and reveals an orange "Add" button. Photo opens a picker
   sheet (Camera / Library), not the camera directly. See
   `pages/07-notes.md`.
   Commit: `feat(mobile-v3): rework notes composer to match design`.

2. **Camera capture screen.** Fix the broken `StyleSheet: undefined`
   workaround in `app/(app)/camera/capture.tsx:198`, switch the
   thumbnail strip to a 3-column grid, add a shutter haptic, and
   verify the session-commit round-trip back into the report.
   Commit: `fix(mobile-v3): camera capture UI + session round-trip`.

3. **Voice note pipeline.** Verify `useVoiceNotePipeline` end-to-end
   (mock + live), surface failed-step retry in the timeline,
   show the live waveform in the composer during recording, and
   render the transcript inline on the voice card. Reference
   `mobile-old-source-dump.md` for the player + transcript layout.
   Commit: `fix(mobile-v3): voice note pipeline + transcript display`.

### P3 — Saved-report actions + PDF

1. Port `ReportActionsMenu`, `PdfPreviewModal`,
   `useReportPdfActions`, and `SavedReportSheet`. Wire the labeled
   `⋯ Actions` button on `[reportId].tsx` with View / Save / Share
   PDF + Delete.
   Commit: `feat(mobile-v3): restore PDF actions and saved-report sheet`.

### P4 — Smaller page polishes

- Projects list — owner badge styling per `03-projects-list.png`.
- Members — match `06-members.png`.
- Profile — match `14-profile.png`, port `UsageBarChart`.
- Onboarding/login/verify — confirm against `01-login.png` and
  `02-onboarding.png`; small spacing fixes only.

### P5 — Tests + Maestro re-port

- Re-port any Maestro flows that target the rebuilt screens.
- Add Vitest coverage for the new report cards.
- Verify `pnpm test:mobile` is green before each commit in P1–P4.

## Page inventory

Every screen below gets a design doc under
`docs/v3/realignment/pages/`. Numbers follow the screenshot order
where one exists, with new numbers for screens that aren't
screenshotted yet.

| # | File | Screenshot | v3 source |
|---|---|---|---|
| 01 | `pages/01-login.md` | `01-login.png` | `app/(auth)/login.tsx` |
| 02 | `pages/02-onboarding.md` | `02-onboarding.png` | `app/(auth)/onboarding.tsx` |
| 02b | `pages/02b-verify.md` | — | `app/(auth)/verify.tsx` |
| 03 | `pages/03-projects-list.md` | `03-projects-list.png` | `app/(app)/projects/index.tsx` |
| 04 | `pages/04-new-project.md` | `04-new-project.png` | `app/(app)/projects/new.tsx` |
| 04b | `pages/04b-edit-project.md` | — | `app/(app)/projects/[projectId]/edit.tsx` |
| 05 | `pages/05-project-home.md` | `05-project-home.png` | `app/(app)/projects/[projectId]/index.tsx` |
| 06 | `pages/06-members.md` | `06-members.png` | `app/(app)/projects/[projectId]/members.tsx` |
| 06b | `pages/06b-reports-list.md` | — | `app/(app)/projects/[projectId]/reports/index.tsx` |
| 07 | `pages/07-notes-tab.md` | `07-notes.png` | `app/(app)/projects/[projectId]/reports/generate.tsx` (Notes tab) |
| 08 | `pages/08-report-tab.md` | `08-report-generation.png` | same screen, Report tab |
| 09 | `pages/09-report-edit-tab.md` | `09-report-edit.png` | **STRIPPED in P1**, doc kept for future redesign |
| 10 | `pages/10-saved-report.md` | `10-saved-report.png` | `app/(app)/projects/[projectId]/reports/[reportId].tsx` |
| 11 | `pages/11-pdf-preview.md` | `11-pdf.png` | new — `PdfPreviewModal` |
| 12 | `pages/12-files.md` | `12-files.png` | files in report detail / project |
| 13 | `pages/13-camera.md` | — | `app/(app)/camera/capture.tsx` |
| 14 | `pages/14-profile.md` | `14-profile.png` | `app/(app)/profile/index.tsx` |
| 14b | `pages/14b-account.md` | — | `app/(app)/profile/account.tsx` |
| 14c | `pages/14c-usage.md` | — | `app/(app)/profile/usage.tsx` |

## Design-doc structure (per page)

Every `pages/<NN>-<slug>.md` follows this template. The goal is that
the user can paste the file (plus the matching PNG) into an LLM-driven
design tool with the prompt at the top and get a working visual.

```
# <Page name>

> **Prompt for design tool:** Generate a high-fidelity mobile UI for
> the screen described below. Match the visual style of the attached
> reference screenshot. Use iOS sizing. Output a single screen frame
> with the listed sections in order. Do not invent extra content.

**Route:** <expo-router path>
**Reference screenshot:** ../../../apps/docs/public/screenshots/<file>.png
**v3 source file(s):** <list>
**Mobile-old source (for behaviour parity):**
[`docs/v3/_work/mobile-old-source-dump.md`](../../_work/mobile-old-source-dump.md)
  section `===== FILE: <old path> =====`

## Purpose

<one-paragraph user-facing goal>

## Layout (top → bottom)

1. <section> — <component> — <copy / placeholder>
2. …

## Components

| Component | Type | Props / state |
|---|---|---|
| … |

## Interactions

- Tap <thing> → <result>
- Pull-to-refresh → <result>
- Empty state → <copy>
- Loading state → <skeleton structure>
- Error state → <copy + recovery action>

## Data shown

- <field> — from `<hook / API>`

## Visual tokens

- Background: `theme.colors.background`
- Card: …

## Acceptance checklist

- [ ] Matches reference screenshot at the section level
- [ ] All listed testIDs render
- [ ] No `console.log` / TODO / stubbed handlers
- [ ] Works in mock mode (`USE_FIXTURES=true`)
- [ ] Vitest snapshot or behavior test added
```

## Conventions while implementing

- Use subagents (`Explore`, `Code Reviewer`, `TDD Guide`) liberally —
  context fills up fast. Each commit should be a single subagent task
  when feasible.
- Conventional commits, scoped to `mobile-v3` for app changes and
  `docs` for design-doc changes.
- Keep `apps/docs/content/guides.ts` in sync as user-facing copy
  changes — it's the contract.
- Do not push to `main`; commit to the current working branch
  (`mobile-v3` per `AGENTS.md`).
- For every commit: `pnpm test:mobile` green before pushing.
