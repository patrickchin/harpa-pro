# Design — Attachment placement in report.body

> Status: design (not yet implemented). One PR, no feature flag.

LLMs can't see attached photos or documents, so the report
generator has no way to bind a photo batch to the issue or section
it documents. Today every batch lands in a single bottom-of-screen
"Photos" card on the generated-report screen, regardless of which
issue or section it relates to.

We need a one-handed UI that lets an editor place each batch into
a specific issue or detailed section, AND we want the regen pipeline
to respect those placements (and propose its own when it has strong
context).

Cross-links:
- Builds on [arch-batch-photo-notes.md](arch-batch-photo-notes.md)
  (`note_files`, `noteId` grouping).
- Touches [arch-report-auto-regen.md](arch-report-auto-regen.md)
  (regeneration trigger semantics).
- Renderer covered by [arch-mobile.md](arch-mobile.md); schema in
  [arch-database.md](arch-database.md).
- Auth/scope rules per [arch-auth-and-rls.md](arch-auth-and-rls.md).

## Acceptance contract

1. On a generated report (draft or finalised), every photo note shows
   a "Place in…" affordance. Tapping it opens an `AppDialogSheet`
   listing all issues then all detailed sections by title; tapping
   a row places that note's batch into the chosen target.
2. Once placed, the batch renders inline at the bottom of the target
   `IssuesCard` row or `SummarySectionCard`, in the same 3-column
   tile grid as the bottom Photos card. A "Move" affordance reopens
   the same sheet with an extra "Remove from this section" row.
3. The bottom Photos card filters out placed batches; if every batch
   is placed it returns null.
4. Placement persists across draft → finalised transitions.
5. Across regenerations the LLM is given the existing `body`
   (including current placements) and is instructed to preserve every
   user-placed batch. The LLM **MAY** add `attachments.images` for
   batches the user has not placed, using note metadata as context.
   If the LLM emits an unknown batch ID or violates the preserve
   rule, a server-side validator strips the offending entry
   post-generation (defense in depth).
6. If a note is **deleted** between regens, dangling IDs in
   `body.attachments.*` are filtered at render-time (cosmetic) and
   removed by the next regen (canonical). No render-time PATCHes.
7. Read-only members see placements but cannot mutate them.
8. **Note ordering is preserved end-to-end** (capture order). Notes
   are never reordered by listing, regen payload assembly, or LLM
   output. Adjacency carries semantic context (e.g. a voice note
   immediately after a photo batch describing it).

## Architecture summary

Three load-bearing decisions:

1. **Placement lives in `report.body`**, not on individual notes.
   `report.body.{issues,sections}[].attachments.images: string[]`
   is the single source of truth for what gets rendered where.
2. **Placement is keyed by note ID** (`not_xxxxxxxxxx`). Globally
   unique, stable forever, no allocator, no counter. Short enough
   (~14 chars) that LLMs handle it reliably.
3. **LLM payload is structured JSON** with `notes[]` (chronological
   capture order, no `n` field — position is the contract) and
   `currentBody` (so the LLM can preserve user placements and propose
   new ones from context).

Together these make placement a first-class property of the composed
report rather than a per-note annotation reconciled at render-time.
There is one writer (`setReportBody`), one reader (the renderer maps
`body` directly), one cache key.

## Alternatives considered

### A. Per-note `notes.placement` JSONB column (rejected)

Stash `{ kind: 'issue' | 'section', index: number }` on each note.

Rejected because:
- **Index-coupled to a structure the LLM owns.** Every regen
  reshapes `body.issues[]`; index 2 may point at a different issue
  after each regen. We'd need a client-side orphan healer (UI clears
  invalid indices via `PATCH /notes/{n}/placement = null`).
- **The orphan healer is reactive.** It writes during render, which
  races against cache invalidation, which races against auto-regen.
  This is a known anti-pattern category (see
  [docs/bugs/README.md R9 — "Two layers, both correct, fight each
  other"](../bugs/README.md)) — placement bump → cache invalidate →
  regen → reshape → orphan → heal → "split-second revert".
- **Two sources of truth never reconciled in one place.** Notes own
  placement, reports own structure, mobile splices them at render.
  Server never sees the composed view → LLM never sees user
  placements during regen.

### B. Per-report `seq` counter for short integer IDs (rejected)

Allocate `notes.seq` per-report so the LLM sees `[image 7]` instead
of `[image not_8h3kq2vp9w]`.

Rejected because:
- Adds a column, a counter on `app.reports`, and a concurrency-safe
  `UPDATE … RETURNING next_note_seq` allocator inside the create-note
  tx — three new things that can be wrong.
- Token savings (~5 tokens per ID vs 1) are real but bounded:
  ~few-hundred tokens per regen for a heavy report.
- LLMs reliably copy 14-char tokens verbatim when the schema is
  constrained (Zod structured output).
- Note IDs are already what every other layer speaks. Adding `seq`
  means every layer learns to translate.

### C. Stable issue/section IDs in `report.body` (deferred)

Issues/sections currently have no stable identity — they're array
positions. With stable IDs, placement could key by issue ID instead
of array index, eliminating the "index out of range after regen"
problem entirely.

This is the right long-term shape but a separate, larger change.
v2 sidesteps the problem by storing `attachments` *inside* the
issue/section objects themselves — when `ReportEditForm` reorders
or rewrites `body.issues[]`, the `attachments` go along automatically
because they're nested in the same JSONB object.

If stable IDs land later, the placement endpoint's `{ kind, index }`
target shape switches to `{ targetId }`; `body.attachments` shape is
unchanged.

## Data model

### `notes` — metadata

```sql
ALTER TABLE app.notes
  ADD COLUMN source text,
  ADD COLUMN meta   jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE app.notes
  ADD CONSTRAINT notes_source_chk
  CHECK (
    source IS NULL
    OR source IN ('typed', 'voice', 'camera', 'gallery', 'upload')
  );

-- Capture-order invariants. The `id ASC` tiebreaker handles two
-- notes sharing a millisecond (rare, but possible during fast
-- multi-shot capture).
CREATE INDEX IF NOT EXISTS notes_report_order_idx
  ON app.notes (report_id, created_at ASC, id ASC);

-- Defang gross client-clock skew. Offline capture is allowed
-- (timestamps in the past); far-future timestamps are not.
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
| `upload` | File(s) uploaded from outside the app. |

`meta` is open-ended JSONB for kind-specific extras (voice
`durationSec`, original filename for uploads, EXIF). No schema today;
keys documented in `api-contract` as they're added.

### `note_files` — per-image caption (forward-prep)

```sql
ALTER TABLE app.note_files
  ADD COLUMN caption text;
```

Nullable. Mobile UI does not surface this in v2 — the column exists
so the future per-image-caption UI doesn't need another migration.
The LLM payload conditionally includes per-photo captions only when
at least one is set on a batch (keeps the common-case prompt small).

### `report.body` — `attachments` on every issue and section

`ReportBody` (today: `{ summary, issues[], sections[] }`) gains an
optional `attachments` block at every issue and detailed section:

```ts
type ReportAttachments = {
  // Note IDs whose kind is 'image'. Render-time filters unknown
  // (deleted) IDs; regen validator strips them on write.
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

Why inside `report.body` (not a side table, not on `notes`):

- One read returns everything mobile needs to render. No splice.
- Every writer of `body` (manual edit, regen, placement) goes
  through `setReportBody` — one validation/sanitisation funnel.
- Atomic with regen by free: a regen that reshapes issues writes
  the new `attachments` in the same statement.

Server-side validator runs on every `setReportBody`:

```ts
// packages/api/src/services/reports.ts
function sanitiseAttachments(
  body: ReportBody,
  validNoteIds: Set<string>,
): ReportBody;
```

- Strips IDs not in `validNoteIds` (deleted notes, wrong report,
  scope-invisible).
- De-duplicates: each note ID appears in at most one `attachments`
  array across the entire body. First occurrence (reading
  `body.issues[]` then `body.sections[]`) wins.
- Logged as a warning when a violation fires (LLM ignored the
  preserve rule).

## Note ordering — invariants

Capture order is load-bearing for prompt comprehension. Pin it down:

- **Single canonical sort fragment.** All notes-by-report reads use
  the same Drizzle SQL fragment:
  ```ts
  // packages/api/src/services/notes.ts
  export const notesCanonicalOrder = sql`n.created_at ASC, n.id ASC`;
  ```
  Used by `listNotes`, `collectNotesForGeneration`, the regen
  new-notes slice, and any future read site. Any direct
  `ORDER BY … created_at …` outside this helper is a review blocker.
- **Index** (`notes_report_order_idx`) matches the canonical sort.
- **CHECK constraint** rejects far-future `created_at`.
- **Integration test** (`notes.ordering.integration.test.ts`):
  - 5 notes with mixed kinds and explicit `createdAt`, including two
    with identical timestamps (verifies `id ASC` tiebreaker).
  - `listNotes` returns capture order.
  - Delete the middle note; survivors are still in capture order.
  - `collectNotesForGeneration`'s JSON `notes[]` matches `listNotes`
    order.
  - A backdated note (offline upload) lands in its historical
    position, not at the end.

## LLM payload — structured JSON

`collectNotesForGeneration` returns a structured object. The prompt
template stitches it into the user message verbatim as JSON.

```ts
type GenerationPayload = {
  // Notes in capture order. Position is the contract — adjacency
  // carries semantic context. No n / index / order field.
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

Design rules:

- **`notes` is always an array.** Never an object map. Array order is
  the only ordering signal.
- **No `n` / `index` field.** Position is the contract. Removes
  ambiguity if the LLM tries to reason about a numeric identifier.
- **`id` is the note ID.** It's what the LLM emits in
  `attachments.images`.
- **`photos[]` is conditional.** Included only when at least one
  photo in the batch has a caption. Common case is empty → field
  omitted.
- **`createdAt` is verbatim from the DB.** Lets the LLM reason about
  time gaps (e.g. "10 seconds apart → likely the same observation").
- **`currentBody` is the previous report body verbatim.** Null on
  first generation; thereafter the most recent saved body including
  user-placed `attachments`.

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

`sanitiseAttachments` enforces (3) and (4) as defense in depth.

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

Zod is the single source of truth for both the LLM's structured-output
schema and the server's runtime validation.

## API surface

### New: `PATCH /reports/{report}/attachments`

```
PATCH /reports/{report}/attachments
Body: {
  noteId: string;
  target:
    | { kind: 'issue';   index: number }   // current "where in body" handle
    | { kind: 'section'; index: number }
    | null;                                 // unplace
  expectedBodyVersion: string;              // last-seen generated_at
}
Returns: 200 { report: Report }             // full updated report incl. body
       | 409 { conflict: Report }           // caller is stale; here's current
```

Service contract:

```ts
// packages/api/src/services/reports.ts
export async function placeNoteInReport(
  db: Db,
  reportId: string,
  noteId: string,
  target: PlacementTarget | null,
  expectedBodyVersion: string,
): Promise<{ kind: 'ok' | 'conflict'; report: Report }>;
```

Behaviour:
- 404 if report not visible under scope.
- 404 if note not visible or not in this report.
- 400 if note kind ∉ {`image`, `document`}.
- 400 if `target.index` out of range for current body.
- 409 + current body if `expectedBodyVersion` mismatches (optimistic
  concurrency — a regen may have landed since the client last read).
- Success: removes the noteId from any other `attachments` array
  first (idempotent move), then adds it to the requested target.
  Writes the entire updated `body` in one statement.
- **Does NOT call `bumpNotesChangedAt`.** Placement reshapes
  presentation of existing content; no regen should be triggered.
  Bump tracks new *content* since last generation; placement is not
  content. This is structural (placement isn't a `notes` write), not
  a carve-out.

Per-request DB scope: route runs under the standard
`withScopedConnection({ sub, sid })`. Pitfall-6 paired test: editor
of project P succeeds; member of project Q gets 404.

### `collectNotesForGeneration` returns structured payload

```ts
export async function collectNotesForGeneration(
  db: Db,
  reportId: string,
): Promise<GenerationPayload>;
```

`reportGeneration.ts` JSON-stringifies the payload into the user
message. The legacy text format (`NOTES:\n[1] [images N: M photos]…`)
is removed.

### Note creation accepts `source` and `meta`

`POST /notes` body adds:

```ts
{ // existing fields
  source?: 'typed' | 'voice' | 'camera' | 'gallery' | 'upload';
  meta?:   Record<string, unknown>;
}
```

Mobile sends `source` based on which capture flow the user used.
Existing rows backfill (one-shot script in the migration): text →
`typed`, voice → `voice`, image/document without further info →
`upload` (best guess; meta empty).

## Mobile wiring

### Renderer

`ReportView` reads `body` directly. There is no client-side splice
helper, no orphan healer. Each `IssuesCard` and `SummarySectionCard`
takes its own `attachments` slice; a small helper resolves IDs to
`NoteRow`s and silently drops unknowns:

```tsx
// pure helper; trivially testable
function resolveBatches(
  notes: NoteRow[],
  ids: string[] | undefined,
): NoteRow[] {
  if (!ids?.length) return [];
  const byId = new Map(notes.map((n) => [n.id, n]));
  return ids.map((id) => byId.get(id)).filter((n): n is NoteRow => !!n);
}

<IssuesCard
  issue={issue}                                    // includes attachments
  placedBatches={resolveBatches(noteRows, issue.attachments?.images)}
/>
```

The bottom Photos card filters out everything placed anywhere in
`body`:

```tsx
const placedIds = collectPlacedAttachmentIds(report.body);
const unplacedNotes = noteRows.filter(
  (n) => n.kind === 'image' && !placedIds.has(n.id),
);
```

### Components

```
apps/mobile/components/reports/photo-placement/
├── PhotoGroupPlacementSheet.tsx   // AppDialogSheet body
├── PlacedPhotoStrip.tsx            // 3-col grid + "Move" chip
└── PhotoPlacementChip.tsx          // "Place in…" button
```

- `PhotoGroupPlacementSheet` — receives `issues`, `sections`,
  `currentTarget`, `onSelect(target | null)`. Renders two scroll
  sections ("Issues", "Detailed sections"). Uses the shared
  `AppDialogSheet` primitive — **no `Alert.alert`**
  ([Pitfall 12](pitfalls.md#pitfall-12)). One row per target plus a
  "Remove from current section" row when `currentTarget` is set.
- `PlacedPhotoStrip` — pure presentational; same 3-column grid as
  the bottom Photos card. Reuses `PhotoTile`.
- `PhotoPlacementChip` — small icon button overlaid bottom-right of
  the batch; tap opens the sheet.

Styling: NativeWind only ([Pitfall 3](pitfalls.md#pitfall-3)). No
hex literals.

### Mutation hook

```ts
// apps/mobile/lib/api/optimistic.ts
export function usePlaceAttachment(): UseMutationResult<…> {
  // Optimistically patch ['report', reportId] cache.
  // No 'reportNotes' invalidation — note rows didn't change.
  // On 409: replace local body with server's, reopen the sheet
  //         pre-selected on the new target.
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
| All photos in a batch deleted | Same as above. |
| Issue/section deleted by regen | LLM regenerates `body` from scratch using `currentBody` + new notes. If the target still semantically exists (renamed), the LLM should re-emit the placement. If genuinely gone, the LLM should re-place to the closest match or omit. User can re-place with one tap. |
| Issue/section reordered in `ReportEditForm` | `attachments` is nested in the issue/section object; reorder carries it along automatically. No drift. |
| Read-only project member | Chip not rendered (gated on `canEdit`). API 404s under their scope. |
| Finalised report | Placement editable. Finalisation snapshots `body`; placement reshapes the snapshot. |
| Voice / text note | Chip not rendered; PATCH returns 400. |
| Concurrent regen during placement | 409 from `expectedBodyVersion`; client refreshes and the user re-picks. Window is single-digit seconds. |
| LLM violates preserve rule | `sanitiseAttachments` strips/repairs after generation; logged. User sees their placement intact. |

## Test plan

- **Vitest unit (api-contract):** `attachments` Zod accepts/rejects
  shapes; full body round-trips with attachments.
- **Vitest unit (api):** `sanitiseAttachments` — strips unknown IDs,
  de-dupes across arrays, preserves order otherwise.
- **Vitest scope (api):** Pitfall-6 paired test for
  `PATCH /reports/{r}/attachments`.
- **Vitest integration (api):** default-wiring test
  ([Pitfall 13](pitfalls.md#pitfall-13)) — place a batch, fetch the
  full report, assert `body.issues[0].attachments.images` contains
  the note ID; assert `notes_changed_at` unchanged; assert 409 on
  stale `expectedBodyVersion`.
- **Vitest integration (api):** ordering test (above).
- **Vitest integration (api):** regen with `currentBody` containing
  user placements — fixture LLM call returns a body that omits one
  user-placed batch; assert the validator restores it and logs the
  violation.
- **Vitest unit (mobile):** `collectPlacedAttachmentIds` +
  `resolveBatches` — placed, unplaced, mixed kinds, deleted note
  dangling in body.
- **Vitest unit (mobile):** `PhotoGroupPlacementSheet` snapshot +
  tap → `onSelect`.
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

## Out of scope (explicit carve-outs)

- **Multi-select / bulk move.** Tracked in plan-p3 follow-ups. The
  underlying mutation is per-note already.
- **Drag-and-drop reorder of placed batches within a section.**
  Position within `attachments.images` is array order; the LLM
  controls it on regen, the user can't reorder in this iteration.
- **Per-photo caption UI.** Column added (`note_files.caption`); UI
  surfacing is a separate design.
- **Auto-place-everything pass.** Not yet — start with "LLM places
  high-confidence batches" and learn from real regens.
- **Stable issue/section IDs.** Sidestepped by nesting `attachments`
  inside the issue/section object. Real stable IDs are a future
  larger change.

## Implementation checklist (single PR, ~one commit per item)

Schema + ordering:
1. `feat(api): migration NN_notes_metadata — source, meta, note_files.caption, ordering index + CHECK`
2. `feat(api): notesCanonicalOrder helper + audit read sites`
3. `feat(api): POST /notes accepts source + meta; backfill existing rows`
4. `test(api): notes.ordering.integration.test.ts`
5. `feat(mobile): pass source on each note creation flow`

Attachments in body:
6. `feat(api-contract): attachments schema on issue + section`
7. `feat(api): sanitiseAttachments validator + unit tests`
8. `feat(api): setReportBody runs sanitiseAttachments`

Structured LLM payload:
9. `feat(api): collectNotesForGeneration returns GenerationPayload`
10. `feat(api): reportGeneration prompt switches to JSON; system rules updated`
11. `feat(api): LLM output schema includes attachments; live fixture updated`
12. `test(api): regen with currentBody preserves user placements`

Endpoint + mobile UI:
13. `feat(api): PATCH /reports/{r}/attachments + service + scope test`
14. `test(api): default-wiring integration test (Pitfall 13)`
15. `feat(mobile): renderer reads body.attachments; bottom card filter`
16. `feat(mobile): PhotoGroupPlacementSheet + PhotoPlacementChip + PlacedPhotoStrip`
17. `feat(mobile): usePlaceAttachment hook with 409 handling`
18. `feat(mobile): wire chip + sheet into ReportView / saved-report screen`
19. `test(maestro): place-photo-on-issue flow including regen-preserves-placement step`

Docs:
20. `docs: link design from architecture.md row 17, arch-batch-photo-notes.md, plan-p3`

## Open questions

- **Q1:** Should the LLM be allowed to *un*-place a batch on regen
  (as opposed to leaving it placed where the user put it)? Current
  proposal: **no** — preserve rule is absolute, validator enforces.
  Relax later if real regens show the LLM has good reasons.
- **Q2:** Should the UI visually distinguish "auto-placed by LLM"
  from "user-placed" (subtle badge)? Useful for trust early; defer.
  Cheap to add later by extending the entry to `{ id, by: 'user' | 'llm' }`.
- **Q3:** User-driven reorder of batches within a section. Today
  array order in `attachments.images` is LLM-controlled. Defer.
- **Q4:** Should the placement endpoint switch to `{ targetId }`
  once stable issue/section IDs exist? Yes — but stable IDs aren't
  on the roadmap; defer until they are.
