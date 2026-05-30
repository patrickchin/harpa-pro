# Mobile app structure simplification — design

**Status:** Draft (awaiting user review)
**Scope:** `apps/mobile/` directory layout only. No behaviour changes,
no API changes, no component renames besides one (`mobile-ui.ts` →
`report-ui.ts`).

## Problem

`apps/mobile/` runs two competing organizing principles side by
side, and the seams are visible. The clearest symptom:
`NoteTimeline.tsx` (in `components/notes/`) dispatches to
`PhotoNoteCard` (in `components/notes/`) **and** `VoiceNoteCard` (in
`features/voice/`). The cards are siblings semantically, but they
live in different trees.

Audit of the drift:

- **`features/` exists for one domain only** — `features/voice/`.
  The arch doc (`docs/v4/arch-mobile.md`) lists `features/auth/`,
  `features/voice/`, `features/reports/`, but only voice was ever
  created.
- **`features/voice/` overreaches** — it holds the recorder state
  machine, the native and fixture adapters, the pipeline hook
  (correct), *and* `VoiceNoteCard.tsx`, `VoiceCardShell.tsx`,
  `voiceNoteCardHeader.ts` (presentational — should be next to the
  other note cards).
- **`lib/` has 39 flat `.ts` files at root** — `date.ts`,
  `phone.ts`, `mobile-ui.ts`, `report-edit-helpers.ts`, etc. The
  spec showed a slim grouped `lib/`, reality grew flat.
- **`GenerateReportProvider`** — a context + reducer for the
  generate-report flow — lives in `components/reports/generate/`
  next to its UI. Under the proposed rule it belongs in `features/`.

## The folder rule

A file goes in **`features/<domain>/`** if and only if the domain
owns a **state machine, a React Context provider with non-trivial
reducer logic, or a native/external adapter** (recorder, camera
session, OTP). Pure presentational UI — even when domain-named
(`VoiceNoteCard`, `PhotoNoteCard`, `ReportView`) — goes in
**`components/<domain>/`**. **`lib/`** holds cross-cutting utilities
only (api client, env, date, dialogs, telemetry), grouped into
subfolders by concern; nothing flat at the `lib/` root.
**`screens/`** holds props-driven screen bodies; **`app/`** holds
expo-router route files that wire data into screens.

This rule will be added to `docs/v4/arch-mobile.md` as the
authoritative source.

## Target directory shape

```
apps/mobile/
  app/                    # expo-router routes (data fetching lives here)
  screens/                # props-driven screen bodies (no API/auth)
  components/             # PRESENTATIONAL only — grouped by domain
    primitives/
    notes/                # all note cards (incl. VoiceNoteCard)
    reports/              # section cards, detail/, generate/ UI pieces
    files/, uploads/, account/, skeletons/, ui/
  features/               # VERTICAL SLICES with state machines / adapters
    voice/                # recorder + pipeline (no card here)
    generate/             # GenerateReportProvider + reducer
  lib/                    # CROSS-CUTTING utilities (subfolders only)
    api/  audio/  auth/  camera/  config/  dialogs/  files/  nav/
    native/  notes/  phone/  projects/  reports/  telemetry/  util/
    ai/  uploads/  design-tokens/  dev-fixtures/
```

`features/camera/` and `features/auth/` are **not** created. The
camera and auth modules in `lib/` are coordinators, not full state
machines — leave them in `lib/` until a real state machine appears.

## Concrete moves

### A. Voice card moves to `components/notes/`

| File | From | To |
|---|---|---|
| `VoiceNoteCard.tsx` | `features/voice/` | `components/notes/` |
| `VoiceCardShell.tsx` | `features/voice/` | `components/notes/` |
| `voiceNoteCardHeader.ts` | `features/voice/` | `components/notes/` |
| `voiceNoteCardHeader.test.ts` | `features/voice/` | `components/notes/` |

Stays in `features/voice/`: `InlineVoiceRecorder.tsx`,
`useInlineRecorder.ts(+test)`, `useVoiceNotePipeline.ts(+test)`,
`expoAudioRecorder.ts`, `fixtureRecorder.ts(+test)`,
`pickRecorder.ts`, `recorder-types.ts`.

### B. `GenerateReportProvider` moves to `features/generate/`

| File | From | To |
|---|---|---|
| `GenerateReportProvider.tsx` | `components/reports/generate/` | `features/generate/` |

The sibling UI pieces (`GenerateReportInputBar`,
`GenerateReportTabBar`, `GenerateReportActionRow`) stay in
`components/reports/generate/`.

### C. `lib/` regrouping (39 flat files → subfolders)

| Subfolder | Files moved in |
|---|---|
| `lib/config/` (new) | `env.{ts,test.ts}`, `build-info.ts`, `dev-flags.ts` |
| `lib/util/` (new) | `date.{ts,test.ts}`, `utils.ts`, `uuid.ts`, `use-clipboard.ts`, `use-refresh.ts`, `layout-shift-probe.{ts,test.ts}` |
| `lib/phone/` (new) | `phone.{ts,test.ts}`, `countries.{ts,test.ts}` |
| `lib/auth/` (exists) | `login-phone-hint.{ts,test.ts}`, `remembered-login.{ts,test.ts}`, `use-otp-resend.ts` |
| `lib/reports/` (new) | `export-report-pdf.ts`, `generate-report-ui.ts`, `mobile-ui.ts` → renamed `report-ui.ts`, `report-body-adapter.ts`, `report-edit-helpers.{ts,test.ts}`, `section-icons.ts`, `surface-depth.ts`, `use-report-body-autosave.{ts,test.tsx}`, `use-report-pdf-actions.ts` |
| `lib/projects/` (new) | `project-members-layout.ts`, `project-overview.ts`, `project-reports-list.ts` |
| `lib/notes/` (new) | `note-entry.ts` |
| `lib/files/` (new) | `image-cache.ts` |
| `lib/camera/` (exists) | `camera-session-registry.{ts,test.ts}` |

After this, `apps/mobile/lib/*.{ts,tsx}` at the root returns nothing.

The single rename (`mobile-ui.ts` → `report-ui.ts`) reflects that
the file's exports (`getReportStats`, `getIssueSeverityTone`) are
report-specific, not generic UI.

## Enforcement

1. **`docs/v4/arch-mobile.md` rewrite.** The "Directory structure"
   section is updated to the target tree above, and the new
   "Folder rule" paragraph is added near the top.
2. **One-line `README.md` in each top-level folder** —
   `components/`, `features/`, `lib/`, `screens/` — stating what
   goes there. People read folder READMEs when adding files.
3. **CI guard.** A grep step in the mobile workflow that fails if
   `apps/mobile/lib/*.{ts,tsx}` (root level only) matches anything.
   Stops flat-file regrowth.

No new ESLint rules. Existing `no-restricted-imports`
(Alert, env access) is left untouched.

## Execution order

Risk-sorted; each step is its own commit and must pass
`pnpm --filter @harpa/mobile typecheck && pnpm --filter @harpa/mobile test`
before moving on.

1. **`lib/` regrouping.** Mechanical, no behaviour change, biggest
   import churn but lowest risk. Use `git mv` to preserve history.
   Commit per subfolder batch so reviewer can scan one concern at a
   time.
2. **`GenerateReportProvider` → `features/generate/`.** Smaller
   blast radius (generate-report screen + its test).
3. **Voice card pieces → `components/notes/`.** Touches
   `NoteTimeline`, `NoteOptionsSheet`, `ReportNotesPane`,
   `VoiceNoteRow`. Run voice pipeline tests +
   `screens/generate-notes.test.tsx`.
4. **READMEs, `arch-mobile.md` update, CI guard.** Doc + tooling.

## Out of scope (non-goals)

- No behaviour changes.
- No API or schema changes.
- No new ESLint rules.
- No test coverage changes.
- No component renames except `mobile-ui.ts` → `report-ui.ts`.
- `features/camera/` and `features/auth/` are NOT created.
- `screens/` and `app/` shape is unchanged.

## Verification

After every step:

```sh
pnpm --filter @harpa/mobile typecheck
pnpm --filter @harpa/mobile test
```

Final acceptance:

- `ls apps/mobile/lib/*.ts apps/mobile/lib/*.tsx 2>/dev/null` is
  empty.
- `apps/mobile/features/voice/` no longer contains
  `VoiceNoteCard.tsx`, `VoiceCardShell.tsx`, or
  `voiceNoteCardHeader.ts`.
- `apps/mobile/features/generate/GenerateReportProvider.tsx`
  exists.
- `docs/v4/arch-mobile.md` "Directory structure" matches reality.
- Mobile typecheck + test suite pass.
