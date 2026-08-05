# Auto-Regenerate Reports — Design

Status: ✅ Shipped. Live architecture lives in
[`docs/v4/arch-report-auto-regen.md`](../../v4/arch-report-auto-regen.md);
this spec is retained as the original design rationale.
Date: 2026-05-28
Scope: `apps/mobile`, `packages/api`, `packages/api-contract`

## Problem

The Report tab on the generate screen shows AI-generated output from a
report's notes. Today the user must tap **Regenerate** every time notes
change. We want regeneration to happen automatically whenever the
report's source of truth (its notes) changes, persist that "needs
regen" state across app restarts (so reopening the app does not
re-trigger work that was already done), and stay out of the way of
manual edits made in the developer-only Edit tab.

## Goals

- Auto-regenerate whenever notes are added, deleted, or edited.
- Persist the "needs regen" signal in the database so app restarts do
  not re-fire generation for work already done.
- Do not regenerate when the only change is a manual edit to the
  report body (Edit tab) — manual edits are accepted as-is until the
  next note change.
- Survive bursts and the in-flight race so the latest note state
  always wins without thrashing.
- Stop on error so a broken provider or a usage-cap hit does not loop
  silently against the user's quota.

## Non-goals

- Prompt tuning so the LLM preserves manual edits across auto-regens
  (the regenerate path already forwards `existingBody`; tuning is a
  separate effort).
- Debounce / batching of bursts.
- A "pending updates" count badge in the UI.

## Current state

- `reports.notes_since_last_generation int` (incremented on add-note
  for text and voice notes only; reset to `0` on (re)generate).
- `runGenerate` (`packages/api/src/routes/reports.ts`) handles both
  the cold start (`mode: 'generate'`) and the update case
  (`mode: 'regenerate'`, which forwards `existingBody`).
- Mobile route `apps/mobile/app/(app)/projects/[project]/reports/[number]/generate.tsx`
  reads `notesSinceLastGeneration` and exposes a manual
  `handleRegenerate`. There is no automatic trigger.
- The autosave path uses a `userDirty` boolean to decide when to
  PATCH the body, kept separate from the counter — manual edits
  already do not bump it.

## Why the counter is wrong

A simple counter cannot model what we need:

1. **Edits double-count.** Editing the same note five times would
   bump it `+5`, but the AI-relevant change is "one note differs."
2. **Deletes break the noun.** After add 3 → regen → delete 2, the
   counter reads `2` but there are _fewer_ notes than the AI last
   saw — "notes since last generation" no longer matches reality.
3. **Race-unsafe.** `runGenerate` resets the counter to `0`
   unconditionally on save. A bump that happens _during_ the AI
   call is clobbered by the reset, so the follow-up regen never
   fires.
4. **The check is binary, not a count.** The client only needs to
   know "does the source of truth differ from what was last
   generated?"

## Design — dirty timestamp pair

Replace the counter with a timestamp pair already half-present in the
schema:

- `reports.generated_at timestamptz` — already exists, set when an
  AI generation lands.
- `reports.notes_changed_at timestamptz` — new column, set to `now()`
  on any note add, delete, or edit.

Derived flag exposed to the client:

```
needsRegeneration =
  notes_changed_at IS NOT NULL
  AND (generated_at IS NULL OR notes_changed_at > generated_at)
```

### Race safety

`runGenerate` captures `snapshotTs := report.notes_changed_at`
_before_ the AI call. On save, set
`generated_at = COALESCE(snapshotTs, now())`. `generated_at` then
records _the snapshot of notes we synthesized from_ — not the
wall-clock save time. If a note bump fires during the in-flight
AI run, `notes_changed_at` becomes `> snapshotTs == generated_at`,
the comparison stays dirty, and the queue-of-one fires another
regen. No extra state machine needed.

Using `now()` instead (or `GREATEST(now(), snapshotTs)`) would
silently lose that signal: `now()` at save time is strictly later
than any bump that landed during the multi-second AI call, so
`notes_changed_at < generated_at` and the dirty bit evaporates.

### Manual edits

Edit-tab changes go through `useReportBodyAutosave`, which PATCHes
`reports.body` only. The autosave path does not touch
`notes_changed_at`. Manual edits therefore never set
`needsRegeneration` to true.

The trade-off (accepted): when a note change _does_ fire an
auto-regen, the regenerate path forwards `existingBody` to the AI,
which is prompt-instructed to preserve manual edits. Whether that
prompt is good enough is out of scope; for now the user has
explicitly accepted "new notes may override manual edits" because the
Edit tab is dev-only.

### Finalized reports

The bump helper is a no-op when `status = 'finalized'`. Finalized
reports never auto-regenerate.

## Server changes

### Migration

**Expand step only — contract/drop cleanup is deferred to a later release.**

Following the expand-contract rules in
[`docs/v4/arch-cicd-and-migrations.md §Expand-contract rules`](../../v4/arch-cicd-and-migrations.md):

**PR A (this commit):**

1. `ALTER TABLE app.reports ADD COLUMN notes_changed_at timestamptz` — nullable;
   existing rows remain `NULL`.

`notes_since_last_generation` is intentionally kept. Both columns coexist so
any machine still running the previous image can read and write the counter
without error during a rolling deploy. New code dual-writes both columns (see
`packages/api/src/services/notes.ts`).

**Later release — contract/drop migration:**

Once every running machine has been replaced by code that dual-writes
`notes_changed_at`, a follow-up migration will:

2. Backfill rows where the counter was > 0 and `notes_changed_at` is still NULL:
   ```sql
   UPDATE app.reports
      SET notes_changed_at = updated_at
    WHERE notes_since_last_generation > 0
      AND notes_changed_at IS NULL;
   ```
3. `ALTER TABLE app.reports DROP COLUMN notes_since_last_generation`.

### `packages/api/src/services/notes.ts`

Add an internal helper:

```ts
async function bumpNotesChangedAt(db: Db, reportId: string) {
  await db.execute(sql`
    UPDATE app.reports
       SET notes_changed_at = now(),
           updated_at       = now()
     WHERE id = ${reportId}
       AND status = 'draft'
  `);
}
```

Call it from:

- `createTextNote`
- `createVoiceNote`
- `createPhotoNote` / batch photo creation
- `createDocumentNote`
- `updateNote` (body / title / summary / transcript edits)
- `deleteNote`

**Dual-write during the expand window.** Do NOT remove the existing
`notes_since_last_generation = notes_since_last_generation + 1`
updates. Both writes coexist until the contract PR drops the counter.
Old machines reading only the counter still see a correct value; new
machines compute `needsRegeneration` from `notes_changed_at` first
and fall back to the counter for rows not yet migrated.

Caption updates on `note_files` do not yet have a route. When/if one
is added it must call this helper too — leave a TODO at the helper
definition so it is not forgotten.

### `packages/api/src/services/reports.ts`

- `ReportSummary` gains `needsRegeneration: boolean`, computed via a
  **dual-read** during the expand window: `notes_changed_at` is
  authoritative when set; for rows not yet touched by new code (where
  `notes_changed_at` is still `NULL`) fall back to
  `notes_since_last_generation > 0`.

  ```
  needsRegeneration =
    (notes_changed_at IS NOT NULL
      AND (generated_at IS NULL OR notes_changed_at > generated_at))
    OR (notes_changed_at IS NULL AND notes_since_last_generation > 0)
  ```

- Keep the `notes_since_last_generation` column in all SELECTs and in
  the mapper for the duration of the expand window. The contract PR
  removes it.
- `runGenerate` / `setReportBody`:
  - Capture `snapshotTs = report.notes_changed_at` before the AI
    call.
  - On save: `generated_at = COALESCE(${snapshotTs}, now())`. The
    timestamp records the snapshot we synthesized FROM, not the
    save time, so a bump landing during the AI call keeps
    `notes_changed_at > generated_at` and the dirty bit survives
    (see "Race safety" above). Fallback to `now()` covers first-
    time generates and the manual-edit code path, neither of which
    has a snapshot to race against.
  - Do **not** modify `notes_changed_at` on generate. The dirty
    check is purely the comparison.
  - **Dual-write the clean state.** Also keep
    `notes_since_last_generation = 0` in the `UPDATE` so machines
    still reading the legacy counter see clean state during the
    expand window.

### Contract

- `packages/api-contract/openapi.json` schemas that include
  `notesSinceLastGeneration` lose that field and gain
  `needsRegeneration: boolean`.
- Regenerate `packages/api-contract/src/generated/types.ts` via the
  existing codegen.

## Mobile changes

### New hook — `apps/mobile/features/generate/useAutoRegenerate.ts`

```ts
export function useAutoRegenerate(input: {
  needsRegeneration: boolean;
  status: 'draft' | 'finalized';
  isGenerating: boolean;
  generationError: string | null;
  onRegenerate: () => void;
}) {
  const { needsRegeneration, status, isGenerating, generationError, onRegenerate } = input;
  useEffect(() => {
    if (!needsRegeneration) return;
    if (status !== 'draft') return;
    if (isGenerating) return;
    if (generationError) return;
    onRegenerate();
  }, [needsRegeneration, status, isGenerating, generationError, onRegenerate]);
}
```

Queue-of-one is implicit: `onRegenerate`'s `onSuccess` invalidates the
report query, the refetch updates `needsRegeneration`, and if the
flag is still true the effect fires again exactly once.

Error gate: once `generationError` is set, the effect blocks. The
existing manual **Regenerate** button already clears the error before
calling the mutation, so the user resumes the loop by tapping it.
Finalized reports never enter the gate.

### Route wiring — `app/(app)/projects/[project]/reports/[number]/generate.tsx`

- Replace `notesSinceLastGeneration` reads with `needsRegeneration`.
- Call `useAutoRegenerate({ … onRegenerate: handleRegenerate })`.
- Pass `needsRegeneration` (and drop `notesSinceLastGeneration`)
  through `GenerateReportProvider` props.

### Provider / UI

- `GenerateReportProvider` swaps the prop name.
- `ReportTabPane` pill copy changes from "{n} notes since last
  generation" to "Updates pending" (boolean-driven).
- A count badge is deferred.

## Tests

### API integration (`packages/api/src/__tests__/`)

- Adding a note bumps `notes_changed_at`; `needsRegeneration` flips
  true. (Replaces the existing counter test.)
- Deleting a note bumps it.
- Updating a text-note body bumps it.
- Updating a voice-note transcript / title / summary bumps it.
- Generate clears the dirty bit (`generated_at` set, comparison
  becomes false).
- Race: simulate a bump _between_ the snapshot capture and the save
  by setting `notes_changed_at` directly with a SQL UPDATE between
  the two AI-fixture calls. Assert `needsRegeneration` remains true
  after the save returns.
- Finalized reports: `bumpNotesChangedAt` is a no-op; updates to
  notes on a finalized report do not flip the flag (in practice the
  routes reject mutations on finalized reports — the helper should
  still be guarded as defence in depth).

### Mobile unit (`apps/mobile/features/generate/`)

- `useAutoRegenerate` fires when `needsRegeneration` flips true.
- Does not fire while `isGenerating`.
- Does not fire while `generationError` is set.
- Resumes after `generationError` clears.
- Does not fire for `status: 'finalized'`.
- Queue-of-one: after the in-flight regen resolves and the flag is
  still true, fires exactly one more time.

### Default-wiring rule

Per AGENTS.md hard rule #5, the route-level integration test for
`generate.tsx` must exercise the real `useAutoRegenerate` hook against
a real (fixture-backed) generate mutation. The current
`generate-report-tab.test.tsx` is the natural home — add an
"auto-regenerates when notesChangedAt > generatedAt" case there. DI
stubs of the hook are not allowed as the only coverage.

## Docs

- New doc `docs/v4/arch-report-auto-regen.md` describing the
  timestamp-pair model and the race-safety argument.
- Update `docs/v4/pitfalls.md` with the "don't model dirty state as a
  counter" lesson (deletes and edits make the noun lie; resets are
  race-unsafe).
- Update any plan checkboxes that referenced
  `notesSinceLastGeneration`.

## Out of scope (follow-ups)

- LLM prompt tuning to preserve manual edits across auto-regens.
- A debounce / batching strategy for note bursts.
- A pending-count badge in the Report tab.
- A separate "auto-regen disabled" developer toggle.

## Risks

- **Race-test flakiness.** The race assertion relies on injecting a
  bump between snapshot and save; doing this deterministically
  requires either a controllable AI fixture hook or direct SQL
  between calls. Keep it as the latter to avoid fixture-engine
  coupling.
- **Quota burn during E2E.** Maestro flows that add multiple notes
  on a draft report will now trigger multiple AI calls. Either set
  the test account's monthly cap high, run the flow against fixture
  mode, or finalize the report at the end of the flow so additional
  bumps stop. Decide per flow.
