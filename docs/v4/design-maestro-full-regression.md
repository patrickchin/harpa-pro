# Maestro full regression journey

> **Historical status:** green. The listed modules passed end-to-end on
> real Android device `R3CT7092S2H` (`com.harpa.pro.dev`) in
> fixture-replay mode against the local docker-compose stack.
> Last verified: 2026-05-24, HEAD `11632dc`, wallclock ~18m21s for
> the full journey across 01-auth, 01b-signup-bob, 02-projects-crud,
> 03-members-invite, 04-members-permissions, 05-members-viewer,
> 06-members-remove, 07-reports-crud, 08-text-notes,
> 11-generate-finalize, 12-report-debug, 13-projects-delete (plus
> helpers and sign-out).
> **Current 2026-05-28 state:** `origin/dev` has module 09 implemented
> and re-enabled, module 10a expanded for the landed photo-upload
> redesign, module 10b added for finalized saved-report photo coverage,
> and modules 11/12/13 restored to both local and dev journeys. On
> Android `R3CT7092S2H`, focused 10b and 11/12/13 runs, the full local
> regression journey, and clean full dev-deployment journey all passed
> using the local CLI auth broker plus API/R2 proxy bridge.
> Windows-host gotchas hit while getting here are cataloged in
> [`pitfalls-maestro-windows.md`](pitfalls-maestro-windows.md).
> **Phase:** P4 hardening (extends [P3.14](plan-p3-feature-build.md#p314--maestro-full-journey--shipped) `core-end-to-end.yaml`).
>
> Companions:
> [`arch-testing.md`](arch-testing.md),
> [`arch-project-members.md`](arch-project-members.md),
> [`plan-voice-pipeline.md`](plan-voice-pipeline.md),
> [`arch-ai-fixtures.md`](arch-ai-fixtures.md).
>
> Pitfalls addressed:
> [Pitfall 2](pitfalls.md#pitfall-2--llm-fixtures-retrofitted-not-designed-in),
> [Pitfall 3](pitfalls.md#pitfall-3--mobile-shell-drifted-from-the-visual-design),
> [Pitfall 4](pitfalls.md#pitfall-4--big-features-stubbed-then-forgotten),
> [Pitfall 6](pitfalls.md#pitfall-6--per-request-db-scope-rls-replacement-added-late),
> [Pitfall 9](pitfalls.md#pitfall-9--maestro-appid-hardcoded),
> [Pitfall 13](pitfalls.md#pitfall-13--di-stubs-become-the-spec-default-wiring-silently-broken).

---

## 1. Design problem

`core-end-to-end.yaml` (shipped at P3.14) walks the happy-path of the
authenticated app on a single account. It does **not** exercise:

1. Two-actor permission semantics on Members (`owner` vs `editor` vs
   `viewer`): edit-button visibility, 403 paths.
2. Member **deletion** + verification that the removed member can no
   longer see the project on their account.
3. The "report is generated" arc: prompt + report-notes + LLM response
   visible on a **debug surface** (not yet built — gap below).
4. Text-note **delete** path.
5. Report finalize → unfinalize → re-finalize round-trip.

The acceptance contract: a single Maestro entrypoint
(`maestro test apps/mobile/.maestro/regression-journey.yaml`) that
green-lights all currently-shipped+merged features end-to-end on iOS
sim and Android emu, in fixture-replay mode, on a CI machine without
network egress to live LLM vendors — **and** runnable against the
`dev` Fly + Neon stack (`harpa-pro-api-dev.fly.dev`) with seeded test
accounts (see §6).

### Scope carve-outs (deliberately not in the journey today)

Features known not to be on `dev` yet, or known-broken stubs. Each
has an explicit pickup pointer so they re-enter the journey when the
underlying surface lands. **Do not silently green-stub these**
(Pitfall 4) — the module file does not exist until the feature
lands; the [Future modules](#7-future-modules-pickup-pointers)
section is the queue.

| Carved out | Why | Pickup pointer |
|---|---|---|
| Voice note debug fields (transcript, summary, playback) in Report Debug | Module 09 covers the draft-side voice lifecycle and module 12 covers the current debug surface. Voice-specific debug fields need API + UI support before Maestro can assert them. | Track after the debug payload expands. |
| Push notifications / universal links cold-tap | Tracked in [P4.6](plan-p4-hardening.md#p46-universal-links). Different harness. | [P4.6] — separate flow `share-link-cold-start.yaml`. |
| Avatar upload (`AvatarUploader`) | Depends on R2 upload pipeline + camera roll — partly merged but no canonical Maestro coverage yet. | Add as `12a-avatar-upload.yaml` after photo modules unblock. |

---

## 2. Alternatives considered

### 2A. Single monolithic flow

One ~1500-line `regression-journey.yaml`. Rejected — Maestro flows
become unreadable past ~200 lines; a single `tapOn` selector miss
fails the whole suite with no localisation; reruns of the broken
section require reset to clean state.

### 2B. Many independent flows, no journey (status quo + more)

Add `p4-voice.yaml`, `p4-members-permissions.yaml`, etc. Each runs in
isolation with `clearState` at the top. Rejected as the **only**
mechanism — does not exercise cross-feature state (e.g. a voice note
added by editor visible in the owner's saved-report screen). Misses
Pitfall 4 ("big features stubbed then forgotten") because per-flow
mocks can re-stub the very wiring we want to test.

### 2C. **Chosen — orchestrated journey with `runFlow` sub-flows**

Top-level `regression-journey.yaml` calls modular sub-flows via
`runFlow:` and shares state (project slug, member phone, report
number) through Maestro variables (`env:`). Each sub-flow is also
runnable standalone with its own `appId` + `clearState` preamble for
debugging. This matches the P3 per-section convention while giving
us cross-feature continuity.

```
.maestro/
  regression-journey.yaml          # top-level — runs the journey
  helpers/
    sign-in-alice.yaml
    sign-in-bob.yaml
    sign-out.yaml
    open-project.yaml              # by stored projectSlug
  modules/
    01-auth.yaml                   # sign-up alice + sign-in alice
    02-projects-crud.yaml          # create, edit, list verify
    03-members-invite.yaml         # alice invites bob as editor
    04-members-permissions.yaml    # bob sees project, can edit
    05-members-viewer.yaml         # alice downgrades bob → viewer; bob sees no edit buttons
    06-members-remove.yaml         # alice removes bob; bob no longer sees project
    07-reports-crud.yaml           # create + delete draft report
    08-text-notes.yaml             # add + delete text note
    11-generate-finalize.yaml      # generate → ReportView → finalize → unfinalize → re-finalize
    12-report-debug.yaml           # debug surface — prompt + notes + LLM response visible
    13-projects-delete.yaml        # delete the project (teardown)
```

Module numbers `09-voice-notes` and `10-photo-notes` are
**deliberately skipped** in the initial release — the gap reserves
the slot for when the corresponding features land on `dev`. See
[§7 Future modules](#7-future-modules-pickup-pointers).

---

## 3. Chosen approach — contract

### 3.1 Two-actor strategy

Maestro can only drive one device. We sequence actor switches by
signing out and signing back in.

| Actor | Phone | OTP | Role |
|---|---|---|---|
| `alice` | `+15550000001` | `000000` | project owner |
| `bob` | `+15550000002` | `000000` | invitee (editor → viewer → removed) |

**Fixture-mode OTP.** `EXPO_PUBLIC_USE_FIXTURES=true` (`:mock` build)
must wire the Twilio Verify client to accept `000000` for
the two fixture phone numbers. This is the same record/replay
fixture surface used by `packages/api/src/services/otp`; document
the accepted shape next to its definition per Pitfall 13.

`sign-in-alice.yaml` / `sign-in-bob.yaml` are the canonical helpers;
do not inline the phone/OTP in modules.

### 3.2 Shared state between modules

Maestro variables, set by `output:` on the first module and read by
later ones:

| Variable | Set by | Read by |
|---|---|---|
| `REPORT_NUMBER` | `07-reports-crud` | 08–12 |
| `BOB_USER_ID` | `03-members-invite` (from members row testID) | 05, 06 |

The single project created by `02-projects-crud` is referenced from
modules 04–13 by its **post-edit name** (`text: "Regression Test
Project \(Edited\)"`) rather than its dynamic slug. Earlier iterations
captured the slug via a hidden `project-slug-chip` element, but
Android's accessibility framework filters out invisible elements
(opacity 0, height 0, off-screen), so the chip was unreachable from
Maestro's hierarchy snapshot. Tapping by visible name avoids the
testID-injection workaround entirely.

**Report numbers are not hard-coded.** `app.projects.next_report_number`
is a monotonic per-project counter (it does **not** reset when reports
are deleted), so the first report created inside a journey run may be
report `1`, `2`, or higher depending on prior CRUD activity. Modules
07–12 select report rows and their detail views with wildcard testIDs
— `report-row-.*`, `report-view-.*`, `report-summary-.*`,
`report-title-.*` — and capture the actual number via Maestro
`evalScript` / `output.REPORT_NUMBER` rather than asserting on `'1'`.
Any new module that touches a report must follow the same pattern; a
hard-coded `report-row-1` will pass on a clean stack and break the
moment 13-projects-delete or a prior run bumps the counter.

### 3.2.1 Below-the-fold pattern — `scrollUntilVisible`, not `assertVisible`

Android's accessibility export inside a `ScrollView` (or `FlatList`)
only includes descendants that are currently laid out within the
visible region. Elements below the fold are absent from the
hierarchy snapshot Maestro sees, so `assertVisible: { id: "x" }`
fails with "element not found" even though the element is mounted
and would render if scrolled into view.

The fix used throughout the journey is `scrollUntilVisible` with
`direction: DOWN` and the same `id:` selector. See module 12's
`debug-prompt` and `debug-report-notes` assertions, which mirror
the pre-existing pattern used for `debug-llm-response` on the same
screen. Apply this anywhere a list, debug panel, or detail screen
extends past one screen height — the journey's flakiest assertions
during bring-up were all bare `assertVisible` calls on content that
happened to render below the device's visible area.

### 3.2.2 Unfinalize round-trip — no auto-navigation

`onConfirmUnfinalize` in
`apps/mobile/app/(app)/projects/[project]/reports/[number]/index.tsx`
(`handleConfirmUnfinalize`, ~line 189) calls the unfinalize mutation
and updates query state, but **does not navigate**. The user (or
Maestro) stays on the saved-report screen after the mutation
resolves. To exercise the finalize → unfinalize → re-finalize
round-trip, module 11 walks back manually: `btn-back` to the reports
list, tap the same `report-row-.*` to re-open the draft on
`/generate`, then assert `btn-finalize-report` re-renders. Adding an
implicit `router.push` to that handler is a behaviour change, not a
test-only fix — keep the walk-back in the module.

### 3.3 testID inventory (required additions)

Maestro asserts by `testID` (Pitfall: text-based selectors break on
copy tweaks). The journey requires the following testIDs to exist —
add them in the **screen** files in the same commit as the
corresponding module flow:

| testID | Screen / component | Used by |
|---|---|---|
| `btn-new-project` | `projects-list.tsx` | 02 |
| `input-project-name` | `project-new.tsx` | 02 |
| `btn-save-project` | `project-new.tsx`, `project-edit.tsx` | 02 |
| `btn-project-edit` | `project-home.tsx` | 02 |
| `btn-project-delete` | `project-edit.tsx` | 13 |
| `confirm-delete-project` | `AppDialogSheet` destructive confirm | 13 |
| `link-project-members` | `project-home.tsx` | 03 |
| `input-member-phone` | `project-members.tsx` AddMemberForm | 03 |
| `picker-member-role` | `project-members.tsx` | 03, 05 |
| `btn-add-member` | `project-members.tsx` | 03 |
| `member-row-${userId}` | `project-members.tsx` | 03, 05, 06 |
| `btn-remove-member-${userId}` | `project-members.tsx` | 06 |
| `confirm-remove-member` | `AppDialogSheet` destructive confirm | 06 |
| `member-role-badge-${userId}` | `project-members.tsx` | 04, 05 |
| `btn-new-report` | `reports-list.tsx` | 07 |
| `btn-report-delete` | `saved-report.tsx` actions menu | 07 |
| `report-row-${number}` | `reports-list.tsx` | 07–12 |
| `tab-notes` / `tab-report` / `tab-edit` | `GenerateReportTabBar` | 08–12 |
| `input-text-note` | `GenerateReportInputBar` | 08 |
| `btn-send-text-note` | `GenerateReportInputBar` | 08 |
| `note-row-${noteId}` | `NoteTimeline` | 08 |
| `btn-delete-note-${noteId}` | `NoteTimeline` long-press menu | 08 |
| `btn-generate-report` | `GenerateReportActionRow` | 11 |
| `btn-finalize-report` | `GenerateReportActionRow` | 11 |
| `confirm-finalize` | `AppDialogSheet` | 11 |
| `btn-unfinalize-report` | `saved-report.tsx` actions menu | 11 |
| `report-view-${number}` | `ReportView` | 11, 12 |
| `report-title-${number}` | `ReportView` heading | 11 |
| `report-summary-${number}` | `SummarySectionCard` body | 11 — **currently dead, do not assert.** The testID is gated on `report.report.meta.summary` at `apps/mobile/components/reports/ReportView.tsx:40`, but the wire schema in `packages/api-contract/src/schemas/reports.ts` does not include a `meta.summary` field — the AI fixture returns `summarySections` instead. Until either the schema converges with `meta.summary` or `ReportView.tsx` is changed to always render the testID (e.g. against the joined `summarySections` text), this selector resolves to a non-existent element. |
| `btn-open-report-debug` | `saved-report.tsx` actions menu (dev section only) | 12 |
| `debug-prompt` | `report-debug.tsx` | 12 |
| `debug-report-notes` | `report-debug.tsx` | 12 |
| `debug-llm-response` | `report-debug.tsx` | 12 |
| `debug-empty-state` | `report-debug.tsx` | 12 (carve-out fallback) |

The CI gate `scripts/check-maestro-testids.sh` (new — see
implementation checklist) greps the modules for `id:` selectors and
fails if any are unreferenced in `apps/mobile/screens/**` or
`apps/mobile/components/**`.

### 3.4 New product surface — Report Debug screen

The user-stated requirement "In the debug page, there are correct
values for the prompt, for the report notes, and for the response
from the LLM" requires a surface that does not currently exist.

**Decision:** ship `screens/report-debug.tsx` + route at
`app/(app)/projects/[project]/reports/[number]/debug.tsx`, gated by
the same `showDeveloperSection` flag (`DEV_TOOLS_VISIBLE` /
`EXPO_PUBLIC_USE_FIXTURES`) that already controls the Profile
developer section. Reached via a new "Report Debug" entry in
`ReportActionsMenu` that only renders when the flag is on.

API contract (new): `GET /reports/{number}/debug` →
```ts
{
  prompt: { system: string; user: string };
  notes: Array<{ id: NoteId; kind: NoteKind; body: string; createdAt: string }>;
  lastGeneration: {
    requestedAt: string;
    finishedAt: string | null;
    vendor: AiVendor;
    model: string;
    fixtureMode: 'live' | 'replay' | 'record';
    response: string;            // raw text from the LLM
    usage: { inputTokens; outputTokens; cachedTokens? };
  } | null;
}
```

RLS: same scope as `GET /reports/{number}` (project member).
Pitfall 6 scope-test trio: owner reads own, non-member 404, viewer
reads own (debug is not edit). Fixture replay: the existing
`generate-report.*` fixtures already capture prompt + response;
expose them through the route — no new fixture flavour needed.

The debug screen is read-only — no mutations, no PII redaction
needed beyond what `notes.body` already carries (notes are user
content, surfaced verbatim by design).

### 3.5 Fixture-mode invariants the journey relies on (local mode)

- LLM calls answered by `packages/ai-fixtures` in replay mode
  ([arch-ai-fixtures.md](arch-ai-fixtures.md)).
- R2 PUTs answered by the local R2 fixture
  ([arch-storage.md](arch-storage.md) `fixture mode`).
- OTP answered by the fixture verifier accepting `000000` for the
  two fixture phones (§3.1).

If any of those default wirings break, the journey breaks first —
that is the Pitfall 13 contract.

### 3.6 Per-module exit assertions (excerpt)

```yaml
# 04-members-permissions.yaml — bob (editor) sees project + can edit
- runFlow: helpers/sign-in-bob.yaml
- assertVisible:
    text: "Regression Test Project \\(Edited\\)"
- tapOn:
    text: "Regression Test Project \\(Edited\\)"
- assertVisible:
    id: "btn-project-edit"                # editor can edit
- assertNotVisible:
    id: "btn-add-member"                  # editor cannot manage members
- assertNotVisible:
    id: "btn-project-delete"
```

```yaml
# 05-members-viewer.yaml — alice downgrades bob; bob sees no edit
- runFlow: helpers/sign-in-alice.yaml
- ... # tap role picker on member-row, choose viewer
- assertVisible:
    id: "member-role-badge-${BOB_USER_ID}"
    text: "viewer"
- runFlow: helpers/sign-out.yaml
- runFlow: helpers/sign-in-bob.yaml
- tapOn:
    text: "Regression Test Project \\(Edited\\)"
- assertNotVisible:
    id: "btn-project-edit"
- assertNotVisible:
    id: "btn-new-report"
- assertNotVisible:
    id: "tab-edit"                        # viewer cannot reach edit tab on draft
```

```yaml
# 12-report-debug.yaml
- assertVisible:
    id: "debug-prompt"
- assertVisible:
    id: "debug-report-notes"
- assertVisible:
    id: "debug-llm-response"
# spot-check that the debug page shows the SAME report number we generated
- assertVisible:
    id: "debug-prompt"
    text: ".*${REPORT_NUMBER}.*"          # regex form
```

### 3.7 CI integration

- New workflow `.github/workflows/e2e-maestro-regression.yml`
  triggered on push to `main` + `dev` + nightly cron. Runs on
  `macos-14` for iOS sim and `ubuntu-22.04` for Android emu (matrix).
- `MAESTRO_APP_ID` is read from env, not hardcoded (Pitfall 9).
- Two matrix dimensions: `mode = {local-fixtures, dev-deployment}`.
  See §6 for what differs between them.
- Artifacts: Maestro screen recording per module on failure, full
  device log uploaded.
- The existing P3 `core-end-to-end.yaml` keeps running as a PR-time
  smoke check (faster, narrower). The regression journey is **not**
  required on every PR — it runs on `main`/`dev` push and nightly,
  and gates `v0.4.0-hardening` tag.

---

## 4. Implementation checklist

One bullet ≈ one commit. Land in this order; each module is gated by
the testIDs + product surfaces it depends on.

1. `feat(api): GET /reports/{number}/debug + scope-test trio + fixture-replay test` — §3.4 route, Pitfall 6 + Pitfall 13. Returns text notes only in initial cut; voice transcript/summary fields are tracked after the core voice-note E2E path is stable.
2. `feat(mobile): Report Debug screen + actions-menu entry behind showDeveloperSection` — `screens/report-debug.tsx`, `app/(app)/projects/[project]/reports/[number]/debug.tsx`, Vitest cases.
3. `chore(mobile): testID audit — add testIDs from §3.3 to screens + components` — touches the 20+ files in the inventory; pure additive, no behaviour change.
4. `feat(mobile): hidden project-slug + bob-user-id chips in dev/fixture builds` — header `Text testID` only mounted when `EXPO_PUBLIC_USE_FIXTURES` or `__DEV__`.
5. ~~`feat(api): test-account allowlist + magic-OTP backdoor`~~ — **dropped.** No magic OTP backdoor. Local mode uses the existing fake-Twilio path (`TWILIO_LIVE=0` → accepts `TWILIO_VERIFY_FAKE_CODE=000000`), while dev-deployment mode uses the narrower `POST /auth/password/verify` test-account bypass that is already gated by Doppler `dev` secrets.
6. ~~`chore(infra): seed cli command + Doppler dev wiring`~~ — **replaced.** Local mode signs Alice and Bob up via the normal mobile sign-up UI (modules `01-auth.yaml` and `01b-signup-bob.yaml`) and resets with `docker compose down -v`. Dev mode must use allowlisted test accounts and per-run cleanup without truncating the shared dev DB.
7. `test(mobile): .maestro/helpers/{sign-in-alice,sign-in-bob,sign-out,open-project}.yaml` — shared building blocks. No teardown helper: state reset is `docker compose down -v` locally.
8. `test(mobile): .maestro/modules/01-auth.yaml + 02-projects-crud.yaml`.
9. `test(mobile): .maestro/modules/03-members-invite.yaml + 04-members-permissions.yaml + 05-members-viewer.yaml + 06-members-remove.yaml`.
10. `test(mobile): .maestro/modules/07-reports-crud.yaml + 08-text-notes.yaml`.
11. `test(mobile): .maestro/modules/11-generate-finalize.yaml + 12-report-debug.yaml + 13-projects-delete.yaml`.
12. `test(mobile): .maestro/regression-journey.yaml + scripts/check-maestro-testids.sh` — top-level runner + CI grep gate.
13. `chore(ci): e2e-maestro-regression.yml workflow (iOS sim + Android emu matrix, local-fixtures + dev-deployment modes, MAESTRO_APP_ID from env)` — Pitfall 9.
14. `docs(v4): tick P4.8 checklist + cross-link from plan-p4-hardening.md`.

Future commits / goals (queued in [§7](#7-future-modules-pickup-pointers)):

- F1. `test(mobile): fully harden .maestro/modules/09-voice-notes.yaml` — landed and re-enabled in the regression journey.
- F2. `test(mobile): .maestro/modules/10a-photo-notes-draft.yaml` — landed for the photo upload redesign: attachment sheet → camera → two-tile batch → generated report photos → preview → delete.
- F3. `test(mobile): .maestro/modules/10b-photo-notes-finalized.yaml` — after `ReportPhotos` signed-URL wiring lands on the redesigned photo surface.
- F4. `feat(api): extend /reports/{n}/debug with voice transcript+summary columns` — after the debug payload and UI expose voice-specific fields.

---

## 5. Open questions / carve-outs

| ID | Question / carve-out | Resolution / owner |
|---|---|---|
| Q1 | Where does this land in the plan tree? | New section **P4.8 — Maestro full regression** in [`plan-p4-hardening.md`](plan-p4-hardening.md). |
| Q2 | Does the regression journey replace `core-end-to-end.yaml`? | No. `core-end-to-end.yaml` stays as the PR-time smoke flow (≈2 min). The regression journey is the nightly/release gate (≈10 min sans voice/photo, ≈15 min with). |
| Q3 | How do test accounts get into the `dev` deployment? | Use the existing `POST /auth/password/verify` test-account password bypass, gated by `TEST_ACCOUNT_PHONES` + `TEST_ACCOUNT_PASSWORD` in Doppler `dev`. This avoids magic OTP and real SMS while reusing the normal session/JWT path. Maestro still needs a non-production login helper or setup hook that can use this endpoint. |
| Q4 | Universal-links cold-tap coverage | Stays in [P4.6](plan-p4-hardening.md#p46-universal-links). |
| Q5 | Token-event timeline (`GET /me/usage/events`) | Out of scope — stays in [P3.15.5](plan-p3-feature-build.md#p3155--llm-token-accounting) follow-up. |
| Q6 | Android emu LLM-fixture network surface (local mode) | Verify Android emu can reach the loopback fixture server (`10.0.2.2:<port>`). Surface in step 13. |
| Q7 | Voice + photo carve-outs — where do they re-enter? | [§7](#7-future-modules-pickup-pointers). Tracked here, not silently deferred. |
| Q8 | Dev mode runs against real LLMs — cost? | `dev` API uses real vendor keys with cost caps in Doppler `dev`. The regression journey runs nightly only on `dev` mode (1×/day × short fixture-friendly prompts) — estimated <$0.05/run. If cost becomes a concern, switch dev-mode to point at fixture-replay too (set `AI_FIXTURE_MODE=replay` on the dev Fly machine for the run window). |

---

## 6. Running modes — local vs dev deployment

The journey is designed to run in two modes with the same coverage
target. The local mode runs first for deterministic debugging; the dev
deployment mode runs second to prove deployed API, Neon, R2, auth, and
AI wiring.

### 6.1 Mode A — Local fixtures (the default)

- Build: `pnpm ios:mock` (`EXPO_PUBLIC_USE_FIXTURES=true`).
- API: in-process or local Fly proxy at `http://localhost:8787`,
  `AI_FIXTURE_MODE=replay`, R2 fixture, Twilio fixture verifier
  accepting `000000` for any phone.
- DB: Testcontainers Postgres or a local Neon branch wiped before
  the run.
- No network egress; reproducible.
- Used by every developer locally and by the PR-preview CI matrix.

### 6.2 Mode B — Dev deployment

After the full local run passes, run the same E2E coverage against
the development deployment:

- API: `https://harpa-pro-api-dev.fly.dev` (`harpa-pro-api-dev`).
- DB/storage: Neon `dev` branch + `harpa-pro-dev` R2 bucket.
- Mobile: preview/development app variant (`com.harpa.pro.dev`)
  pointed at the dev API, either via compile-time
  `EXPO_PUBLIC_API_URL` or the non-production API base URL override.
- Auth: test-account password bypass (`POST /auth/password/verify`),
  not fake OTP and not real SMS. Requires the dev Fly app to have
  `TEST_ACCOUNT_PHONES` and `TEST_ACCOUNT_PASSWORD` configured from
  Doppler `dev`. Local Maestro runs should keep that shared password
  in a CLI broker process, not in Maestro env/input values, because
  Maestro logs evaluated commands.
- Data: use allowlisted Alice/Bob test accounts and create unique
  per-run project/report names, then clean them up in-flow. Do not
  truncate the shared dev DB as part of a normal E2E run.
- AI: dev deployment settings. If `AI_LIVE=1`, this is a live-provider
  smoke; if dev is temporarily pointed at fixture replay, the run
  still proves deployed API/auth/storage/DB wiring.
- Android device bridge: use a local API proxy and R2 proxy when the
  device cannot reach public dev/R2 endpoints directly. The API proxy
  forwards to `harpa-pro-api-dev` and rewrites signed R2 URLs to the
  local R2 proxy, which forwards the original signed requests.

Open implementation work:

- Fold the local dev helpers/proxies into the future `mo journey`
  target so users do not need to start them manually.
- Teach `mo journey` / `mo run` a `--target dev` mode that skips local
  DB truncation, points the app at `harpa-pro-api-dev`, and uses the
  password-login helper.
- Keep the sequencing strict: local backend must pass before running
  against dev.

---

## 7. Future modules — pickup pointers

These slots are reserved in the module numbering and **must be
filled** when the underlying feature lands on `dev`. Each row owns a
clear merge-trigger so we don't drift back into Pitfall 4.

| Slot | Module | Trigger to add | Tracking |
|---|---|---|---|
| 09 | `09-voice-notes.yaml` — fixture recording + upload + transcribe + summarize + title + transcript sheet + playback entry point + delete | Voice-note E2E hardening landed on `dev` | Re-enabled in `regression-journey.yaml`; passed local Android regression before module 10a work. |
| 10a | `10a-photo-notes-draft.yaml` — `btn-attachment` → camera → Done → two-tile photo row appears on Notes timeline → generate → Report tab photo strip → preview → delete | Photo upload UI redesign landed on `dev` (`5173049`) | Re-enabled in `regression-journey.yaml`; passed focused local Android, full local regression, and clean full dev-deployment regression on 2026-05-28. |
| 10b | `10b-photo-notes-finalized.yaml` — open finalized report → ReportPhotos block renders → ImagePreviewModal opens via signed URL | Add a photo-bearing finalized-report path after the draft-side upload lifecycle | Added to local/dev journeys after module 10a; passed focused local Android, full local regression, and clean full dev-deployment regression on 2026-05-28. |
| 12a | `12-report-debug.yaml` voice fields | Add `voiceTranscripts` + `voiceSummaries` arrays to `GET /reports/{n}/debug` and to the debug screen | Bundled with F4 in §4 after the debug payload expands. |
| 14 | `14-avatar-upload.yaml` | Avatar upload needs its own camera-roll/R2 assertions | Add to P4 list as a separate upload-pipeline follow-up. |

If a feature lands on `dev` but its module is **not** added in the
same PR, the PR is blocked. The merge-checklist for any branch in
the table above must include "added Maestro module from
design-maestro-full-regression.md §7".

---

## 8. Open scope — uncovered routes and flows

Routes and flows that currently render in the app but are **not**
asserted by `regression-journey.yaml`. Each is a candidate for a
follow-up module; flagged here so we don't lose track of the gap
between "the journey is green" and "the app is covered".

- `apps/mobile/app/(app)/account.tsx` — account screen (settings,
  sign-out trigger, destructive actions). Sign-out is exercised
  indirectly via `helpers/sign-out.yaml`, but the rest of the screen
  is unasserted.
- `apps/mobile/app/(app)/usage.tsx` — token-usage screen. No
  module touches it; the `/me/usage/events` endpoint is also out of
  scope (Q5).
- `apps/mobile/app/(app)/profile.tsx` — profile screen, including
  display-name edits, avatar (if/when `AvatarUploader` lands per
  carve-out), and the dev-section toggles that gate the report-debug
  entry asserted in module 12. The journey reaches the developer
  section indirectly (the entry only renders behind
  `EXPO_PUBLIC_USE_FIXTURES`) but does not assert profile edits.
- Voice notes — module `09` now covers recording, upload, transcribe,
  summarize, title, transcript viewing, playback entry point, and
  delete. Remaining voice coverage is the saved-report/debug surface
  once the debug payload exposes voice transcript/summary fields.
- Image / photo uploads — module `10a` covers the landed draft-side
  photo lifecycle around `attachments[]` and per-tile state. Module
  `10b` covers finalized saved-report photos and preview by fileId.

These do not block the P4.8 exit gate — they are tracked as future
modules and will land alongside their feature work or as targeted
hardening PRs.

---

## 9. Pitfalls catalogue

Windows-host + real-device Maestro gotchas hit while bringing this
journey to green (process management, `evalScript` outputs,
`scrollUntilVisible`, ADB reverse-port, fixture-mode quirks) are
documented in
[`pitfalls-maestro-windows.md`](pitfalls-maestro-windows.md). Read
it before debugging a fresh journey failure on this host.
