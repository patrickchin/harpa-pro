# P3 — Feature Build

> **Historical delivery plan.** P3 features shipped and continued to
> change during hardening and store release. The unchecked phase gates
> below record work that was not closed under the original P3 tag.
> They are not the current backlog. Use the linked architecture docs,
> current implementation, and tests for present behavior.
> The Generate Edit tab described in the historical P3.8 delivery record was
> removed later. Current draft editing uses per-card controls on the Report
> pane; Debug remains developer-gated.

> Goal: full feature build across mobile + API — generate, list,
> view, edit, share reports with voice + photo capture, account /
> usage / limits, LLM token accounting.
>
> Resolves [Pitfall 4](pitfalls.md#pitfall-4--big-features-stubbed-then-forgotten):
> features are either in scope or feature-flagged behind a fully
> exercised code path. UI parity against the v3 source is no longer
> a goal — the visual design has reached its v4 shape and further
> drift is expected and welcome.

## Exit gate (`p3-exit-gate.yml`)

- [ ] Maestro P3 journey coverage green on iOS + Android.
- [x] Mobile coverage ≥ 80% lines. (Gate wired via `vitest run
--coverage` in `apps/mobile/vitest.config.ts`. Baseline:
      lines 81.84%, statements 81.84%, branches 79.41%, functions 73%.
      Auto-generated `lib/api/hooks.ts` and native shims excluded —
      they're verified by the spec-drift gate and Maestro respectively.)
- [x] Upload pipeline integration test green for `image`, `voice`, `document` (Pitfall 8).
- [x] No `// TODO` / "Coming soon" / `Alert.alert` outside dialogs.

## Scope

This plan and its linked `design-*.md` files are the specification
sources for the P3 screen set. If no task-specific spec applies to an
existing screen, its current implementation and tests are the
baseline. A design change needs a task-specific design doc. Each row
maps a screen specification to its v4 destination
(`screens/<name>.tsx` body plus an
`app/(app|auth)/<route>.tsx` real route).

- new project / edit project
- project home
- members
- reports list
- generate — notes / report tabs, plus developer-gated Debug (the big one)
- saved report + actions menu + PDF preview
- files — no standalone screen in the v4 spec (see P3.11), marked N/A
- camera ✅ shipped (P3.12)
- profile / account / usage ✅ shipped (P3.13)
- feature completion + upload wiring (P3.15)

## Shared report components

All shared report components live under `apps/mobile/components/`.
NativeWind classes and shared primitives remain consistent across
screens. Do not introduce Unistyles (Pitfall 3). Component locations:

| Component             | Current location                                               |
| --------------------- | -------------------------------------------------------------- |
| `StatBar`             | `apps/mobile/components/reports/StatBar.tsx`                   |
| `WeatherStrip`        | `apps/mobile/components/reports/WeatherStrip.tsx`              |
| `SummarySectionCard`  | `apps/mobile/components/reports/SummarySectionCard.tsx`        |
| `IssuesCard`          | `apps/mobile/components/reports/IssuesCard.tsx`                |
| `WorkersCard`         | `apps/mobile/components/reports/WorkersCard.tsx`               |
| `MaterialsCard`       | `apps/mobile/components/reports/MaterialsCard.tsx`             |
| `NextStepsCard`       | `apps/mobile/components/reports/NextStepsCard.tsx`             |
| `CompletenessCard`    | `apps/mobile/components/reports/CompletenessCard.tsx`          |
| `ReportView`          | `apps/mobile/components/reports/ReportView.tsx`                |
| `PdfPreviewModal`     | `apps/mobile/components/reports/PdfPreviewModal.tsx`           |
| `ReportActionsMenu`   | `apps/mobile/components/reports/detail/ReportActionsMenu.tsx`  |
| `SavedReportSheet`    | `apps/mobile/components/reports/detail/SavedReportSheet.tsx`   |
| `ReportDetailTabBar`  | `apps/mobile/components/reports/detail/ReportDetailTabBar.tsx` |
| `useReportPdfActions` | `apps/mobile/lib/reports/use-report-pdf-actions.ts`            |

## Maestro gate (all sections and subsections)

> **Every section and subsection ships its own dedicated Maestro flow.**
> Write a new `.maestro/p3-<section>.yaml` (e.g. `p3-7-generate-report.yaml`)
> scoped to just that section's behaviour, and run it green on the iOS
> simulator before committing:
>
> ```
> maestro test .maestro/p3-<section>.yaml
> ```
>
> These per-section flows are deliberately narrow — they are the
> building blocks that were later collated into the retired P3
> `core-end-to-end` journey and then into broader regression suites.
> Do not reuse an existing flow; do not run the whole suite as the
> gate. One section → one flow → green before commit.

## Tasks (one screen per commit)

For each screen in the scope list:

1. Read this plan, any linked task-specific design doc, and the
   matching current files under `apps/mobile/`.
2. Build the screen body in `apps/mobile/screens/<name>.tsx`,
   plus the components it needs. Preserve established classes unless
   the specification changes them.
3. Wire the real route under `(auth)/` or `(app)/` with hooks +
   navigation params.
4. Add behaviour tests for every interaction in the specification.
   If no task-specific spec exists, preserve the current tests.
5. Write a new `.maestro/p3-<section>.yaml` flow scoped to this
   section only (see [Maestro gate](#maestro-gate-all-sections-and-subsections)
   above). It will be collated later into the full E2E journey.
6. **Run `maestro test .maestro/p3-<section>.yaml` — must be green.**
7. Manually review against the specification on the iOS simulator.
   If no task-specific spec exists, compare the current implementation
   and tests.
8. Commit: `feat(mobile): implement <screen> with tests and flow`.

Suggested order (parallelisable across agents once primitives lock):

```
P3.0  IDs/slugs migration  ── superseded by P3.1
P3.1  Slug-native IDs (DOMAIN PKs, no parallel UUID)  ✅ shipped
P3.2  Project list (visual confirm)
P3.3  New / Edit project           ┐ Agent A
P3.4  Project home                 ┘
P3.5  Members
P3.6  Reports list
P3.7  Generate – Notes tab          ┐ Agent B (the big one)
P3.8  Generate – Report tab         │
P3.9  Generate – Edit tab           ┘
P3.10 Saved report + actions + PDF   ✅ shipped
P3.11 Files screen                   ⊘ no standalone v4 screen (N/A)
P3.12 Camera                        ✅ shipped
P3.13 Profile / Account / Usage      ✅ shipped
P3.14 Maestro full-journey           ✅ shipped, later retired in favor of regression-journey.yaml
```

### P3.1 — Slug-native IDs (✅ shipped)

Full design: [design-p31-slug-only-ids.md](design-p31-slug-only-ids.md);
companion: [arch-ids-and-urls.md](arch-ids-and-urls.md). Supersedes the
P3.0 dual-id plan ([design-p30-ids-slugs.md](design-p30-ids-slugs.md))
— prefixed slug is the PK, no parallel UUID column, enforced by 8
Postgres DOMAINs in `20261101000001_init_slug_native.sql`.

Shipped: `packages/api/src/lib/ids.ts` (`newId` / `assertId` /
`insertWithGeneratedId`); `api-contract` `idSchema(prefix)` + branded
`Id<P>` + short route params (`:project`, `:report`, `:note`, `:user`);
resolver routes `GET /p/:project` + `GET /r/:report` (JSON, mobile
`router.replace`s to canonical); `assertId` at the trust boundary;
RLS coerces to `app.usr_id`; CLI openapi-fetch snapshots + mobile
expo-router segments (`[project]/`, `[report].tsx`) regenerated.
Commit train on `feat/v4`.

### P3.6 — Generate – Notes tab (✅ shipped)

First of three Generate-screen commits. Ships the Notes pane as a
visually complete surface (Report / Edit mount as empty placeholders).

Shipped: `GenerateReportProvider` scaffold (tab state, text-note input,
dialogs, attachment sheet, structurally-stable no-op defaults for
Report/Edit fields); `NoteTimeline` (text-only) + `EmptyState` in
`NotesTabPane`; shell components `GenerateReportTabBar` /
`GenerateReportActionRow` / `GenerateReportInputBar` /
`GenerateReportDialogs`; real route at
`app/(app)/projects/[projectSlug]/reports/[number]/generate.tsx` with
route-local notes state; dev mirror `(dev)/generate-notes.tsx` (empty
/ populated / loading); Vitest coverage per state + one snapshot.
Commit: `feat(mobile): P3.6 — Generate Notes tab + provider scaffold`.

### P3.7 — Generate – Report tab (✅ shipped)

Second Generate-screen commit. Report tab from `<View />` placeholder
to a visually complete read-only surface with empty / generating /
live / generation-error / finalize-error states; `useReportGeneration`
hook + `ReportPhotos` rendering remain deferred.

Shipped: new `packages/report-core` (Zod schemas +
`normalizeGeneratedReportPayload` + helpers — shared by mobile + api);
9 rendering primitives implemented under `components/reports/`
(`StatBar`, `WeatherStrip`, `SummarySectionCard`, `IssuesCard`,
`WorkersCard`, `MaterialsCard`, `NextStepsCard`, `CompletenessCard`,
`ReportView`) plus `SectionHeader` + `mobile-ui` / `section-icons`;
provider extended with real `generation` / `draft` / `tabs.editManually`
/ `preview.openFile` / `handleRegenerate` + `initialTab` prop;
`ReportTabPane` fully implemented (error banner + Retry, empty + Edit
manually CTA, shimmer, live ReportView, finalize-error banner;
ReportPhotos slot reserved); fixture mode seeds
`SAMPLE_GENERATED_REPORT`; dev mirror `(dev)/generate-report.tsx`;
Vitest coverage per state + smoke; Reanimated mock extended for
chainable entering presets. Commit:
`feat(mobile,report-core): P3.7 — Generate Report tab + read-only ReportView`.

### P3.8 — Generate – Edit tab (historically shipped; now removed)

Third Generate-screen commit. Fully-controlled inline editor that
mutates `GeneratedSiteReport` via immutable slice helpers; real
autosave hook deferred (provider forwards `isAutoSaving` /
`lastSavedAt` props only — autosave loop landed in P3.x).

Shipped: `lib/report-edit-helpers.ts` (slice patches + whole-array
setters + blank-row factories, all immutable, new wrapper + inner refs
per call) with 23 test cases. `ReportEditForm.tsx` implemented
(7 section cards + shared `Field` / `AddRowButton` / `RemoveRowButton`

- `AppDialogSheet` destructive confirm — Pitfall: no `Alert.alert`);
  `EditTabPane` (empty state + inline form + autosave status row);
  provider extended with `onSetReport` / `setReport` no-op fallback /
  lazy-seed via `createEmptyReport()` from both `tabs.openEdit()` and
  `tabs.editManually()`; dev mirror `(dev)/generate-edit.tsx`; Vitest
  coverage per state + onSetReport propagation + lazy-seed path. Commit:
  `feat(mobile): P3.8 — Generate Edit tab + inline ReportEditForm`.

This section records the original P3 delivery. The later ponytail
simplification removed this unreachable tab, form, flag, and test path. Draft
editing remains available through the Report pane's per-card edit modal.

### P3.x — Update / Finalize flow polish (✅ shipped)

Follow-up on P3.7+P3.8: adds an autosave loop, makes `/regenerate`
AI-aware of the existing body (so manual edits aren't clobbered), and
gates Finalize on autosave being clean. Design:
[design-p3x-generate-update-finalize.md](design-p3x-generate-update-finalize.md).

Shipped: `PATCH /reports/{n}` accepts optional `body`, 409 on
finalized, does NOT reset `notes_since_last_generation` (counter
belongs to the AI loop); AI service `REPORT_UPDATE_SYSTEM_PROMPT` +
fixture flavour `generate-report.update.*` (`generateReport()`
switches on `existingBody`; replay mode normalises the user prompt to
a canonical placeholder for stable hashes — live-vendor recording
deferred); `useReportBodyAutosave` (800ms debounce, baseline-ref
pattern, paused during generate/regenerate/finalize mutations);
`GenerateReportActionRow` gates Finalize + Regenerate on autosave
flight; inverse adapter `generatedReportToReportBody()` (lossy by
design; `issues.severity` collapses to API enum via
`normaliseSeverity()`).

### P3.10 — Saved report + actions + PDF (✅ shipped)

Implements the saved-report detail screen at
`app/(app)/projects/[project]/reports/[number]/index.tsx`. The body
is props-only. PDF export, `ReportPhotos`, and the rich note timeline
were deferred to P3.15 and P4 behind clearly marked stubs.

Shipped: `screens/saved-report.tsx` owns tab + menu + dialog state
(Report always / Notes drafts-only — finalised reports surface notes
via the Actions menu's "View Notes" entry which routes to a
dedicated `screens/report-notes.tsx` page / Edit drafts-only with
auto-bounce to Report on finalize) + canonical reconciliation
pattern preserving local edits across refetches; real route wires
`useProjectQuery` / `useReportQuery` / `useReportPdfActions` /
`useRefresh` with slug params + invalid-route fallback. Dev mirror
(loading / error / draft-populated / finalized). Components
implemented (`ReportActionsMenu`, `ReportDetailHeader`,
`ReportDetailTabBar`, text-only `ReportNotesPane`,
`SavedReportSheet`, `ReportDetailSkeleton`);
`ImagePreviewModal` simplified to RN `Image` (signed URLs deferred);
`PdfPreviewModal` chrome + stub `saveReportPdf` routing through the
action-error dialog; `lib/use-report-pdf-actions.ts` verbatim;
`lib/export-report-pdf.ts` stubbed; `lib/app-dialog-copy.ts` gains
`getUnfinalizeReportDialogCopy()`; 14 Vitest cases covering every
visible state + interaction. Commit:
`feat(mobile): P3.10 — Saved report screen + actions menu + PDF preview`.

**Follow-ups shipped in [P3.15.3](#p3153--saved-report-wiring-completion):**
`useReportUnfinalize`, rich `useNoteTimeline`, `ReportPhotos`,
`ImagePreviewModal` signed-URL + `CachedImage`. Mobile PDF export +
inline rendering → P4.3
([plan-p4-hardening.md](plan-p4-hardening.md)).

### P3.12 — Camera (✅ shipped)

Implements the full-screen burst camera at
`app/(camera)/capture.tsx`. The body is props-only with injection seams
(`renderPreview`, `takePicture`, `permissionOverride`, `onOpenSettings`,
`deleteFile`) so dev mirror + Vitest run without native modules.

Shipped: `screens/camera-capture.tsx` (permission gate, capture queue,
flash + facing toggles, `AppDialogSheet` discard-confirm —
Pitfall: no `Alert.alert`); real route + `_layout.tsx`
(`fullScreenModal`, portrait, black contentStyle) with
`sessionId` → `commitCameraSession(id, uris)` → `safeBack`;
`lib/camera-session-registry.ts` verbatim (`create` → `commit` →
`consume`) + unit tests (cancellation, unknown-id no-ops, unique IDs);
dev mirror with 5 modes (requesting / denied / blocked / granted /
populated) using a `<View />` preview stub + synthesised
`cam-dev://shot-N` URIs; native config (`expo-camera` as config
plugin in `app.config.ts`, NSCameraUsageDescription, Android audio
opt-out, `expo-camera@~16` + `expo-file-system@~18` installed);
11 Vitest cases + 1 snapshot, `expo-camera` / `expo-file-system`
mocked locally. Shipped in `bc20ac10`.

**Follow-ups → [P3.15](#p315--feature-completion--upload-wiring):**
upload-on-Done handoff, `expo-media-library` save-to-roll,
pinch-zoom + tap-focus. iOS prebuild already landed
(`apps/mobile/ios/`). Follow-ups shipped in
[P3.15.2](#p3152--camera-done-handoff).

### P3.13 — Profile / Account / Usage (✅ shipped)

Implements the three account-area screens (`profile`, `account`,
`usage`) as routes under `(app)/`. The bodies are props-only. v3
token-usage rollups, `AvatarUploader`, and AI provider availability
checks were deferred to P3.15 and P4 behind clearly marked stubs.

Shipped: `screens/profile.tsx` owns AI provider/model picker modal +
clear-cache confirm (`AppDialogSheet`) with `showDeveloperSection`
prop; `screens/account.tsx` read-only details form with optional
`avatarSlot` ReactNode injection point; `screens/usage.tsx` per-month
expand state + pricing-reference card + optional `chart` slot; real
routes wire `useAuthSession` / `useMeUsageQuery` / API
`signOut` / `queryClient.clear()` with `safeBack` fallbacks; dev
mirrors with hand-crafted mock states for every visible state (Profile
mirror passes the configured AI provider catalogue: Kimi, OpenAI).
`components/skeletons/AccountDetailsSkeleton.tsx`
verbatim; `lib/build-info.ts` adapted to read Fly API base URL from
`lib/env.ts` (preserves `displayVersion` / `serverLabel` shape);
32 Vitest cases across the three screens + 1 snapshot each. Commit:
`feat(mobile): P3.13 — Profile / Account / Usage screens ported`.

**Follow-ups → [P3.15](#p315--feature-completion--upload-wiring):**
`AvatarUploader`, inline name/company editing, AI provider
persistence + availability probe, Profile tab bar entry, and the
`UsageBarChart` + per-model breakdown all shipped in
[P3.15.4](#p3154--account--profile--usage-wiring) — token-level
`/me/usage` columns deferred to [P3.15.5](#p3155--llm-token-accounting).
Notifications row + language toggle stay out of scope.

### P3.11 — Files screen (⊘ N/A)

No standalone "files" screen exists in the current v4 route map
(verified at P3 close-out). File interactions live inside the
report-detail Notes pane (`ReportNotesPane` — landed in P3.10) and
the camera capture flow (P3.12). Both already have their intended v4
surfaces implemented.

This task is intentionally left out of scope for P3; if a dedicated
files browser ships later, it lands as a P4 add-on with
its own subsection here. The P3 scope list above is marked accordingly.

### P3.14 — Maestro full-journey (✅ shipped)

The retired P3 `core-end-to-end` flow shipped earlier in P3 (commit
`915ede4`). It walked every
currently-shipped user-visible feature on the real `(auth)` + `(app)`
routes — sign-up → onboarding → projects list / new / edit / delete →
members invite + filter → reports list + new → generate tabs
(Notes / Report / Edit / finalize confirm) → voice record → attachment
picker.

**Coverage gaps after the P3.10 / P3.12 / P3.13 ports** (tracked
in [P3.15](#p315--feature-completion--upload-wiring) alongside the
underlying wiring):

- Saved-report tab navigation + actions menu + PDF preview modal
  — covered by Vitest behaviour tests in `screens/saved-report.test.tsx`;
  Maestro coverage lands with the rich note timeline + `ReportPhotos`.
- Camera capture exit handoff — `screens/camera-capture.test.tsx` +
  `lib/camera-session-registry.test.ts` cover the session round-trip;
  Maestro coverage lands with the camera Done → upload handoff.
- Profile sign-out + account / usage surfaces — `screens/profile.test.tsx`,
  `screens/account.test.tsx`, `screens/usage.test.tsx` cover the body
  interactions; Maestro coverage lands once a nav entry point is added
  to the v4 tab bar (currently reached only via direct deep-link).

The flow is green on iOS locally (5/5 PASS); Android pre-flight + CI
integration remain open against the P3 exit gate (run + capture
artifacts before tagging `v0.3.0-features`).

## Pipelines exercised

- **Upload**: presign → R2 PUT → registerFile → createNote
  (always — Pitfall 8). Tested for image/voice/document via
  `upload-creates-timeline-note.test.ts`.
- **Voice note**: record → upload →
  transcribe (fixture) → summarise (fixture) → createNote.
  Tested via `voice-note-pipeline.test.ts`.
- **Camera**: capture → session → commit to report. Tested via
  `camera-session-roundtrip.test.ts`.
- **Report generation**: notes change counter → generate (fixture)
  → CompletenessCard → finalize → PDF (fixture). Current Maestro
  coverage lives in `regression-journey.yaml` plus focused flows.

### P3.15 — Feature completion & upload wiring

Items pulled out of the P3.10 / P3.12 / P3.13 / P3.14 "Deferred"
footers. These are pure feature-completion work that runs locally
(no prod accounts required), so they belong in P3 rather than the
"Hardening" phase. Each item below maps 1:1 to a `TODO(P4)` marker
currently in the code — flip those markers to `TODO(P3.15)` as
they're picked up.

> **Backend-first track.** Land these four API items before
> resuming the mobile track below. The rest of P4's API slices
> (statement_timeout, k6, universal links, Sentry, `/me/usage/events`)
> stay in P4.
>
> **Order:**
>
> 1. [x] **`useReportUnfinalize` route** — `POST /reports/{id}/unfinalize`
>        RLS-scoped; flips `finalized_at` to NULL; integration test covers
>        member-can / non-member-can't + 409 already-draft.
> 2. [x] **LLM token accounting** — the whole of P3.15.5
>        (`llm_usage_events` table + `recordLlmUsage` service +
>        instrumentation of `services/ai.ts` chat / transcribe /
>        generateReport via `withUsageAccounting`).
> 3. [x] **`/me/usage` extension** — `months[].tokens`, `byModel[]`,
>        `totals.tokens` aggregated from `llm_usage_events`.
> 4. [x] **Neon prod migration job** — `pnpm --filter @harpa/api db:migrate`
>        runs against the Doppler `prd` `DATABASE_URL` before the Fly
>        deploy in `.github/workflows/api-prod.yml`.
>
> The paginated `GET /me/usage/events`, Sentry API middleware,
> PG `statement_timeout`, universal-link manifests, and k6 load
> tests stay in P4.

The shared blocker is **mobile R2 upload orchestration** (P3.15.1).
`AvatarUploader`, `ReportPhotos`, `ImagePreviewModal` signed-URL,
and the Camera Done handoff all depend on it. Land the orchestration
hook first.

**LLM token accounting (P3.15.5)** is the prereq for the
token-level usage UI in P3.15.4 — land it before extending
`/me/usage`.

#### P3.15.1 — Mobile R2 upload orchestration

- [x] `useFileUpload` hook: presign → R2 PUT → `registerFile` →
      `createNote`, with retry + progress + an in-memory queue.
      API routes (`POST /files/presign`, `POST /files`,
      `GET /files/{id}/url`) already shipped in P2 — wire the mobile
      side.
- [x] `useFileSignedUrl(fileId)` resolver (cached) for read-back.
- [x] `CachedImage` implemented for v4 (FS cache + BlurHash
      placeholder).
- [x] Integration test: image / voice / document each round-trip
      through the queue end-to-end (Pitfall 8).
- [x] Commit: `feat(mobile): R2 upload orchestration + signed-URL resolver + CachedImage`.

#### P3.15.2 — Camera Done handoff

- [x] `(camera)/capture.tsx` Done drains the session registry into
      the upload queue (`useFocusEffect` in the caller, per current
      `TODO(P4)` in `capture.tsx`).
- [x] `expo-media-library` save-to-camera-roll toggle (off by default).
- [x] Pinch-to-zoom + tap-to-focus gesture handlers on the preview.
- [x] Maestro flow: capture → Done → file appears in report.
- [x] Commit: `feat(mobile): camera Done → upload handoff + roll toggle + gestures`.

#### P3.15.3 — Saved-report wiring completion

- [x] `useReportUnfinalize` route — `POST /reports/{number}/unfinalize`
      (RLS-scoped; 409 on non-finalized; 404 hides cross-project rows).
- [x] `useReportUnfinalize` mobile hook (consumes the route above).
- [x] Rich `useNoteTimeline`: voice / photo / document rows in
      `ReportNotesPane` (currently text-only stub).
- [x] `ReportPhotos` block on the Report tab (uses signed URLs from
      P3.15.1).
- [x] `ImagePreviewModal` swaps the plain `<Image>` for `CachedImage`
      with signed-URL fetch.
- [x] Maestro flow: open saved report → tabs → unfinalize → photo
      preview.
- [x] Commit: `feat(mobile): saved-report rich timeline + ReportPhotos + image preview`.

#### P3.15.4 — Account / Profile / Usage wiring

- [x] Inline editor + optimistic update for display name + company
      name via `useUpdateMeMutation`.
- [x] `AvatarUploader` component (depends on P3.15.1).
- [x] Extend `/me/usage` API response with `inputTokens`,
      `outputTokens`, `cachedTokens` per month + per-model breakdown.
      Sourced from the `llm_usage_events` table (P3.15.5).
      _(Shipped by backend; mobile now consumes the generated
      `usageResponse` schema from `@harpa/api-contract` directly.)_
- [x] Per-model usage and expandable monthly rows render in
      `screens/usage.tsx`. The optional chart slot is currently null.
- [x] `useAiProvider` reads and writes `/settings/ai` through TanStack
      Query. The Developer screen owns the picker.
- [x] Add the Profile shortcut through `AppHeaderActions`. The current
      app shell uses a Stack, not a tab bar.
- [x] Maestro flow: tab → profile → edit name → sign out; usage
      month switch + chart (`.maestro/p3-13-profile-usage.yaml`).
- [x] Commit: `feat(mobile): account editing + AvatarUploader + token-level usage + AI provider persistence`.

#### P3.15.5 — LLM token accounting

Per-user token counting on every LLM call so usage can be billed,
rate-limited, and rendered in the Usage screen (P3.15.4). The single
chokepoint is `packages/api/src/services/ai.ts` (`chat`,
`transcribe`, `generateReport`) — instrument there, not at each
route.

- [x] Drizzle migration: `llm_usage_events` table
      (`id lue_id`, `user_id`, `project_id?`, `report_id?`, `vendor`,
      `model`, `operation` enum `{chat,transcribe,generate_report}`,
      `input_tokens`, `output_tokens`, `cached_tokens`,
      `input_seconds?`, `latency_ms`, `fixture_mode` enum,
      `status` enum, `created_at`). Indexes on `(user_id, created_at desc)` and
      `(user_id, vendor, model, operation)`.
      (`packages/api/migrations/0005_llm_usage_events.sql`.)
- [x] RLS / scoped role: `llm_usage_events_self_select` +
      `llm_usage_events_self_insert` enforce `user_id =
current_setting('app.user_id')`. INSERT goes through the
      per-request scoped accessor; no mobile-side writes.
- [x] Each vendor adapter returns `{ output, usage }` where `usage`
      is `{ inputTokens, outputTokens, cachedTokens? }`. Extract from
      the SDK response per vendor:
  - OpenAI: `response.usage.{prompt_tokens, completion_tokens, prompt_tokens_details.cached_tokens}`.
  - Kimi: equivalent fields from its SDK.
  - Transcribe (Whisper-class): audio duration is stored separately as
    `input_seconds`; `input_tokens` remains a token count and is zero when the
    provider does not report tokens.

    Shipped in P3.15.5 close-out: OpenAI adapter reads
    `prompt_tokens_details.cached_tokens`; new Kimi live adapter
    (`packages/ai-fixtures/src/providers/kimi.ts`, Moonshot REST,
    OpenAI-compatible); `services/ai.ts::transcribe()` records the
    provider-reported `durationSec` as input seconds.

- [x] Fixture replays return canonical `usage` values stored
      alongside the fixture payload (so replay-mode tests have
      deterministic token counts). `packages/ai-fixtures` already
      ships `ChatResponse.usage` and existing fixtures carry the
      recorded values; the chokepoint reads them through
      `withUsageAccounting`.
- [x] `recordLlmUsage(db, { userId, projectId?, reportId?, vendor, model, operation, usage, latencyMs, fixtureMode, status })`
      service in `packages/api/src/services/ai-usage.ts`. Called from
      each of the three `services/ai.ts` entry points via
      `withUsageAccounting` after the vendor call returns (and on
      error too — `status='error'` row with zero tokens so we see
      traffic spikes from failed calls).
- [x] Pitfall 13: `src/__tests__/ai-usage.integration.test.ts`
      exercises real `chat` + `transcribe` round-trips through
      fixtures and asserts a row landed in `llm_usage_events` with
      the expected counts. Default-wiring coverage, not a stub.
- [x] `GET /me/usage` aggregates from this table (months + byModel +
      totals with token sums).
- [x] `GET /me/usage/events` paginates raw events for the
      per-event timeline (`packages/api/src/routes/me.ts` →
      `auth/service.ts::listUsageEvents`). Keyset cursor on
      `(created_at DESC, id DESC)`; optional `operation` + `vendor`
      filters; includes `status='error'` rows so failed calls are
      visible in the timeline. RLS on `app.llm_usage_events` is the
      access gate.
- [x] Commit: `feat(api): per-user LLM token accounting on every call`.

#### P3.15.6 — Voice note pipeline completion

Full design + sequencing live in
[`arch-voice-pipeline.md`](arch-voice-pipeline.md) and
[`plan-voice-pipeline.md`](plan-voice-pipeline.md). One commit per
phase; checkboxes here mirror the phase boundaries.

- [x] **Phase A** — `arch-voice-pipeline.md` design doc;
      `arch-mobile.md §Voice note pipeline` drift fix; this §P3.15.6
      block; AGENTS.md fixture-stub line updated.
- [x] **Phase B** — Drizzle migration `0004_notes_voice_columns.sql`
      (`summary`, `duration_sec`, `language`, `transcribe_provider`,
      `transcribed_at` on `app.notes`, all nullable, expand-only);
      `POST /reports/:reportId/notes/voice` aggregator with
      `withAuth + withRateLimit + withIdempotency(keyBy fileId+reportId)`;
      `packages/api/src/prompts/voiceSummary.ts`; contract additions in
      `packages/api-contract/src/schemas/notes.ts`;
      `voice-aggregator.integration.test.ts` + scope test (Pitfall 13:
      real fixture providers, no aggregator collaborator stubs).
- [x] **Phase C** — add Expo Audio and the recorder adapters. The
      first modal implementation was later replaced by the current
      inline recorder with start, waveform, send, and cancel controls.
      Fixture mode uses `apps/mobile/assets/fixtures/voice-sample.m4a`.
- [x] **Phase D** — `useVoiceNotePipeline({ reportId })` state machine
      (`idle → uploading → transcribing → saved | failed(step)`);
      `useCreateVoiceNoteMutation`; `GenerateReportProvider.voice` wires
      the modal's `onCapture` to the pipeline and exposes a `pipeline`
      sub-surface for transcribing toasts; real `AudioPlaybackProvider`
      backed by one `expo-audio` player (single active note, auto-
      releases when a new URI plays).
- [x] **Phase E** — `VoiceNoteCard` (state pill, play/pause, summary
      preview, transcript expander, retry on `failed`); wired into
      `NoteTimeline` (draft) and `ReportNotesPane` (saved); `noteToEntry`
      surfaces `summary` + `transcript` separately.
- [~] **Phase F** — MMKV queue persistence + rehydrate
  (landed); `AbortSignal` plumbed through `putToR2` and the
  voice pipeline forwards a `clientId` dedupe key (landed);
  client-side 16 kHz mono m4a normalisation **deferred**
  (requires `ffmpeg-kit` native module); optional
  `useLiveTranscript` via `expo-speech-recognition`
  **deferred** (requires native module + permission flow). See
  `arch-voice-pipeline.md §D9` for deferral rationale.
- [x] **Phase G** — `.maestro/modules/09-voice-notes.yaml` drives the
      fixture recorder and asserts the resulting `VoiceNoteCard`.
      Current coverage uses the inline recorder rather than the old
      modal flow.

**Out of scope** (kept disabled or absent until product asks):
notifications row (stays `disabled`-styled), language / locale
switching.

#### P3.15.6 — Camera upload pipeline close-out

Tracked end-to-end in
[`plan-camera-upload-pipeline.md`](plan-camera-upload-pipeline.md)
(15 todos across phases A–C). All shipped.

- [x] Phase A — pitfall regressions (`maestro-appid`, scope test for
      `/files/presign`, `pickStorage` reads parsed env) + MinIO
      default-wiring integration test for live R2.
- [x] Phase B — user-visible completion: `ImageNoteCard`,
      `PendingPhotoCard`, `UploadQueueStrip`, gallery attachment
      sheet (`expo-image-picker`), MMKV-backed queue persistence +
      rehydrate-on-mount, `AbortController` cancel through
      `runUploadJob`.
- [x] Phase C — hardening: `expo-image-manipulator` downscale + 50 MB
      guard, post-success source URI cleanup,
      `.maestro/modules/10a-photo-notes-draft.yaml` live round-trip, widened
      `process.env.R2_*` lint guard, doc roundup
      (`arch-storage.md`, `pitfalls.md` Pitfall 13 sub-bullet,
      `docs/bugs/README.md` `pickStorage` trapdoor entry).
- Document / PDF note UI remains **deferred** by design — the queue
  - server-side pipeline accept the kind; only the mobile UI is
    out of scope for this slice.

## Historical P3 exit

- [ ] All boxes ticked (P3.0 – P3.15). Tag `v0.3.0-features`.
- [ ] `pnpm --filter @harpa/mobile bundle:smoke` green on the tag SHA
      (see `overnight-protocol.md` §5 — also run per-commit through P3).

### Follow-up: photo placement UI

Photo groups now carry an optional `placement` pointer to a specific
issue or summary section. Design + implementation notes:
[`design-photo-placement.md`](design-photo-placement.md). Migration
0014 + `PATCH /notes/{n}/placement` + the mobile sheet/chip ship as
a self-contained slice and do not gate P3 exit.
