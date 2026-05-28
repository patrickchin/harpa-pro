# Auto-Regenerate Reports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-regenerate the report whenever notes change, persist the dirty state across app restarts, and replace the racy counter with a `notes_changed_at` / `generated_at` timestamp pair surfaced as a `needsRegeneration: boolean`.

**Architecture:**
- Server: drop `reports.notes_since_last_generation`; add `reports.notes_changed_at timestamptz`. Bump it on every note add / delete / edit (draft reports only). `runGenerate` captures a snapshot and sets `generated_at = GREATEST(now(), snapshot_ts)` so concurrent bumps survive the in-flight call. Expose `needsRegeneration` (`notes_changed_at IS NOT NULL AND (generated_at IS NULL OR notes_changed_at > generated_at)`) in the API contract.
- Mobile: new `useAutoRegenerate` hook on the generate screen — fires `handleRegenerate` when `needsRegeneration` is true, status is `draft`, no in-flight generation, and no error. Queue-of-one is implicit via React Query invalidation; error gate is the existing `generationError` setter.

**Tech Stack:** Hono + Drizzle + Postgres (Testcontainers for integration tests), `@hono/zod-openapi` contract, `openapi-typescript` codegen, React Native + Expo Router + React Query on mobile, Vitest + `react-test-renderer` for mobile tests.

**Spec:** `docs/superpowers/specs/2026-05-28-auto-regenerate-reports-design.md`

---

## Phase A — Server: schema + service

### Task 1: Migration `0011_notes_changed_at.sql`

**Files:**
- Create: `packages/api/migrations/0011_notes_changed_at.sql`

- [ ] **Step 1: Add the migration**

Migrations are plain SQL applied in lexical order by `packages/api/src/db/migrate.ts`. We follow the comment-header style used by `0010_note_files.sql`.

```sql
-- 0011_notes_changed_at.sql
--
-- Replace the racy `notes_since_last_generation` counter with a
-- `notes_changed_at` timestamp. Dirty state is then
-- `notes_changed_at IS NOT NULL AND
--   (generated_at IS NULL OR notes_changed_at > generated_at)`.
--
-- See docs/superpowers/specs/2026-05-28-auto-regenerate-reports-design.md.

ALTER TABLE app.reports
  ADD COLUMN notes_changed_at timestamptz;

-- Backfill: any report whose counter was non-zero is dirty. Use
-- updated_at as the best-effort "last changed" timestamp.
UPDATE app.reports
   SET notes_changed_at = updated_at
 WHERE notes_since_last_generation > 0;

ALTER TABLE app.reports
  DROP COLUMN notes_since_last_generation;
```

- [ ] **Step 2: Verify locally**

```bash
cd packages/api && pnpm test:integration -t 'migrate'
```

Expected: existing `migrate.advisory-lock.integration.test.ts` and `migrate.failing-file.integration.test.ts` still pass — the new file applies cleanly under the lock.

- [ ] **Step 3: Commit**

```bash
git add packages/api/migrations/0011_notes_changed_at.sql
git commit -m "feat(api): migration 0011 — notes_changed_at replaces counter"
```

---

### Task 2: Drizzle schema reflects the column swap

**Files:**
- Modify: `packages/api/src/db/schema.ts:98-124`

- [ ] **Step 1: Write the failing schema check (existing tests catch the drift)**

The repository's existing integration tests will fail to compile if the schema field stays misnamed — Vitest config compiles TypeScript before running. Run:

```bash
cd packages/api && pnpm typecheck
```

Expected: clean before edit, fails after the column rename below until the service / route updates land. That is fine for this task — we let typecheck stay red across the phase and clear it in Task 4.

- [ ] **Step 2: Edit the schema**

Replace lines 110–112 of `packages/api/src/db/schema.ts`:

```ts
// before:
//   body: jsonb('body'),
//   notesSinceLastGeneration: integer('notes_since_last_generation').notNull().default(0),
//   generatedAt: timestamp('generated_at', { withTimezone: true }),

// after:
    body: jsonb('body'),
    notesChangedAt: timestamp('notes_changed_at', { withTimezone: true }),
    generatedAt: timestamp('generated_at', { withTimezone: true }),
```

- [ ] **Step 3: Commit**

```bash
git add packages/api/src/db/schema.ts
git commit -m "feat(api): drop notes_since_last_generation from reports schema"
```

---

### Task 3: Service layer — bump helper + read mapping

**Files:**
- Modify: `packages/api/src/services/reports.ts:37-83` (types + `mapReport`)
- Modify: `packages/api/src/services/reports.ts:101-394` (every SELECT/UPDATE list)
- Modify: `packages/api/src/services/notes.ts:175-363` (calls bump helper)
- Create test additions in: `packages/api/src/__tests__/notes.integration.test.ts` (update existing, add delete/update cases)

- [ ] **Step 1: Write the failing integration tests**

Open `packages/api/src/__tests__/notes.integration.test.ts`. Replace the existing "bumps `notes_since_last_generation`" test (lines 64–100) with a `notes_changed_at` version, then add delete + update cases. Keep the rest of the file unchanged.

```ts
async function readDirty(reportId: string) {
  const c = await getPool().connect();
  try {
    const r = await c.query<{ changed_at: Date | null; generated_at: Date | null }>(
      `SELECT notes_changed_at AS changed_at, generated_at FROM app.reports WHERE id = $1`,
      [reportId],
    );
    return r.rows[0] ?? { changed_at: null, generated_at: null };
  } finally {
    c.release();
  }
}

it('POST creates a text note and bumps notes_changed_at', async () => {
  const app = createApp();
  const tok = await signTestToken(alice, aliceSid);
  const before = await readDirty(report);
  expect(before.changed_at).toBeNull();
  const res = await app.request(`/reports/${report}/notes`, {
    method: 'POST',
    headers: headers(tok),
    body: JSON.stringify({ kind: 'text', body: 'first observation' }),
  });
  expect(res.status).toBe(201);
  const body = (await res.json()) as { id: string };
  noteId = body.id;
  const after = await readDirty(report);
  expect(after.changed_at).not.toBeNull();
});

it('PATCH note body bumps notes_changed_at', async () => {
  const app = createApp();
  const tok = await signTestToken(alice, aliceSid);
  // Reset the dirty bit so the assertion is meaningful.
  const reset = await getPool().connect();
  try {
    await reset.query(
      `UPDATE app.reports SET notes_changed_at = NULL, generated_at = now() WHERE id = $1`,
      [report],
    );
  } finally {
    reset.release();
  }
  const res = await app.request(`/notes/${noteId}`, {
    method: 'PATCH',
    headers: headers(tok),
    body: JSON.stringify({ body: 'edited observation' }),
  });
  expect(res.status).toBe(200);
  const after = await readDirty(report);
  expect(after.changed_at).not.toBeNull();
  expect(new Date(after.changed_at!).getTime()).toBeGreaterThan(
    new Date(after.generated_at!).getTime(),
  );
});

it('DELETE note bumps notes_changed_at', async () => {
  const app = createApp();
  const tok = await signTestToken(alice, aliceSid);
  // Reset first.
  const reset = await getPool().connect();
  try {
    await reset.query(
      `UPDATE app.reports SET notes_changed_at = NULL, generated_at = now() WHERE id = $1`,
      [report],
    );
  } finally {
    reset.release();
  }
  const res = await app.request(`/notes/${noteId}`, {
    method: 'DELETE',
    headers: headers(tok),
  });
  expect(res.status).toBe(204);
  const after = await readDirty(report);
  expect(after.changed_at).not.toBeNull();
});
```

- [ ] **Step 2: Run them — expect failure**

```bash
cd packages/api && pnpm test:integration -t 'notes CRUD'
```

Expected: compile errors (schema mismatch from Task 2) and/or test failures.

- [ ] **Step 3: Update `services/reports.ts` — types and mapper**

In `packages/api/src/services/reports.ts`:

Replace `ReportRow` (lines 37–50):

```ts
export interface ReportRow {
  id: string;
  number: number;
  projectId: string;
  status: ReportStatus;
  visitDate: string | null;
  body: ReportBody | null;
  notesChangedAt: string | null;
  generatedAt: string | null;
  finalizedAt: string | null;
  pdfUrl: string | null;
  createdAt: string;
  updatedAt: string;
}
```

Replace `RawReport` (lines 52–66):

```ts
interface RawReport {
  [key: string]: unknown;
  id: string;
  number: number;
  project_id: string;
  status: ReportStatus;
  visit_date: Date | null;
  body: ReportBody | null;
  notes_changed_at: Date | null;
  generated_at: Date | null;
  finalized_at: Date | null;
  pdf_file_id: string | null;
  created_at: Date;
  updated_at: Date;
}
```

Replace `mapReport` (lines 68–83):

```ts
function mapReport(r: RawReport): ReportRow {
  return {
    id: r.id,
    number: Number(r.number),
    projectId: r.project_id,
    status: r.status,
    visitDate: r.visit_date ? new Date(r.visit_date).toISOString() : null,
    body: r.body,
    notesChangedAt: r.notes_changed_at ? new Date(r.notes_changed_at).toISOString() : null,
    generatedAt: r.generated_at ? new Date(r.generated_at).toISOString() : null,
    finalizedAt: r.finalized_at ? new Date(r.finalized_at).toISOString() : null,
    pdfUrl: null,
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
  };
}
```

- [ ] **Step 4: Replace every `notes_since_last_generation` SQL fragment**

In the same file, every SELECT and `RETURNING` list currently includes `notes_since_last_generation`. Replace each occurrence with `notes_changed_at`. The affected blocks are at lines ~111-113, ~122-124, ~144-146, ~168-170, ~239-241, ~288-290, ~373-375, ~388-390, ~411-413, ~429-431.

Apply this single text edit for each one:

```
- notes_since_last_generation, generated_at, finalized_at,
+ notes_changed_at, generated_at, finalized_at,
```

And the `r.` qualified variant in `getReportByProjectSlugAndNumber`:

```
- r.notes_since_last_generation, r.generated_at, r.finalized_at,
+ r.notes_changed_at, r.generated_at, r.finalized_at,
```

- [ ] **Step 5: Update `setReportBody` — capture snapshot, race-safe update**

Replace `setReportBody` (lines 355–379) with:

```ts
export async function setReportBody(
  db: Db,
  reportId: string,
  body: ReportBody,
  lastGeneration?: ReportLastGeneration,
  /**
   * Snapshot of `report.notes_changed_at` taken BEFORE the AI call.
   * `generated_at` is clamped to at least this value so concurrent
   * bumps that landed during the call remain "dirty" (notes_changed_at
   * stays > generated_at). When omitted, `now()` is used (first-time
   * generate has nothing to race).
   */
  snapshotTs?: string | null,
): Promise<ReportRow | null> {
  const lastGenJson = lastGeneration ? JSON.stringify(lastGeneration) : null;
  const r = await db.execute<RawReport>(sql`
    UPDATE app.reports
    SET body = ${JSON.stringify(body)}::jsonb,
        generated_at = GREATEST(now(), ${snapshotTs ?? null}::timestamptz),
        last_generation = CASE
          WHEN ${lastGenJson}::text IS NOT NULL THEN ${lastGenJson}::jsonb
          ELSE last_generation
        END,
        updated_at = now()
    WHERE id = ${reportId}
    RETURNING id, number, project_id, status, visit_date, body,
              notes_changed_at, generated_at, finalized_at,
              pdf_file_id, created_at, updated_at
  `);
  const row = r.rows[0];
  return row ? mapReport(row) : null;
}
```

Note: we intentionally remove `notes_since_last_generation = 0`. `notes_changed_at` is NOT cleared — the comparison handles dirty state.

- [ ] **Step 6: Add the `bumpNotesChangedAt` helper to `services/notes.ts`**

Add this near the top of `packages/api/src/services/notes.ts`, after the imports and before `listNotes`:

```ts
/**
 * Mark a draft report's notes as changed. Called from every note
 * mutation (add / delete / edit). No-op on finalized reports
 * because finalization is an immutable snapshot.
 *
 * TODO: when a caption-update route is added for `note_files`,
 * call this helper from it too.
 */
async function bumpNotesChangedAt(db: Db, reportId: string): Promise<void> {
  await db.execute(sql`
    UPDATE app.reports
       SET notes_changed_at = now(),
           updated_at       = now()
     WHERE id = ${reportId}
       AND status = 'draft'
  `);
}
```

Then replace the existing counter updates in this file:

- Lines 258–263 (inside `createNote`) — replace the block:

```ts
  await db.execute(sql`
    UPDATE app.reports
    SET notes_since_last_generation = notes_since_last_generation + 1,
        updated_at = now()
    WHERE id = ${reportId}
  `);
```

with:

```ts
  await bumpNotesChangedAt(db, reportId);
```

- Lines 313–318 (inside `createVoiceNote`) — same replacement.

- Inside `updateNote` (lines 328–356), after the `UPDATE ... RETURNING` returns a row, add the bump before `return`. Modify the end of the function:

```ts
  const row = r.rows[0];
  if (!row) return null;
  await bumpNotesChangedAt(db, row.report_id);
  return mapNote(row);
}
```

`RawNote` already exposes `report_id` — verify by reading the top of the file; if it doesn't, fetch it via the existing `mapNote` output (`mapNote(row).reportId`) and call `bumpNotesChangedAt(db, mapNote(row).reportId)` instead.

- Inside `deleteNote` (lines 358–363), capture the `report_id` in the RETURNING clause and bump:

```ts
export async function deleteNote(db: Db, noteId: string): Promise<boolean> {
  const r = await db.execute<{ id: string; report_id: string }>(sql`
    DELETE FROM app.notes WHERE id = ${noteId} RETURNING id, report_id
  `);
  const row = r.rows[0];
  if (!row) return false;
  await bumpNotesChangedAt(db, row.report_id);
  return true;
}
```

- [ ] **Step 7: Re-run the integration tests**

```bash
cd packages/api && pnpm test:integration -t 'notes CRUD'
```

Expected: all four cases pass (add bumps, edit bumps with `changed_at > generated_at`, delete bumps, RLS 404 case still passes).

- [ ] **Step 8: Commit**

```bash
git add packages/api/src/services/reports.ts packages/api/src/services/notes.ts \
        packages/api/src/__tests__/notes.integration.test.ts
git commit -m "feat(api): bump notes_changed_at on add/edit/delete (race-safe)"
```

---

### Task 4: Wire `snapshotTs` through `runGenerate`

**Files:**
- Modify: `packages/api/src/routes/reports.ts:311-369`
- Create test additions in: `packages/api/src/__tests__/reports.generate.integration.test.ts` (if it exists; otherwise add to the closest existing reports-generate test).

- [ ] **Step 1: Locate the closest existing test for generate**

```bash
cd packages/api && rg -l "runGenerate|/generate" src/__tests__ | head
```

If a `reports.generate.integration.test.ts` (or similar) exists, append to it; otherwise add a new file `packages/api/src/__tests__/reports.regenerate-race.integration.test.ts` modelled on `notes.integration.test.ts` boilerplate (same `startPg` / `signTestToken` / admin-seed pattern).

- [ ] **Step 2: Write the failing race test**

Add this test:

```ts
it('keeps notes_changed_at > generated_at when a note arrives mid-generate', async () => {
  const app = createApp();
  const tok = await signTestToken(alice, aliceSid);
  // Add a note so the report has something to generate from.
  const addRes = await app.request(`/reports/${report}/notes`, {
    method: 'POST',
    headers: headers(tok),
    body: JSON.stringify({ kind: 'text', body: 'one' }),
  });
  expect(addRes.status).toBe(201);

  // Simulate the race: bump notes_changed_at to a value FAR in the
  // future so setReportBody's `GREATEST(now(), snapshotTs)` cannot
  // pass it. If the route captures the snapshot before the bump
  // (current code path), generated_at lands at GREATEST(now(),
  // pre-bump-ts) which is < future bump → dirty stays true.
  const future = new Date(Date.now() + 60_000).toISOString();
  const c = await getPool().connect();
  try {
    await c.query(
      `UPDATE app.reports SET notes_changed_at = $1 WHERE id = $2`,
      [future, report],
    );
  } finally {
    c.release();
  }

  const gen = await app.request(
    `/projects/${projectSlug}/reports/1/generate`,
    {
      method: 'POST',
      headers: headers(tok),
      body: JSON.stringify({ fixtureName: 'minimal' }),
    },
  );
  expect(gen.status).toBe(200);
  const after = await readDirty(report);
  expect(new Date(after.changed_at!).getTime()).toBeGreaterThan(
    new Date(after.generated_at!).getTime(),
  );
});
```

- [ ] **Step 3: Run it — expect failure**

```bash
cd packages/api && pnpm test:integration -t 'mid-generate'
```

Expected: fail (current code resets without GREATEST clamp behaviour — but snapshotTs is also not threaded yet).

- [ ] **Step 4: Capture snapshot in `runGenerate`**

In `packages/api/src/routes/reports.ts`, modify `runGenerate` (~line 311). Right after the `enforceUsageLimit` call (line 326), capture:

```ts
  const snapshotTs = report.notesChangedAt;
```

Then change the `setReportBody` call (line 357) from:

```ts
  const updated = await db((d) => setReportBody(d, report.id, out.body, lastGeneration));
```

to:

```ts
  const updated = await db((d) => setReportBody(d, report.id, out.body, lastGeneration, snapshotTs));
```

Update the surrounding doc comment (lines 300–310) to drop the "reset notes_since_last_generation" sentence and replace it with: *"Both replace `body` and capture `notes_changed_at` BEFORE the AI call so a concurrent note bump remains visible afterwards."*

- [ ] **Step 5: Re-run the race test**

```bash
cd packages/api && pnpm test:integration -t 'mid-generate'
```

Expected: pass.

- [ ] **Step 6: Run the whole API integration suite**

```bash
cd packages/api && pnpm test:integration
```

Expected: green. If anything failed because of leftover `notes_since_last_generation` references in service or route code, grep:

```bash
cd packages/api && rg -n 'notes_since_last_generation|notesSinceLastGeneration' src
```

The only remaining hits should be inside the migration SQL string. Anywhere else → fix it now and re-run.

- [ ] **Step 7: Commit**

```bash
git add packages/api/src/routes/reports.ts packages/api/src/__tests__/
git commit -m "feat(api): race-safe regenerate via notes_changed_at snapshot"
```

---

### Task 5: Add `needsRegeneration` to the API contract

**Files:**
- Modify: `packages/api-contract/src/schemas/reports.ts:60-73`
- Regenerate: `packages/api-contract/openapi.json` and `packages/api-contract/src/generated/types.ts` via `pnpm --filter @harpa/api-contract gen:types`
- Modify: `packages/api/src/services/reports.ts` (every place that mapped → contract goes through `mapReport`; nothing else to touch here since the contract field is derived in the route layer — see step 3).

- [ ] **Step 1: Edit the Zod schema**

Replace `notesSinceLastGeneration: z.number().int().nonnegative(),` on line 67 of `packages/api-contract/src/schemas/reports.ts` with:

```ts
  notesChangedAt: isoDateTime.nullable(),
  needsRegeneration: z.boolean(),
```

Also remove the now-stale comment block on lines 81–86 referencing the counter and replace with:

```ts
  // Manual edits from the Edit tab autosave. Persisted into the same
  // `reports.body` column the AI writes — single source of truth. The
  // autosave path does NOT touch `notes_changed_at`, so manual edits
  // never flip `needsRegeneration` to true. See
  // docs/superpowers/specs/2026-05-28-auto-regenerate-reports-design.md.
```

- [ ] **Step 2: Regenerate types**

```bash
pnpm --filter @harpa/api-contract gen:types
```

Expected: `openapi.json` + `src/generated/types.ts` updated. Confirm `notesSinceLastGeneration` no longer appears:

```bash
cd packages/api-contract && rg -n 'notesSinceLastGeneration|notesChangedAt|needsRegeneration' src/generated
```

Only the latter two should appear.

- [ ] **Step 3: Compute `needsRegeneration` in the route response**

The contract now expects every report response to include `needsRegeneration`. Add a tiny helper in `packages/api/src/services/reports.ts` (right after `mapReport`):

```ts
export function needsRegenerationOf(report: ReportRow): boolean {
  if (report.notesChangedAt === null) return false;
  if (report.generatedAt === null) return true;
  return report.notesChangedAt > report.generatedAt;
}
```

Then in `packages/api/src/routes/reports.ts`, find every handler that returns a report (search for `c.json({ ... report` and bare `c.json({ ...report`). Each must surface the derived field. The least invasive change: introduce a single response-shaping helper near the top of the file:

```ts
import { needsRegenerationOf, type ReportRow } from '../services/reports.js';

function toReportResponse(r: ReportRow) {
  return { ...r, needsRegeneration: needsRegenerationOf(r) };
}
```

Then replace every `c.json({ report: result.report, ... })` with `c.json({ report: toReportResponse(result.report), ... })` and every list mapping with `items: rows.items.map(toReportResponse)`.

Run:

```bash
cd packages/api && rg -n 'c\.json\(.*report' src/routes
```

…to find call sites — there should be a handful (GET single, GET by ID, list, create, update, generate, regenerate, finalize, unfinalize).

- [ ] **Step 4: Run unit + integration**

```bash
cd packages/api && pnpm test && pnpm test:integration
```

Expected: green. Add or update one existing test to assert `needsRegeneration` is `true` after a note add and `false` after generate.

- [ ] **Step 5: Commit**

```bash
git add packages/api-contract packages/api/src/services/reports.ts packages/api/src/routes/reports.ts
git commit -m "feat(api-contract): expose needsRegeneration + notesChangedAt"
```

---

## Phase B — Mobile: hook + wiring

### Task 6: Add `needsRegeneration` to optimistic + types

**Files:**
- Modify: `apps/mobile/lib/api/optimistic.ts:357-370` (optimistic shape)
- Modify: `apps/mobile/lib/api/optimistic.test.tsx:328-362` (test fixture shape)

- [ ] **Step 1: Update the optimistic Report shape**

In `apps/mobile/lib/api/optimistic.ts`, replace `notesSinceLastGeneration: 0,` (line 364) with:

```ts
        notesChangedAt: null,
        needsRegeneration: false,
```

- [ ] **Step 2: Update the test fixture**

In `apps/mobile/lib/api/optimistic.test.tsx`, replace `notesSinceLastGeneration: number;` (line 335) with:

```ts
  notesChangedAt: string | null;
  needsRegeneration: boolean;
```

…and the seed (line 356):

```ts
    notesChangedAt: null,
    needsRegeneration: false,
```

- [ ] **Step 3: Run mobile tests**

```bash
cd apps/mobile && pnpm test -t 'optimistic'
```

Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/lib/api/optimistic.ts apps/mobile/lib/api/optimistic.test.tsx
git commit -m "feat(mobile): swap counter for needsRegeneration in optimistic cache"
```

---

### Task 7: `useAutoRegenerate` hook (TDD)

**Files:**
- Create: `apps/mobile/features/generate/useAutoRegenerate.ts`
- Create: `apps/mobile/features/generate/useAutoRegenerate.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
import { describe, it, expect, vi } from 'vitest';
import TestRenderer, { act } from 'react-test-renderer';
import { useAutoRegenerate } from './useAutoRegenerate';

function Harness(props: Parameters<typeof useAutoRegenerate>[0]) {
  useAutoRegenerate(props);
  return null;
}

const base = {
  needsRegeneration: false,
  status: 'draft' as const,
  isGenerating: false,
  generationError: null,
};

describe('useAutoRegenerate', () => {
  it('fires onRegenerate when needsRegeneration flips true', () => {
    const onRegenerate = vi.fn();
    const tree = TestRenderer.create(
      <Harness {...base} onRegenerate={onRegenerate} />,
    );
    expect(onRegenerate).not.toHaveBeenCalled();
    act(() => {
      tree.update(
        <Harness {...base} needsRegeneration onRegenerate={onRegenerate} />,
      );
    });
    expect(onRegenerate).toHaveBeenCalledTimes(1);
  });

  it('does not fire while isGenerating', () => {
    const onRegenerate = vi.fn();
    TestRenderer.create(
      <Harness
        {...base}
        needsRegeneration
        isGenerating
        onRegenerate={onRegenerate}
      />,
    );
    expect(onRegenerate).not.toHaveBeenCalled();
  });

  it('does not fire when generationError is set', () => {
    const onRegenerate = vi.fn();
    TestRenderer.create(
      <Harness
        {...base}
        needsRegeneration
        generationError="boom"
        onRegenerate={onRegenerate}
      />,
    );
    expect(onRegenerate).not.toHaveBeenCalled();
  });

  it('resumes after generationError clears', () => {
    const onRegenerate = vi.fn();
    const tree = TestRenderer.create(
      <Harness
        {...base}
        needsRegeneration
        generationError="boom"
        onRegenerate={onRegenerate}
      />,
    );
    expect(onRegenerate).not.toHaveBeenCalled();
    act(() => {
      tree.update(
        <Harness
          {...base}
          needsRegeneration
          generationError={null}
          onRegenerate={onRegenerate}
        />,
      );
    });
    expect(onRegenerate).toHaveBeenCalledTimes(1);
  });

  it('does not fire for finalized reports', () => {
    const onRegenerate = vi.fn();
    TestRenderer.create(
      <Harness
        {...base}
        needsRegeneration
        status="finalized"
        onRegenerate={onRegenerate}
      />,
    );
    expect(onRegenerate).not.toHaveBeenCalled();
  });

  it('queue-of-one: re-fires when flag stays true after an in-flight resolves', () => {
    const onRegenerate = vi.fn();
    const tree = TestRenderer.create(
      <Harness
        {...base}
        needsRegeneration
        isGenerating
        onRegenerate={onRegenerate}
      />,
    );
    expect(onRegenerate).not.toHaveBeenCalled();
    act(() => {
      // In-flight resolves; React Query refetch shows the flag is still true.
      tree.update(
        <Harness
          {...base}
          needsRegeneration
          isGenerating={false}
          onRegenerate={onRegenerate}
        />,
      );
    });
    expect(onRegenerate).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run — expect failure**

```bash
cd apps/mobile && pnpm test -t useAutoRegenerate
```

Expected: module-not-found failure.

- [ ] **Step 3: Implement the hook**

Create `apps/mobile/features/generate/useAutoRegenerate.ts`:

```ts
/**
 * Fires `onRegenerate` whenever the report needs regeneration and no
 * blocker is active. The DB-backed `needsRegeneration` flag drives
 * the effect, which makes the trigger persistent across app
 * restarts (the next foreground sees the flag still true and fires
 * once). The queue-of-one falls out naturally: while a regen is in
 * flight `isGenerating` is true, so we skip; when it resolves, React
 * Query invalidates the report row — if the flag is still true we
 * fire exactly one follow-up.
 *
 * See docs/superpowers/specs/2026-05-28-auto-regenerate-reports-design.md.
 */
import { useEffect } from 'react';

export interface UseAutoRegenerateInput {
  needsRegeneration: boolean;
  status: 'draft' | 'finalized';
  isGenerating: boolean;
  generationError: string | null;
  onRegenerate: () => void;
}

export function useAutoRegenerate({
  needsRegeneration,
  status,
  isGenerating,
  generationError,
  onRegenerate,
}: UseAutoRegenerateInput): void {
  useEffect(() => {
    if (!needsRegeneration) return;
    if (status !== 'draft') return;
    if (isGenerating) return;
    if (generationError !== null) return;
    onRegenerate();
  }, [needsRegeneration, status, isGenerating, generationError, onRegenerate]);
}
```

- [ ] **Step 4: Run — expect pass**

```bash
cd apps/mobile && pnpm test -t useAutoRegenerate
```

Expected: all six cases pass.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/features/generate/useAutoRegenerate.ts \
        apps/mobile/features/generate/useAutoRegenerate.test.tsx
git commit -m "feat(mobile): useAutoRegenerate hook (TDD)"
```

---

### Task 8: Replace counter in provider + action row + route

**Files:**
- Modify: `apps/mobile/features/generate/GenerateReportProvider.tsx` (every `notesSinceLastGeneration` site — lines 96, 269–270, 392, 735, 816)
- Modify: `apps/mobile/components/reports/generate/GenerateReportActionRow.tsx` (lines 10, 24, 37)
- Modify: `apps/mobile/app/(app)/projects/[project]/reports/[number]/generate.tsx` (lines 160, 546 + add hook call)
- Modify: `apps/mobile/lib/reports/use-report-body-autosave.ts:23-27` (comment update)

- [ ] **Step 1: Provider — swap prop & context field**

In `GenerateReportProvider.tsx`:

- Line 96 — replace `notesSinceLastGeneration?: number;` with `needsRegeneration?: boolean;`. Update the prop doc above it to: *"Whether the report's notes have changed since the last successful generation. Drives the auto-regenerate effect."*
- Line 269–270 — in the `GenerationSurface` interface, replace `notesSinceLastGeneration: number;` with `needsRegeneration: boolean;` and update its doc comment to: *"True when notes have changed since last generation. The Action Row uses this to switch label."*
- Line 392 — replace default `notesSinceLastGeneration = 0,` with `needsRegeneration = false,`.
- Line 735 (inside `generation: { … }`) — replace `notesSinceLastGeneration,` with `needsRegeneration,`.
- Line 816 (deps array) — replace `notesSinceLastGeneration,` with `needsRegeneration,`.

- [ ] **Step 2: Action row — swap counter logic**

Replace `apps/mobile/components/reports/generate/GenerateReportActionRow.tsx` lines 10, 24, 37:

```tsx
// Line 10 (doc comment): rewrite the sentence.
 * `hasReport` + `needsRegeneration` to switch label / layout.

// Line 24:
  const upToDate = hasReport && !generation.needsRegeneration;

// Line 37 — drop the (N) suffix since we no longer carry a count.
        : 'Update report';
```

- [ ] **Step 3: Route — pass `needsRegeneration` and wire the hook**

In `apps/mobile/app/(app)/projects/[project]/reports/[number]/generate.tsx`:

- Line 160 — replace the `reportRow` type:

```ts
        notesChangedAt?: string | null;
        needsRegeneration?: boolean;
```

(remove `notesSinceLastGeneration?: number;`)

- Right before the `return` block (around line 525), add:

```ts
  useAutoRegenerate({
    needsRegeneration: reportRow?.needsRegeneration ?? false,
    status: reportRow?.status ?? 'draft',
    isGenerating,
    generationError: combinedError,
    onRegenerate: handleRegenerate,
  });
```

…and add the import at the top of the file:

```ts
import { useAutoRegenerate } from '@/features/generate/useAutoRegenerate';
```

- Line 546 — replace `notesSinceLastGeneration={reportRow?.notesSinceLastGeneration ?? 0}` with `needsRegeneration={reportRow?.needsRegeneration ?? false}`.

- [ ] **Step 4: Update the autosave comment**

In `apps/mobile/lib/reports/use-report-body-autosave.ts` lines 23–27, replace the paragraph with:

```ts
 * `notes_changed_at` is INTENTIONALLY not bumped by manual edits
 * (the API service makes the same guarantee — see
 * `services/reports.ts` `updateReport`). Manual edits and AI loops
 * are independent: `needsRegeneration` stays false when only the
 * body changes.
```

- [ ] **Step 5: Sweep for stragglers**

```bash
cd apps/mobile && rg -n 'notesSinceLastGeneration'
```

Expected: zero matches. Fix any remaining references (e.g. invalidation comment on `lib/api/invalidation.ts:62`).

- [ ] **Step 6: Run mobile tests**

```bash
cd apps/mobile && pnpm test
```

Expected: green. Some pre-existing snapshots referencing "Update report (N)" may need updating — run `pnpm test -u` once snapshots are visually inspected.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile
git commit -m "feat(mobile): drive auto-regen from needsRegeneration"
```

---

### Task 9: Route-level integration test exercises the real hook

**Files:**
- Modify: `apps/mobile/screens/generate-report-tab.test.tsx`

The default-wiring rule (AGENTS.md #5) requires at least one test that exercises `useAutoRegenerate` without a DI stub.

- [ ] **Step 1: Add the "auto-regenerates when needsRegeneration flips true" case**

Append a new test inside the existing `describe`:

```tsx
it('auto-regenerates when needsRegeneration flips true', () => {
  const onRegenerate = vi.fn();
  let tree: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(
      <GenerateNotes
        {...baseProps}
        initialTab="report"
        needsRegeneration={false}
        onRegenerate={onRegenerate}
      />,
    );
  });
  expect(onRegenerate).not.toHaveBeenCalled();
  act(() => {
    tree!.update(
      <GenerateNotes
        {...baseProps}
        initialTab="report"
        needsRegeneration={true}
        onRegenerate={onRegenerate}
      />,
    );
  });
  expect(onRegenerate).toHaveBeenCalledTimes(1);
});
```

(Adjust `baseProps` to match the existing harness in that file. If the file does not currently render `GenerateNotes` directly, model the new case on the existing populated-state test.)

The `useAutoRegenerate` hook is called from the real provider, NOT mocked — that is the point of this test.

- [ ] **Step 2: Run**

```bash
cd apps/mobile && pnpm test -t generate-report-tab
```

Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/screens/generate-report-tab.test.tsx
git commit -m "test(mobile): default-wiring case for useAutoRegenerate"
```

---

## Phase C — Docs

### Task 10: New arch doc + pitfall + finishing sweep

**Files:**
- Create: `docs/v4/arch-report-auto-regen.md`
- Modify: `docs/v4/pitfalls.md`
- Search-and-update: any other doc referencing `notes_since_last_generation` or "Update report (N)".

- [ ] **Step 1: Write `docs/v4/arch-report-auto-regen.md`**

```markdown
# Report auto-regenerate

The Report tab on the generate screen regenerates automatically
whenever the report's notes change. The trigger is persistent across
app restarts because it lives in Postgres, not in client memory.

## Dirty signal

Two timestamps on `app.reports`:

- `notes_changed_at timestamptz` — bumped to `now()` on every note
  add / delete / edit while the report is `draft`.
- `generated_at timestamptz` — set by `runGenerate` to
  `GREATEST(now(), snapshotTs)` where `snapshotTs` is the value of
  `notes_changed_at` captured BEFORE the AI call.

Derived:

```
needs_regeneration =
  notes_changed_at IS NOT NULL
  AND (generated_at IS NULL OR notes_changed_at > generated_at)
```

The API exposes this as a boolean `needsRegeneration` on every
report response.

## Race safety

`runGenerate` reads `notes_changed_at` into `snapshotTs` before
calling the AI. If a note mutation bumps `notes_changed_at` to
`now()` *during* the call, the bump's timestamp will be later than
`snapshotTs`. After the AI finishes, `setReportBody` sets
`generated_at = GREATEST(now(), snapshotTs)`. Because `now()` at
save time is later than the snapshot, the clamp is a no-op in the
happy path. In the racy path, `notes_changed_at` is still later
than `generated_at` and the dirty flag stays true. The mobile
auto-regen hook then queues exactly one follow-up.

## Mobile hook

`apps/mobile/features/generate/useAutoRegenerate.ts` runs an effect
that fires `handleRegenerate` when:

- `needsRegeneration` is `true`, AND
- `status === 'draft'`, AND
- no regeneration is currently in flight, AND
- no generation error is set.

The error gate is the user's "stop" button: once an auto-regen
fails, the loop holds until the user clears the error via the
manual Regenerate button (which clears `generationError` first).

## Manual edits

The Edit tab autosave PATCHes `reports.body` only — it does NOT
bump `notes_changed_at`. So manual edits never trigger auto-regen.
When a real note change *does* trigger one, `runGenerate` forwards
the current `report.body` as `existingBody` to the AI; the prompt
is responsible for preserving manual edits as best it can.
```

- [ ] **Step 2: Add the pitfall entry**

Append to `docs/v4/pitfalls.md`:

```markdown
## Pitfall N — don't model dirty state as a counter

Counters lie when the underlying domain has edits and deletes. We
tried `notes_since_last_generation int` (bumped on add, reset on
generate) and hit three real bugs: edits double-counted, deletes
made the noun wrong, and the unconditional reset clobbered bumps
that landed during the in-flight AI call (regen never fired again).

Use a timestamp pair instead: `notes_changed_at` (bumped on every
mutation) and `generated_at` (set at the end of the AI run). The
dirty flag is a comparison, not a number. Capture
`snapshotTs = notes_changed_at` BEFORE the AI call and write
`generated_at = GREATEST(now(), snapshotTs)` at the end — that one
clamp makes the whole loop race-safe.

See `docs/v4/arch-report-auto-regen.md`.
```

- [ ] **Step 3: Final sweep**

```bash
rg -n 'notes_since_last_generation|notesSinceLastGeneration|Update report \(' docs apps packages
```

Expected: matches only in the new migration SQL string and in `docs/legacy-v3/` (frozen). Anywhere else — fix it.

- [ ] **Step 4: Commit**

```bash
git add docs/v4/arch-report-auto-regen.md docs/v4/pitfalls.md
git commit -m "docs(reports): arch + pitfall for auto-regenerate"
```

---

## Verification

- [ ] `cd packages/api && pnpm typecheck && pnpm test && pnpm test:integration` — green.
- [ ] `cd apps/mobile && pnpm typecheck && pnpm test` — green.
- [ ] `pnpm --filter @harpa/api-contract gen:types` — clean (no diff).
- [ ] `rg -n 'notes_since_last_generation|notesSinceLastGeneration' apps packages` — only inside migration `0011_notes_changed_at.sql`.
- [ ] Manual smoke (live env): create a draft report, add a note → Report tab regenerates within seconds. Add another → it regenerates again. Add note while generating → exactly one follow-up regen. Force an error (e.g. invalid AI vendor) → loop stops, manual Regenerate resumes it. Restart app with a pending change in flight → on re-open, regenerates once.
