# Report auto-regeneration

Automatic report regeneration fires whenever notes change (add, edit,
delete, voice transcription, or file attachment), persists across app
restarts, and does NOT fire on manual body edits.

## Mechanism

```
notes_changed_at (DB)  >  generated_at (DB)  →  needsRegeneration = true
```

The API exposes `needsRegeneration: boolean` on every report response.
The mobile `useAutoRegenerate` hook reads this flag and fires the
regenerate mutation when all of:

1. `needsRegeneration === true`
2. Report status is `'draft'`
3. No generation is in flight (`isGenerating === false`)
4. No generation error is set (`generationError === null`)

## Race safety (snapshot semantic)

When `runGenerate` begins it snapshots `report.notesChangedAt` as
`snapshotTs`. After the AI call resolves, `setReportBody` writes:

```sql
generated_at = COALESCE(snapshotTs::timestamptz, now())
```

If a note arrives at T0.5 between snapshot (T0) and save (T1), the
bump sets `notes_changed_at = now()` which is > the saved
`generated_at = T0`. So `needsRegeneration` stays true and the hook
fires a follow-up — the "queue-of-one" pattern.

## Queue-of-one

No explicit queue or debounce timer exists. The mechanism relies on
React Query invalidation:

1. Note add → API bumps `notes_changed_at` → invalidation refetches
   report → `needsRegeneration` flips true → hook fires.
2. Hook fires `onRegenerate` → `isGenerating` becomes true → hook
   gates further calls.
3. Generation resolves → `isGenerating` false → report refetch shows
   either `needsRegeneration: false` (done) or `true` (a note arrived
   mid-flight) → hook fires exactly once more if needed.

## Expand-contract

During the migration expand window:

- `notes_changed_at` (new) is written alongside the legacy
  `notes_since_last_generation` counter.
- `needsRegenerationOf()` prefers `notes_changed_at` when non-null;
  falls back to `notes_since_last_generation > 0`.
- The counter column and its reads will be dropped in a follow-up
  release once all mobile clients have upgraded past the expand.

## Key files

| Layer | File | Purpose |
|-------|------|---------|
| DB | `packages/api/migrations/0011_*.sql` | Adds `notes_changed_at` |
| Schema | `packages/api/src/db/schema.ts` | Drizzle column |
| Service | `packages/api/src/services/reports.ts` | `needsRegenerationOf`, `toReportResponse`, `setReportBody` |
| Service | `packages/api/src/services/notes.ts` | `bumpNotesChangedAt` |
| Route | `packages/api/src/routes/reports.ts` | `runGenerate` snapshot + all 8 response sites wrapped |
| Contract | `packages/api-contract/src/schemas/reports.ts` | `needsRegeneration`, `notesChangedAt` |
| Hook | `apps/mobile/features/generate/useAutoRegenerate.ts` | Effect that fires regeneration |
| Route | `apps/mobile/app/(app)/.../generate.tsx` | Calls hook with server-derived inputs |
| Provider | `apps/mobile/features/generate/GenerateReportProvider.tsx` | Exposes `needsRegeneration` to action row |

## Design spec

Full design document:
`docs/superpowers/specs/2026-05-28-auto-regenerate-reports-design.md`
