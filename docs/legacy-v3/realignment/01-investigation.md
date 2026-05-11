# V3 Realignment — Grounded Investigation

> Source of truth: [`docs/v3/_work/mobile-old-source-dump.md`](../_work/mobile-old-source-dump.md).
> Every claim below is backed by a file/line in that dump or in the current
> v3 source. Speculation is marked **(?)**.

## TL;DR

The v3 rewrite preserved the data layer and navigation, but **all of the
rich report rendering (`StatBar`, `WeatherStrip`, `IssuesCard`, `WorkersCard`,
`MaterialsCard`, `NextStepsCard`, `SummarySectionCard`, `CompletenessCard`),
the PDF-actions flow (`ReportActionsMenu`, `PdfPreviewModal`,
`SavedReportSheet`, `useReportPdfActions`, `export-report-pdf`), the Debug
tab, the input-bar interaction details, and parts of the project-overview
screen** were dropped. The current `ReportView` is a simplified
re-implementation that renders only generic text.

Manual edit is intentionally being stripped (per user request) and
will be removed in P1.

## Per-page findings

### Auth — Login / Verify / Onboarding

Both v3 ([apps/mobile-v3/app/(auth)/login.tsx](../../apps/mobile-v3/app/(auth)/login.tsx))
and the mobile-old screens were OTP-only (phone + 6-digit code). No
social login existed in old. No biometric login existed in old.

**Gap:** none functionally; only minor styling discrepancies vs
[`01-login.png`](../../apps/docs/public/screenshots/01-login.png),
[`02-onboarding.png`](../../apps/docs/public/screenshots/02-onboarding.png).

### Projects list — `app/(app)/projects/index.tsx`

v3 has the layout from `03-projects-list.png` correct: dashed
"Add new project" header card, project rows with name + role badge +
MapPin address + Clock "Updated …". No search, no sort — **mobile-old
also had none**, so this is not a regression.

**Gap:** none.

### New project / Edit project — `app/(app)/projects/new.tsx`, `edit.tsx`

Form fields in v3 match mobile-old: name, address, client name. Old
project edit had an explicit `Delete project` confirmation; v3 has
the same. Owner-only Delete restriction is enforced server-side.

**Gap:** none structural. Verify the copy-to-clipboard taps on
client/address shown on `05-project-home.png` are wired.

### Project home — `app/(app)/projects/[projectId]/index.tsx`

Mobile-old layout (dump line 4201) was:

1. ScreenHeader (back arrow + project name, backLabel `"Projects"`).
2. Row: copyable client name (`btn-copy-client`) + copyable address
   (`btn-copy-address`) on the left; outline **Edit** button
   (`btn-edit-project`) on the right.
3. Stat tiles row: **Total reports** + **Drafts** (warning tone when
   drafts > 0). Uses `StatTile` shared component.
4. **Last report** card (`Card variant="muted"`) showing
   `formatRelativeTime(stats.lastReportAt)` ("No reports yet" or
   "2 days ago").
5. Four action `Card` rows: **Reports**, **Documents** (Soon),
   **Materials & Equipment** (Soon), **Members**. Each row has icon
   in a 40px square, title, subtitle, chevron-right.

v3 ([apps/mobile-v3/app/(app)/projects/[projectId]/index.tsx](../../apps/mobile-v3/app/(app)/projects/[projectId]/index.tsx))
is missing:

- Copy-to-clipboard interactions (`btn-copy-client`, `btn-copy-address`).
- **Last report** muted card.
- **Documents** and **Materials & Equipment** Soon rows.
- The `btn-edit-project` is a header pencil instead of an inline
  outline button next to the client name (per screenshot).
- Stat tone (warning) when drafts > 0.

### Members — `app/(app)/projects/[projectId]/members.tsx`

v3 keeps role tabs and add-member sheet. No regression observed beyond
visual polish vs `06-members.png`.

### Reports list — `app/(app)/projects/[projectId]/reports/index.tsx`

v3 uses a `ReportCard` per row. Sorting/filtering matches old (none).
**Gap:** "New report" entry point styling vs the screenshot's projects
list dashed card pattern (the New-report card on the reports list in
old appears as a similar dashed card subtitled "Start a draft for this
project").

### Report — Generate / draft — `app/(app)/projects/[projectId]/reports/generate.tsx`

This is the biggest regression area. Mobile-old structure
(dump lines 229–664):

- **Action row** (`GenerateReportActionRow.tsx`, dump line 229) above
  the tab bar — two states:
  1. Out of date: single full-width secondary button labelled
     `"Generate report"` (first time) / `"Update report (N)"` (when
     `N = generation.notesSinceLastGeneration > 0`) / `"Generating…"`
     (busy). Disabled when no notes and no report. testID
     `btn-generate-update-report`.
  2. Up to date: icon-only Regenerate (`RotateCcw`) + primary hero
     **Finalize report** button. testID `btn-finalize-report`.
- **Tab bar** (`GenerateReportTabBar.tsx`, dump line 318) — 4 tabs
  inside a rounded-lg card with p-1 padding:
  **Notes** (with count: `"Notes (N)"`), **Report**
  (with `ActivityIndicator` while regenerating), **Edit**, **Debug**.
  Each tab is icon + label, active state has `bg-secondary` with
  accent bottom border.
- **Notes tab** (`NotesTabPane.tsx`, dump line 424) — full-bleed
  `ScrollView` with `NoteTimeline` and an `EmptyState`
  ("Start capturing site notes" + Mic icon).
- **Report tab** (`ReportTabPane.tsx`, dump line 485) — top error
  banner with `Retry` button; then either a `CompletenessCard` of
  an empty skeleton + "Edit manually" button, or 4 shimmer placeholder
  rows while generating, or the full `<ReportView>` with
  `CompletenessCard` on top and `finalizeError` banner below.
- **Edit tab** (`EditTabPane.tsx`, dump line 616) — "Edit report" label
  + `"Saving…" / "Saved"` autosave status badge, then `<ReportEditForm>`.
  Stripped in v3 (P1 of plan).
- **Debug tab** (`DebugTabPane.tsx`, dump line 664) — collapsible
  panels for Request Body / Prompt / Response / Error, with Copy
  System / User / Full prompt buttons. Useful for dev; not user-facing.
- **Input bar** (`GenerateReportInputBar.tsx`, dump line 1) only on
  Notes tab. Behavior:
  - **Idle (no input)**: 4-element row inside a rounded-xl border
    container with `min-h-[68px]`:
    - Left half: paperclip `btn-attachment` (opens attachment sheet)
      + multiline `TextInput` (`input-note`, placeholder "Type a site
      note...").
    - Right side: large **Photo** Pressable (icon + "Photo" label) +
      large **Voice** Pressable (icon + "Voice" label).
  - **Typing (`notes.input.trim()` truthy)**: Photo/Voice collapse;
    a single primary **Add** button replaces them (`btn-add-note`,
    icon + "Add" label).
  - **Recording**: the input area transforms into a warning-soft
    panel showing "LISTENING" caption, `<LiveWaveform amplitude>`,
    and interim transcript text. Right side shows an X **Cancel**
    (`btn-record-cancel`) button and a pulsing **Stop**
    (`btn-record-stop`) button.

v3 (`apps/mobile-v3/components/reports/GenerateReportInputBar.tsx`) has:
- 3 tabs (no Debug).
- A flat input row with the mic + camera as 36×36 icon buttons that
  do **not** collapse on typing — they remain visible alongside the
  Add button.
- No paperclip / attachment sheet.
- No "Listening" / interim-transcript UI during recording — just a
  full-width waveform.
- No cancel button while recording.
- Action row exists but only renders "Generate report" or
  "Finalize report"; no "Update report (N)" count, no "Generating…"
  busy label, no `RotateCcw` icon-only regenerate when up to date.

### Report view — `ReportView` and section cards

`apps/mobile-v3/components/reports/ReportView.tsx` renders plain text
sections. **None of the following cards exist in v3** (all in dump):

| Card | Dump line | Key visuals |
|---|---|---|
| `StatBar` | 1562 | 3 `StatTile`s — Workers / Materials / Issues; the 3rd tile turns `warning` tone via `getReportStats` |
| `WeatherStrip` | 1591 | `Card` with Cloud/Thermometer/Wind chips, "Impact: …" subtitle |
| `SummarySectionCard` | 1654 | Free-form section with `SECTION_ICONS[title]` from `lib/section-icons.ts` |
| `IssuesCard` | 1683 | Severity ramp (danger/warning/neutral) — 4px stripe + soft-bg severity badge + "→ Action" callout |
| `WorkersCard` | 1792 | Per-role row with horizontal bar chart sized `(count / max) * 100%`; total in subtitle, hours/notes below |
| `MaterialsCard` | 1859 | List of `surface-muted` rows with name + meta (qty / unit / status / condition) + notes |
| `NextStepsCard` | 1909 | Numbered "1." / "2." list with monospace numerals |
| `CompletenessCard` | 1949 | Warning-bordered tile listing missing fields (Visit date / Weather / Workers / Materials / Issues / Next steps) — appears on Report tab while incomplete |
| `ReportView` | 2028 | Composes the above in order: StatBar → WeatherStrip → Summary → Issues → Workers → Materials → NextSteps → free-form Summary Sections list |

The report screenshot [`10-saved-report.png`](../../apps/docs/public/screenshots/10-saved-report.png)
matches exactly this composition (3-tile stat bar, weather strip,
summary card, issues card with severity badges and action callout).

### Report — Saved/finalized — `[reportId].tsx`

Mobile-old screen (dump section `ReportActionsMenu` line 2314,
`SavedReportSheet` line 2447, `ReportDetailTabBar` line 2700) had:

- ScreenHeader with title + labeled `… Actions` button
  (NOT a header trailing icon — a labelled button below the header).
- 3-tab pill bar: **Report / Notes / Edit** — active state uses
  `bg-foreground` with `text-primary-foreground` (the inverted
  primary look in the screenshot).
- Report tab → `<ReportView>`.
- Notes tab → read-only `NoteTimeline`.
- Edit tab → `ReportEditForm` (P1: stripped).
- ⋯ Actions menu is a bottom modal with **View PDF**, **Save PDF**,
  **Share PDF**, **Delete Report** (testIDs `btn-report-view-pdf` /
  `-save-pdf` / `-share-pdf` / `-delete`). Disabled states during
  pending operations.
- **PdfPreviewModal** (dump line 2101) full-screen modal with
  iOS WebView / Android react-native-pdf, share button in header,
  loading/error states.
- **SavedReportSheet** (dump line 2447) — bottom sheet shown after
  Save PDF: shows full path, location description, **Open PDF**,
  **Share PDF**, **Done** buttons. testID `btn-saved-pdf-done`.

v3 (`apps/mobile-v3/app/(app)/projects/[projectId]/reports/[reportId].tsx`)
has only a `MoreVertical` header icon → AppDialogSheet with **Delete
report** only. No PDF actions, no preview modal, no saved sheet.

### Camera — `app/(app)/camera/capture.tsx`

v3 ([apps/mobile-v3/app/(app)/camera/capture.tsx](../../apps/mobile-v3/app/(app)/camera/capture.tsx))
mostly matches mobile-old: permission gate, flash cycle, flip,
shutter, horizontal thumbnail strip, Done/Cancel with discard
confirm. Two issues:

- `apps/mobile-v3/app/(app)/camera/capture.tsx:198` contains a
  workaround `...({ StyleSheet: undefined } as any)` — looks like a
  leftover hack from initial port. Replace with proper
  `StyleSheet.absoluteFill` or fixed inset rule.
- Mobile-old used `AppDialogSheet` for the discard confirmation
  (per the AGENTS.md rule); v3 uses `Alert.alert` directly. Switch
  back to `AppDialogSheet`.

### Voice notes — `features/voice/useVoiceNotePipeline.ts`

v3 pipeline order (`useVoiceNotePipeline.ts`):
`stopRecording → upload(presign + PUT + createFile) → transcribe →
createNote(kind=voice, body=transcript, fileId)`. The pending-note
state machine (`uploading → transcribing → saved/failed` with
`failedStep` so retry resumes) is correct.

Compared to mobile-old's `voice-note-flow.ts` (not in the dump but
the hook `useVoiceNotePlayer.ts` is at dump line 5350 — TODO read),
v3 is missing:

- **Live interim transcript** during recording (`voice.interimTranscript`
  in old) — old used on-device `useSpeechToText` for a real-time
  preview while still recording. v3 only normalises metering.
- **In-timeline retry/discard chips** for pending voice notes
  (`onRetryPendingVoice` / `onDiscardPendingVoice` in
  `NoteTimeline.tsx`, dump line 424).
- **Transcript display on the saved voice card** — v3's
  `VoiceNoteCard` renders the body but no badge for "Transcribed by
  …" or copy-transcript action.
- **Audio playback player** — `useVoiceNotePlayer` (and
  `AudioPlaybackProvider`) ensured only one voice note plays at a
  time and exposed seek-to. The v3 `usePlayer.ts` exists but is not
  wired into a coordinated provider per the dump.

### Profile / Account / Usage

Mobile-old had a top-level `profile.tsx`, plus `account.tsx`,
`usage.tsx` with `UsageBarChart` (dump references — UsageBarChart
not yet read in detail, ~line 5700+). v3 split these into
`profile/index.tsx`, `profile/account.tsx`, `profile/usage.tsx`.

**Gap:** verify `UsageBarChart` port; verify build-info and sign-out
present.

## Components & hooks to port back

| Item | Source line in dump | Destination |
|---|---|---|
| `StatBar.tsx` | 1562 | `apps/mobile-v3/components/reports/sections/StatBar.tsx` |
| `WeatherStrip.tsx` | 1591 | `…/sections/WeatherStrip.tsx` |
| `SummarySectionCard.tsx` | 1654 | `…/sections/SummarySectionCard.tsx` |
| `IssuesCard.tsx` | 1683 | `…/sections/IssuesCard.tsx` |
| `WorkersCard.tsx` | 1792 | `…/sections/WorkersCard.tsx` |
| `MaterialsCard.tsx` | 1859 | `…/sections/MaterialsCard.tsx` |
| `NextStepsCard.tsx` | 1909 | `…/sections/NextStepsCard.tsx` |
| `CompletenessCard.tsx` | 1949 | `…/sections/CompletenessCard.tsx` (optional — could defer) |
| `ReportView.tsx` | 2028 | replace v3 `ReportView.tsx` (compose the above) |
| `PdfPreviewModal.tsx` | 2101 | `components/reports/PdfPreviewModal.tsx` |
| `ReportActionsMenu.tsx` | 2314 | `components/reports/ReportActionsMenu.tsx` |
| `SavedReportSheet.tsx` | 2447 | `components/reports/SavedReportSheet.tsx` |
| `ReportDetailTabBar.tsx` | 2700 | `components/reports/ReportDetailTabBar.tsx` |
| `useReportPdfActions.ts` | (search later) | `features/reports/useReportPdfActions.ts` |
| `export-report-pdf.ts` | (search later) | `lib/export-report-pdf.ts` |
| `report-to-html.ts` | (search later) | `lib/report-to-html.ts` |
| `section-icons.ts` | (in dump) | `lib/section-icons.ts` |
| `report-helpers.ts` | (in dump) | `lib/report-helpers.ts` (only `toTitleCase`, `getItemMeta` needed) |
| `mobile-ui.ts` `getReportStats` / `getIssueSeverityTone` | (in dump) | inline or `lib/mobile-ui.ts` |
| `useCopyToClipboard.ts` | (TODO read) | `features/util/useCopyToClipboard.ts` (for project home copy chips) |

## What NOT to port

- `ReportEditForm.tsx` — keep dormant in v3 (already present). Edit
  tab is being stripped in P1 pending redesign.
- `DebugTabPane.tsx` — not user-facing; leave deleted.
- `CompletenessCard` — borderline. The screenshot `08-report-generation.png`
  shows it. **Port it.**
- `report-helpers.ts` already had a removal note in
  `docs/archive/TODO.md`; only port the helpers actually needed
  (`toTitleCase`, `getItemMeta`).

## Cross-cutting infra dependencies

Many of the ported components use NativeWind className strings
(`bg-card`, `text-foreground`, `border-warning-border`, …). v3 uses
**Unistyles** with theme tokens (`theme.colors.foreground`,
`theme.colors.surfaceMuted`, …). Each port has to be translated to
Unistyles. The token names map approximately like this:

| className | Unistyles equivalent |
|---|---|
| `bg-background` | `theme.colors.background` |
| `bg-card` | `theme.colors.card` |
| `bg-secondary` | `theme.colors.secondary` |
| `bg-surface-muted` | `theme.colors.surfaceMuted` |
| `bg-warning-soft` / `border-warning-border` / `text-warning-text` | `theme.colors.warning*` (verify in `lib/styles/tokens.ts`) |
| `bg-destructive` / `text-destructive-foreground` | `theme.colors.destructive` / `…ForegroundDestructive` |
| `text-muted-foreground` | `theme.colors.mutedForeground` |
| `text-foreground` | `theme.colors.foreground` |

If a token isn't defined in `apps/mobile-v3/lib/styles/tokens.ts`,
**add it** before porting components — don't hard-code hex values.
