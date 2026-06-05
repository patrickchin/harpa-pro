# Design — Manual photo-group placement into report sections

> Status: design (not yet implemented). Targets a single PR worth of
> work, default-on once shipped (no feature flag).

Cross-links:
- Builds on [arch-batch-photo-notes.md](arch-batch-photo-notes.md)
  (`note_files`, `noteId` grouping).
- Touches the report renderer covered by
  [arch-mobile.md](arch-mobile.md) and the schema docs in
  [arch-database.md](arch-database.md).
- Auth/scope rules per [arch-auth-and-rls.md](arch-auth-and-rls.md).

## Problem

LLMs cannot see photos and have no context to weave them into the
generated report. Today, every photo group (one batch upload =
one `app.notes` row, possibly N `app.note_files` rows) renders in
a single bottom-of-screen "Photos" card on the saved-report screen
(`apps/mobile/components/reports/detail/ReportPhotos.tsx`),
regardless of which issue or section it relates to. The user has no
way to bind a photo group to the issue/section it documents.

We need a simple, one-handed UI that lets an editor place each
**photo group** (note) into:

- a specific **issue** (by stable handle into `report.issues[]`), or
- a specific **detailed section** (by stable handle into
  `report.sections[]`), or
- nowhere — falls back to the bottom Photos card.

A note has at most one placement target. Multiple notes may map
to the same issue/section.

## Acceptance contract

1. On a saved report (draft or finalised), every photo note shows a
   "Place in…" affordance. Tapping it opens an `AppDialogSheet`
   listing all issues then all detailed sections by title; tapping
   a row sets that group's placement.
2. Once placed, the group renders inline at the bottom of the
   target `IssuesCard` row or `SummarySectionCard`, using the same
   3-column tile grid as `ReportPhotos`. A "Move" affordance opens
   the same sheet pre-selected on the current target with an extra
   "Remove from this section" row.
3. The bottom `ReportPhotos` card filters out placed groups; if all
   groups are placed it returns null.
4. Placement persists across draft → finalised transitions and
   across regenerations.
5. If the targeted issue/section disappears (issues/sections array
   shrinks below the stored handle), the group reverts to unplaced
   (rendered in the bottom card). No data loss in `app.notes`; only
   the placement column is cleared.
6. Read-only members (non-editor project roles) see placements but
   cannot mutate them (same rule as note-delete; see
   [arch-project-members.md](arch-project-members.md)).

## Canonical-source files

- `apps/mobile/components/reports/ReportView.tsx`
- `apps/mobile/components/reports/IssuesCard.tsx`
- `apps/mobile/components/reports/SummarySectionCard.tsx`
- `apps/mobile/components/reports/detail/ReportPhotos.tsx`
- `apps/mobile/components/reports/detail/ReportNotesPane.tsx`
  (`ReportNoteRow` shape — adds `placement` field)
- `apps/mobile/screens/saved-report.tsx` (the wiring site, ~L427)
- `packages/api/src/{routes,services}/notes.ts`
- `packages/api/src/db/schema.ts` (`notes` table)
- `packages/api-contract/src/notes.ts` (Zod)
- `packages/report-core/src/generated-report.ts`
  (`GeneratedSiteReport` — read-only consumer; not changed)

## Alternatives considered

### A. Drag-and-drop tiles between cards
Rejected. Heavy gesture conflicts inside a `ScrollView`; not
one-handed friendly; and Maestro can't drive a long-press-drag-drop
across cards reliably enough to gate the feature on E2E.

### B. Multi-select + "Move N" toolbar
Rejected for v1. Bulk move adds modal state and a selection mode
that has no other use yet. Easy to add later because the underlying
mutation is per-note already.

### C. Per-group "Place in…" chip → bottom-sheet picker (chosen)
Tap-target only, no gestures, identical interaction whether the
group is unplaced or already placed (single sheet handles place /
move / remove). Maps cleanly to one PATCH per tap. Maestro driver
trivial: tap → tap-row → assert.

### D. Stable handles by `index` vs. by title hash
We pick **`index` with self-healing on drift** (option D1) over a
synthetic title-hash key (option D2). Rationale:

- Issues and sections are reordered by `ReportEditForm` rarely; the
  natural drift case is "issue deleted while a note pointed at it",
  which is well-handled by clearing on read.
- Title hashes invalidate on any wording tweak (e.g. minor LLM
  re-generation), which would silently re-orphan placements far
  more often than reorder/delete.
- The expand path to title-hash later is non-destructive: change
  the `kind` enum and run a one-shot resolver.

Self-healing rule: on read, if `placement.index >= issues.length`
(resp. `sections.length`) we treat the placement as null in the
UI **and** asynchronously clear it via the same PATCH endpoint
(fire-and-forget; no user-facing error). This keeps the column
truthful without blocking render.

## Data model

### Schema change — `app.notes.placement`

Add a single nullable `jsonb` column. Expand-only migration; no
backfill needed (default is `NULL`).

```sql
-- packages/api/migrations/00NN_note_placement.sql
ALTER TABLE app.notes
  ADD COLUMN placement jsonb;

-- Shape constraint (cheap, DB-side).
ALTER TABLE app.notes
  ADD CONSTRAINT notes_placement_shape_chk
  CHECK (
    placement IS NULL
    OR (
      jsonb_typeof(placement) = 'object'
      AND placement ? 'kind'
      AND placement ? 'index'
      AND placement->>'kind' IN ('issue', 'section')
      AND jsonb_typeof(placement->'index') = 'number'
      AND (placement->>'index')::int >= 0
    )
  );
```

JSON shape (single source of truth in `api-contract`):

```ts
const placementSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('issue'),   index: z.number().int().nonnegative() }),
  z.object({ kind: z.literal('section'), index: z.number().int().nonnegative() }),
]);
export type NotePlacement = z.infer<typeof placementSchema>;
```

**Why JSONB on `notes`, not a separate `note_placements` table.**
Placement is 1:1 with `notes.id`, scoped per-report (queries already
filter by `report_id`), never queried independently, and small
(<40 bytes). A side table would add a join with no benefit.
[Pitfall 6](pitfalls.md#pitfall-6) per-request scope is unaffected:
the column rides along with the existing notes RLS policy; no new
policy required.

**Indexing.** None. Reads piggyback on the existing
`SELECT … FROM app.notes WHERE report_id = $1` path in `listNotes`.

**Stability strategy.** Placement is read with self-healing (above);
`ReportEditForm` does **not** need to know about placements. The
generator is unchanged — placement is a UI/API-only concept layered
on top of `reports.body`.

### Constraint that we are NOT adding

We deliberately do **not** scope `index` to `kind = 'image'` notes
in the DB constraint. That gate lives in the route handler (return
400 on non-image notes). Keeping the DB constraint structural-only
makes it easier to extend placement to other kinds later if we
ever want to (e.g. pinning a voice note to an issue).

## API surface

### New endpoint

```
PATCH /notes/{note}/placement
Body:    { placement: NotePlacement | null }
Returns: 200 { ...note, placement }
```

Why a sub-resource and not extending `PATCH /notes/{note}`:
- Existing `PATCH /notes/{note}` only accepts `{ body, title,
  summary }` and explicitly rejects empty patches (route line 143
  in `routes/notes.ts`). Adding an undefined-permitted field to
  the same handler muddies that contract.
- Distinct OpenAPI route makes Maestro selectors / API-CLI calls
  easier to reason about.
- 400 vs 404 semantics differ: placement targets a note that must
  be `kind='image'` AND visible under scope; a sub-resource lets
  us return a precise error envelope.

Per-request DB scope: identical to other `notes` mutations —
goes through `db((d) => updateNotePlacement(d, …))`. No new role.

Service contract:

```ts
// packages/api/src/services/notes.ts
export async function updateNotePlacement(
  db: Db,
  noteId: string,
  placement: NotePlacement | null,
): Promise<NoteRow | null>;
```

Behaviour:
- 404 if note not visible under scope.
- 400 (route layer) if note kind ≠ `image`.
- Success: writes `placement` JSONB. **Does NOT call
  `bumpNotesChangedAt`** — placement is a UI-only annotation
  (which generated card a photo group anchors to), not a content
  change to the underlying note. Bumping `notes_changed_at` would
  fire the client's auto-regenerator after every placement edit;
  the regen can reshape `issues[]` / `sections[]`, making the
  just-saved placement index out of range; the orphan-healer in
  `ReportTabPane` then clears it and the photo "reverts" to the
  unplaced grid a split second after the user placed it
  (regression caught against PR #129).
- Returns the full `NoteRow` so the optimistic mutation can patch
  the cache without re-fetching.

### Zod additions in `packages/api-contract`

- Export `placementSchema` (above) and `notePlacementUpdate` (`{
  placement: placementSchema.nullable() }`).
- Extend `noteSchemas.note` with `placement: placementSchema.nullable()`.
- Generated client gets `apiClient.notes.updatePlacement({ note,
  body })`.

### Per-request scope tests (Pitfall 6)

For the new route, two paired tests, mirroring the existing
delete-note scope tests:

1. Editor of project P can `PATCH /notes/{n}/placement` for a
   note in their own report and see the column written.
2. A user in project Q **cannot** `PATCH /notes/{n}/placement`
   for the same note — must 404 (not 401), proving the scoped
   role hides the row, not just the auth middleware.

Test must fail when `withScopedConnection` is removed from the
route — the standard pitfall-6 negative.

### Default-wiring integration test (Pitfall 13)

A single `notes.placement.integration.test.ts` that:
- Creates a project + report + image note via the **real default
  factories** (no DI stubs), against Testcontainers Postgres.
- PATCHes placement to `{ kind: 'issue', index: 0 }`.
- Re-fetches via `GET /reports/{n}/notes` (real path) and asserts
  the placement comes back through the join + Zod parse.
- Asserts `notes_changed_at` on the report is **unchanged** (see
  the placement-vs-content note above).

This proves the migration ran, Drizzle row mapping handles JSONB,
and the OpenAPI/Zod surface preserves the shape end-to-end.

## Mobile wiring

### New components

```
apps/mobile/components/reports/photo-placement/
├── PhotoGroupPlacementSheet.tsx   // AppDialogSheet body
├── PlacedPhotoGroup.tsx            // 3-col grid + "Move" chip
└── PhotoPlacementChip.tsx          // "Place in…" button
```

- `PhotoGroupPlacementSheet` — receives `issues`, `sections`,
  `currentPlacement`, `onSelect(placement | null)`. Renders two
  scroll sections ("Issues", "Detailed sections"). Sheet uses the
  shared `AppDialogSheet` primitive — **no `Alert.alert`**
  ([Pitfall 12](pitfalls.md#pitfall-12)). One row per target plus
  a "Remove from current section" row when `currentPlacement` is
  set.
- `PlacedPhotoGroup` — pure presentational: takes the same
  `attachments` list `ReportPhotos` builds, plus an `onMove`
  callback. Reuses `PhotoTile` from `@/components/notes/PhotoTile`
  so the visual is identical.
- `PhotoPlacementChip` — small icon button (lucide
  `MapPin`-style) overlaid bottom-right of the photo grid; tap
  opens the sheet.

Styling: NativeWind only ([Pitfall 3](pitfalls.md#pitfall-3)). No
hex literals in components.

### Mutation hook

```ts
// apps/mobile/lib/api/optimistic.ts
export function usePlacePhotoGroup(): UseMutationResult<…> {
  // Optimistically patch the cached `note` in the
  // `reportNotes(reportId)` query, mirroring useOptimisticDeleteNote.
  // On error: rollback + toast (NOT Alert.alert).
}
```

### `ReportView` changes

`ReportView` becomes placement-aware by accepting a single new
prop (no behaviour change when omitted — keeps it props-driven
and unit-testable per AGENTS rule about screen bodies):

```ts
interface ReportViewProps {
  report: GeneratedSiteReport;
  reportNumber?: number;
  /**
   * Photo groups already placed into issues/sections, keyed by
   * placement target. Built from notes by the parent screen.
   * When omitted, the renderer behaves exactly as today.
   */
  placedPhotoGroups?: {
    issues: Record<number, PlacedGroup>;     // index → group
    sections: Record<number, PlacedGroup>;
  };
  /** Callback to trigger the "Move" sheet for a placed group. */
  onMovePlacedGroup?: (noteId: string) => void;
}
```

`IssuesCard` and `SummarySectionCard` each gain a single optional
`placedGroup?: PlacedGroup` and `onMove?: () => void` prop.
Rendered at the bottom of the row/card with a thin top border.
When `placedGroup` is undefined the cards render exactly as today.

`saved-report.tsx` (around line 433) becomes:

```tsx
const { placedByIssue, placedBySection, unplacedRows } =
  splitPlacements(noteRows, displayReport);

<ReportView
  report={displayReport}
  reportNumber={reportNumber ?? undefined}
  placedPhotoGroups={{ issues: placedByIssue, sections: placedBySection }}
  onMovePlacedGroup={openPlacementSheetForNote}
/>
<View className="mt-4">
  <ReportPhotos
    noteRows={unplacedRows}            // <- filtered
    onOpenPhoto={handleOpenPhoto}
    onPlace={openPlacementSheetForNote} // <- new
  />
</View>
<PhotoGroupPlacementSheet
  visible={…}
  …
  onSelect={(placement) => placePhotoGroup.mutate({…})}
/>
```

`splitPlacements` is a pure helper; full unit-test coverage,
including the self-healing branch (placement points past
`issues.length`).

### testIDs for Maestro

- `btn-place-photo-{noteId}` — chip on each unplaced group.
- `btn-move-placed-photo-{noteId}` — chip on each placed group.
- `placement-sheet`, `placement-sheet-issue-{i}`,
  `placement-sheet-section-{i}`, `placement-sheet-remove`.
- `placed-group-{noteId}` — wrapper inside the issue/section card.

## Edge cases

| Case | Behaviour |
|---|---|
| Note deleted while placed | `notes` row gone → join in `listNotes` returns nothing → group disappears from card. No FK action needed. |
| All photos in a group deleted | Same as above — note row deletes. |
| Issue/section deleted from `report.body` so index out of range | Self-healing: UI ignores placement, fires `PATCH … { placement: null }`. Group reappears in bottom Photos card on next render. |
| Issue/section reordered (rare; user edits in `ReportEditForm`) | Index points at a different target. Acceptable for v1 — user can re-place with one tap. Documented as a known limitation; revisit if reorder UX lands. |
| Read-only project member | Chip not rendered (gated on the same `canEdit` flag the kebab uses for note-delete). API returns 404 for the PATCH under their scope as a defence-in-depth. |
| Finalised report | Placement still editable. Finalisation is an immutable snapshot of `reports.body`, but `notes` (incl. `placement`) is the source-of-truth side table; placing a photo on a finalised report does not regenerate, only re-binds rendering. |
| Voice / document / text note | Chip not rendered; PATCH returns 400 if attempted. |

## Test plan

- **Vitest unit (api):**
  `services/notes.placement.test.ts` — happy path, 400 on
  non-image, JSONB shape constraint round-trips, `notes_changed_at`
  bumped.
- **Vitest unit (api-contract):** placement Zod parse rejects
  unknown `kind`, negative index, missing fields.
- **Vitest scope (api):** pair test described above
  (Pitfall 6).
- **Vitest integration (api):** default-wiring test described above
  (Pitfall 13).
- **Vitest unit (mobile):** `splitPlacements.test.ts` covers
  unplaced, placed-issue, placed-section, orphaned-self-heal.
  `PhotoGroupPlacementSheet.test.tsx` snapshot + tap → onSelect.
- **Maestro flow:** `place-photo-on-issue.flow.yml` —
  1. Open seeded draft report with one photo and ≥1 issue.
  2. Tap `btn-place-photo-{n}` → `placement-sheet-issue-0`.
  3. Assert the bottom Photos card no longer shows the tile.
  4. Assert `placed-group-{n}` exists inside the first issue card.
  5. Finalise the report.
  6. Re-open from the project list; assert the placed group still
     renders inside the issue card.

  Driven against fixtures (no live LLM), per
  [Pitfall 2](pitfalls.md#pitfall-2).

## Doc + plan updates

- New file: `docs/v4/design-photo-placement.md` (this document).
- `docs/v4/architecture.md` index — add row 17 "Photo placement"
  pointing here.
- `docs/v4/arch-batch-photo-notes.md` — add a "See also" link to
  this design (placement is a layer on top of batch notes).
- `docs/v4/plan-p3-feature-build.md` — add a checkbox under the
  saved-report screen: "Photo-group placement (issues/sections);
  see `design-photo-placement.md`".
- `docs/v4/arch-report-auto-regen.md` — note that placement PATCH
  is **deliberately exempt** from the `notes_changed_at` bump
  (placement is a UI annotation, not a content change — see the
  service-fn section above).

## Out of scope (explicit carve-outs)

Recorded here so they cannot be silently lost:

- **Multi-select / bulk move.** Tracked in
  `docs/v4/plan-p3-feature-build.md` under "Photo-group placement →
  follow-ups".
- **Drag-and-drop reorder of placed groups within a section.**
  Same follow-up bucket. Today position within an issue/section is
  insertion order (note `created_at`).
- **Reordering issues/sections in `ReportEditForm` migrating
  placements.** Same follow-up bucket; relies on the title-hash
  expand path.
- **Captions per placed photo.** `note_files.caption` already
  exists; surfacing it is a separate UI design.
- **Auto-placement suggestions (LLM-driven, e.g. caption-aware).**
  Pure-research; not on the roadmap.

## Implementation checklist (one item ≈ one commit)

1. `feat(api-contract): add NotePlacement schema + extend Note`
   — Zod schema, exported types, no consumers yet.
2. `feat(api): migration 00NN — notes.placement jsonb + check`
   — expand-only migration, no backfill, schema.ts updated.
3. `feat(api): updateNotePlacement service + scope test pair`
   — service fn (no `bumpNotesChangedAt` call: placement is a
   UI annotation, not a content change), Pitfall-6 tests.
4. `feat(api): PATCH /notes/{n}/placement route + integration test`
   — default-wiring test (Pitfall 13), 400 on non-image, listNotes
   returns placement.
5. `feat(mobile): generated client + usePlacePhotoGroup hook`
   — optimistic update mirroring useOptimisticDeleteNote.
6. `feat(mobile): PhotoGroupPlacementSheet + PhotoPlacementChip`
   — AppDialogSheet body, snapshot tests, no Alert.alert.
7. `feat(mobile): splitPlacements + PlacedPhotoGroup; wire ReportView`
   — IssuesCard / SummarySectionCard accept placedGroup; ReportView
   plumbs through; saved-report.tsx splits noteRows.
8. `feat(mobile): self-heal orphan placements`
   — fire-and-forget PATCH placement=null when index out of range,
   covered by splitPlacements unit test.
9. `test(maestro): place-photo-on-issue flow`
   — full E2E captured + replayed against fixtures.
10. `docs: link design-photo-placement.md from architecture index +
    plan-p3 + arch-batch-photo-notes`
    — final cross-links land with the feature, per
    [Pitfall 10](pitfalls.md#pitfall-10).

## Open questions

- **Q1:** Should placement also surface on the **draft** Notes-tab
  timeline (so a user can pre-place before generation)? Proposal:
  no for v1 — placement targets indices that don't exist until a
  report is generated. Recorded under the v1 carve-outs.
- **Q2:** When a placed group regenerates and the new
  `report.body` has fewer issues, do we want a one-shot toast
  ("3 photos un-placed by regeneration")? Proposal: defer — the
  bottom Photos card resurfaces them and the user notices.
  Tracked alongside auto-placement in the follow-up bucket.
