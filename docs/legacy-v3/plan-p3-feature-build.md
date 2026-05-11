# P3: Feature Build (Weeks 5-7)

> Part of [Implementation Plan](./implementation-plan.md)

### Goal
Implement all screens with full functionality.

### P3.1 — Projects Feature

**Deliverables:**
- Project list, detail, create, edit, delete screens
- Member management

**Tasks:**

| Task | Description | Est. | Depends On |
|------|-------------|------|------------|
| P3.1.1 | useProjects, useProject, useCreateProject hooks | 2h | P2.4 |
| P3.1.2 | useUpdateProject, useDeleteProject hooks | 1h | P3.1.1 |
| P3.1.3 | projects/index.tsx — list screen | 3h | P3.1.2 |
| P3.1.4 | projects/new.tsx — create screen | 2h | P3.1.3 |
| P3.1.5 | projects/[projectId]/index.tsx — detail screen | 3h | P3.1.4 |
| P3.1.6 | projects/[projectId]/edit.tsx — edit screen | 2h | P3.1.5 |
| P3.1.7 | useMembers, useAddMember, useRemoveMember hooks | 2h | P3.1.6 |
| P3.1.8 | projects/[projectId]/members.tsx — member list | 3h | P3.1.7 |
| P3.1.9 | components/members/AddMemberSheet.tsx | 2h | P3.1.8 |
| P3.1.10 | Unit tests for project screens | 3h | P3.1.9 |

**Acceptance Criteria:**
- [ ] All project CRUD operations work
- [ ] Members can be added/removed
- [ ] Role badges display correctly
- [ ] Empty states show

---

### P3.2 — Reports Feature

**Deliverables:**
- Report list, detail, generate screens
- Note timeline component

**Tasks:**

| Task | Description | Est. | Depends On |
|------|-------------|------|------------|
| P3.2.1 | useReports, useReport, useCreateReport hooks | 2h | P3.1 |
| P3.2.2 | useGenerateReport hook with optimistic update | 3h | P3.2.1 |
| P3.2.3 | reports/index.tsx — list screen | 2h | P3.2.2 |
| P3.2.4 | components/reports/ReportCard.tsx | 2h | P3.2.3 |
| P3.2.5 | reports/generate.tsx — generate screen | 4h | P3.2.4 |
| P3.2.6 | components/reports/NoteTimeline.tsx | 4h | P3.2.5 |
| P3.2.7 | components/reports/GenerateActionBar.tsx | 2h | P3.2.6 |
| P3.2.8 | reports/[reportId].tsx — detail screen | 4h | P3.2.7 |
| P3.2.9 | components/reports/ReportView.tsx | 3h | P3.2.8 |
| P3.2.10 | Report section components (Weather, Workers, etc.) | 4h | P3.2.9 |
| P3.2.11 | Unit tests for report screens | 3h | P3.2.10 |

**Acceptance Criteria:**
- [ ] AI generation works with provider selection
- [ ] Timeline shows notes + pending uploads
- [ ] Report sections render correctly
- [ ] Edit tab allows manual editing

---

### P3.3 — Notes Feature

**Deliverables:**
- Text note CRUD
- Timeline integration

**Tasks:**

| Task | Description | Est. | Depends On |
|------|-------------|------|------------|
| P3.3.1 | useNotes, useCreateNote hooks with optimistic update | 3h | P3.2 |
| P3.3.2 | useUpdateNote, useDeleteNote hooks | 2h | P3.3.1 |
| P3.3.3 | useNoteTimeline hook (merge pending + server) | 4h | P3.3.2 |
| P3.3.4 | components/notes/TextNoteCard.tsx | 2h | P3.3.3 |
| P3.3.5 | Swipe-to-delete gesture | 2h | P3.3.4 |
| P3.3.6 | Unit tests for note hooks | 2h | P3.3.5 |

**Acceptance Criteria:**
- [ ] Text notes create/edit/delete
- [ ] Timeline merges pending uploads (R11 compliance)
- [ ] Optimistic updates visible immediately (R3)
- [ ] Swipe-to-delete works

---

### P3.4 — Upload Queue Feature

**Deliverables:**
- Upload queue with persistence
- Background upload support

**Tasks:**

| Task | Description | Est. | Depends On |
|------|-------------|------|------------|
| P3.4.1 | Create features/upload-queue/types.ts | 1h | P2.4 |
| P3.4.2 | Create uploadQueue$ observable with persistence | 2h | P3.4.1 |
| P3.4.3 | Create UploadQueueProvider.tsx | 4h | P3.4.2 |
| P3.4.4 | Implement presign + upload flow | 3h | P3.4.3 |
| P3.4.5 | iOS background upload (NSURLSession) | 4h | P3.4.4 |
| P3.4.6 | Android foreground service upload | 4h | P3.4.5 |
| P3.4.7 | components/uploads/UploadTrayBadge.tsx | 2h | P3.4.6 |
| P3.4.8 | Queue persistence across app restart | 2h | P3.4.7 |
| P3.4.9 | Unit tests for upload queue | 3h | P3.4.8 |

**Acceptance Criteria:**
- [ ] Uploads resume on app restart
- [ ] Failed uploads retry with backoff
- [ ] Progress visible in UI
- [ ] Background upload works on iOS

---

### P3.5 — Files & Camera Feature

**Deliverables:**
- File list, picker, preview
- Camera capture
- End-to-end photo capture → upload pipeline

**Status:** Camera screen and UI components exist but are **not wired up**. No caller opens the camera or consumes captured photos.

**Tasks:**

| Task | Description | Est. | Depends On | Status |
|------|-------------|------|------------|--------|
| P3.5.1 | useFiles hook | 1h | P3.4 | Done |
| P3.5.2 | components/files/FileCard.tsx | 2h | P3.5.1 | Done |
| P3.5.3 | components/files/FilePicker.tsx | 2h | P3.5.2 | Done |
| P3.5.4 | components/files/ImagePreview.tsx (modal) | 3h | P3.5.3 | Done |
| P3.5.5 | camera/capture.tsx with expo-camera | 4h | P3.5.4 | Done (needs fixes) |
| P3.5.6 | Image preprocessing (resize, thumbnail, blurhash) | 3h | P3.5.5 | Not started |
| P3.5.7 | **Camera capture fixes**: add `mode="picture"`, `pictureSize="1920x1080"`, `exif: false`, `imageType: "jpg"` to CameraView; track width/height per capture; delete temp files on remove/discard; replace `Alert.alert` with `AppDialogSheet` (AGENTS.md rule) | 2h | P3.5.5 | Not started |
| P3.5.8 | **usePhotoUploadPipeline hook**: create session → navigate to camera → await session promise → enqueue each URI into upload queue with project/report metadata → resolve file size via `FileSystem.getInfoAsync` | 4h | P3.5.7, P3.4 | Not started |
| P3.5.9 | **Wire camera button on report screens**: import `usePhotoUploadPipeline`, connect camera button in report detail / NoteTimeline to trigger pipeline | 2h | P3.5.8 | Not started |
| P3.5.10 | **Post-upload cache invalidation**: on upload complete, invalidate `reportNotesKey` and `project-files` React Query caches; render pending uploads as optimistic `PendingPhotoItem` entries in timeline | 2h | P3.5.9 | Not started |
| P3.5.11 | Unit tests for pipeline + integration | 3h | P3.5.10 | Not started |

**Acceptance Criteria:**
- [ ] Camera capture works with correct quality/format settings
- [ ] Camera button on report screen opens custom camera UI
- [ ] Captured photos flow into upload queue automatically
- [ ] Pending photos appear in timeline optimistically
- [ ] Upload completion invalidates caches and shows server photos
- [ ] Temp files cleaned up on discard/remove
- [ ] Photo library picker works
- [ ] Images preprocessed before upload (resize, thumbnail, blurhash)
- [ ] Lightbox preview works
- [ ] Discard confirmation uses AppDialogSheet (not Alert.alert)

---

### P3.6 — Voice Notes Feature

**Deliverables:**
- Audio recording + playback
- End-to-end voice note pipeline: record → upload → transcribe → summarize

**Status:** Recording, playback, and basic VoiceNoteCard exist. The upload → transcribe → summarize pipeline is **not wired**. API stubs for transcribe/summarize must be implemented first (P1.6).

**Tasks:**

| Task | Description | Est. | Depends On | Status |
|------|-------------|------|------------|--------|
| P3.6.1 | Create features/audio/AudioProvider.tsx | 3h | P3.4 | Done |
| P3.6.2 | Implement useRecorder hook | 3h | P3.6.1 | Done |
| P3.6.3 | Implement usePlayer hook | 2h | P3.6.2 | Done |
| P3.6.4 | components/voice/RecordButton.tsx | 2h | P3.6.3 | Done |
| P3.6.5 | components/voice/VoiceNoteCard.tsx | 3h | P3.6.4 | Done (minimal) |
| P3.6.6 | components/voice/Waveform.tsx | 2h | P3.6.5 | Done |
| P3.6.7 | **useVoiceNotePipeline wiring**: on recording stop → enqueue audio file in upload queue → on upload complete → call `POST /transcribe` → on transcript ready → call `POST /summarize` for long transcripts → invalidate caches | 4h | P3.6.6, P3.4, P1.6 | Not started |
| P3.6.8 | **Wire record button on report screens**: connect RecordButton in report detail / NoteTimeline to trigger pipeline; show recording state in UI | 2h | P3.6.7 | Not started |
| P3.6.9 | **VoiceNoteCard enhancements**: add seekable progress bar; play button → primary bg; add 3-dot options menu (share/download/delete/view transcript); show voice_title + voice_summary; show author name + formatted timestamp | 3h | P3.6.8 | Not started |
| P3.6.10 | **Status state machine**: show uploading → transcribing → summarizing → ready states on VoiceNoteCard; handle errors with retry per stage | 2h | P3.6.9 | Not started |
| P3.6.11 | Unit tests for pipeline + integration | 3h | P3.6.10 | Not started |

**Acceptance Criteria:**
- [ ] Recording works with visual feedback
- [ ] Playback with seekable progress bar
- [ ] Only one voice note plays at a time
- [ ] Record button on report screen triggers full pipeline
- [ ] Audio file uploads via upload queue after recording stops
- [ ] Auto-transcribe fires on upload complete
- [ ] Auto-summarize fires for long transcripts
- [ ] VoiceNoteCard shows status (uploading/transcribing/summarizing/ready/error)
- [ ] Options menu with share/download/delete/transcript actions
- [ ] voice_title and voice_summary display on card
- [ ] Retry works per-stage on failure

---

### P3.7 — Profile & Settings Feature

**Deliverables:**
- Profile, account, usage screens
- AI provider settings

**Tasks:**

| Task | Description | Est. | Depends On |
|------|-------------|------|------------|
| P3.7.1 | profile/index.tsx — main profile | 2h | P3.1 |
| P3.7.2 | profile/account.tsx — edit account details | 2h | P3.7.1 |
| P3.7.3 | profile/usage.tsx — token usage | 2h | P3.7.2 |
| P3.7.4 | AI provider selection modal | 2h | P3.7.3 |
| P3.7.5 | Avatar upload | 2h | P3.7.4 |
| P3.7.6 | Sign out flow | 1h | P3.7.5 |
| P3.7.7 | Unit tests | 2h | P3.7.6 |

**Acceptance Criteria:**
- [ ] Profile displays correctly
- [ ] Avatar upload works
- [ ] Usage history paginated
- [ ] AI provider selection persists

---

### P3.8 — PDF Export

**Deliverables:**
- PDF generation + preview + share

**Tasks:**

| Task | Description | Est. | Depends On |
|------|-------------|------|------------|
| P3.8.1 | usePdfExport hook | 2h | P3.2 |
| P3.8.2 | PDF preview modal | 2h | P3.8.1 |
| P3.8.3 | Share sheet integration | 1h | P3.8.2 |
| P3.8.4 | Unit tests | 1h | P3.8.3 |

**Acceptance Criteria:**
- [ ] PDF generated correctly
- [ ] Preview in-app
- [ ] Share works
