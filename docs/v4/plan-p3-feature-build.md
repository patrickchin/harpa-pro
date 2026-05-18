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
- files  — no canonical screen exists (see P3.11 below); marked N/A
- camera  ✅ shipped (P3.12)
- profile / account / usage  ✅ shipped (P3.13)
- feature completion + upload wiring (P3.15)

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
> building blocks that will be collated later into the full
> `core-end-to-end.yaml` journey (P3.14) and into broader regression
> suites. Do not reuse an existing flow; do not run the whole suite as
> the gate. One section → one flow → green before commit.

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
6. Write a new `.maestro/p3-<section>.yaml` flow scoped to this
   section only (see [Maestro gate](#maestro-gate-all-sections-and-subsections)
   above). It will be collated later into the full E2E journey.
7. **Run `maestro test .maestro/p3-<section>.yaml` — must be green.**
8. Manual visual review side-by-side with the canonical source on
   the iOS sim.
9. Commit: `feat(mobile): <screen> ported from canonical source with tests + flow`.

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
P3.11 Files screen                   ⊘ no canonical (N/A)
P3.12 Camera                        ✅ shipped
P3.13 Profile / Account / Usage      ✅ shipped
P3.14 Maestro full-journey           ✅ shipped (core-end-to-end.yaml)
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
9 rendering primitives ported verbatim under `components/reports/`
(`StatBar`, `WeatherStrip`, `SummarySectionCard`, `IssuesCard`,
`WorkersCard`, `MaterialsCard`, `NextStepsCard`, `CompletenessCard`,
`ReportView`) plus `SectionHeader` + `mobile-ui` / `section-icons`;
provider extended with real `generation` / `draft` / `tabs.editManually`
/ `preview.openFile` / `handleRegenerate` + `initialTab` prop;
`ReportTabPane` fully ported (error banner + Retry, empty + Edit
manually CTA, shimmer, live ReportView, finalize-error banner;
ReportPhotos slot reserved); fixture mode seeds
`SAMPLE_GENERATED_REPORT`; dev mirror `(dev)/generate-report.tsx`;
Vitest coverage per state + smoke; Reanimated mock extended for
chainable entering presets. Commit:
`feat(mobile,report-core): P3.7 — Generate Report tab + read-only ReportView`.

### P3.8 — Generate – Edit tab (✅ shipped)

Third Generate-screen commit. Fully-controlled inline editor that
mutates `GeneratedSiteReport` via immutable slice helpers; real
autosave hook deferred (provider forwards `isAutoSaving` /
`lastSavedAt` props only — autosave loop landed in P3.x).

Shipped: `lib/report-edit-helpers.ts` (slice patches + whole-array
setters + blank-row factories, all immutable, new wrapper + inner refs
per call) with 23 test cases; `ReportEditForm.tsx` ported verbatim
(7 section cards + shared `Field` / `AddRowButton` / `RemoveRowButton`
+ `AppDialogSheet` destructive confirm — Pitfall: no `Alert.alert`);
`EditTabPane` (empty state + inline form + autosave status row);
provider extended with `onSetReport` / `setReport` no-op fallback /
lazy-seed via `createEmptyReport()` from both `tabs.openEdit()` and
`tabs.editManually()`; dev mirror `(dev)/generate-edit.tsx`; Vitest
coverage per state + onSetReport propagation + lazy-seed path. Commit:
`feat(mobile): P3.8 — Generate Edit tab + inline ReportEditForm`.

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

Ports the saved-report detail screen from canonical
`app/projects/[projectId]/reports/[reportId].tsx` into v4 at
`app/(app)/projects/[project]/reports/[number]/index.tsx`. Body is
props-only; PDF export, `ReportPhotos`, and the rich note timeline
deferred to P3.15 / P4 behind clearly-marked stubs.

Shipped: `screens/saved-report.tsx` owns tab + menu + dialog state
(Report always / Notes always / Edit drafts-only with auto-bounce to
Report on finalize) + canonical reconciliation pattern preserving
local edits across refetches; real route wires `useProjectQuery` /
`useReportQuery` / `useReportPdfActions` / `useRefresh` with slug
params + invalid-route fallback; dev mirror (loading / error /
draft-populated / finalized); components ported verbatim
(`ReportActionsMenu`, `ReportDetailHeader`, `ReportDetailTabBar`,
text-only `ReportNotesPane`, `SavedReportSheet`, `ReportDetailSkeleton`);
`ImagePreviewModal` simplified to RN `Image` (signed URLs deferred);
`PdfPreviewModal` chrome + stub `saveReportPdf` routing through the
action-error dialog; `lib/use-report-pdf-actions.ts` verbatim;
`lib/export-report-pdf.ts` stubbed; `lib/app-dialog-copy.ts` gains
`getUnfinalizeReportDialogCopy()`; 14 Vitest cases covering every
visible state + interaction. Commit:
`feat(mobile): P3.10 — Saved report screen + actions menu + PDF preview`.

**Follow-ups → [P3.15](#p315--feature-completion--upload-wiring):**
`useReportUnfinalize`, rich `useNoteTimeline`, `ReportPhotos`,
`ImagePreviewModal` signed-URL + `CachedImage`. Mobile PDF export +
inline rendering → P4.3
([plan-p4-hardening.md](plan-p4-hardening.md)).

### P3.12 — Camera (✅ shipped)

Ports the full-screen burst camera from canonical
`app/(camera)/capture.tsx`. Body is props-only with injection seams
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
mocked locally. Commit:
`feat(mobile): P3.12 — Camera capture screen ported from canonical source`.

**Follow-ups → [P3.15](#p315--feature-completion--upload-wiring):**
upload-on-Done handoff, `expo-media-library` save-to-roll,
pinch-zoom + tap-focus. iOS prebuild already landed
(`apps/mobile/ios/`).

### P3.13 — Profile / Account / Usage (✅ shipped)

Ports the three account-area screens (`profile`, `account`, `usage`)
from canonical to v4 routes under `(app)/`. Bodies are props-only;
v3 token-usage rollups, `AvatarUploader`, and AI provider
availability check deferred to P3.15 / P4 behind clearly-marked stubs.

Shipped: `screens/profile.tsx` owns AI provider/model picker modal +
clear-cache confirm (`AppDialogSheet`) with `showDeveloperSection`
prop; `screens/account.tsx` read-only details form with optional
`avatarSlot` ReactNode injection point; `screens/usage.tsx` per-month
expand state + pricing-reference card + optional `chart` slot; real
routes wire `useAuthSession` / `useMeUsageQuery` / better-auth
`signOut` / `queryClient.clear()` with `safeBack` fallbacks; dev
mirrors with hand-crafted mock states for every visible state (Profile
mirror passes the canonical AI provider catalogue: Kimi, OpenAI,
Anthropic, Google, Z.AI, DeepSeek); `components/skeletons/AccountDetailsSkeleton.tsx`
verbatim; `lib/build-info.ts` adapted to read Fly API base URL from
`lib/env.ts` (preserves `displayVersion` / `serverLabel` shape);
32 Vitest cases across the three screens + 1 snapshot each. Commit:
`feat(mobile): P3.13 — Profile / Account / Usage screens ported`.

**Follow-ups → [P3.15](#p315--feature-completion--upload-wiring):**
`AvatarUploader` (blocked on R2 orchestration), inline name/company
editing, token-level usage (API + `UsageBarChart`), AI provider
persistence + availability probe. Notifications row + language toggle
stay out of scope.

### P3.11 — Files screen (⊘ N/A)

No standalone "files" screen exists in the canonical source
(`../haru3-reports/apps/mobile/app/` on `dev` — verified at P3
close-out). File interactions live inside the report-detail Notes
pane (`ReportNotesPane` — landed in P3.10) and the camera capture
flow (P3.12); both already have their canonical surfaces ported.

This task is intentionally left out of scope for P3; if a dedicated
files browser ships in canonical later, it lands as a P4 add-on with
its own subsection here. The P3 scope list above is marked accordingly.

### P3.14 — Maestro full-journey (✅ shipped)

The `core-end-to-end.yaml` flow at `.maestro/core-end-to-end.yaml`
shipped earlier in P3 (commit `915ede4`). It walks every
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
- **Voice note**: record → live interim transcript → upload →
  transcribe (fixture) → summarise (fixture) → createNote.
  Tested via `voice-note-pipeline.test.ts`.
- **Camera**: capture → session → commit to report. Tested via
  `camera-session-roundtrip.test.ts`.
- **Report generation**: notes change counter → generate (fixture)
  → CompletenessCard → finalize → PDF (fixture). Maestro
  `core-end-to-end` exercises the whole arc.

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
> 1. **`useReportUnfinalize` route** — `POST /reports/{id}/unfinalize`
>    (or `PATCH` with `{ status: 'draft' }`). RLS-scoped; flips
>    `finalized_at` to NULL; integration test covers
>    member-can / non-member-can't. From P3.15.3.
> 2. **LLM token accounting** — the whole of P3.15.5
>    (`llm_usage_events` table + `recordLlmUsage` service +
>    instrumentation of `services/ai.ts` chat / transcribe /
>    generateReport + fixture usage values). Prereq for step 3.
> 3. **`/me/usage` extension** — add `inputTokens`, `outputTokens`,
>    `cachedTokens` per month + per-model breakdown, aggregated
>    from `llm_usage_events`. From P3.15.4.
> 4. **Neon prod migration job** — add the
>    `pnpm --filter @harpa/api db:migrate` step to
>    `.github/workflows/api-prod.yml` (currently only runs in
>    `api-dev.yml`). Without this, step 2's `llm_usage_events`
>    migration won't apply on prod deploy. From
>    [P4.4](plan-p4-hardening.md#p44-neon-prod-migration--pitr).
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
- [ ] `useFileUpload` hook: presign → R2 PUT → `registerFile` →
      `createNote`, with retry + progress + an in-memory queue.
      API routes (`POST /files/presign`, `POST /files`,
      `GET /files/{id}/url`) already shipped in P2 — wire the mobile
      side.
- [ ] `useFileSignedUrl(fileId)` resolver (cached) for read-back.
- [ ] `CachedImage` + `prefetchImages` ported from canonical
      (FS cache + BlurHash placeholder).
- [ ] Integration test: image / voice / document each round-trip
      through the queue end-to-end (Pitfall 8).
- [ ] Commit: `feat(mobile): R2 upload orchestration + signed-URL resolver + CachedImage`.

#### P3.15.2 — Camera Done handoff
- [ ] `(camera)/capture.tsx` Done drains the session registry into
      the upload queue (`useFocusEffect` in the caller, per current
      `TODO(P4)` in `capture.tsx`).
- [ ] `expo-media-library` save-to-camera-roll toggle (off by default).
- [ ] Pinch-to-zoom + tap-to-focus gesture handlers on the preview.
- [ ] Maestro flow: capture → Done → file appears in report.
- [ ] Commit: `feat(mobile): camera Done → upload handoff + roll toggle + gestures`.

#### P3.15.3 — Saved-report wiring completion
- [ ] `useReportUnfinalize` mutation (route + hook).
- [ ] Rich `useNoteTimeline`: voice / photo / document rows in
      `ReportNotesPane` (currently text-only stub).
- [ ] `ReportPhotos` block on the Report tab (uses signed URLs from
      P3.15.1).
- [ ] `ImagePreviewModal` swaps the plain `<Image>` for `CachedImage`
      with signed-URL fetch.
- [ ] Maestro flow: open saved report → tabs → unfinalize → photo
      preview.
- [ ] Commit: `feat(mobile): saved-report rich timeline + ReportPhotos + image preview`.

#### P3.15.4 — Account / Profile / Usage wiring
- [ ] Inline editor + optimistic update for display name + company
      name via `useUpdateMeMutation`.
- [ ] `AvatarUploader` component (depends on P3.15.1).
- [ ] Extend `/me/usage` API response with `inputTokens`,
      `outputTokens`, `cachedTokens` per month + per-model breakdown.
      Sourced from the `llm_usage_events` table (P3.15.5).
- [ ] `UsageBarChart` + per-event timeline rendered in
      `screens/usage.tsx` (currently a chart-slot placeholder).
- [ ] `useAiProvider` AsyncStorage round-trip + `useAvailableProviders`
      (`/generate-report` availability probe). Profile route stops
      passing empty catalogues.
- [ ] Add a nav entry to the v4 tab bar for Profile (currently only
      reached via deep-link).
- [ ] Maestro flow: tab → profile → edit name → sign out; usage
      month switch + chart.
- [ ] Commit: `feat(mobile,api): account editing + token-level usage + AI provider persistence`.

#### P3.15.5 — LLM token accounting

Per-user token counting on every LLM call so usage can be billed,
rate-limited, and rendered in the Usage screen (P3.15.4). The single
chokepoint is `packages/api/src/services/ai.ts` (`chat`,
`transcribe`, `generateReport`) — instrument there, not at each
route.

- [ ] Drizzle migration: `llm_usage_events` table
      (`id uuidv7`, `user_id`, `project_id?`, `report_id?`, `vendor`,
      `model`, `operation` enum `{chat,transcribe,generate_report}`,
      `input_tokens`, `output_tokens`, `cached_tokens`,
      `total_tokens` generated, `latency_ms`, `fixture_mode` bool,
      `created_at`). Index on `(user_id, created_at desc)` and
      `(user_id, vendor, model)`.
- [ ] RLS / scoped role: users can only `SELECT` their own rows;
      `INSERT` is restricted to the API service role (see
      `arch-auth-and-rls.md`). No mobile-side writes.
- [ ] Each vendor adapter returns `{ output, usage }` where `usage`
      is `{ inputTokens, outputTokens, cachedTokens? }`. Extract from
      the SDK response per vendor:
      - OpenAI: `response.usage.{prompt_tokens, completion_tokens, prompt_tokens_details.cached_tokens}`
      - Anthropic: `response.usage.{input_tokens, output_tokens, cache_read_input_tokens}`
      - Google / Kimi / Z.AI / DeepSeek: equivalent fields per their SDKs.
      - Transcribe (Whisper-class): record audio duration → derive
        `inputTokens` via a documented conversion (or store
        `inputSeconds` in a separate column).
- [ ] Fixture replays return canonical `usage` values stored
      alongside the fixture payload (so replay-mode tests have
      deterministic token counts). `packages/ai-fixtures` schema
      extended; existing fixtures backfilled with the values
      observed during recording.
- [ ] `recordLlmUsage(db, { userId, projectId?, reportId?, vendor, model, operation, usage, latencyMs, fixtureMode })`
      service in `packages/api/src/services/ai-usage.ts`. Called from
      each of the three `services/ai.ts` entry points after the
      vendor call returns (and on error too — log the failure with
      zero tokens so we see traffic spikes from failed calls).
- [ ] Pitfall 13: write an integration test that exercises a real
      `chat` round-trip through fixtures and asserts a row landed
      in `llm_usage_events` with the expected counts. Default-wiring
      coverage, not a stub.
- [ ] `GET /me/usage` (extended in P3.15.4) aggregates from this
      table. `GET /me/usage/events` paginates raw events for the
      per-event timeline.
- [ ] Commit: `feat(api): per-user LLM token accounting on every call`.

**Out of scope** (kept disabled or absent until product asks):
notifications row (stays `disabled`-styled), language / locale
switching.

## P3 exit
- [ ] All boxes ticked (P3.0 – P3.15). Tag `v0.3.0-features`.
- [ ] `pnpm --filter @harpa/mobile bundle:smoke` green on the tag SHA
  (see `overnight-protocol.md` §5 — also run per-commit through P3).
