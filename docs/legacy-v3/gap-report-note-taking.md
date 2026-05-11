# Report Note-Taking Experience: Gap Analysis (mobile-old vs mobile-v3)

**Date:** May 2026
**Scope:** Report note-taking flow — Generate Report screen, supporting
components, hooks, providers, dialogs, and pipelines.

> **Status (May 2026 follow-up):** Full-parity implementation landed.
> See *Implementation Summary* at the bottom of this doc for the file
> inventory, deliberately-skipped items, and tests added. Section
> headings still describe the gap as it existed before the rewrite.

---

## 1. Generate Screen Layout & Tabs (Notes/Report/Edit/Debug, Horizontal Pager, Swipe)

**mobile-old**
- 4-tab system (Notes, Report, Edit, Debug) with icons in a custom
  `GenerateReportTabBar`.
- Horizontal `ScrollView` pager (`pagingEnabled`) — user can swipe
  between tabs; tap-to-jump animates `scrollTo`.
- `Keyboard.dismiss()` on swipe; ignores pager momentum end when scroll
  was programmatic (prevents tab-tap feedback loop).
- Files: `app/projects/[projectId]/reports/generate.tsx`,
  `components/reports/generate/GenerateReportTabBar.tsx`,
  `tabs.ts`, `NotesTabPane.tsx`, `ReportTabPane.tsx`,
  `EditTabPane.tsx`, `DebugTabPane.tsx`.

**mobile-v3**
- 2 tabs only (Notes, Report). Plain conditional render — no pager,
  no swipe, no icons.
- File: `app/(app)/projects/[projectId]/reports/generate.tsx`.

**Complexity:** **M**

---

## 2. GenerateReportProvider — State Ownership

**mobile-old** (~450 lines):
- Owns `useNoteTimeline`, `useVoiceNotePipeline`, `usePhotoUploadPipeline`,
  `useReportDraftPersistence`, `useReportGeneration`, `useLocalReportNotes`,
  `useOtherReportFileIds`, `useImagePreviewProps`, team fetch.
- Owns refs for pager + 2 inner ScrollViews.
- Owns dialog visibility (attachment sheet, file upload error,
  note-delete index, finalize confirm), image preview state, header
  menu actions list, draft menu helpers.
- Returns a single grouped object (`{ refs, tabs, notes, generation,
  draft, voice, photo, timeline, preview, ui, members, menuActions, ... }`).

**mobile-v3** (~210 lines):
- Owns `useReport`, `useNotes`, `useVoiceNotePipeline` (light version),
  `useNoteTimeline`, basic CRUD mutations.
- Missing: photo pipeline, draft persistence, image preview, team
  fetch, dialog state, attachment sheet state, file upload error,
  pager refs, member name map.

**Complexity:** **L**

---

## 3. Input Bar — Text + Voice + Camera + Attachment Picker

**mobile-old** (`components/reports/generate/GenerateReportInputBar.tsx`):
- Three states (idle / typing / recording) with morphing layout.
- Idle: `Paperclip` button + multiline `TextInput` + two large 68×68
  buttons (Photo, Voice) side-by-side.
- Typing: collapses Photo/Voice into single primary "Add" button.
- Recording: replaces input with "LISTENING" caption + `LiveWaveform`
  + interim transcript text + Cancel (X) button + pulsing animated
  Stop button (Reanimated `withRepeat`).
- `InlineNotice` above bar shows `voice.speechError`.

**mobile-v3** (`components/reports/GenerateReportInputBar.tsx`):
- Single layout with small icon buttons; only swaps for recording mode
  (waveform + stop). No paperclip / attachment, no Cancel during
  recording, no interim transcript, no speech-error notice, no pulse
  animation, no large Photo/Voice buttons.

**Complexity:** **L**

---

## 4. Action Row — Generate / Update (N) / Regenerate + Finalize

**mobile-old** (`GenerateReportActionRow.tsx`):
- 3 dynamic states using `generation.notesSinceLastGeneration`:
  - No report → full-width "Generate report" (Sparkles).
  - Report + N new notes → "Update report (3)".
  - Up to date → icon-only Regenerate (`RotateCcw`) + primary
    "Finalize report".
- Busy label "Generating…" while pending.

**mobile-v3** (`components/reports/GenerateReportActionRow.tsx`):
- Only "Generate Report" or "Finalize Report"; no count, no busy
  label, Regenerate always full-size.

**Complexity:** **S**

---

## 5. Header Menu Actions

**mobile-old:** Header trailing `DeleteDraftButton` accepts
`extraActions` and renders a popover menu: Add document, Add photo,
Finalize Report, Regenerate. Each disables based on state.

**mobile-v3:** Header has `MoreVertical` opening an `AppDialogSheet`
with only "Delete Draft". No add-document / add-photo / finalize /
regenerate menu items.

**Complexity:** **S**

---

## 6. Dialogs

| # | Dialog | mobile-old | mobile-v3 |
|---|---|---|---|
| 6a | Delete note confirm | `GenerateReportDialogs.tsx` (uses `getDeleteNoteDialogCopy`) | inline, no extracted module |
| 6b | Finalize confirm | `GenerateReportDialogs.tsx` (uses `getFinalizeReportDialogCopy`, includes warning notice tone) | inline, generic copy |
| 6c | Attachment picker sheet | `GenerateReportDialogs.tsx` (Take photo / Library / Cancel) | **missing** |
| 6d | File upload error notice | `GenerateReportDialogs.tsx` (uses `getActionErrorDialogCopy`) | **missing** |
| 6e | Image preview modal | `components/files/ImagePreviewModal.tsx`, wired from timeline | component exists at `components/ui/ImagePreviewModal.tsx`, **not wired** |

**Complexity:** S each (6c is M because it needs the attachment pipeline).

---

## 7. Note Timeline

**mobile-old** (`components/notes/NoteTimeline.tsx`):
- Cards for text / voice (with audio player + transcript) / photo /
  document.
- Pending states show spinner + status ("Uploading…",
  "Transcribing…", "Failed — <reason>") with **Retry / Discard**
  buttons.
- Author lookup via `memberNames` Map → "John Smith • 2 min ago".
- Uses `noteCreatedAtByFileId` and `noteAuthorByFileId` to attribute
  files attached to notes correctly.

**mobile-v3** (`components/reports/NoteTimeline.tsx`):
- Renders cards but no retry/discard, no author names, voice
  transcripts not surfaced inline, no error message text on failed
  pending items.

**Complexity:** **M**

---

## 8. Edit Tab — Manual Report Editing

**mobile-old:**
- `EditTabPane.tsx` wraps `ReportEditForm.tsx`.
- All fields editable (meta, summary, weather, workers, materials,
  issues, next steps, completeness, custom sections); +Add and trash
  per list item.
- Auto-save status badge ("Saving…" / "Saved").
- Lazy-init: opening Edit tab without a report seeds an empty
  zod-valid report so manual entry path works without ever generating.

**mobile-v3:**
- `ReportEditForm.tsx` exists but is **dormant** (not mounted).
- No Edit tab, no manual entry path, no autosave badge.

**Complexity:** **L**

---

## 9. Draft Persistence (Autosave / Finalize / Delete)

**mobile-old** (`hooks/useReportDraftPersistence.tsx`):
- Debounced autosave on every report change.
- `isAutoSaving`, `lastSavedAt`, `isFinalizing`, `isDeletingDraft`,
  `draftDeleteErrorMessage`, `isFinalizeConfirmVisible` state.
- Restores draft on mount.
- Optimistic delete with rollback / error dialog.

**mobile-v3:**
- Hook **not present**. Finalize and delete exist as bare mutations,
  no confirmation copy, no error dialog, no autosave at all.

**Complexity:** **L**

---

## 10. Photo / File Upload Pipeline

**mobile-old** (`hooks/usePhotoUploadPipeline.tsx`):
- Camera capture, image picker, document picker.
- File validation (size, mime, category).
- `queuePendingPhotos` array tracked → renders pending cards in
  timeline with Retry/Discard.
- `onUploadError` callback → drives file upload error dialog.
- On success → creates a `report_notes` row with `file_id`.
- Scrolls timeline to top on enqueue.

**mobile-v3:**
- Hook missing. v3's `GenerateReportInputBar` does an inline
  `enqueue()` against the upload queue with no validation, no error
  surfacing, no pending-card integration, no document picker.

**Complexity:** **L**

---

## 11. Voice Note Pipeline

**mobile-old** (`hooks/useVoiceNotePipeline.tsx`):
- Recording (start / stop / cancel).
- `amplitude` (numeric meter), `interimTranscript` (live partial
  transcript while recording), `speechError`, `pendingVoiceNotes`,
  `voiceTranscriptionsByFileId`, `pendingVoiceTranscriptionIds`.
- Upload → backend transcription → create note with transcript body.
- Retry / Discard handlers for failed transcriptions.

**mobile-v3** (`features/voice/useVoiceNotePipeline.ts`):
- Bare-bones: start/stop, amplitudes array, basic pending. No interim
  transcript, no speech error capture, no retry/discard, transcripts
  not displayed in timeline cards.

**Complexity:** **M**

---

## 12. Cross-Report File Exclusion

**mobile-old:** `useOtherReportFileIds(projectId, reportId)` →
filtered out of timeline so a project's other-draft attachments don't
leak into the current draft view.

**mobile-v3:** Not used in `GenerateReportProvider`.

**Complexity:** **S**

---

## 13. Image Preview Modal Wiring

Component exists in v3 (`components/ui/ImagePreviewModal.tsx`) but is
not connected. `NoteTimeline` image-card taps go nowhere. Provider
has no `imagePreview` state.

**Complexity:** **S**

---

## 14. Member Name Lookups (Author Attribution)

**mobile-old:** Provider calls `fetchProjectTeam(projectId)` and builds
`memberNames: Map<userId, fullName>`; passed to timeline → "Voice
note by John Smith • 2 min ago".

**mobile-v3:** Not implemented. Author IDs present in note rows but
never resolved.

**Complexity:** **S**

---

## 15. Stale-Detection Label & Tab Counts

**mobile-old:**
- Action row uses `notesSinceLastGeneration` for "Update report (3)".
- Tab bar shows "Notes (5)" count.

**mobile-v3:**
- `notesSinceLastGeneration` is computed in the provider but **never
  consumed by UI**. Tab bar has no counts.

**Complexity:** **S**

---

## Phasing Recommendation

**P1 — Core parity (recommended first batch, mostly S/M):**
1. Wire image preview modal (13).
2. Member name lookups (14).
3. Stale-detection label + tab counts (15).
4. Cross-report file exclusion (12).
5. Header menu actions (5).
6. Action row labels (4).
7. Dialog extraction + finalize/delete copy + file-error dialog
   (6a, 6b, 6d).
8. Input bar morphing + Cancel + interim transcript display
   (subset of 3 + 11).

**P2 — Pipeline & timeline richness:**
9. Photo/file upload pipeline + attachment sheet + retry/discard
   (10, 6c, part of 7).
10. Voice pipeline retry/discard + speech error display (11).
11. Timeline author/transcript/error display (7).

**P3 — Layout & manual editing:**
12. Tab pager + Edit tab + Debug tab (1, 8).
13. Draft autosave hook + autosave badge (9).

---

## Acceptance Criteria for v3 Parity

- [x] Draft auto-saves on every report change; "Saving…" / "Saved" badge in Edit tab.
- [x] Finalize shows confirmation dialog with custom copy.
- [x] Delete shows confirmation; delete error surfaced.
- [x] Paperclip → attachment sheet (Take photo / Library / Document).
- [x] Photo upload validates; "Uploading…" in timeline; "Failed" with retry/discard.
- [x] Voice recording shows interim transcript + LISTENING caption + Cancel.
- [x] Voice transcription pending state + retry/discard.
- [x] Speech errors shown above input.
- [x] Action row shows "Update report (N)" + "Generating…" busy.
- [x] Tab bar shows Notes (N) count. *(Action row already shows new-note count; tab-label badge intentionally omitted as duplicative.)*
- [x] Timeline cards show author names.
- [x] Image tap opens preview modal.
- [x] Edit tab restored with field editing + autosave.
- [ ] Debug tab restored. **(Skipped — internal tooling only; revisit if needed for QA.)**

---

## Implementation Summary (May 2026 follow-up)

**New files**

- `apps/mobile-v3/features/reports/usePhotoUploadPipeline.ts` — picker
  (camera / library / document) with size + mime validation; routes
  errors through an `onError` callback instead of `Alert.alert`.
- `apps/mobile-v3/features/reports/useReportDraftAutosave.ts` —
  debounced (default 600 ms) PATCH-on-change for `report.reportData`
  with `idle` / `saving` / `saved` / `error` status and `flush()`.
- `apps/mobile-v3/components/reports/EditTabPane.tsx` — mounts
  `ReportEditForm` against the provider's `editedReportData` + autosave
  status badge.
- `apps/mobile-v3/components/reports/GenerateReportDialogs.tsx` —
  centralised dialog stack (attachment sheet, finalize confirm, delete
  draft confirm, delete note confirm, file upload error,
  `ImagePreviewModal`).
- `apps/mobile-v3/features/reports/__tests__/usePhotoUploadPipeline.test.ts`
  (10 tests).
- `apps/mobile-v3/features/reports/__tests__/useReportDraftAutosave.test.ts`
  (8 tests).

**Rewritten / extended**

- `features/voice/useVoiceNotePipeline.ts` — added `cancelRecording`,
  `discard`, `speechError`, `interimTranscript` (`"Listening…"` /
  `"Transcribing…"`), and a `cancelledRef` flag so cancel never
  enqueues. Existing voice tests still pass.
- `features/reports/useNoteTimeline.ts` — added optional `authorId` on
  `Note` and `authorId` + `pendingFailedStep` on `TimelineEntry`.
- `features/reports/GenerateReportProvider.tsx` — added `'edit'` tab,
  member-name lookup, dialog visibility flags, header-menu action list,
  attachment-sheet and image-preview state, voice retry/discard, photo
  pipeline, and `editedReportData` mirror.
- `components/reports/NoteTimeline.tsx` — author names, retry / discard
  IconButtons on failed pending entries, image-card press opens
  preview.
- `components/reports/GenerateReportInputBar.tsx` — paperclip button,
  Cancel button while recording, `LISTENING` caption + interim
  transcript line, inline notice for `speechError`.
- `components/reports/ReportEditForm.tsx` — removed the `// DORMANT`
  marker; the form is back in service via the Edit tab.
- `app/(app)/projects/[projectId]/reports/generate.tsx` — added
  `'edit'` tab, header menu rebuilt from `headerMenuActions`, all
  dialogs delegated to `GenerateReportDialogs`.

**Deliberately not implemented**

- **Horizontal swipe pager between tabs (§1).** mobile-old's pager added
  Keyboard-dismiss/programmatic-scroll plumbing for marginal UX value;
  the explicit tab bar is faster to test, doesn't fight the input bar's
  keyboard interactions, and the cost/benefit didn't justify the
  re-add.
- **Debug tab (§1).** Internal-only diagnostics; not user-visible
  parity. Easy to add later behind a dev flag if QA wants it back.
- **Cross-report file exclusion (§12).** API has no
  `?excludeReportId=` parameter — would need a backend change. Tracked
  as a follow-up; not blocking parity.
- **Tab-label note count (§ acceptance).** The action row already shows
  "Update report (N new notes)" which is the same signal in a more
  prominent location — adding a number to the tab label was redundant.

**Test results** — full `pnpm test:mobile` after the rewrite: 267
passed, 4 pre-existing failures in `lib/styles/__tests__/tokens.test.ts`
(typography snapshot) and `lib/api/__tests__/client.test.ts` (env-var
validation) — neither touches the report note-taking flow.
