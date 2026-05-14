# P3.0 IDs/Slugs Migration — Implementation Design

> **Status:** ready for implementation  
> **Companion doc:** [arch-ids-and-urls.md](arch-ids-and-urls.md)  
> **Addresses:** [plan-p3-feature-build.md P3.0 task](plan-p3-feature-build.md)  
> **Pitfalls addressed:** #1 (API tests-first), #6 (per-request scope)

---

## Design problem

Currently:
- Projects and reports use UUIDv4 primary keys exposed in API path params (`:id`, `:reportId`).
- Mobile app navigates to `/projects/${uuid}`.
- No stable short URLs for sharing.
- No human-readable report numbering within projects.

Target (from [arch-ids-and-urls.md](arch-ids-and-urls.md)):
- **UUIDv7** for new rows (sortable, B-tree friendly).
- **Prefixed slugs** as public identifiers: `prj_xxxxxx`, `rpt_xxxxxx`.
- **Per-project report numbers** (`/projects/prj_x/reports/42`).
- **Two URL shapes per entity:** long (canonical) and short (shareable).
- All URLs and API contracts reference slugs, not internal UUIDs.

This design must ship **before** any screen-port commit so URLs the app constructs are immediately on the final scheme.

---

## Alternatives considered

### 1. UUIDv7 generation strategy

| Alternative | Pros | Cons | Decision |
|---|---|---|---|
| **A. Native `uuid_generate_v7()`** | PG 17 native, zero deps, fast | Requires PG ≥ 17 | ✅ **Adopted** |
| B. `pg_uuidv7` extension | Works on PG < 17, Neon supports | One more extension to install | Rejected — pre-prod, can upgrade |
| C. App-side generation (nanoid uuid) | Works anywhere | One more JS dep, slightly slower inserts | Rejected — prefer DB-native |

**Justification:** We're pre-production. Neon supports PG 17. Testcontainers can use `postgres:17-alpine`. Native UUIDv7 is cleaner than an extension. Existing UUIDv4 rows stay unchanged (IDs are internal-only post-migration).

### 2. Migration expand/contract vs. single-step

| Alternative | Pros | Cons | Decision |
|---|---|---|---|
| **A. Single migration** | Simple, fast, no coordination | Requires nullable→backfill→NOT NULL in one file | ✅ **Adopted** |
| B. 4-step expand/contract | Classic zero-downtime | Over-engineered for pre-production; 4 migration files | Rejected — no prod data yet |

**Justification:** Integration tests have seed data, but we can re-run setup. Production DB is empty. A single migration file with nullable→backfill→constraint simplifies reasoning and reduces churn.

---

## 1. UUIDv7 availability decision

**Path A: native `uuid_generate_v7()` (PG ≥ 17)** — adopted.

### Steps

1. **Testcontainers upgrade:**  
   `packages/api/src/__tests__/setup-pg.ts`:  
   ```ts
   new PostgreSqlContainer('postgres:17-alpine')
   ```

2. **Neon verification:**  
   Neon's default PG version is 17 as of Q4 2024. No action required; document in migration comment.

3. **Migration file:**  
   Use `uuid_generate_v7()` (standard PG 17 function) as the new default for `projects.id` and `reports.id`. Existing rows keep their UUIDv4 values (no backfill of `id` itself, only of the new `slug` columns).

**Carve-out:** If local dev needs PG < 17, we defer to app-side nanoid uuid generation via an opt-in env var. **Not needed for P3.0** — document as a future escape hatch if a contributor's Postgres.app is stuck on 16.

---

## 2. Migration plan

**Single migration file:** `202605130001_slugs_and_report_numbers.sql`

### Operations (in order within one file)

```sql
-- 1. Enable uuid_generate_v7() (PG 17 ships it in the `public` schema by default; explicit CREATE EXTENSION not needed).
-- Verify: SELECT uuid_generate_v7(); -- should return a v7 UUID.

-- 2. Add slug columns (nullable, no unique constraint yet).
ALTER TABLE app.projects ADD COLUMN slug text;
ALTER TABLE app.reports ADD COLUMN slug text;

-- 3. Add report numbering columns.
ALTER TABLE app.projects ADD COLUMN next_report_number int NOT NULL DEFAULT 1;
ALTER TABLE app.reports ADD COLUMN number int;

-- 4. Backfill slugs for any existing rows.
--    Use a PL/pgSQL block that generates Crockford-base32 6-char slugs.
--    Collision-retry loop (max 2 attempts per row, then fail).
--    Pre-production → no rows in prod; integration tests will re-seed.
DO $$
DECLARE
  rec record;
  new_slug text;
  attempt int;
BEGIN
  -- Projects
  FOR rec IN SELECT id FROM app.projects WHERE slug IS NULL LOOP
    attempt := 0;
    LOOP
      new_slug := 'prj_' || (SELECT string_agg(substr('0123456789abcdefghjkmnpqrstvwxyz', floor(random()*32)::int + 1, 1), '') FROM generate_series(1,6));
      BEGIN
        UPDATE app.projects SET slug = new_slug WHERE id = rec.id;
        EXIT;
      EXCEPTION WHEN unique_violation THEN
        attempt := attempt + 1;
        IF attempt > 2 THEN RAISE EXCEPTION 'slug collision retry exhausted for project %', rec.id; END IF;
      END;
    END LOOP;
  END LOOP;

  -- Reports (and assign numbers within project)
  FOR rec IN SELECT r.id, r.project_id,
                    row_number() OVER (PARTITION BY r.project_id ORDER BY r.created_at, r.id) AS rn
             FROM app.reports r
             ORDER BY r.project_id, rn
  LOOP
    attempt := 0;
    LOOP
      new_slug := 'rpt_' || (SELECT string_agg(substr('0123456789abcdefghjkmnpqrstvwxyz', floor(random()*32)::int + 1, 1), '') FROM generate_series(1,6));
      BEGIN
        UPDATE app.reports SET slug = new_slug, number = rec.rn WHERE id = rec.id;
        EXIT;
      EXCEPTION WHEN unique_violation THEN
        attempt := attempt + 1;
        IF attempt > 2 THEN RAISE EXCEPTION 'slug collision retry exhausted for report %', rec.id; END IF;
      END;
    END LOOP;
  END LOOP;

  -- Sync next_report_number for each project to max(number)+1.
  UPDATE app.projects p
  SET next_report_number = COALESCE((SELECT max(r.number) FROM app.reports r WHERE r.project_id = p.id), 0) + 1;
END;
$$;

-- 5. Add NOT NULL + UNIQUE constraints.
ALTER TABLE app.projects ALTER COLUMN slug SET NOT NULL;
ALTER TABLE app.projects ADD CONSTRAINT projects_slug_unique UNIQUE (slug);

ALTER TABLE app.reports ALTER COLUMN slug SET NOT NULL;
ALTER TABLE app.reports ALTER COLUMN number SET NOT NULL;
ALTER TABLE app.reports ADD CONSTRAINT reports_slug_unique UNIQUE (slug);
ALTER TABLE app.reports ADD CONSTRAINT reports_number_unique UNIQUE (project_id, number);

-- 6. Switch id defaults to uuid_generate_v7() for new rows.
ALTER TABLE app.projects ALTER COLUMN id SET DEFAULT uuid_generate_v7();
ALTER TABLE app.reports ALTER COLUMN id SET DEFAULT uuid_generate_v7();
-- (auth.users/sessions/verifications can migrate in a follow-up; not user-facing.)

-- 7. Create indexes for slug lookups.
CREATE INDEX projects_slug_idx ON app.projects(slug);
CREATE INDEX reports_slug_idx ON app.reports(slug);
-- (UNIQUE already creates an index, but we make it explicit for clarity.)

-- 8. Grant SELECT on new columns to app_authenticated (RLS policies already cover the tables).
-- No additional grants needed — GRANT ALL TABLES already covers new columns.
```

### Why one file?

- **Pre-production:** No live traffic to coordinate. Integration tests re-run `beforeAll` setup.
- **Atomic:** If backfill fails (collision exhaustion, logic bug), the whole migration rolls back; no half-state.
- **Simpler review:** One diff, one commit, one CI pass.

---

## 3. Slug generator design

**File:** `packages/api/src/lib/slug.ts`

### Interface

```ts
/**
 * Generate a prefixed slug: `<prefix>_<6-char nanoid>`.
 * Alphabet: Crockford base32 (no I/L/O/U). Output is lowercase.
 */
export function generateSlug(prefix: 'prj' | 'rpt' | 'fil' | 'not'): string;
```

### Implementation

```ts
import { customAlphabet } from 'nanoid';

const ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz'; // Crockford base32, lowercase
const nanoid = customAlphabet(ALPHABET, 6);

export function generateSlug(prefix: 'prj' | 'rpt' | 'fil' | 'not'): string {
  return `${prefix}_${nanoid()}`;
}
```

### Collision handling

- **At insert time** in service layer (e.g., `createProject`, `createReport`).
- Retry loop: generate slug → attempt insert → on unique violation, retry (max 2 attempts).
- Birthday collision probability: ~0.0001% at 10k rows per type → 2 retries is safe.
- Example (in `services/projects.ts`):

```ts
export async function createProject(
  db: Db,
  input: { name: string; clientName?: string; address?: string },
): Promise<string> {
  const slug = generateSlug('prj');
  let attempt = 0;
  while (attempt < 3) {
    try {
      const result = await db.execute<{ id: string }>(sql`
        SELECT app.create_project_with_owner(${input.name}, ${input.clientName ?? null}, ${input.address ?? null}, ${slug})
      `);
      return result.rows[0]!.id;
    } catch (err) {
      if (isUniqueViolation(err, 'projects_slug_unique')) {
        attempt++;
        if (attempt >= 3) throw new Error('slug collision retry exhausted');
        // Generate new slug and retry
        slug = generateSlug('prj');
        continue;
      }
      throw err;
    }
  }
  throw new Error('unreachable');
}
```

### SECURITY DEFINER helper update

The `app.create_project_with_owner` helper gains a `p_slug text` parameter:

```sql
CREATE OR REPLACE FUNCTION app.create_project_with_owner(
  p_name text,
  p_client_name text,
  p_address text,
  p_slug text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, pg_temp AS $$
DECLARE
  v_user uuid := current_setting('app.user_id')::uuid;
  v_id uuid;
BEGIN
  INSERT INTO app.projects(name, client_name, address, owner_id, slug)
  VALUES (p_name, p_client_name, p_address, v_user, p_slug)
  RETURNING id INTO v_id;

  INSERT INTO app.project_members(project_id, user_id, role)
  VALUES (v_id, v_user, 'owner');

  RETURN v_id;
END;
$$;
```

### Report number generation

`createReport` service function updates `projects.next_report_number` in a transaction:

```ts
export async function createReport(
  db: Db,
  projectId: string,
  input: { visitDate?: string },
): Promise<string> {
  const slug = generateSlug('rpt');
  let attempt = 0;
  while (attempt < 3) {
    try {
      return await db.transaction(async (tx) => {
        // Lock row + increment counter
        const [proj] = await tx.execute<{ next_number: number }>(sql`
          UPDATE app.projects
          SET next_report_number = next_report_number + 1
          WHERE id = ${projectId}::uuid
          RETURNING next_report_number - 1 AS next_number
        `).then(r => r.rows);
        
        if (!proj) throw new Error('project not found');
        
        const [report] = await tx.execute<{ id: string }>(sql`
          INSERT INTO app.reports(project_id, author_id, slug, number, visit_date)
          VALUES (
            ${projectId}::uuid,
            current_setting('app.user_id')::uuid,
            ${slug},
            ${proj.next_number},
            ${input.visitDate ? sql`${input.visitDate}::timestamptz` : sql`NULL`}
          )
          RETURNING id
        `).then(r => r.rows);
        
        return report!.id;
      });
    } catch (err) {
      if (isUniqueViolation(err, 'reports_slug_unique')) {
        attempt++;
        if (attempt >= 3) throw new Error('slug collision retry exhausted');
        slug = generateSlug('rpt');
        continue;
      }
      throw err;
    }
  }
  throw new Error('unreachable');
}
```

---

## 4. API contract surface

### New schemas (`packages/api-contract/src/schemas/_shared.ts`)

```ts
import { z } from 'zod';

// Crockford base32 — excludes i, l, o, u to avoid visual ambiguity.
const SLUG_CHARSET = '[0-9a-hjkmnp-tv-z]';

export const projectSlug = z
  .string()
  .regex(new RegExp(`^prj_${SLUG_CHARSET}{6}$`, 'i'), 'invalid project slug')
  .transform(s => s.toLowerCase());

export const reportSlug = z
  .string()
  .regex(new RegExp(`^rpt_${SLUG_CHARSET}{6}$`, 'i'), 'invalid report slug')
  .transform(s => s.toLowerCase());

export const reportNumber = z.coerce.number().int().positive();
```

> The implementation in `_shared.ts` inlines the Crockford-strict regex
> (`/^prj_[0-9a-hjkmnp-tv-z]{6}$/i`). The earlier draft of this design
> showed `[0-9a-z]` for brevity; the implementation is authoritative.

### Branded types (`packages/api-contract/src/index.ts`)

```ts
export type ProjectSlug = string & { readonly __brand: 'ProjectSlug' };
export type ReportSlug = string & { readonly __brand: 'ReportSlug' };

export function projectSlugBrand(s: string): ProjectSlug {
  return s as ProjectSlug;
}
export function reportSlugBrand(s: string): ReportSlug {
  return s as ReportSlug;
}
```

### Path param changes

| Route | Before | After | Notes |
|---|---|---|---|
| List projects | `GET /projects` | `GET /projects` | No change (query params only) |
| Get project | `GET /projects/:id` | `GET /projects/:projectSlug` | Path param rename |
| Update project | `PATCH /projects/:id` | `PATCH /projects/:projectSlug` | Path param rename |
| Delete project | `DELETE /projects/:id` | `DELETE /projects/:projectSlug` | Path param rename |
| List reports | `GET /projects/:id/reports` | `GET /projects/:projectSlug/reports` | Parent path param |
| Create report | `POST /projects/:id/reports` | `POST /projects/:projectSlug/reports` | Parent path param |
| Get report | `GET /reports/:reportId` | `GET /projects/:projectSlug/reports/:number` | **NEW STRUCTURE** |
| Update report | `PATCH /reports/:reportId` | `PATCH /projects/:projectSlug/reports/:number` | **NEW STRUCTURE** |
| Delete report | `DELETE /reports/:reportId` | `DELETE /projects/:projectSlug/reports/:number` | **NEW STRUCTURE** |
| Generate report | `POST /reports/:reportId/generate` | `POST /projects/:projectSlug/reports/:number/generate` | **NEW STRUCTURE** |
| Finalize report | `POST /reports/:reportId/finalize` | `POST /projects/:projectSlug/reports/:number/finalize` | **NEW STRUCTURE** |

### New resolver routes

| Route | Method | Response | Purpose |
|---|---|---|---|
| `/p/:projectSlug` | GET | `{ type: 'project', projectSlug: string }` | Resolve short URL → canonical |
| `/r/:reportSlug` | GET | `{ type: 'report', projectSlug: string, reportNumber: number }` | Resolve short URL → canonical |

**Implementation note:** The API returns JSON (not a 308 redirect) so the mobile client can `router.replace` without a visible redirect flash. Web clients (future) can follow a `Location` header if we add one.

### Response bodies

Projects gain a `slug` field:

```ts
// packages/api-contract/src/schemas/projects.ts
export const project = z.object({
  id: uuid,            // internal only; mobile can ignore
  slug: projectSlug,   // use this for navigation
  name: z.string().min(1).max(200),
  // ... rest unchanged
});
```

Reports gain `slug` and `number`:

```ts
// packages/api-contract/src/schemas/reports.ts
export const report = z.object({
  id: uuid,              // internal only
  slug: reportSlug,      // short URL token
  number: reportNumber,  // per-project counter
  projectId: uuid,       // FK (could also use projectSlug; keep uuid for now)
  // ... rest unchanged
});
```

---

## 5. Per-request scope test plan

### New test files

None. **Extend existing** `packages/api/src/__tests__/scope/{projects,reports}.scope.test.ts`.

### Test additions

#### `projects.scope.test.ts`

```ts
it('alice GET /projects/:projectSlug (by slug) returns her own project', async () => {
  const app = createApp();
  const token = await signTestToken(alice, aliceSid);
  const res = await app.request(`/projects/${aliceSlug}`, { headers: { authorization: `Bearer ${token}` } });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { slug: string };
  expect(body.slug).toBe(aliceSlug);
});

it('paired — alice GET /projects/:projectSlug of bob returns 404', async () => {
  const app = createApp();
  const token = await signTestToken(alice, aliceSid);
  const res = await app.request(`/projects/${bobSlug}`, { headers: { authorization: `Bearer ${token}` } });
  expect(res.status).toBe(404);
});
```

#### `reports.scope.test.ts`

```ts
it('alice GET /projects/:projectSlug/reports/:number returns her own report', async () => {
  const app = createApp();
  const token = await signTestToken(alice, aliceSid);
  const res = await app.request(`/projects/${aliceProjectSlug}/reports/1`, { headers: { authorization: `Bearer ${token}` } });
  expect(res.status).toBe(200);
});

it('cross — alice GET /projects/:projectSlug/reports/:number of bob → 404', async () => {
  const app = createApp();
  const token = await signTestToken(alice, aliceSid);
  const res = await app.request(`/projects/${bobProjectSlug}/reports/1`, { headers: { authorization: `Bearer ${token}` } });
  expect(res.status).toBe(404);
});
```

#### New test file: `resolvers.scope.test.ts`

```ts
describe('scope: resolver routes', () => {
  it('alice GET /p/:projectSlug resolves her own project', async () => {
    const app = createApp();
    const token = await signTestToken(alice, aliceSid);
    const res = await app.request(`/p/${aliceProjectSlug}`, { headers: { authorization: `Bearer ${token}` } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { type: string; projectSlug: string };
    expect(body.projectSlug).toBe(aliceProjectSlug);
  });

  it('alice GET /p/:projectSlug of bob → 404', async () => {
    const app = createApp();
    const token = await signTestToken(alice, aliceSid);
    const res = await app.request(`/p/${bobProjectSlug}`, { headers: { authorization: `Bearer ${token}` } });
    expect(res.status).toBe(404);
  });

  it('alice GET /r/:reportSlug resolves her own report', async () => {
    const app = createApp();
    const token = await signTestToken(alice, aliceSid);
    const res = await app.request(`/r/${aliceReportSlug}`, { headers: { authorization: `Bearer ${token}` } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { type: string; projectSlug: string; reportNumber: number };
    expect(body.reportSlug).toBe(aliceReportSlug);
  });

  it('alice GET /r/:reportSlug of bob → 404', async () => {
    const app = createApp();
    const token = await signTestToken(alice, aliceSid);
    const res = await app.request(`/r/${bobReportSlug}`, { headers: { authorization: `Bearer ${token}` } });
    expect(res.status).toBe(404);
  });
});
```

### Verification gate

All scope tests must pass after migration + route changes. No new `@ts-expect-error` annotations allowed in test files.

---

## 6. Mobile changes

### Routing structure (new files)

```
app/(app)/
  projects/
    [projectSlug]/
      index.tsx                     # project home (rename from [id]/index.tsx)
      reports/
        [number].tsx                # report detail (rename from current structure)
  p/
    [projectSlug].tsx               # NEW: short-URL resolver
  r/
    [reportSlug].tsx                # NEW: short-URL resolver
```

### Files to add

1. **`app/(app)/p/[projectSlug].tsx`** — resolver screen:

```tsx
/**
 * Short-URL resolver for projects: /p/prj_xxxxxx
 * Fetches project by slug, then router.replace to canonical long URL.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';
import { useResolveProjectSlugQuery } from '@/lib/api/hooks';
import { Skeleton } from '@/components/ui/skeleton';
import { InlineNotice } from '@/components/ui/inline-notice';
import { Button } from '@/components/ui/button';

export default function ProjectSlugResolver() {
  const { projectSlug } = useLocalSearchParams<{ projectSlug: string }>();
  const router = useRouter();
  const { data, isLoading, error } = useResolveProjectSlugQuery(projectSlug);

  useEffect(() => {
    if (data) {
      router.replace(`/projects/${data.projectSlug}` as any);
    }
  }, [data, router]);

  if (isLoading) {
    return (
      <View className="flex-1 bg-gray-50 p-4">
        <Skeleton className="h-8 w-3/4 mb-4" />
        <Skeleton className="h-4 w-full mb-2" />
        <Skeleton className="h-4 w-5/6" />
      </View>
    );
  }

  if (error) {
    return (
      <View className="flex-1 bg-gray-50 p-4 justify-center">
        <InlineNotice variant="error" message="Project not found or access denied." />
        <Button onPress={() => router.back()} className="mt-4">
          Go Back
        </Button>
      </View>
    );
  }

  return null; // Redirecting...
}
```

2. **`app/(app)/r/[reportSlug].tsx`** — resolver screen (similar structure, resolves report slug → project slug + number).

### Files to update

1. **`app/(app)/projects/index.tsx`** — change `router.push` from UUID to slug:

```ts
// Before:
router.push(`/projects/${id}`);

// After:
router.push(`/projects/${slug}`);
```

2. **Update all `router.push` / `router.replace` call sites** that reference project or report IDs:
   - `screens/projects-list.tsx` (if it has inline navigation — check)
   - Any other screen that navigates to a project or report

### Typed routes regeneration

Expo Router auto-generates `expo-router.d.ts` based on file structure. After adding `[projectSlug].tsx` and renaming `[id].tsx`, run:

```bash
pnpm --filter @harpa/mobile expo export --platform ios --dev
```

This triggers the typed-routes codegen. The `@ts-expect-error` annotations in existing files will resolve once the new route structure is in place.

### Generated hooks update

`apps/mobile/lib/api/hooks.ts` is **auto-generated** from the OpenAPI spec via `pnpm spec:emit` (or an equivalent codegen step). After the API contract changes land, regenerate:

```bash
pnpm --filter @harpa/api spec:emit
pnpm --filter @harpa/mobile codegen  # (if a separate codegen step exists)
```

New hooks:
- `useResolveProjectSlugQuery(slug: string)`
- `useResolveReportSlugQuery(slug: string)`

Updated hooks (param name changes):
- `useGetProjectQuery(projectSlug: string)` (was `id`)
- `useListReportsQuery({ projectSlug, ... })` (was `id`)
- `useGetReportQuery({ projectSlug, number })` (was `reportId`)

---

## 7. Worker dispatch sequence

### Commit 1: Migration + slug generator + testcontainers upgrade

**Agent:** `tdd-guide` (tests-first), then `database-reviewer`

**Tasks:**
1. Upgrade Testcontainers to `postgres:17-alpine` in `packages/api/src/__tests__/setup-pg.ts`.
2. Write migration `202605130001_slugs_and_report_numbers.sql` per §2.
3. Implement `packages/api/src/lib/slug.ts` (nanoid + customAlphabet).
4. Add unit tests for `slug.ts` (100 iterations, no collisions in set, regex match).
5. Run `pnpm test:api:integration` — all existing tests pass (seed data gets slugs via backfill).

**Verification:**
- `pnpm test:api:integration` green.
- Manual: `psql` into test DB, `SELECT slug FROM app.projects LIMIT 5;` — all match `prj_[0-9a-z]{6}`.

---

### Commit 2: API contract + service-layer slug generation + SECURITY DEFINER updates

**Agent:** `tdd-guide` + `code-reviewer`

**Tasks:**
1. Add `projectSlug`, `reportSlug`, `reportNumber` schemas to `packages/api-contract/src/schemas/_shared.ts`.
2. Add branded types to `packages/api-contract/src/index.ts`.
3. Update `projects.ts` and `reports.ts` schemas to include `slug` and (reports) `number` fields.
4. Update `packages/api/src/services/projects.ts` → `createProject` gains retry loop + calls `app.create_project_with_owner(…, slug)`.
5. Update `packages/api/src/services/reports.ts` → `createReport` transactionally increments `next_report_number` + retries on slug collision.
6. Update SECURITY DEFINER helper in `packages/api/migrations/202605120003_projects_helpers.sql` (append a new version or amend if safe).
7. Write unit tests for service functions (mock collision, verify retry).

**Verification:**
- `pnpm test:api` green.
- `pnpm typecheck` green across all workspaces.

---

### Commit 3: API routes + scope tests

**Agent:** `tdd-guide` + `security-reviewer`

**Tasks:**
1. Rename path params in `packages/api/src/routes/projects.ts` (`:id` → `:projectSlug`).
2. Update `packages/api/src/routes/reports.ts`:
   - Change parent path from `/projects/:id/reports` → `/projects/:projectSlug/reports`.
   - Nest report CRUD under canonical long URLs: `GET /projects/:projectSlug/reports/:number`.
3. Add two resolver routes:
   - `GET /p/:projectSlug` → lookup project by slug, return `{ type: 'project', projectSlug }`.
   - `GET /r/:reportSlug` → lookup report by slug, return `{ type: 'report', projectSlug, reportNumber }`.
4. Update `packages/api/src/__tests__/scope/projects.scope.test.ts` — add slug-based tests (§5).
5. Update `packages/api/src/__tests__/scope/reports.scope.test.ts` — add number-based tests (§5).
6. Add `packages/api/src/__tests__/scope/resolvers.scope.test.ts` (§5).
7. Regenerate OpenAPI spec: `pnpm --filter @harpa/api spec:emit`.

**Verification:**
- `pnpm test:api:integration` green (all scope tests pass).
- `pnpm check-spec-drift` green (contract matches OpenAPI output).
- Manual: `curl http://localhost:3000/p/prj_xxxxxx -H "Authorization: Bearer <token>"` → 200 JSON.

---

### Commit 4: Mobile routing + codegen + resolver screens

**Agent:** `code-reviewer` (post-implementation review)

**Tasks:**
1. Rename `app/(app)/projects/[id]/` → `[projectSlug]/`.
2. Update `app/(app)/projects/index.tsx` — change `router.push` to use `slug` (§6).
3. Add `app/(app)/p/[projectSlug].tsx` (§6, file 1).
4. Add `app/(app)/r/[reportSlug].tsx` (§6, file 2).
5. Regenerate typed routes: `pnpm --filter @harpa/mobile expo export --platform ios --dev`.
6. Regenerate API hooks: `pnpm --filter @harpa/mobile codegen` (or equivalent).
7. Remove `@ts-expect-error` annotations in `projects/index.tsx` once typed routes are current.
8. Update any other `router.push` call sites (grep for `/projects/\${` and `/reports/\${`).

**Verification:**
- `pnpm --filter @harpa/mobile typecheck` green.
- `pnpm ios` boots without crash.
- Manual: tap a project in the list → URL bar (if dev mode shows it) displays `/projects/prj_xxxxxx`.
- Manual: trigger a resolver screen (simulate deep link via `expo-linking` or metro dev menu) → observe `router.replace` to canonical URL.

---

## 8. Risks & carve-outs

### Risks

| Risk | Mitigation | Pitfall reference |
|---|---|---|---|
| **Slug collision in production** | Retry loop (2 attempts); 6 chars × 32 = ~10⁹ namespace → collision observable at ~30k rows. Monitor; bump to 8 chars if needed. | N/A (design-level) |
| **Integration tests fail after migration** | `beforeAll` re-runs setup; new rows get slugs. Old UUID-based assertions may break → update to use `slug` field. | Pitfall #1 (tests-first) |
| **Per-request scope bypass** | Every new route MUST pass scope tests proving RLS enforcement. CI blocks merge if `check-scope-tests.sh` fails. | Pitfall #6 |
| **Mobile typed-routes lag** | `@ts-expect-error` annotations are temporary; commit 4 removes them. CI warns if they persist beyond P3.0. | Pitfall #3 (drift) |

### Carve-outs (deferred to later P3 tasks)

| Feature | Reason | Plan doc reference |
|---|---|---|
| **Note slugs** (`not_xxxxxx`) | Notes are not shareable; internal timeline only. | [arch-ids-and-urls.md](arch-ids-and-urls.md) |
| **File slugs** (`fil_xxxxxx`) | Current R2 key scheme (`<uuid>.<ext>`) is stable; no user-facing URLs yet. | Deferred to P3.10 (Files screen) |
| **Universal links** (`apple-app-site-association`) | Requires public domain + SSL cert. P4 infrastructure task. | [plan-p4-e2e-polish.md](plan-p4-e2e-polish.md) |
| **Slug regeneration / migration tooling** | No production data; backfill is one-time. If we ever need to re-slug, write a script. | N/A |
| **Renaming projects (slug stays immutable)** | Rename = `PATCH name`, slug unchanged. No UI for slug editing. | N/A |

---

## Design summary (≤ 5 bullets)

1. **UUIDv7 (native PG 17)** for new rows; existing UUIDv4 IDs stay. Testcontainers upgrade to `postgres:17-alpine`.
2. **Single migration file** (`202605130001_slugs_and_report_numbers.sql`) adds `slug` columns + `number`/`next_report_number`, backfills, adds constraints, switches defaults to `uuid_generate_v7()`.
3. **Slug generator** (`lib/slug.ts`) uses `nanoid` + Crockford base32 (6 chars). Retry-on-collision at service layer (max 2 attempts). Per-project report numbers via transactional counter.
4. **API contract** renames path params to `:projectSlug`, `:number`; adds two resolver routes (`/p/:projectSlug`, `/r/:reportSlug`). Scope tests cover slug-based lookups.
5. **Mobile routing** renames `[id]` → `[projectSlug]`, adds resolver screens (`p/[projectSlug].tsx`, `r/[reportSlug].tsx`). Typed routes + API hooks regenerated post-commit.

---

## Docs created/edited

- **Created:** `docs/v4/design-p30-ids-slugs.md` (this file)
- **Amended:** `docs/v4/architecture.md` (add link to this design doc)

---

## Pitfalls addressed

- **Pitfall #1 (API tests-first):** All 4 commits have test coverage BEFORE route changes merge. Scope tests prove RLS enforcement.
- **Pitfall #6 (per-request scope):** New resolver routes + slug-based lookups have paired scope tests (own/cross). No raw `db` access in routes layer.

---

## Implementation checklist (ordered, one item ≈ one commit)

- [ ] **Commit 1:** Migration + slug generator + testcontainers upgrade  
  - [ ] Upgrade `setup-pg.ts` to `postgres:17-alpine`  
  - [ ] Write `202605130001_slugs_and_report_numbers.sql`  
  - [ ] Implement `packages/api/src/lib/slug.ts`  
  - [ ] Add unit tests for `slug.ts`  
  - [ ] Run `pnpm test:api:integration` → green  

- [x] **Commit 2:** API contract + service-layer slug generation  
  - [x] Add `projectSlug`, `reportSlug`, `reportNumber` Zod schemas  
  - [x] Add branded types  
  - [x] Update `services/projects.ts` (retry loop + helper call)  
  - [x] Update `services/reports.ts` (transaction + number increment)  
  - [x] Update SECURITY DEFINER helper (`create_project_with_owner`) — migration `202605130004_projects_helpers_v2_slugs_not_null.sql` drops 3-arg overload, adds 4-arg `(text, text, text, text)` with `p_slug`, plus `app.random_slug()` and `reports_autonumber()` trigger as belt-and-braces SQL defaults so direct admin test inserts still satisfy NOT NULL.  
  - [x] Behaviour assertions added to integration suites (project responses carry `prj_…` slug; second report in a project gets `number = previous + 1`).  
  - [x] Run `pnpm test:api` + `pnpm typecheck` → green (180 integration tests)  

- [ ] **Commit 3:** API routes + scope tests  
  - [ ] Rename path params in `routes/projects.ts`  
  - [ ] Update `routes/reports.ts` (nested under `:projectSlug/reports/:number`)  
  - [ ] Add resolver routes (`/p/:projectSlug`, `/r/:reportSlug`)  
  - [ ] Add scope tests (`projects.scope.test.ts`, `reports.scope.test.ts`, `resolvers.scope.test.ts`)  
  - [ ] Regenerate OpenAPI spec (`pnpm spec:emit`)  
  - [ ] Run `pnpm test:api:integration` + `pnpm check-spec-drift` → green  

- [ ] **Commit 4:** Mobile routing + codegen + resolver screens  
  - [ ] Rename `[id]` → `[projectSlug]` in mobile file structure  
  - [ ] Update `projects/index.tsx` (use `slug` in `router.push`)  
  - [ ] Add `app/(app)/p/[projectSlug].tsx`  
  - [ ] Add `app/(app)/r/[reportSlug].tsx`  
  - [ ] Regenerate typed routes (`expo export`)  
  - [ ] Regenerate API hooks (`codegen`)  
  - [ ] Remove `@ts-expect-error` annotations  
  - [ ] Run `pnpm --filter @harpa/mobile typecheck` → green  
  - [ ] Manual: boot iOS sim, tap project → verify slug-based URL  

---

## Open questions / carve-outs

**None.** All design decisions made. Carve-outs documented in §8.

---

**End of design doc.**

---

## Amendments after database-reviewer

The following changes were applied based on database-reviewer findings (see P0-1, P0-3, P1-1, P1-3, P2-1, P2-3):

### P0-1: UUIDv7 deferred

**Finding:** PG 17 does NOT ship `uuid_generate_v7()` natively (lands in PG 18).

**Decision:** Adopt **Option C — defer UUIDv7**. Keep `gen_random_uuid()` (UUIDv4) for new rows. Slugs are the public identifier; internal UUID version is invisible to clients. UUIDv7 can be revisited in P4 if needed.

**Impact:**
- No Testcontainers image upgrade needed (stayed on `postgres:16-alpine`).
- No extension installation required.
- Migration does NOT change the `id` column defaults.
- Migration file header documents the deferral.

### P0-3: Drizzle schema sync

**Finding:** Schema must be kept in sync with migration to avoid drift.

**Applied:**
- `projects` table: added `slug: text('slug').notNull().unique()`, `nextReportNumber: integer('next_report_number').notNull().default(1)`. Kept `id: uuid('id').defaultRandom().primaryKey()` UNCHANGED.
- `reports` table: added `slug: text('slug').notNull().unique()`, `number: integer('number').notNull()`, plus `unique('reports_number_unique').on(t.projectId, t.number)`.
- Verification: `pnpm --filter @harpa/api db:generate` produces no new migration (or only formatting diffs).

### P1-1: Backfill uses random()

**Finding:** Migration backfill uses `random()` which is not cryptographically secure, but acceptable for pre-prod.

**Applied:** Added comment in migration noting that `random()` is acceptable for pre-production backfill (no cryptographic requirements; integration tests re-seed).

### P1-3: Progress logging

**Finding:** Long-running DO blocks should log progress.

**Applied:** Added `RAISE NOTICE` lines to backfill DO block:
- After every 100 projects/reports backfilled.
- Final totals for projects and reports.
- Confirmation after syncing `next_report_number`.

### P2-1: Redundant indexes removed

**Finding:** Explicit `CREATE INDEX` on columns with UNIQUE constraints is redundant (UNIQUE creates the index).

**Applied:** Removed `CREATE INDEX projects_slug_idx` and `CREATE INDEX reports_slug_idx` from the migration. The UNIQUE constraints provide the indexes.

### P2-3: Manual rollback included

**Finding:** Operational safety requires documented rollback steps.

**Applied:** Appended a `-- ROLLBACK (manual)` comment block at the bottom of the migration file with the DROP statements in reverse order.

### P1-2: SECURITY DEFINER helper update

**Note:** The database-reviewer finding P1-2 (updating `app.create_project_with_owner` to accept `p_slug` parameter) belongs to **Commit 2**, not Commit 1. Commit 1 only adds the schema columns and backfills existing rows. The service layer that passes slugs to the helper will be updated in Commit 2 when the API routes switch to slug-based creation.

**Implementation impact:** To avoid breaking existing inserts during Commit 1, the `slug` and `number` columns remain **nullable** after the migration. UNIQUE constraints are in place, but NOT NULL constraints are deferred to Commit 2 (when the helper + service layer gain slug generation). This is the correct expand/contract pattern for a live system, even though we're pre-production.

---
