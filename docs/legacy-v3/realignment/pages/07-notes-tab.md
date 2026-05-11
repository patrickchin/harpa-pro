# Notes Tab (Report Draft)

> **Prompt for design tool:** The Notes tab is the primary input view while composing a site report. It displays a vertical timeline of captured text notes, voice transcripts, and attached photos. At the bottom is a smart input bar that morphs between three states: **Idle** (shows Photo and Voice buttons side-by-side), **Typing** (Photo and Voice collapse; an orange Add button replaces them), and **Recording** (full-width waveform with "LISTENING" caption, interim transcript, Cancel and Stop buttons). Above the tab bar sits a persistent action row with "Generate report" / "Update report (N)" / "Finalize report" buttons. The tab bar itself has 2 tabs in v3 P1 (Notes with count, Report with spinner during generation).

**Route:** `app/(app)/projects/[projectId]/reports/generate.tsx` → Notes tab
**Reference screenshot:** ../../../apps/docs/public/screenshots/07-notes.png
**v3 source:** apps/mobile-v3/components/reports/GenerateReportInputBar.tsx, NoteTimeline.tsx, GenerateReportActionRow.tsx
**Mobile-old source:** [`docs/v3/_work/mobile-old-source-dump.md`](../../_work/mobile-old-source-dump.md) — `===== FILE: apps/mobile-old/components/reports/generate/GenerateReportInputBar.tsx =====` (line 1), `NotesTabPane.tsx` (line 424), `GenerateReportActionRow.tsx` (line 229), `GenerateReportTabBar.tsx` (line 318)

## Purpose

Capture site observations as a timeline of notes (text, voice, photo). The input bar adapts its layout based on composition state, hiding photo/voice buttons when the user starts typing to reduce clutter. Voice recordings auto-transcribe in real-time ("Listening…"). The action row above the tabs drives report generation.

## Layout (top → bottom)

1. **GenerateReportActionRow** — persistent above the tab bar, two states:
   - **Out of date** (no report or new notes): single full-width secondary button `btn-generate-update-report` with icon (Sparkles) + label ("Generate report" / "Update report (N)" where N = notesSinceLastGeneration / "Generating…"). Disabled when busy or no notes + no report. `className="w-full"`.
   - **Up to date** (report exists, no new notes): flex-row `gap-2`; icon-only secondary `btn-generate-update-report` with RotateCcw (Regenerate), then primary hero `btn-finalize-report` flexed with "Finalize report" label. Disabled when busy.

2. **GenerateReportTabBar** — 4-element (old) or 2-element (v3 P1) pill bar in a `rounded-lg border-border bg-card p-1` card:
   - Old: Notes (N) / Report / Edit / Debug, each with icon + label, `py-3`, active state `bg-secondary border-b-2 border-accent`.
   - **v3 P1 drops Edit + Debug** → only Notes (N) + Report, same styling.
   - Report tab shows `ActivityIndicator` when `generation.isUpdating`.

3. **NoteTimeline** — `ScrollView flex-1 px-5` with each note as a numbered row (e.g., "1. Type note text" or "2. [Photo from camera]" or "3. Voice transcript 'hello world'"). Empty state shows `EmptyState` icon (Mic) + text "Start capturing site notes".

4. **GenerateReportInputBar** — only visible on Notes tab, bottom of screen with border-t.
   - **Idle (notes.input.trim() falsy)**:
     - Container: `min-h-[68px] rounded-xl border px-4 py-3 flex-row items-stretch gap-3` flex-row.
     - Left side (flex-1): Paperclip `btn-attachment` pressable + multiline `TextInput input-note` placeholder "Type a site note..." `flex-1 min-h-[44px] text-base`.
     - Right side: two large buttons in idle state only:
       - Camera `btn-camera-capture` icon (Camera) + label "Photo", 68×68 `rounded-xl border-border bg-card px-3`.
       - Voice `btn-record-start` icon (Mic) + label "Voice", 68×68 `rounded-xl border-border bg-card px-3`.
   - **Typing (notes.input.trim() truthy)**:
     - Left side (flex-1): Paperclip + TextInput unchanged.
     - Right side: Primary Add `btn-add-note` button replaces Photo/Voice, 68×68 `min-w-[84px] rounded-xl px-4`, icon (Plus) + label "Add".
   - **Recording (voice.isRecording true)**:
     - Container bg: `border-warning-border bg-warning-soft`.
     - Left side: "LISTENING" caption `text-xs font-semibold uppercase tracking-widest text-muted-foreground` + `<LiveWaveform amplitude={voice.amplitude}>` + interim transcript text `mt-2 text-sm text-muted-foreground`.
     - Right side: X button `btn-record-cancel` (68×68 `rounded-xl border-border bg-card px-3`, icon X) + pulsing Stop `btn-record-stop` (68×68 `rounded-xl bg-destructive px-3`, icon MicOff + label "Stop", pulsing scale animation at 1.5x).

## Components

| Component | Type | Props / state |
|-----------|------|---------------|
| `GenerateReportActionRow` | Functional | `generation`, `draft`, `timeline` from `useGenerateReport()`. Reads `hasReport`, `hasNotes`, `upToDate`, `busy` to determine state. |
| `GenerateReportTabBar` | Functional | `tabs.active` (notes / report / edit / debug), `notes.list.length` for count label, `generation.isUpdating` for Report spinner. **V3 P1: remove edit/debug tabs.** |
| `NoteTimeline` | Functional | `notes.list` array; each item has id, type (text/voice/photo), content/transcript, createdAt. Click item → preview modal. |
| `GenerateReportInputBar` | Functional | `notes.input`, `notes.setInput`, `notes.add()`, `voice.isRecording`, `voice.amplitude`, `voice.interimTranscript`, `voice.toggleRecording()`, `voice.cancelRecording()`, `voice.speechError`, `photo.handleCameraCapture()`, `ui.setAttachmentSheetVisible()`. |
| `LiveWaveform` | Visual | Animated bars responding to `amplitude` number (0–1). |

## Interactions

- **Idle state**: Tap Paperclip → AttachmentSheet (Take photo / Choose from library) per guides.ts step 2. Tap Photo → Camera capture. Tap Voice → start recording.
- **Typing**: As soon as `notes.input.trim()` becomes truthy, Photo/Voice collapse; Add button appears. Tap Add → add the text note to timeline, clear input, Photo/Voice reappear.
- **Recording**: Tap Voice → `voice.toggleRecording()` = true. Waveform animates. Interim transcript appears in real-time. Tap Stop → finalize recording, transcription completes, note added to timeline. Tap Cancel → discard recording.
- **Tab bar**: Tap Notes → switch to notes view. Tap Report → switch to report view (only 2 tabs in v3 P1). Keyboard.dismiss on tab press.
- **Action row**: Tap "Generate report" / "Update report (N)" → `handleRegenerate()`, which triggers `generation.isUpdating = true`, switches to Report tab, streams response. Tap "Finalize report" → confirm dialog, then `draft.finalize()`.
- **Attachment sheet** (from guides.ts step 2, subfeature of Paperclip tap):
  - Modal with "Take photo" and "Choose from library" options.
  - Take photo → launches camera, saves to Photos file list.
  - Choose from library → file picker, saves to Photos file list.
  - Each attached photo appears in timeline as "[Photo from camera captured at HH:MM]" or "[Photo from library: filename.jpg]".

## Data shown

- **Timeline**: Notes list, each row numbered (1. 2. 3. …) with capture time + content (text / transcript / photo metadata).
- **Input field**: Placeholder "Type a site note…", multiline, auto-grow, character limit (?) (can check v3 source for max length).
- **Voice state**: Interim transcript updates in real-time as audio is processed. "LISTENING" caption in uppercase.
- **Buttons**: Label + icon in all states. Busy states show loading spinner or disabled opacity.
- **Audio waveform**: Real-time bars scaled to amplitude (0–1).

## Visual tokens

Use Unistyles tokens only:
- Container bg: `theme.colors.card` (idle) / `theme.colors.warningSoft` (recording).
- Text: `theme.colors.foreground` (primary) / `theme.colors.mutedForeground` (secondary).
- Button background: `theme.colors.card` (secondary) / primary hero color (Add).
- Borders: `theme.colors.border` (default) / `theme.colors.warningBorder` (recording).
- Icon size: 20–24px depending on button context.
- Spacing: `gap-3` between row elements, `px-4 py-3` in container, `px-3` in buttons.
- Radii: `theme.radii.xl` (68px container) / `theme.radii.md` (buttons).
- Typography: `text-xs font-semibold uppercase` (caption) / `text-sm font-semibold` (button label) / `text-base` (input).

## Acceptance checklist

- [ ] Input bar morphs between idle / typing / recording states correctly.
- [ ] Paperclip opens attachment sheet with Take photo / Choose from library.
- [ ] Voice recording shows "LISTENING" caption + waveform + interim transcript.
- [ ] Stop button pulses with scale animation while recording.
- [ ] Add button appears/disappears on input state change.
- [ ] Tab bar shows only Notes + Report in v3 P1 (Edit and Debug removed).
- [ ] Notes count label updates (e.g., "Notes (3)").
- [ ] Report tab spinner shows during generation.
- [ ] Action row shows correct label based on generation state.
- [ ] Timeline displays numbered notes with icons/metadata.
- [ ] Empty timeline shows "Start capturing site notes" EmptyState.
- [ ] All testIDs present: `btn-attachment`, `input-note`, `btn-camera-capture`, `btn-record-start`, `btn-record-stop`, `btn-record-cancel`, `btn-add-note`, `btn-generate-update-report`, `btn-finalize-report`, `btn-tab-notes`, `btn-tab-report`.
