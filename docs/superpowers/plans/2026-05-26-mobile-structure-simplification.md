# Mobile structure simplification — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganise `apps/mobile/` so `features/` only holds state machines + adapters, `components/` only holds presentational UI, and `lib/` is grouped into subfolders (no flat files at root).

**Architecture:** Pure file moves + import rewrites. No behaviour, schema, or API changes. The path alias `@/*` → `apps/mobile/*` is unchanged, so every import update is a string rewrite from `@/lib/<x>` → `@/lib/<group>/<x>` (or `@/features/voice/<x>` → `@/components/notes/<x>` for the voice cards). Each task is one logical move with its own commit; mobile typecheck + tests gate every step.

**Tech Stack:** pnpm, Turbo, TypeScript, Vitest, `git mv`, `sed`.

**Spec:** `docs/superpowers/specs/2026-05-26-mobile-structure-simplification-design.md`

---

## File structure (after this plan)

```
apps/mobile/
  components/notes/
    VoiceNoteCard.tsx          ← moved from features/voice/
    VoiceCardShell.tsx         ← moved from features/voice/
    voiceNoteCardHeader.ts     ← moved from features/voice/
    voiceNoteCardHeader.test.ts← moved from features/voice/
    (existing: PhotoNoteCard, TextNoteCard, ImageNoteCard, NoteTimeline,
     NoteOptionsSheet, NoteOptionsKebab, NoteCardHeader, PendingPhotoCard,
     PhotoBatchGrid, PhotoGridTile, + tests)
  components/<other>/          ← unchanged
  features/
    voice/                     ← keeps recorder/pipeline/adapters only
    generate/                  ← NEW: GenerateReportProvider lives here
  lib/
    config/                    ← NEW: env, build-info, dev-flags
    util/                      ← NEW: date, utils, uuid, use-clipboard,
                                       use-refresh, layout-shift-probe
    phone/                     ← NEW: phone, countries
    auth/                      ← +login-phone-hint, +remembered-login,
                                  +use-otp-resend (existing dir)
    reports/                   ← NEW: export-report-pdf, generate-report-ui,
                                       report-ui (renamed from mobile-ui),
                                       report-body-adapter, report-edit-helpers,
                                       section-icons, surface-depth,
                                       use-report-body-autosave,
                                       use-report-pdf-actions
    projects/                  ← NEW: project-members-layout, project-overview,
                                       project-reports-list
    notes/                     ← NEW: note-entry
    files/                     ← NEW: image-cache
    camera/                    ← +camera-session-registry (existing dir)
    (existing untouched: ai, api, audio, design-tokens, dev-fixtures,
     dialogs, nav, native, telemetry, uploads)
  components/, screens/, app/  ← unchanged (except imports)
```

After the plan:
- `apps/mobile/lib/*.{ts,tsx}` (root level glob) returns **nothing**.
- `apps/mobile/features/voice/` contains no `Voice*.tsx` or `voiceNoteCardHeader*`.

---

## Conventions used in every task

- Use `git mv` for every file move (preserves history).
- Use `sed -i ''` (BSD sed on macOS) for import rewrites. The literal command form:
  ```bash
  grep -rl --include='*.ts' --include='*.tsx' "<old>" apps/mobile \
    | xargs sed -i '' "s|<old>|<new>|g"
  ```
- After each task: `pnpm --filter @harpa/mobile typecheck` then `pnpm --filter @harpa/mobile test`. Both must pass before commit.
- Commit message format: `refactor(mobile): <what moved>`.

---

## Task 1: Create `lib/util/` and move utilities

**Files:**
- Move: `apps/mobile/lib/date.ts` → `apps/mobile/lib/util/date.ts`
- Move: `apps/mobile/lib/date.test.ts` → `apps/mobile/lib/util/date.test.ts`
- Move: `apps/mobile/lib/utils.ts` → `apps/mobile/lib/util/utils.ts`
- Move: `apps/mobile/lib/uuid.ts` → `apps/mobile/lib/util/uuid.ts`
- Move: `apps/mobile/lib/use-clipboard.ts` → `apps/mobile/lib/util/use-clipboard.ts`
- Move: `apps/mobile/lib/use-refresh.ts` → `apps/mobile/lib/util/use-refresh.ts`
- Move: `apps/mobile/lib/layout-shift-probe.ts` → `apps/mobile/lib/util/layout-shift-probe.ts`
- Move: `apps/mobile/lib/layout-shift-probe.test.ts` → `apps/mobile/lib/util/layout-shift-probe.test.ts`

- [ ] **Step 1: Create folder + move files**

```bash
cd apps/mobile
mkdir -p lib/util
git mv lib/date.ts lib/util/date.ts
git mv lib/date.test.ts lib/util/date.test.ts
git mv lib/utils.ts lib/util/utils.ts
git mv lib/uuid.ts lib/util/uuid.ts
git mv lib/use-clipboard.ts lib/util/use-clipboard.ts
git mv lib/use-refresh.ts lib/util/use-refresh.ts
git mv lib/layout-shift-probe.ts lib/util/layout-shift-probe.ts
git mv lib/layout-shift-probe.test.ts lib/util/layout-shift-probe.test.ts
```

- [ ] **Step 2: Rewrite imports**

Run from repo root:

```bash
for name in date utils uuid use-clipboard use-refresh layout-shift-probe; do
  grep -rl --include='*.ts' --include='*.tsx' "from '@/lib/${name}'" apps/mobile \
    | xargs sed -i '' "s|from '@/lib/${name}'|from '@/lib/util/${name}'|g"
done
```

- [ ] **Step 3: Verify no stale imports remain**

```bash
for name in date utils uuid use-clipboard use-refresh layout-shift-probe; do
  grep -rn "from '@/lib/${name}'" apps/mobile --include='*.ts' --include='*.tsx' && \
    echo "STALE: ${name}" || true
done
```
Expected: no lines printed (other than the `|| true` no-ops).

- [ ] **Step 4: Typecheck + test**

```bash
pnpm --filter @harpa/mobile typecheck
pnpm --filter @harpa/mobile test
```
Expected: both pass.

- [ ] **Step 5: Commit**

```bash
git add -A apps/mobile
git commit -m "refactor(mobile): group lib utilities under lib/util/

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 2: Create `lib/config/` and move env/build/flags

**Files:**
- Move: `apps/mobile/lib/env.ts` → `apps/mobile/lib/config/env.ts`
- Move: `apps/mobile/lib/env.test.ts` → `apps/mobile/lib/config/env.test.ts`
- Move: `apps/mobile/lib/build-info.ts` → `apps/mobile/lib/config/build-info.ts`
- Move: `apps/mobile/lib/dev-flags.ts` → `apps/mobile/lib/config/dev-flags.ts`

- [ ] **Step 1: Move files**

```bash
cd apps/mobile
mkdir -p lib/config
git mv lib/env.ts lib/config/env.ts
git mv lib/env.test.ts lib/config/env.test.ts
git mv lib/build-info.ts lib/config/build-info.ts
git mv lib/dev-flags.ts lib/config/dev-flags.ts
```

- [ ] **Step 2: Rewrite imports**

```bash
for name in env build-info dev-flags; do
  grep -rl --include='*.ts' --include='*.tsx' "from '@/lib/${name}'" apps/mobile \
    | xargs sed -i '' "s|from '@/lib/${name}'|from '@/lib/config/${name}'|g"
done
```

- [ ] **Step 3: Verify no stale imports**

```bash
for name in env build-info dev-flags; do
  grep -rn "from '@/lib/${name}'" apps/mobile --include='*.ts' --include='*.tsx' \
    && echo "STALE: ${name}" || true
done
```
Expected: no real matches.

- [ ] **Step 4: Typecheck + test**

```bash
pnpm --filter @harpa/mobile typecheck
pnpm --filter @harpa/mobile test
```
Expected: both pass.

- [ ] **Step 5: Commit**

```bash
git add -A apps/mobile
git commit -m "refactor(mobile): group env/build/flags under lib/config/

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 3: Create `lib/phone/` and move phone/countries

**Files:**
- Move: `apps/mobile/lib/phone.ts` → `apps/mobile/lib/phone/phone.ts`
- Move: `apps/mobile/lib/phone.test.ts` → `apps/mobile/lib/phone/phone.test.ts`
- Move: `apps/mobile/lib/countries.ts` → `apps/mobile/lib/phone/countries.ts`
- Move: `apps/mobile/lib/countries.test.ts` → `apps/mobile/lib/phone/countries.test.ts`

- [ ] **Step 1: Move files**

```bash
cd apps/mobile
mkdir -p lib/phone
git mv lib/phone.ts lib/phone/phone.ts
git mv lib/phone.test.ts lib/phone/phone.test.ts
git mv lib/countries.ts lib/phone/countries.ts
git mv lib/countries.test.ts lib/phone/countries.test.ts
```

- [ ] **Step 2: Rewrite imports**

```bash
for name in phone countries; do
  grep -rl --include='*.ts' --include='*.tsx' "from '@/lib/${name}'" apps/mobile \
    | xargs sed -i '' "s|from '@/lib/${name}'|from '@/lib/phone/${name}'|g"
done
```

- [ ] **Step 3: Typecheck + test**

```bash
pnpm --filter @harpa/mobile typecheck
pnpm --filter @harpa/mobile test
```
Expected: both pass.

- [ ] **Step 4: Commit**

```bash
git add -A apps/mobile
git commit -m "refactor(mobile): group phone/countries under lib/phone/

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 4: Move auth-adjacent files into existing `lib/auth/`

**Files:**
- Move: `apps/mobile/lib/login-phone-hint.ts` → `apps/mobile/lib/auth/login-phone-hint.ts`
- Move: `apps/mobile/lib/login-phone-hint.test.ts` → `apps/mobile/lib/auth/login-phone-hint.test.ts`
- Move: `apps/mobile/lib/remembered-login.ts` → `apps/mobile/lib/auth/remembered-login.ts`
- Move: `apps/mobile/lib/remembered-login.test.ts` → `apps/mobile/lib/auth/remembered-login.test.ts`
- Move: `apps/mobile/lib/use-otp-resend.ts` → `apps/mobile/lib/auth/use-otp-resend.ts`

- [ ] **Step 1: Move files**

```bash
cd apps/mobile
git mv lib/login-phone-hint.ts lib/auth/login-phone-hint.ts
git mv lib/login-phone-hint.test.ts lib/auth/login-phone-hint.test.ts
git mv lib/remembered-login.ts lib/auth/remembered-login.ts
git mv lib/remembered-login.test.ts lib/auth/remembered-login.test.ts
git mv lib/use-otp-resend.ts lib/auth/use-otp-resend.ts
```

- [ ] **Step 2: Rewrite imports**

```bash
for name in login-phone-hint remembered-login use-otp-resend; do
  grep -rl --include='*.ts' --include='*.tsx' "from '@/lib/${name}'" apps/mobile \
    | xargs sed -i '' "s|from '@/lib/${name}'|from '@/lib/auth/${name}'|g" || true
done
```

(The `|| true` covers files with zero importers — `xargs` is empty.)

- [ ] **Step 3: Typecheck + test**

```bash
pnpm --filter @harpa/mobile typecheck
pnpm --filter @harpa/mobile test
```
Expected: both pass.

- [ ] **Step 4: Commit**

```bash
git add -A apps/mobile
git commit -m "refactor(mobile): consolidate auth-adjacent files under lib/auth/

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 5: Create `lib/reports/` and rename `mobile-ui.ts` → `report-ui.ts`

**Files:**
- Move: `apps/mobile/lib/export-report-pdf.ts` → `apps/mobile/lib/reports/export-report-pdf.ts`
- Move: `apps/mobile/lib/generate-report-ui.ts` → `apps/mobile/lib/reports/generate-report-ui.ts`
- Rename + move: `apps/mobile/lib/mobile-ui.ts` → `apps/mobile/lib/reports/report-ui.ts`
- Move: `apps/mobile/lib/report-body-adapter.ts` → `apps/mobile/lib/reports/report-body-adapter.ts`
- Move: `apps/mobile/lib/report-edit-helpers.ts` → `apps/mobile/lib/reports/report-edit-helpers.ts`
- Move: `apps/mobile/lib/report-edit-helpers.test.ts` → `apps/mobile/lib/reports/report-edit-helpers.test.ts`
- Move: `apps/mobile/lib/section-icons.ts` → `apps/mobile/lib/reports/section-icons.ts`
- Move: `apps/mobile/lib/surface-depth.ts` → `apps/mobile/lib/reports/surface-depth.ts`
- Move: `apps/mobile/lib/use-report-body-autosave.ts` → `apps/mobile/lib/reports/use-report-body-autosave.ts`
- Move: `apps/mobile/lib/use-report-body-autosave.test.tsx` → `apps/mobile/lib/reports/use-report-body-autosave.test.tsx`
- Move: `apps/mobile/lib/use-report-pdf-actions.ts` → `apps/mobile/lib/reports/use-report-pdf-actions.ts`

- [ ] **Step 1: Move files (and rename `mobile-ui.ts`)**

```bash
cd apps/mobile
mkdir -p lib/reports
git mv lib/export-report-pdf.ts lib/reports/export-report-pdf.ts
git mv lib/generate-report-ui.ts lib/reports/generate-report-ui.ts
git mv lib/mobile-ui.ts lib/reports/report-ui.ts
git mv lib/report-body-adapter.ts lib/reports/report-body-adapter.ts
git mv lib/report-edit-helpers.ts lib/reports/report-edit-helpers.ts
git mv lib/report-edit-helpers.test.ts lib/reports/report-edit-helpers.test.ts
git mv lib/section-icons.ts lib/reports/section-icons.ts
git mv lib/surface-depth.ts lib/reports/surface-depth.ts
git mv lib/use-report-body-autosave.ts lib/reports/use-report-body-autosave.ts
git mv lib/use-report-body-autosave.test.tsx lib/reports/use-report-body-autosave.test.tsx
git mv lib/use-report-pdf-actions.ts lib/reports/use-report-pdf-actions.ts
```

- [ ] **Step 2: Rewrite imports (note the `mobile-ui` → `report-ui` rename)**

```bash
# Same-name moves
for name in export-report-pdf generate-report-ui report-body-adapter \
            report-edit-helpers section-icons surface-depth \
            use-report-body-autosave use-report-pdf-actions; do
  grep -rl --include='*.ts' --include='*.tsx' "from '@/lib/${name}'" apps/mobile \
    | xargs sed -i '' "s|from '@/lib/${name}'|from '@/lib/reports/${name}'|g" || true
done

# Rename
grep -rl --include='*.ts' --include='*.tsx' "from '@/lib/mobile-ui'" apps/mobile \
  | xargs sed -i '' "s|from '@/lib/mobile-ui'|from '@/lib/reports/report-ui'|g" || true
```

- [ ] **Step 3: Verify no stale imports**

```bash
for name in export-report-pdf generate-report-ui mobile-ui report-body-adapter \
            report-edit-helpers section-icons surface-depth \
            use-report-body-autosave use-report-pdf-actions; do
  grep -rn "from '@/lib/${name}'" apps/mobile --include='*.ts' --include='*.tsx' \
    && echo "STALE: ${name}" || true
done
```
Expected: no real matches.

- [ ] **Step 4: Typecheck + test**

```bash
pnpm --filter @harpa/mobile typecheck
pnpm --filter @harpa/mobile test
```
Expected: both pass.

- [ ] **Step 5: Commit**

```bash
git add -A apps/mobile
git commit -m "refactor(mobile): group report helpers under lib/reports/ (rename mobile-ui)

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 6: Create `lib/projects/` and move project helpers

**Files:**
- Move: `apps/mobile/lib/project-members-layout.ts` → `apps/mobile/lib/projects/project-members-layout.ts`
- Move: `apps/mobile/lib/project-overview.ts` → `apps/mobile/lib/projects/project-overview.ts`
- Move: `apps/mobile/lib/project-reports-list.ts` → `apps/mobile/lib/projects/project-reports-list.ts`

- [ ] **Step 1: Move files**

```bash
cd apps/mobile
mkdir -p lib/projects
git mv lib/project-members-layout.ts lib/projects/project-members-layout.ts
git mv lib/project-overview.ts lib/projects/project-overview.ts
git mv lib/project-reports-list.ts lib/projects/project-reports-list.ts
```

- [ ] **Step 2: Rewrite imports**

```bash
for name in project-members-layout project-overview project-reports-list; do
  grep -rl --include='*.ts' --include='*.tsx' "from '@/lib/${name}'" apps/mobile \
    | xargs sed -i '' "s|from '@/lib/${name}'|from '@/lib/projects/${name}'|g"
done
```

- [ ] **Step 3: Typecheck + test**

```bash
pnpm --filter @harpa/mobile typecheck
pnpm --filter @harpa/mobile test
```
Expected: both pass.

- [ ] **Step 4: Commit**

```bash
git add -A apps/mobile
git commit -m "refactor(mobile): group project helpers under lib/projects/

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 7: Move remaining flat files (`note-entry`, `image-cache`, `camera-session-registry`)

**Files:**
- Move: `apps/mobile/lib/note-entry.ts` → `apps/mobile/lib/notes/note-entry.ts`
- Move: `apps/mobile/lib/image-cache.ts` → `apps/mobile/lib/files/image-cache.ts`
- Move: `apps/mobile/lib/camera-session-registry.ts` → `apps/mobile/lib/camera/camera-session-registry.ts`
- Move: `apps/mobile/lib/camera-session-registry.test.ts` → `apps/mobile/lib/camera/camera-session-registry.test.ts`

- [ ] **Step 1: Move files**

```bash
cd apps/mobile
mkdir -p lib/notes lib/files
git mv lib/note-entry.ts lib/notes/note-entry.ts
git mv lib/image-cache.ts lib/files/image-cache.ts
git mv lib/camera-session-registry.ts lib/camera/camera-session-registry.ts
git mv lib/camera-session-registry.test.ts lib/camera/camera-session-registry.test.ts
```

- [ ] **Step 2: Rewrite imports**

```bash
grep -rl --include='*.ts' --include='*.tsx' "from '@/lib/note-entry'" apps/mobile \
  | xargs sed -i '' "s|from '@/lib/note-entry'|from '@/lib/notes/note-entry'|g"

grep -rl --include='*.ts' --include='*.tsx' "from '@/lib/image-cache'" apps/mobile \
  | xargs sed -i '' "s|from '@/lib/image-cache'|from '@/lib/files/image-cache'|g" || true

grep -rl --include='*.ts' --include='*.tsx' "from '@/lib/camera-session-registry'" apps/mobile \
  | xargs sed -i '' "s|from '@/lib/camera-session-registry'|from '@/lib/camera/camera-session-registry'|g"
```

- [ ] **Step 3: Verify `lib/` root is flat-file-free**

```bash
ls apps/mobile/lib/*.ts apps/mobile/lib/*.tsx 2>/dev/null
```
Expected: no output (the glob matches nothing).

- [ ] **Step 4: Typecheck + test**

```bash
pnpm --filter @harpa/mobile typecheck
pnpm --filter @harpa/mobile test
```
Expected: both pass.

- [ ] **Step 5: Commit**

```bash
git add -A apps/mobile
git commit -m "refactor(mobile): move remaining flat lib files into subfolders

apps/mobile/lib/ root now contains only subfolders.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 8: Move `GenerateReportProvider` → `features/generate/`

**Files:**
- Move: `apps/mobile/components/reports/generate/GenerateReportProvider.tsx` → `apps/mobile/features/generate/GenerateReportProvider.tsx`
- Update imports in (4 files):
  - `apps/mobile/screens/generate-notes.tsx`
  - `apps/mobile/components/reports/generate/ReportTabPane.tsx`
  - `apps/mobile/components/reports/generate/EditTabPane.tsx`
  - `apps/mobile/components/reports/generate/DebugTabPane.tsx`

- [ ] **Step 1: Move file**

```bash
cd apps/mobile
mkdir -p features/generate
git mv components/reports/generate/GenerateReportProvider.tsx \
       features/generate/GenerateReportProvider.tsx
```

- [ ] **Step 2: Rewrite imports**

```bash
grep -rl --include='*.ts' --include='*.tsx' \
  "from '@/components/reports/generate/GenerateReportProvider'" apps/mobile \
  | xargs sed -i '' \
    "s|from '@/components/reports/generate/GenerateReportProvider'|from '@/features/generate/GenerateReportProvider'|g"
```

- [ ] **Step 3: Verify no stale imports**

```bash
grep -rn "from '@/components/reports/generate/GenerateReportProvider'" \
  apps/mobile --include='*.ts' --include='*.tsx' \
  && echo "STALE" || true
```
Expected: no real matches.

- [ ] **Step 4: Typecheck + test (run the generate tests explicitly too)**

```bash
pnpm --filter @harpa/mobile typecheck
pnpm --filter @harpa/mobile test -- generate
```
Expected: both pass.

- [ ] **Step 5: Commit**

```bash
git add -A apps/mobile
git commit -m "refactor(mobile): move GenerateReportProvider to features/generate/

Provider + reducer are state-machine-like; per the folder rule this
belongs in features/ alongside features/voice/. UI siblings stay in
components/reports/generate/.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 9: Move voice card pieces → `components/notes/`

**Files moved:**
- `apps/mobile/features/voice/VoiceNoteCard.tsx` → `apps/mobile/components/notes/VoiceNoteCard.tsx`
- `apps/mobile/features/voice/VoiceCardShell.tsx` → `apps/mobile/components/notes/VoiceCardShell.tsx`
- `apps/mobile/features/voice/voiceNoteCardHeader.ts` → `apps/mobile/components/notes/voiceNoteCardHeader.ts`
- `apps/mobile/features/voice/voiceNoteCardHeader.test.ts` → `apps/mobile/components/notes/voiceNoteCardHeader.test.ts`

**Files updated (importers):**
- `apps/mobile/components/notes/NoteTimeline.tsx`
- `apps/mobile/components/notes/NoteOptionsSheet.tsx`
- `apps/mobile/components/reports/detail/VoiceNoteRow.tsx`
- Any internal imports inside the moved files (e.g. `VoiceNoteCard` importing `VoiceCardShell` / `voiceNoteCardHeader` via `@/features/voice/...`).

- [ ] **Step 1: Move files**

```bash
cd apps/mobile
git mv features/voice/VoiceNoteCard.tsx components/notes/VoiceNoteCard.tsx
git mv features/voice/VoiceCardShell.tsx components/notes/VoiceCardShell.tsx
git mv features/voice/voiceNoteCardHeader.ts components/notes/voiceNoteCardHeader.ts
git mv features/voice/voiceNoteCardHeader.test.ts components/notes/voiceNoteCardHeader.test.ts
```

- [ ] **Step 2: Rewrite imports (external importers + intra-file references)**

```bash
for name in VoiceNoteCard VoiceCardShell voiceNoteCardHeader; do
  grep -rl --include='*.ts' --include='*.tsx' "from '@/features/voice/${name}'" apps/mobile \
    | xargs sed -i '' "s|from '@/features/voice/${name}'|from '@/components/notes/${name}'|g"
done
```

- [ ] **Step 3: Verify no stale imports and `features/voice/` is recorder-only**

```bash
grep -rn "from '@/features/voice/\(VoiceNoteCard\|VoiceCardShell\|voiceNoteCardHeader\)'" \
  apps/mobile --include='*.ts' --include='*.tsx' && echo "STALE" || true
ls apps/mobile/features/voice/
```
Expected: no stale matches. `ls` output: `InlineVoiceRecorder.tsx`, `expoAudioRecorder.ts`, `fixtureRecorder.ts`, `fixtureRecorder.test.ts`, `pickRecorder.ts`, `recorder-types.ts`, `useInlineRecorder.ts`, `useInlineRecorder.test.ts`, `useVoiceNotePipeline.ts`, `useVoiceNotePipeline.test.ts` (no `Voice*Card*` / `voiceNoteCardHeader*`).

- [ ] **Step 4: Typecheck + test (run note + voice suites explicitly)**

```bash
pnpm --filter @harpa/mobile typecheck
pnpm --filter @harpa/mobile test -- notes
pnpm --filter @harpa/mobile test -- voice
pnpm --filter @harpa/mobile test
```
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add -A apps/mobile
git commit -m "refactor(mobile): move VoiceNoteCard to components/notes/

Voice cards are presentational, so per the folder rule they sit
next to PhotoNoteCard, TextNoteCard, ImageNoteCard. features/voice/
now holds only the recorder state machine + native/fixture adapters.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 10: Add folder READMEs

**Files created:**
- `apps/mobile/components/README.md`
- `apps/mobile/features/README.md`
- `apps/mobile/lib/README.md`
- `apps/mobile/screens/README.md`

- [ ] **Step 1: Create `apps/mobile/components/README.md`**

```markdown
# components/

**Presentational UI only**, grouped by domain.

Goes here:
- React components that render UI.
- Domain-named widgets (note cards, report cards, file previews).
- Components owned by primitives/ (Card, Button, Input, …).

Does NOT go here:
- State machines, reducers, or Context providers with non-trivial
  logic → `features/<domain>/`.
- Cross-cutting utilities (date, env, api client) → `lib/<group>/`.

See `docs/v4/arch-mobile.md` for the full folder rule.
```

- [ ] **Step 2: Create `apps/mobile/features/README.md`**

```markdown
# features/

**Vertical slices** for domains that own a state machine, a
non-trivial Context+reducer provider, or a native/external adapter.

Goes here:
- Recorder / pipeline / adapter bundles (e.g. `voice/`).
- Providers + reducers (e.g. `generate/GenerateReportProvider`).

Does NOT go here:
- Plain presentational UI — even domain-named like `VoiceNoteCard`
  → those belong in `components/<domain>/`.
- Generic utilities → `lib/<group>/`.

See `docs/v4/arch-mobile.md` for the full folder rule.
```

- [ ] **Step 3: Create `apps/mobile/lib/README.md`**

```markdown
# lib/

**Cross-cutting utilities**, grouped into subfolders by concern.
Nothing flat at the `lib/` root — a CI guard enforces this.

Subfolders:
- `api/`, `auth/`, `audio/`, `camera/`, `config/`, `dialogs/`,
  `files/`, `nav/`, `native/`, `notes/`, `phone/`, `projects/`,
  `reports/`, `telemetry/`, `uploads/`, `util/`, plus
  `ai/`, `design-tokens/`, `dev-fixtures/`.

Goes here:
- Pure helpers, hooks without their own UI, type definitions,
  client wrappers (api, dialogs).

Does NOT go here:
- Presentational UI → `components/<domain>/`.
- Anything with significant stateful coordination → `features/<domain>/`.

See `docs/v4/arch-mobile.md` for the full folder rule.
```

- [ ] **Step 4: Create `apps/mobile/screens/README.md`**

```markdown
# screens/

**Props-driven screen bodies.** No API calls, no auth lookups, no
network. Data fetching lives in the expo-router route files under
`app/` that wire data into these components.

See `docs/v4/arch-mobile.md` § "Screens as props-driven bodies".
```

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/components/README.md apps/mobile/features/README.md \
        apps/mobile/lib/README.md apps/mobile/screens/README.md
git commit -m "docs(mobile): add README to each top-level folder

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 11: Update `docs/v4/arch-mobile.md`

**File modified:** `docs/v4/arch-mobile.md` — the "Directory structure" section (lines ~30–172 in the current file) and a new paragraph near the top.

- [ ] **Step 1: Add the folder-rule paragraph**

In `docs/v4/arch-mobile.md`, immediately after the `## Stack` section and before `## Directory structure`, insert:

```markdown
## Folder rule

A file goes in `features/<domain>/` if and only if the domain owns a
**state machine, a React Context provider with non-trivial reducer
logic, or a native/external adapter** (recorder, camera session,
OTP). Pure presentational UI — even when domain-named
(`VoiceNoteCard`, `PhotoNoteCard`, `ReportView`) — goes in
`components/<domain>/`. `lib/` holds cross-cutting utilities only
(api client, env, date, dialogs, telemetry), grouped into subfolders
by concern; no flat files at the `lib/` root (enforced in CI).
`screens/` holds props-driven screen bodies; `app/` holds expo-router
route files that wire data into screens.

```

- [ ] **Step 2: Replace the "Directory structure" code block body**

Replace the contents of the `## Directory structure` code block (the entire fenced block under that heading) with:

````markdown
```
apps/mobile/
  app/                                 # expo-router
    (auth)/  (app)/  (camera)/  ...    # routes do data fetching
    _layout.tsx                        # providers (env, query, queue, dialogs, sentry)

  screens/                             # props-driven screen bodies
                                       # (no API/auth inside; consumed
                                       # by the routes in app/)

  components/                          # PRESENTATIONAL ONLY
    primitives/                        # Card, Button, Input, …
    notes/
      NoteTimeline.tsx
      TextNoteCard.tsx
      PhotoNoteCard.tsx
      ImageNoteCard.tsx
      PendingPhotoCard.tsx
      PhotoBatchGrid.tsx
      PhotoGridTile.tsx
      VoiceNoteCard.tsx                # ← lives here, not in features/
      VoiceCardShell.tsx
      voiceNoteCardHeader.ts
      NoteCardHeader.tsx
      NoteOptionsSheet.tsx
      NoteOptionsKebab.tsx
    reports/
      ReportView.tsx
      ReportEditForm.tsx
      StatBar.tsx WeatherStrip.tsx SummarySectionCard.tsx
      IssuesCard.tsx WorkersCard.tsx MaterialsCard.tsx
      NextStepsCard.tsx CompletenessCard.tsx PdfPreviewModal.tsx
      detail/                          # saved-report UI pieces
      generate/                        # generate-report UI pieces
                                       #   (provider lives in features/generate/)
    files/  uploads/  account/  skeletons/  ui/

  features/                            # STATE MACHINES + ADAPTERS
    voice/
      InlineVoiceRecorder.tsx
      useInlineRecorder.ts
      useVoiceNotePipeline.ts
      expoAudioRecorder.ts
      fixtureRecorder.ts
      pickRecorder.ts
      recorder-types.ts
    generate/
      GenerateReportProvider.tsx       # provider + reducer

  lib/                                 # CROSS-CUTTING (subfolders only)
    api/  auth/  audio/  camera/  config/  dialogs/  files/  nav/
    native/  notes/  phone/  projects/  reports/  telemetry/  util/
    ai/  design-tokens/  dev-fixtures/  uploads/

  tailwind.config.js  global.css  app.config.ts  babel.config.js  metro.config.js
  .maestro/  __tests__/
```
````

- [ ] **Step 3: Sanity-check the rendered doc**

```bash
grep -n "VoiceNoteCard" docs/v4/arch-mobile.md
grep -n "GenerateReportProvider" docs/v4/arch-mobile.md
grep -n "^## Folder rule" docs/v4/arch-mobile.md
```
Expected: `VoiceNoteCard` appears under `components/notes/`, `GenerateReportProvider` appears under `features/generate/`, the "Folder rule" heading exists.

- [ ] **Step 4: Commit**

```bash
git add docs/v4/arch-mobile.md
git commit -m "docs(mobile): document folder rule and updated directory tree

Adds the features/ vs components/ vs lib/ rule and reflects the
post-refactor directory layout.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 12: Add CI guard for flat `lib/` files

**Files:**
- Create: `scripts/check-mobile-lib-flat.sh`
- Modify: `.github/workflows/lint-typecheck.yml` (add one line to the "Removal verification gates" step)

- [ ] **Step 1: Create the guard script**

Create `scripts/check-mobile-lib-flat.sh` with:

```bash
#!/usr/bin/env bash
# Fail if any .ts or .tsx file lives directly in apps/mobile/lib/
# (root level only). Subfolders are required — see
# docs/v4/arch-mobile.md "Folder rule".

set -euo pipefail

shopt -s nullglob
flat=(apps/mobile/lib/*.ts apps/mobile/lib/*.tsx)

if [ ${#flat[@]} -gt 0 ]; then
  echo "ERROR: flat files found in apps/mobile/lib/ (must live in a subfolder):"
  printf '  %s\n' "${flat[@]}"
  echo
  echo "Move them into an appropriate subfolder (config/, util/, reports/, …)."
  echo "See docs/v4/arch-mobile.md § 'Folder rule'."
  exit 1
fi

echo "apps/mobile/lib/ is subfolder-only ✓"
```

Then:

```bash
chmod +x scripts/check-mobile-lib-flat.sh
```

- [ ] **Step 2: Run the guard locally to confirm it passes now**

```bash
bash scripts/check-mobile-lib-flat.sh
```
Expected output: `apps/mobile/lib/ is subfolder-only ✓`

- [ ] **Step 3: Wire it into `.github/workflows/lint-typecheck.yml`**

In `.github/workflows/lint-typecheck.yml`, locate the existing block:

```yaml
      - name: Removal verification gates
        run: |
          bash scripts/check-no-supabase.sh
          bash scripts/check-no-unistyles.sh
          bash scripts/check-scope-tests.sh
```

and append one line so it becomes:

```yaml
      - name: Removal verification gates
        run: |
          bash scripts/check-no-supabase.sh
          bash scripts/check-no-unistyles.sh
          bash scripts/check-scope-tests.sh
          bash scripts/check-mobile-lib-flat.sh
```

- [ ] **Step 4: Sanity-check the guard fails when it should**

```bash
touch apps/mobile/lib/should-fail.ts
bash scripts/check-mobile-lib-flat.sh && echo "BAD: guard did not fail" || echo "OK: guard correctly failed"
rm apps/mobile/lib/should-fail.ts
bash scripts/check-mobile-lib-flat.sh
```
Expected: first run prints `OK: guard correctly failed`; second run prints the success line.

- [ ] **Step 5: Commit**

```bash
git add scripts/check-mobile-lib-flat.sh .github/workflows/lint-typecheck.yml
git commit -m "ci(mobile): guard against flat files in apps/mobile/lib/

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Final verification (one-shot, after all tasks)

- [ ] **Step 1: Confirm acceptance criteria from the spec**

```bash
# lib/ root is flat-file-free
ls apps/mobile/lib/*.ts apps/mobile/lib/*.tsx 2>/dev/null && echo FAIL || echo OK

# features/voice/ has no presentational pieces
ls apps/mobile/features/voice/VoiceNoteCard.tsx \
   apps/mobile/features/voice/VoiceCardShell.tsx \
   apps/mobile/features/voice/voiceNoteCardHeader.ts 2>/dev/null \
   && echo FAIL || echo OK

# features/generate/ exists with the provider
test -f apps/mobile/features/generate/GenerateReportProvider.tsx && echo OK || echo FAIL

# arch-mobile.md has the rule + correct locations
grep -q "^## Folder rule" docs/v4/arch-mobile.md && echo OK || echo FAIL
grep -q "VoiceNoteCard.tsx                # ← lives here" docs/v4/arch-mobile.md && echo OK || echo FAIL

# CI guard exists and passes
bash scripts/check-mobile-lib-flat.sh
```
Expected: every echo is `OK`, guard prints its success line.

- [ ] **Step 2: Full mobile gate**

```bash
pnpm --filter @harpa/mobile typecheck
pnpm --filter @harpa/mobile lint
pnpm --filter @harpa/mobile test
```
Expected: all green.
