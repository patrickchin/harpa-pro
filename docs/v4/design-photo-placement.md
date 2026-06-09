# Design v2 — Attachment placement as a first-class report field

> Status: design (not yet implemented). Supersedes
> [design-photo-placement-v1.md](design-photo-placement-v1.md), which
> shipped placement as a per-note `notes.placement` JSONB column +
> client-side orphan healer. v1 worked but exposed an architectural
> smell ([R9 — "Two layers, both correct, fight each other"](../bugs/README.md))
> and made the LLM unaware of user placements during regeneration.
> v2 moves placement into `report.body` itself, keyed by **note ID**,
> and restructures the LLM payload as JSON so the model can both
> respect existing placements and propose new ones from context.
>
> Targets ~5 PRs in expand-contract sequence (see Migration plan).

Cross-links:
- Replaces [design-photo-placement-v1.md](design-photo-placement-v1.md).
- Builds on [arch-batch-photo-notes.md](arch-batch-photo-notes.md)
  (`note_files`, `noteId` grouping).
- Touches [arch-report-auto-regen.md](arch-report-auto-regen.md)
  (regeneration trigger semantics — drops the v1 carve-out for
  `bumpNotesChangedAt`).
- Touches the report renderer covered by
  [arch-mobile.md](arch-mobile.md) and the schema docs in
  [arch-database.md](arch-database.md).
- Auth/scope rules per [arch-auth-and-rls.md](arch-auth-and-rls.md).
- Closes the v1 Q2 (regen-induced un-place toast) by giving the LLM
  current placements as input — un-placement becomes near-impossible
  by design rather than handled at render-time.

## Motivation

v1 shipped placement as a UI-only annotation on notes:

```sql
notes.placement jsonb  -- { kind: 'issue' | 'section', index: number }
```

That worked but had three structural problems:

1. **Reactive reconciliation.** Index-based placement meant any regen
   that reshaped `report.body.issues[]` could put a placement out of
   range. The fix was a client-side `useEffect` orphan healer that
   PATCHed `placement = null`. That healer became the substrate of
   the R9 bug (placement bump → cache invalidation → auto-regen →
   reshape → orphan → heal → "split-second revert"). The v1 fix was
   to carve out `bumpNotesChangedAt` from the placement service, but
   the substrate (an effect that writes during render) is still there.

2. **Two sources of truth, never reconciled in one place.** Notes
   own placement; reports own structure. The mobile renderer joined
   them at render time via `splitPlacements`. The server never saw
   the composed view, so the LLM never saw user placements during
   regen — it could (and did) re-author a body that ignored existing
   placements, leaving the healer to silently un-place things.

3. **Index-coupled to a structure the LLM owns.** `index: 2` is only
   meaningful relative to the *current* `issues[]` array. The LLM
   regenerates that array on every run. We were betting that
   index-stability under "incremental re-author" would hold, and
   when it didn't (rename, reorder, delete), placement silently broke.

v2 fixes all three by:

- **Storing placement inside `report.body`** — one JSONB column owns
  the composed view. No client-side splice. No orphan healer.
- **Keying placement by `notes.id`** — globally stable, never reused,
  immune to issue/section reshuffles.
- **Feeding the LLM the current `body` and letting it preserve or
  propose placements** — placement becomes part of the regen contract
  instead of fighting it.

## Acceptance contract

1. On a saved report (draft or finalised), every photo note shows
   a "Place in…" affordance. Tapping it opens an `AppDialogSheet`
   listing all issues then all detailed sections by title; tapping
   a row places that note's image batch into the chosen target.
2. Once placed, the batch renders inline at the bottom of the target
   `IssuesCard` row or `SummarySectionCard`, in the same 3-column
   tile grid as `ReportPhotos`. A "Move" affordance reopens the same
   sheet pre-selected on the current target with an extra "Remove
   from this section" row.
3. The bottom `ReportPhotos` card filters out placed batches; if all
   batches are placed it returns null.
4. Placement persists across draft → finalised transitions.
5. Across **regenerations** the LLM is given the existing `body`
   (including current placements) and is instructed to preserve any
   user-placed batch. The LLM **MAY** add `attachments.images` for
   batches the user has not placed, using note metadata as context.
   If the LLM emits an unknown batch ID or violates a preserve rule,
   a server-side validator strips the offending entry post-generation
   (defense in depth).
6. If a note is **deleted** between regens, dangling IDs in
   `body.attachments.*` are filtered at render-time (cosmetic) and
   removed by the next regen (canonical). No render-time PATCHes.
7. Read-only members see placements but cannot mutate them.
8. **Note ordering is preserved end-to-end** (capture order). Notes
   are never reordered by listing, regen payload assembly, or LLM
   output. Adjacency carries semantic context (e.g. a voice note
   immediately after a photo batch describing it).

## Data model

### `notes` — replace `placement` with metadata

```sql
-- Migration NN_01: additive metadata
ALTER TABLE app.notes
  ADD COLUMN source text,
  ADD COLUMN meta   jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE app.notes
  ADD CONSTRAINT notes_source_chk
  CHECK (
    source IS NULL
    OR source IN ('typed', 'voice', 'camera', 'gallery', 'upload')
  );

-- Capture-order invariants. The `id ASC` tiebreaker prevents
-- nondeterministic ordering when two notes share a millisecond
-- (rare, but possible during fast multi-shot capture).
CREATE INDEX IF NOT EXISTS notes_report_order_idx
  ON app.notes (report_id, created_at ASC, id ASC);

-- Defang gross client-clock skew. We accept skew up to a day
-- (offline notes, timezone slop) but not 2099.
ALTER TABLE app.notes
  ADD CONSTRAINT notes_created_at_sane_chk
  CHECK (created_at <= now() + interval '1 day');
```

`source` values:

| Value | Meaning |
|---|---|
| `typed` | Text body entered via keyboard. |
| `voice` | Voice note (transcribed by the voice pipeline). |
| `camera` | Photo(s) captured in-app via camera. |
| `gallery` | Photo(s) chosen from device gallery. |
| `upload` | File(s) uploaded from outside the app (existing files). |

`meta` is open-ended JSONB for kind-specific extras (e.g. voice
`durationSec`, original filename for uploads, EXIF). No schema today;
keys are documented in `api-contract` as they're added.

`notes.placement` is **dropped** at the end of the migration sequence
(see Migration plan, contract step).

### `note_files` — per-image caption (forward-prep)

```sql
ALTER TABLE app.note_files
  ADD COLUMN caption text;
```

Nullable. Mobile UI does not surface this in v2 — the column exists
so the future per-image-caption UI lands without another migration.
The LLM payload conditionally includes per-photo captions only when
at least one is set on a batch (keeps the common-case prompt small).

### `report.body` — `attachments` on every issue and section

`ReportBody` (today: `{ summary, issues[], sections[] }`) gains an
optional `attachments` block at every issue and detailed section:

```ts
type ReportAttachments = {
  // Note IDs whose kind is 'image'. Render-time filters unknown
  // (deleted) IDs; regen output validator strips them.
  images?: string[];
  // Reserved for future use (kind = 'document' / 'video').
  documents?: string[];
};

type ReportIssue = {
  title: string;
  description: string;
  // ... existing fields
  attachments?: ReportAttachments;
};

type ReportSection = {
  title: string;
  body: string;
  // ... existing fields
  attachments?: ReportAttachments;
};
```

Why **inside `report.body`** and not a side table:

- `report.body` is already a JSONB blob versioned via
  `report.generated_at` / `report.notes_changed_at`. Placement *is*
  part of the composed report.
- One read returns everything mobile needs to render. No splice on
  the client. No `splitPlacements` helper. No "compose the view".
- Every existing pathway that writes `report.body` (manual edit,
  regen) writes attachments in the same column. Atomic by free.

Why note **IDs** and not a per-report `seq`:

- Note IDs are already short prefixed strings (`not_8h3kq2vp9w` —
  14 chars). LLMs handle that length reliably.
- No allocator, no counter column, no migration to seed sequences.
- Globally unique forever; immune to renumbering.
- Uniform across kinds — `images: ["not_…"]` and
  `documents: ["not_…"]` use the same identifier space.

The token cost (note IDs are ~5 tokens vs ~1 for an integer) is
real but bounded: ~few-hundred tokens per regen for a heavy report.
Worth it to avoid the entire allocator + counter machinery.

Server-side validator (post-generation):

```ts
// packages/api/src/services/reports.ts
function sanitiseAttachments(body: ReportBody, validNoteIds: Set<string>): ReportBody;
```

Strips any ID in `body.{issues,sections}[].attachments.{images,documents}`
that isn't in `validNoteIds` (note exists, kind matches, scope-visible).
Also de-duplicates: each note ID appears in at most one
`attachments` array across the entire body. Conflict resolution: the
**first** occurrence in `body.issues[]` then `body.sections[]` reading
order wins; later duplicates are dropped. Logged as a warning when it
fires (LLM violated the preserve rule).

### Note ordering — invariants

Capture order is load-bearing for prompt comprehension. Pin it down:

- **Single canonical sort fragment.** All reads use the same
  `notesCanonicalOrder` Drizzle SQL fragment:
  ```ts
  // packages/api/src/services/notes.ts
  export const notesCanonicalOrder = sql`n.created_at ASC, n.id ASC`;
  ```
  Used by `listNotes`, `collectNotesForGeneration`, the regen new-notes
  slice, and any future read site. Lint rule: any direct
  `ORDER BY ... created_at ... notes` outside this helper is a review
  blocker.
- **Index** (`notes_report_order_idx`) matches the canonical sort —
  reads are O(log n) and cannot accidentally sort by a different
  column.
- **CHECK constraint** rejects far-future `created_at` values
  (defangs catastrophic clock skew without breaking offline capture).
- **Integration test** (`notes.ordering.integration.test.ts`):
  - 5 notes created with mixed kinds and explicit `createdAt` values
    including two identical timestamps (verifies `id ASC` tiebreaker).
  - `listNotes` returns capture order.
  - Delete the middle note; survivors are still in capture order.
  - `collectNotesForGeneration`'s JSON `notes[]` array order matches
    `listNotes` order.
  - A second pass with a backdated note (offline upload) lands in the
    correct historical position, not at the end.

## LLM payload — structured JSON

`collectNotesForGeneration` returns a **structured object**, not a
text string. The prompt template stitches it into the user message
verbatim as JSON.

```ts
type GenerationPayload = {
  // Notes in capture order. Position is the contract — adjacency
  // carries semantic context. No `n` / `index` / `order` field.
  notes: GenerationNote[];

  // Existing report body (null on first generation). Includes
  // attachments — the LLM must preserve user-placed batches.
  currentBody: ReportBody | null;
};

type GenerationNote =
  | { kind: 'text';     id: string; source?: 'typed';     body: string;       createdAt: string }
  | { kind: 'voice';    id: string; source?: 'voice';     transcript: string; durationSec?: number; createdAt: string }
  | { kind: 'image';    id: string; source?: 'camera' | 'gallery' | 'upload'; photoCount: number; caption?: string; photos?: { id: string; caption?: string }[]; createdAt: string }
  | { kind: 'document'; id: string; source?: 'upload';    filename?: string;  caption?: string;     createdAt: string };
```

Notes:

- **`notes` is always an array.** Never an object map. Array order
  is the only ordering signal.
- **No `n` / `index` field.** Position is the contract. Removes any
  ambiguity if the LLM tries to reason about an indexed identifier.
- **`id` is the note ID.** It appears in placeholders (legacy text
  prompt also accepts the same IDs for the transition period) and is
  what the LLM emits in `attachments.images`.
- **`photos[]` is conditional.** Included only when at least one photo
  in the batch has a caption. Common case is empty → field omitted.
- **`createdAt` is verbatim from the DB.** Lets the LLM reason about
  time gaps between notes (e.g. "10 seconds apart → likely the same
  observation").
- **`currentBody` is the previous report body verbatim.** On first
  generation it is null; thereafter it's the most recent saved body
  including any user-placed `attachments`.

### System prompt additions

`packages/api/src/prompts/reportGeneration.ts` gets these rules:

1. *Notes are listed in chronological capture order. Adjacency
   carries context: a voice note may explain the photo batch
   captured just before it. Treat consecutive notes as potentially
   related observations.*
2. *Each note has a stable `id`. To attach a photo or document batch
   to an issue or section, add the note's `id` to that target's
   `attachments.images` or `attachments.documents` array.*
3. *If `currentBody` is provided, you MUST preserve every batch ID
   already present in `currentBody.{issues,sections}[].attachments`.
   You may move existing content around or rewrite descriptions, but
   you may not remove a user-placed batch. You MAY add new
   `attachments` entries for batches not yet placed if you have
   strong contextual evidence (caption, adjacent voice note,
   explicit mention in a text note).*
4. *Each batch ID may appear in at most one `attachments` array
   across the entire report body. If you place a batch, it is no
   longer "unplaced" and must not appear elsewhere.*

Server-side validator runs after parse and enforces (3) and (4). Any
violation is logged + auto-corrected; the user does not see a stuck
state.

### Output schema (Zod)

```ts
// packages/api-contract/src/reports.ts (additions)
const attachmentsSchema = z.object({
  images: z.array(z.string()).optional(),
  documents: z.array(z.string()).optional(),
}).strict();

// Extend issue + section schemas:
const issueSchema = baseIssueSchema.extend({
  attachments: attachmentsSchema.optional(),
});
const sectionSchema = baseSectionSchema.extend({
  attachments: attachmentsSchema.optional(),
});
```

Zod is the single source of truth for both the LLM's
structured-output schema and the server's runtime validation.

## API surface

### Replaced: `PATCH /notes/{n}/placement` → `PATCH /reports/{r}/attachments`

```
PATCH /reports/{report}/attachments
Body: {
  noteId: string;
  target:
    | { kind: 'issue';   index: number }   // current "where in body" handle
    | { kind: 'section'; index: number }
    | null;                                 // unplace
}
Returns: 200 { report: Report }   // full updated report incl. body
```

Why a new endpoint:
- Placement is now a `report.body` mutation. `notes` no longer owns it.
- One round-trip mutates one JSONB column atomically; client gets the
  full updated body back so the cache stays consistent without
  cross-key invalidation.

Why target uses `{ kind, index }` and not `{ targetTitle }`:
- The mobile UI offers "the section the user is looking at right now"
  as the choice; the user sees current titles. Index is the natural
  handle on the *current* body version.
- If the body changes between fetch and PATCH (e.g. another editor
  regen'd in the meantime), the server returns 409 + the latest body.
  Client re-renders the sheet; user picks again. Tiny window in
  practice.
- Note IDs go *into* `body.attachments`; they don't drive the
  endpoint shape.

Service contract:

```ts
// packages/api/src/services/reports.ts
export async function placeNoteInReport(
  db: Db,
  reportId: string,
  noteId: string,
  target: PlacementTarget | null,
  expectedBodyVersion: string,  // last-seen body hash or generated_at
): Promise<{ report: Report } | { conflict: Report }>;
```

Behaviour:
- 404 if report not visible under scope.
- 404 if note not visible / not in this report.
- 400 if note kind ∉ {`image`, `document`}.
- 400 if `target.index` out of range for current body.
- 409 + current body if `expectedBodyVersion` mismatches (optimistic
  concurrency).
- Success: writes the entire updated `body` JSONB in one statement
  using `jsonb_set` or a full replacement; returns the new report.
  **Removes the noteId from any other `attachments` array first**
  (idempotent unplace) so a move is exactly-once.
- **Does NOT call `bumpNotesChangedAt`.** The bump tracks new
  *content* since last generation. Placement reshapes presentation
  of existing content; no regen should be triggered by placement
  alone. (This is the same rule v1 settled on, but in v2 the
  carve-out is structural — placement isn't even a `notes` write.)

Per-request DB scope: route runs under the standard
`withScopedConnection({ sub, sid })` like every other report mutation.
Pitfall-6 paired test: editor of project P succeeds; member of project
Q gets 404.

### Removed

- `PATCH /notes/{n}/placement` — gone.
- `notes.placement` field on the note schema — gone.
- `useUpdateNotePlacementMutation` and the `'reportNotes' / 'report'`
  cache-invalidation tuple — gone.

### `collectNotesForGeneration` returns structured payload

```ts
export async function collectNotesForGeneration(
  db: Db,
  reportId: string,
): Promise<GenerationPayload>;
```

`reportGeneration.ts` JSON-stringifies the payload into the user
message. The legacy text format (`NOTES:\n[1] [images N: M photos]…`)
is removed in the same release; no flag, no parallel path.

### Note creation accepts `source` and `meta`

`POST /notes` body adds:

```ts
{ // existing fields
  source?: 'typed' | 'voice' | 'camera' | 'gallery' | 'upload';
  meta?:   Record<string, unknown>;
}
```

Mobile sends `source` based on which capture flow the user used.
Existing rows backfill: text → `typed`, voice → `voice`, image/document
without further info → `upload` (best-guess; meta empty).

## Mobile wiring

### Renderer simplifies dramatically

`splitPlacements` is **deleted**. So is `ReportTabPane`'s orphan-healer
`useEffect`. The renderer becomes a pure map over `report.body`:

```tsx
// IssuesCard — already gets `issue` from body
<IssuesCard
  issue={issue}                         // includes issue.attachments
  placedBatches={resolveBatches(noteRows, issue.attachments?.images)}
/>

// resolveBatches filters unknown IDs (deleted notes) silently.
// Pure helper; no side effects; trivially testable.
```

`saved-report.tsx` collects all unplaced image notes by computing
the set difference: `noteRows - all IDs referenced in body.attachments`.
That same set feeds the bottom `ReportPhotos` card.

```tsx
const placedIds = collectPlacedAttachmentIds(report.body);
const unplacedNotes = noteRows.filter(
  (n) => n.kind === 'image' && !placedIds.has(n.id),
);
```

### Mutation hook

```ts
// apps/mobile/lib/api/optimistic.ts
export function usePlaceAttachment(): UseMutationResult<…> {
  // Optimistically patch the cached `report` (one cache key only).
  // No `'reportNotes'` invalidation — note rows didn't change.
  // On 409: replace local body with server's, reopen the sheet.
  // On error: rollback + toast.
}
```

One cache key (`['report', reportId]`) owns placement. The R9
"two layers fight each other" pattern is structurally impossible —
there is only one layer.

### testIDs for Maestro

- `btn-place-photo-{noteId}` — chip on each unplaced batch.
- `btn-move-placed-photo-{noteId}` — chip on each placed batch.
- `placement-sheet`, `placement-sheet-issue-{i}`,
  `placement-sheet-section-{i}`, `placement-sheet-remove`.
- `placed-batch-{noteId}` — wrapper inside the issue/section card.

## Edge cases

| Case | Behaviour |
|---|---|
| Note deleted while placed | ID dangles in `body.attachments` until next regen. Render-time filter drops it from view (cosmetic). Next regen rewrites `body` with current valid IDs only (canonical cleanup). |
| All photos in a batch deleted | Same as above — note row deletes; ID drops out at next regen. |
| Issue/section deleted by regen | The LLM regenerates `body` from scratch using `currentBody` + new notes. If a target still semantically exists (renamed), the LLM should re-emit the placement under the new title. If the target is genuinely gone (issue deleted), the LLM should re-place to the closest match or omit the placement. The user can re-place with one tap if unhappy. |
| Issue/section reordered in `ReportEditForm` | Placement endpoint takes `{ kind, index }` against the current body. Manual edits to `body.issues` order automatically carry their `attachments` along (it's the same JSONB object). No drift. |
| Read-only project member | Chip not rendered (gated on `canEdit`). API 404s under their scope. |
| Finalised report | Placement editable. Finalisation snapshots `body`; placement reshapes the snapshot. |
| Voice / text note | Chip not rendered; PATCH returns 400. |
| Concurrent regen during placement | 409 from `expectedBodyVersion`; client refreshes and the user re-picks. Window is single-digit seconds. |
| LLM violates preserve rule | Server validator strips/repairs after generation; logged as a warning. User sees their placement intact. |

## Test plan

- **Vitest unit (api-contract):** attachments Zod schema accepts/rejects
  shapes; body Zod schema with attachments round-trips.
- **Vitest unit (api):** `sanitiseAttachments` — strips unknown IDs,
  de-dupes across arrays, preserves order otherwise.
- **Vitest scope (api):** Pitfall-6 paired test for
  `PATCH /reports/{r}/attachments`.
- **Vitest integration (api):** default-wiring test that places a
  batch, fetches the full report, asserts `body.issues[0].attachments.images`
  contains the note ID; asserts `notes_changed_at` is unchanged;
  asserts a 409 path on stale `expectedBodyVersion`.
- **Vitest integration (api):** ordering test described in
  [Note ordering — invariants](#note-ordering--invariants).
- **Vitest integration (api):** regen with `currentBody` containing
  user placements — asserts the validator strips invalid LLM output
  and that user-placed batches survive the regen.
- **Vitest unit (mobile):** `collectPlacedAttachmentIds` + bottom-card
  filter — placed, unplaced, mixed kinds, deleted note dangling in body.
- **Vitest unit (mobile):** `resolveBatches` filters unknown IDs.
- **Maestro flow:** `place-photo-on-issue.flow.yml` —
  1. Open seeded draft report with one photo and ≥1 issue.
  2. Tap `btn-place-photo-{n}` → `placement-sheet-issue-0`.
  3. Assert `placed-batch-{n}` exists inside the first issue card.
  4. Assert the bottom Photos card no longer shows the tile.
  5. Trigger regenerate; assert `placed-batch-{n}` still in place.
  6. Finalise. Re-open from project list; placement persists.

  Driven against fixtures (no live LLM), per
  [Pitfall 2](pitfalls.md#pitfall-2). The regen step uses a fixture
  that exercises `currentBody` plumbing.

## Migration plan (expand-contract)

Five steps, one PR each. v1 stays live until step 4; the cutover is
deliberately gradual.

### PR 1 — Additive metadata + ordering invariants

- Migration: `notes.source`, `notes.meta`, `note_files.caption`,
  `notes_report_order_idx`, sanity CHECK on `created_at`.
- `notesCanonicalOrder` SQL helper extracted; all read sites use it.
- `POST /notes` accepts `source` / `meta`; mobile passes them.
- Backfill `source` for existing rows.
- Ordering integration test.
- No behaviour change for placement yet.

### PR 2 — `attachments` field added to `report.body`

- Zod schema: `attachments` optional on issue + section.
- `sanitiseAttachments` server-side validator + unit tests.
- `setReportBody` calls `sanitiseAttachments` before write.
- `report.body` reads tolerate the new optional field.
- No client UI changes yet; nothing populates `attachments`.

### PR 3 — Structured-JSON LLM payload + LLM placements (LLM may now propose)

- `collectNotesForGeneration` returns `GenerationPayload`.
- `reportGeneration.ts` system prompt updated; user message takes JSON.
- LLM output schema includes `attachments`; live tests verify.
- The LLM may now place batches it has confident context for. The
  client UI still uses v1 (`notes.placement` JSONB) for user-driven
  placement — read path unifies both in a follow-on bridge helper
  for one release.

### PR 4 — `PATCH /reports/{r}/attachments` + mobile cutover

- New endpoint + service + scope + integration tests.
- Mobile renderer reads `body.attachments` instead of
  `splitPlacements(notes)`.
- Mobile chip uses the new endpoint.
- One-shot data migration: copy every existing `notes.placement`
  into the corresponding `report.body.attachments`. Idempotent (run
  once, verify, leave the column readable for one release as a
  rollback path).
- v1 endpoint (`PATCH /notes/{n}/placement`) starts returning 410
  Gone; mobile no longer calls it.

### PR 5 — Drop `notes.placement` (contract)

- Migration: `ALTER TABLE app.notes DROP COLUMN placement;`.
- `notes.placement` removed from schema, contract, mobile types.
- v1 endpoint removed (was already 410).
- Orphan-healer `useEffect` and `useUpdateNotePlacementMutation`
  deleted from mobile (already unused after PR 4).
- R9 entry in `docs/bugs/README.md` updated: pattern documented as
  resolved structurally; the historical instance closed.

## Doc + plan updates

- `design-photo-placement.md` (this file) replaces v1.
- `design-photo-placement-v1.md` retained as historical record.
- `docs/v4/architecture.md` index — update row 17 "Photo placement"
  pointing here.
- `docs/v4/arch-batch-photo-notes.md` — update "See also" to v2.
- `docs/v4/arch-report-auto-regen.md` — drop the v1 carve-out
  language (placement bump exemption); replace with: "Placement is
  a `report.body` write, not a `notes` write — it bypasses the
  `notes_changed_at` trigger structurally."
- `docs/v4/plan-p3-feature-build.md` — replace the v1 checkbox with a
  v2 sub-tree of 5 PRs.
- `docs/bugs/README.md` — add a "Resolved" footer to R9 once PR 5
  lands (keep the pattern definition; the instance is closed).

## Out of scope (explicit carve-outs)

- **Multi-select / bulk move.** Tracked in plan-p3 follow-ups. The
  underlying mutation is per-note already.
- **Drag-and-drop reorder of placed batches within a section.**
  Position within `attachments.images` is the array order; the LLM
  controls it on regen, the user can't reorder in v2.
- **Per-photo caption UI.** Column added (`note_files.caption`); UI
  surfacing is a separate design.
- **Auto-place-everything pass.** Not yet — start with "LLM places
  high-confidence batches" and learn from real regens.

## Implementation checklist (one item ≈ one commit, grouped by PR)

PR 1 (metadata + ordering):
1. `feat(api): migration NN_metadata — notes.source/meta, note_files.caption`
2. `feat(api): notesCanonicalOrder helper + audit read sites`
3. `feat(api): notes_report_order_idx + created_at sanity CHECK`
4. `feat(api): POST /notes accepts source + meta; backfill existing rows`
5. `test(api): notes.ordering.integration.test.ts`
6. `feat(mobile): pass source on note creation flows`

PR 2 (attachments field):
7. `feat(api-contract): attachments schema on issue + section`
8. `feat(api): sanitiseAttachments validator + unit tests`
9. `feat(api): setReportBody runs sanitiseAttachments`

PR 3 (structured LLM payload):
10. `feat(api): collectNotesForGeneration returns GenerationPayload`
11. `feat(api): reportGeneration prompt switches to JSON; system rules updated`
12. `feat(api): LLM output schema includes attachments; live tests`
13. `test(api): regen with currentBody preserves user placements`

PR 4 (cutover):
14. `feat(api): PATCH /reports/{r}/attachments + service + scope + integration`
15. `feat(mobile): renderer reads body.attachments; bottom card filter`
16. `feat(mobile): placement sheet calls new endpoint; usePlaceAttachment hook`
17. `feat(api): one-shot data migration notes.placement → body.attachments`
18. `chore(api): v1 PATCH /notes/{n}/placement returns 410 Gone`

PR 5 (contract):
19. `feat(api): migration NN_drop_placement — DROP COLUMN notes.placement`
20. `chore: remove v1 placement code from api, contract, mobile`
21. `docs: archive v1 design; update R9 with resolved-by-structural-fix footer`

## Open questions

- **Q1:** Should the LLM be allowed to *un*-place a batch on regen
  (as opposed to leaving it placed where the user put it)? Current
  proposal: **no** — the preserve rule is absolute, validator
  enforces. We can relax later if real regens show the LLM has
  good reasons to move batches the user pinned.
- **Q2:** When the LLM places a batch on its own, should the UI
  visually distinguish "auto-placed" from "user-placed" (e.g.
  subtle badge)? Useful for debugging trust early; can defer.
  Cheap to add later — extend `attachments` to a `{ id, by: 'user' | 'llm' }`
  shape if needed (additive).
- **Q3:** Per-batch position within an issue (e.g. "this batch first,
  then this one"). Today array order in `attachments.images`. Should
  the user be able to reorder? Defer; covered by the v1 carve-out.
- **Q4:** Should placement-target use `{ kind, index }` or
  `{ targetId }` once we add stable issue/section IDs? Stable IDs
  aren't on the roadmap; defer until they are.
