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
6. Maestro flow exercising it.
7. Manual visual review side-by-side with the canonical source on
   the iOS sim.
8. Commit: `feat(mobile): <screen> ported from canonical source with tests + flow`.

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

Full design: [design-p31-slug-only-ids.md](design-p31-slug-only-ids.md).
Companion: [arch-ids-and-urls.md](arch-ids-and-urls.md). Supersedes
the P3.0 dual-id plan ([design-p30-ids-slugs.md](design-p30-ids-slugs.md))
— there is **no parallel UUID column**: each entity's prefixed slug
is the primary key, enforced by a Postgres DOMAIN.

- [x] Drizzle schema: PKs/FKs as plain `text()`; init migration
      collapses prior P0/P1 schema into one
      `20261101000001_init_slug_native.sql` (8 DOMAINs, RLS
      retyped, SECURITY DEFINER helpers).
- [x] `packages/api/src/lib/ids.ts` — `newId(prefix)`,
      `assertId(prefix, value)`, `insertWithGeneratedId` (retry
      on `23505`).
- [x] `packages/api-contract`: `idSchema(prefix)` factory +
      branded `Id<P>` TS types. Route params switched to short
      form (`:project`, `:report`, `:note`, `:user`). OpenAPI
      regenerated.
- [x] Resolver routes `GET /p/:project` + `GET /r/:report`
      return JSON (not 308); mobile resolver screens
      `router.replace` to canonical long URL.
- [x] `withScopedConnection` / `verifyJwt` / `signTestToken`
      call `assertId` at the trust boundary; RLS coerces
      `current_setting('app.user_id')::app.usr_id`.
- [x] CLI openapi-fetch path templates + snapshots updated.
- [x] Mobile: expo-router segments renamed
      (`[project]/`, `[report].tsx`, `[project].tsx`),
      `lib/api/hooks.ts` regenerated.
- [x] Commit train on `feat/v4`:
      `feat(api-contract|api|cli|mobile): slug-native IDs`.

### P3.6 — Generate – Notes tab

First of three commits that together port the Generate Report screen.
P3.6 ships the Notes pane as a *visually complete* surface; Report
(P3.7) and Edit (P3.8) mount as empty placeholders.

- [x] `GenerateReportProvider` scaffold — owns tab state, text-note
      input, dialog visibility, attachment sheet. Report-tab / Edit-tab
      fields (`generation`, `draft`, `voice`, `photo`) present as
      structurally-stable no-op defaults with `TODO(P3.7/P3.8)` markers.
- [x] `NoteTimeline` (text-only) + `EmptyState` wired into
      `NotesTabPane`. Voice / photo / pending-upload rows deferred.
- [x] Shared shell: `GenerateReportTabBar`, `GenerateReportActionRow`,
      `GenerateReportInputBar` (text input + voice + photo + attach
      buttons, voice/photo wired to provider no-ops),
      `GenerateReportDialogs` (delete-note, finalize-confirm,
      attachment sheet, upload error).
- [x] Real route at
      `apps/mobile/app/(app)/projects/[projectSlug]/reports/[number]/generate.tsx`
      using `useProjectQuery` + `useReportQuery`. Notes live in
      route-local React state for P3.6 (TODO marker for the
      `useReportNotesQuery` swap in P3.7).
- [x] Dev mirror `(dev)/generate-notes.tsx` with empty / populated /
      loading toggles + registry entry.
- [x] Vitest unit tests for the screen body covering each state +
      one snapshot.
- [x] Commit: `feat(mobile): P3.6 — Generate Notes tab + provider scaffold`.

### P3.7 — Generate – Report tab

Second of the three Generate-screen commits. Brings the Report tab
from a placeholder `<View />` to a visually complete, read-only
surface that renders a `GeneratedSiteReport` with empty / generating
/ live / generation-error / finalize-error states. Same pattern as
P3.6: provider takes orchestration state as props; route + dev
mirror + tests pass canned values. Real `useReportGeneration` hook
+ ReportPhotos rendering remain deferred (see TODO markers).

- [x] New shared package `packages/report-core` — Zod schemas +
      `normalizeGeneratedReportPayload` + helpers (`getReportCompleteness`,
      `getWorkersLines`, `getWeatherLines`, …). Mobile + api both
      depend on it via `@harpa/report-core`.
- [x] Nine rendering primitives ported verbatim from canonical
      under `apps/mobile/components/reports/`: `StatBar`,
      `WeatherStrip`, `SummarySectionCard`, `IssuesCard`,
      `WorkersCard`, `MaterialsCard`, `NextStepsCard`,
      `CompletenessCard`, `ReportView`. Plus `SectionHeader`
      primitive and `mobile-ui` / `section-icons` helpers.
- [x] `GenerateReportProvider` extended: real `generation`
      (`report`, `isUpdating`, `error`, `notesSinceLastGeneration`,
      `hasReport`), `draft` (`isFinalizing`, `finalizeError`,
      finalize-confirm visibility), `tabs.editManually`,
      `preview.openFile`, `handleRegenerate` — all driven by new
      provider props. `initialTab` prop added for dev mirror.
- [x] `ReportTabPane` body fully ported: error banner + Retry,
      empty state (CompletenessCard skeleton + Edit manually CTA),
      generating shimmer, live ReportView + finalize-error banner.
      ReportPhotos slot reserved with a TODO marker (lands once
      upload pipeline + `useLocalReportNotes` port).
- [x] Real route forwards report state via new
      `report`/`isGeneratingReport`/`generationError`/`onRegenerate`
      props; fixture-mode seeds `SAMPLE_GENERATED_REPORT` so the
      tab renders without the API generate endpoint. TODO marker
      for the real `useReportGeneration` hook (lands with the API
      endpoint).
- [x] Dev mirror `(dev)/generate-report.tsx` with state toggles
      (no-report / generating / live-report / generation-error /
      finalize-error) + registry entry.
- [x] Vitest unit tests for the Report tab covering each state +
      smoke render of populated layout. Reanimated mock extended
      with chainable entering-preset proxy so `FadeIn.duration(…)`
      works under test.
- [x] Commit: `feat(mobile,report-core): P3.7 — Generate Report tab + read-only ReportView`.

### P3.8 — Generate – Edit tab

Third of the three Generate-screen commits. Brings the Edit tab from
a placeholder `<View />` to a fully-controlled inline editor that
mutates a `GeneratedSiteReport` through immutable slice helpers. The
real autosave hook (`useReportAutoSave` / `useReportDraftPersistence`)
remains deferred; the provider just forwards `isAutoSaving` +
`lastSavedAt` props so the status row renders the right copy.

- [x] `lib/report-edit-helpers.ts` extended from the P3.7
      `createEmptyReport()`-only stub: `updateMeta`, `updateWeather`,
      `updateWorkers` slice patches (with empty-shape seeding when
      the slice is `null`), `setRoles` / `setMaterials` / `setIssues`
      / `setNextSteps` / `setSections` whole-array setters, and
      `blankRole` / `blankMaterial` / `blankIssue` / `blankSection`
      factories. All immutable; every helper returns a new wrapper +
      a new inner `report` object so React shallow-equality fires.
- [x] `lib/report-edit-helpers.test.ts` ports the canonical helper
      tests (23 cases): shape, identity, schema round-trip,
      null-seed paths, and "two calls produce independent refs".
- [x] `components/reports/ReportEditForm.tsx` ported verbatim from
      canonical: 7 section cards (Meta / Weather / Workers + Roles /
      Materials / Issues / Next Steps / Summary Sections) with
      shared `Field` / `AddRowButton` / `RemoveRowButton` helpers
      and an `AppDialogSheet` confirm before destructive removes
      (Pitfall: no `Alert.alert`).
- [x] `EditTabPane` body fully ported: empty state when
      `generation.report === null`, inline form once a report
      exists, and an autosave status row (`Saving…` / `Saved` / ``).
- [x] `GenerateReportProvider` extended: new `onSetReport`,
      `isAutoSaving`, `lastSavedAt` props; `generation.setReport`
      surface (no-op fallback when route doesn't wire persistence);
      `draft.isAutoSaving` + `draft.lastSavedAt`; lazy-seed via
      `createEmptyReport()` from both `tabs.openEdit()` and
      `tabs.editManually()` when no report is present yet.
- [x] Dev mirror `(dev)/generate-edit.tsx` with state toggles
      (no-report / live-report / autosaving / saved) + registry entry.
- [x] Vitest unit tests for the Edit tab covering each state +
      onSetReport propagation (new top-level + inner refs) + the
      "Edit manually" lazy-seed path from the empty Report tab.
- [x] Commit: `feat(mobile): P3.8 — Generate Edit tab + inline ReportEditForm`.

### P3.10 — Saved report + actions + PDF

Ports the saved-report detail screen from canonical
`../haru3-reports/apps/mobile/app/projects/[projectId]/reports/[reportId].tsx`
into the v4 slug-native route at
`apps/mobile/app/(app)/projects/[project]/reports/[number]/index.tsx`.
Body is props-only (no API / no auth / no secure-store) so the dev
mirror exercises the same component without mocks. The PDF export
pipeline, ReportPhotos block, and rich note timeline are deferred to
P4 behind clearly-marked stubs.

- [x] Body `screens/saved-report.tsx` owns the tab + menu + dialog
      state. Tabs: Report (always), Notes (always), Edit (drafts
      only — auto-bounces to Report when status flips to
      `finalized`). Reconciliation pattern from canonical preserves
      local edits across refetches unless the server JSON changed.
- [x] Real route wires `useProjectQuery`, `useReportQuery`,
      `useReportPdfActions`, and `useRefresh`. Slug-native params
      (`project` + `number`) with the invalid-route fallback.
- [x] Dev mirror `(dev)/saved-report.tsx` with 4 mode toggles
      (loading / error / draft-populated / finalized) +
      registry entry.
- [x] Components ported verbatim where v4 has the matching
      primitive: `ReportActionsMenu`, `ReportDetailHeader`,
      `ReportDetailTabBar`, `ReportNotesPane` (text-only — full
      timeline deferred), `SavedReportSheet`,
      `ReportDetailSkeleton`. `ImagePreviewModal` simplified to
      `react-native` `Image` (no `expo-image` / signed URLs yet).
      `PdfPreviewModal` ships the modal chrome; inline rendering
      is deferred and the stub `saveReportPdf` surfaces an error.
- [x] `lib/use-report-pdf-actions.ts` ported verbatim from the
      canonical hook; `lib/export-report-pdf.ts` ships as a stub
      whose async functions throw the standard "Saving PDFs lands
      in P4 …" message so any accidental invocation routes through
      the existing action-error dialog.
- [x] `lib/app-dialog-copy.ts` gains `getUnfinalizeReportDialogCopy()`
      next to the existing `getDeleteReportDialogCopy()` /
      `getActionErrorDialogCopy()` helpers. Confirm dialogs are
      body-owned via `AppDialogSheet` (Pitfall: no `Alert.alert`).
- [x] Vitest unit tests (14) cover every visible state +
      interaction: skeleton, invalid-route fallback, error / retry,
      tab switching, finalize bounce, hidden Edit tab on
      finalized, actions menu open/close, confirm-delete +
      confirm-unfinalize callbacks, PDF preview open, Save PDF
      invocation, populated-draft layout assertion.
- [x] Commit: `feat(mobile): P3.10 — Saved report screen + actions menu + PDF preview`.

**Deferred to P4** (each behind a `TODO(P4)` marker in code):

- v4 `Report.body` → `GeneratedSiteReport` translation (route
  currently mounts the dev fixture for the body).
- `useReportDelete`, `useReportUnfinalize`, `useReportAutoSave`
  mutation hooks.
- `useReportNotesQuery` + rich `useNoteTimeline` (voice / photo /
  document rows). `ReportNotesPane` ships as a text-only stub
  exporting `ReportNoteRow`.
- `ReportPhotos` block on the Report tab — blocked on the upload
  pipeline + signed-URL resolution.
- `ImagePreviewModal` signed-URL fetch + `CachedImage` / BlurHash
  placeholder.
- PDF export pipeline (Expo Print + Sharing) — stub lib throws.
- Inline PDF rendering (`react-native-webview` / `react-native-pdf`).

### P3.12 — Camera

Ports the full-screen burst camera from canonical
`../haru3-reports/apps/mobile/app/(camera)/capture.tsx` into the v4
`(camera)` route group. Body is props-only (no router / no
session-registry coupling — the route owns the handoff). The camera
preview, shutter, and `useCameraPermissions` hook stay inside the
body (matching canonical), with injection seams (`renderPreview`,
`takePicture`, `permissionOverride`, `onOpenSettings`, `deleteFile`)
so the dev mirror + Vitest run without native modules.

- [x] Body `screens/camera-capture.tsx` owns the permission gate,
      capture queue, flash + facing toggles, and the discard-confirm
      dialog (via `AppDialogSheet` — Pitfall: no `Alert.alert`).
      Permissions resolve via `useCameraPermissions` by default; a
      `permissionOverride` prop short-circuits the hook for
      tests / the dev gallery.
- [x] Real route `app/(camera)/capture.tsx` + `_layout.tsx`
      (`fullScreenModal`, portrait orientation, black contentStyle).
      Reads `sessionId` from `useLocalSearchParams`, commits via
      `commitCameraSession(id, uris)`, pops with `safeBack`.
- [x] `lib/camera-session-registry.ts` ported verbatim
      (`create` → `commit` → `consume` round-trip) so the camera
      caller protocol matches canonical 1-for-1. Unit tests cover
      cancellation, commit + unknown-id no-ops, and unique-id
      generation.
- [x] Dev mirror `app/(dev)/camera-capture.tsx` with 5 mode toggles
      (requesting / denied / blocked / granted / populated). Live
      `CameraView` is stubbed with a `<View />` placeholder; shutter
      synthesises `cam-dev://shot-N` URIs so the populated-strip +
      discard dialog states are exercisable without a real camera.
      Registry entry added under `group: 'app'`.
- [x] Native config: `expo-camera` added as a config plugin in
      `app.config.ts` with a `cameraPermission` description string
      (NSCameraUsageDescription on iOS, the audio recording perm is
      opted-out on Android). `expo-camera@~16` and
      `expo-file-system@~18` added via `pnpm --filter @harpa/mobile add`.
- [x] Vitest unit tests (11) cover every visible state +
      interaction: permission-requesting spinner, denied notice
      (canAskAgain → "Allow camera"), blocked notice
      (`onOpenSettings` invoked), cancel-from-permission-gate,
      granted UI mounts, shutter appends a capture, flip + flash
      toggles relabel, Done invokes `onCommit` with the URI list,
      Cancel with no captures fires `onCancel`, Cancel with captures
      opens the discard dialog → Discard fires `onCancel`, thumb
      tap removes + invokes `deleteFile`. Plus one snapshot of the
      granted-empty layout. `expo-camera` and `expo-file-system`
      are mocked locally in the test file (no global setup change).
- [x] Commit: `feat(mobile): P3.12 — Camera capture screen ported from canonical source`.

**Deferred to P4** (each behind a `TODO(P4)` marker in code):

- Upload pipeline kick on Done (R2 presign → PUT → registerFile →
  createNote). Route currently commits URIs to the session registry
  and pops; caller is responsible for draining + uploading in
  `useFocusEffect` once the queue lands.
- `expo-media-library` "save to camera roll" toggle.
- Pinch-to-zoom + tap-to-focus on the preview (deferred until the
  upload pipeline is stable — canonical doesn't have these yet
  either).
- iOS prebuild: running `expo prebuild` to regenerate `ios/`
  Podfile entries for `expo-camera`. Deferred until the next EAS
  cut (the JS shipped here typechecks + tests in isolation).

### P3.13 — Profile / Account / Usage

Ports the three account-area screens from canonical
`../haru3-reports/apps/mobile/app/{profile,account,usage}.tsx` into
v4 routes at `apps/mobile/app/(app)/{profile,account,usage}.tsx`.
All three bodies are props-only (no API / auth / secure-store
coupling) so the dev mirrors exercise every visible state without
spinning a real backend. The v3 token-usage rollups, AvatarUploader,
and AI provider availability check don't have v4 equivalents yet
(no `token_usage` table, no R2 upload pipeline, no
provider-availability endpoint) — those land in P4 behind clearly
marked stubs.

- [x] Body `screens/profile.tsx` owns the AI provider / model picker
      modal + the clear-cache confirm dialog (`AppDialogSheet` —
      Pitfall: no `Alert.alert`). Auth user, monthly usage, sign-out,
      cache clear, copy-to-clipboard, and the AI catalogue all flow
      in as typed props. Developer section gated on a
      `showDeveloperSection` prop so dev mirrors flip it on without
      env-var gymnastics.
- [x] Body `screens/account.tsx` renders the read-only details form
      (phone + display name + company name) with an optional
      `avatarSlot` ReactNode so the route can inject a real
      `AvatarUploader` once it lands (P4 — placeholder until then).
- [x] Body `screens/usage.tsx` owns the per-month expand state +
      pricing-reference card. Accepts an optional `chart` ReactNode
      slot so the route can mount a real `UsageBarChart` once we
      have token-level history (P4).
- [x] Real routes wire `useAuthSession`, `useMeUsageQuery`,
      better-auth `signOut`, and the TanStack `queryClient.clear()`
      cache-clear into the body props. `safeBack` falls back to
      `/(app)/profile` (account/usage) or `/(app)/projects`
      (profile).
- [x] Dev mirrors `app/(dev)/{profile,account,usage}.tsx` with
      hand-crafted mock states (Profile: loaded / loading-account /
      usage-loading / empty-usage / new-user. Account: loaded /
      loading / no-name / no-company. Usage: populated / loading /
      empty / single-month). Registry entries added under
      `group: 'app'`. The Profile dev mirror passes the canonical
      AI provider catalogue (Kimi, OpenAI, Anthropic, Google, Z.AI,
      DeepSeek) so the modal is visually reviewable.
- [x] Supporting helpers ported under appropriate dirs:
      `components/skeletons/AccountDetailsSkeleton.tsx` (verbatim);
      `lib/build-info.ts` adapted to read the Fly API base URL from
      `lib/env.ts` instead of v3's Supabase URL (preserves the
      `displayVersion` / `serverLabel` shape the Profile footer
      consumes).
- [x] Vitest unit tests (32 across the three files) cover every
      visible state + interaction the canonical exercises: profile
      copy callbacks, usage spinner / populated / empty, account
      open, sign-out, clear-cache dialog confirm, developer-section
      gating, AI provider modal advancing to model step + selecting
      a model, account skeleton, custom avatar slot, usage month
      expand/collapse/switch, chart slot gating on ≥ 2 months,
      pricing reference rendered, back button. Plus one snapshot per
      screen of the populated layout.
- [x] Commit: `feat(mobile): P3.13 — Profile / Account / Usage screens ported`.

**Deferred to P4** (each behind a `TODO(P4)` marker in code):

- `AvatarUploader` — Supabase storage in v3; v4 needs the R2 upload
  pipeline + signed-URL flow before the avatar picker can land.
  Route passes no `avatarSlot`, body renders the default
  non-interactive User-icon placeholder.
- Editing the account fields (display name + company name). The v4
  `PATCH /me` hook exists (`useUpdateMeMutation`), but wiring an
  inline editor + optimistic update is out of scope for P3.13.
- Token-level usage detail: input / output / cached tokens, per-event
  timeline, per-model breakdown, `UsageBarChart`. v4 `/me/usage`
  returns `{ reports, voiceNotes }` only; the canonical
  per-generation rollups live behind a future analytics endpoint.
- AI provider catalogue persistence (`useAiProvider` AsyncStorage
  round-trip) + the `/generate-report` availability probe
  (`useAvailableProviders`). Real Profile route passes empty
  catalogues and `showDeveloperSection={false}`; dev mirror exercises
  the modal with the canonical catalogue inline.
- Notifications row (top of Profile sections) — disabled in canonical
  too, ported with the same `disabled` styling.
- Language toggle / locale switching — not in canonical's profile;
  out of scope for P3.13.

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

**Coverage gaps after the P3.10 / P3.12 / P3.13 ports** (deferred to
P4 alongside the underlying wiring):

- Saved-report tab navigation + actions menu + PDF preview modal
  — covered by Vitest behaviour tests in `screens/saved-report.test.tsx`;
  Maestro coverage lands once the v4 `Report.body` → `GeneratedSiteReport`
  translation + real autosave hook are in.
- Camera capture exit handoff — `screens/camera-capture.test.tsx` +
  `lib/camera-session-registry.test.ts` cover the session round-trip;
  Maestro coverage lands with the R2 upload pipeline (the canonical
  `(camera)/capture` flow drives presign → PUT → registerFile →
  createNote on Done).
- Profile sign-out + account / usage surfaces — `screens/profile.test.tsx`,
  `screens/account.test.tsx`, `screens/usage.test.tsx` cover the body
  interactions; Maestro coverage lands once the routes are linked from
  the app shell (no nav entry point exists in the v4 tab bar yet —
  reached only via direct deep-link in this drop).

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

## P3 exit
- [ ] All boxes ticked. Tag `v0.3.0-features`.
- [ ] `pnpm --filter @harpa/mobile bundle:smoke` green on the tag SHA
  (see `overnight-protocol.md` §5 — also run per-commit through P3).
