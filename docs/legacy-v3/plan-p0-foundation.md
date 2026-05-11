# P0: Foundation (Week 1)

> Part of [Implementation Plan](./implementation-plan.md)

### Goal
Scaffold new packages, establish OpenAPI spec, set up CI pipelines.

### P0.1 — Package Scaffolding

**Deliverables:**
- `packages/api/` — Hono API server structure
- `packages/api-contract/` — OpenAPI types package
- `apps/mobile-v3/` — Expo app skeleton

**Tasks:**

| Task | Description | Est. | Depends On |
|------|-------------|------|------------|
| P0.1.1 | Create `packages/api/` with Hono + Drizzle boilerplate | 2h | — |
| P0.1.2 | Create `packages/api-contract/` with openapi-typescript setup | 1h | — |
| P0.1.3 | Create `apps/mobile-v3/` with Expo Router + Legends State + React Query | 2h | — |
| P0.1.4 | Configure turbo pipeline for new packages | 30m | P0.1.1-3 |
| P0.1.5 | Add workspace dependencies in root `pnpm-workspace.yaml` | 15m | P0.1.1-3 |

**Acceptance Criteria:**
- [ ] `pnpm install` succeeds from repo root
- [ ] `pnpm --filter @harpa/api dev` starts Hono server on port 8080
- [ ] `pnpm --filter mobile-v3 start` starts Expo dev server
- [ ] `pnpm turbo build` builds all packages

**Agent Instructions (P0.1.1):**
```markdown
Create packages/api/ with the following structure:

packages/api/
├── src/
│   ├── index.ts           # Hono app entry
│   ├── routes/
│   │   └── health.ts      # GET /health
│   ├── middleware/
│   │   └── error.ts       # Error handler
│   └── db/
│       └── client.ts      # Drizzle client
├── drizzle.config.ts
├── package.json
├── tsconfig.json
└── vitest.config.ts

Dependencies:
- hono
- @hono/zod-openapi
- drizzle-orm
- postgres
- zod

Use "type": "module" in package.json.
Export createApp() function that returns configured Hono app.
```

---

### P0.2 — OpenAPI Spec Bootstrap

**Deliverables:**
- Initial OpenAPI spec with auth, projects, reports schemas
- Type generation working

**Tasks:**

| Task | Description | Est. | Depends On |
|------|-------------|------|------------|
| P0.2.1 | Define base schemas (Project, Report, Note, File, Error) in Zod | 2h | P0.1.1 |
| P0.2.2 | Create route definitions with `@hono/zod-openapi` | 3h | P0.2.1 |
| P0.2.3 | Add `/api/openapi.json` endpoint serving spec | 30m | P0.2.2 |
| P0.2.4 | Set up `openapi-typescript` generation script | 1h | P0.2.3 |
| P0.2.5 | Export generated types from `@harpa/api-contract` | 30m | P0.2.4 |

**Acceptance Criteria:**
- [ ] `GET /api/openapi.json` returns valid OpenAPI 3.1 spec
- [ ] `pnpm --filter @harpa/api-contract generate` produces `openapi.d.ts`
- [ ] Types export correctly: `import type { Project } from '@harpa/api-contract'`

**Agent Instructions (P0.2.1):**
```markdown
Create Zod schemas in packages/api/src/schemas/:

1. common.ts
   - ApiError schema (code, message, details?, requestId?)
   - Pagination schema (cursor?, limit?, hasNext, nextCursor?)

2. project.ts
   - ProjectSchema (id, name, address, clientName, ownerId, role, updatedAt)
   - CreateProjectSchema (name, address?, clientName?)
   - UpdateProjectSchema (name?, address?, clientName?)

3. report.ts
   - ReportSchema (id, projectId, ownerId, title, status, reportData, ...)
   - CreateReportSchema (projectId, title?)
   - Import GeneratedSiteReportSchema from @harpa/report-core

Use zod .openapi() extensions for OpenAPI metadata.
```

---

### P0.3 — CI Pipeline Setup

**Deliverables:**
- GitHub Actions for API + mobile-v3
- Contract test workflow

**Tasks:**

| Task | Description | Est. | Depends On |
|------|-------------|------|------------|
| P0.3.1 | Create `.github/workflows/api-tests.yml` | 1h | P0.1.1 |
| P0.3.2 | Create `.github/workflows/mobile-v3-tests.yml` | 1h | P0.1.3 |
| P0.3.3 | Create `.github/workflows/api-contract.yml` (type gen drift check) | 30m | P0.2.4 |
| P0.3.4 | Add Testcontainers setup for Postgres | 2h | P0.3.1 |

**Acceptance Criteria:**
- [ ] PR to `dev` triggers API + mobile tests
- [ ] Contract drift fails if `openapi.d.ts` not regenerated
- [ ] Integration tests spin up Postgres container

---

### P0.4 — Drizzle Schema + Migrations

**Deliverables:**
- Drizzle schema mirroring existing Supabase tables
- Migration generation working

**Tasks:**

| Task | Description | Est. | Depends On |
|------|-------------|------|------------|
| P0.4.1 | Define Drizzle schema for profiles, projects, project_members | 2h | P0.1.1 |
| P0.4.2 | Define Drizzle schema for reports, report_notes, file_metadata | 2h | P0.4.1 |
| P0.4.3 | Define Drizzle schema for token_usage | 30m | P0.4.2 |
| P0.4.4 | Configure drizzle-kit to read from existing Supabase schema | 1h | P0.4.3 |
| P0.4.5 | Verify schema matches production DB | 1h | P0.4.4 |

**Acceptance Criteria:**
- [ ] `drizzle-kit introspect` shows no differences
- [ ] All tables have TypeScript types
- [ ] Foreign keys and indexes defined

**Agent Instructions (P0.4.1):**
```markdown
Create packages/api/src/db/schema.ts with Drizzle schema.

Match exactly the existing Supabase tables in supabase/migrations/.

Key tables for this task:
- profiles (id uuid PK, phone text, full_name text, company_name text, avatar_url text, created_at, updated_at)
- projects (id uuid PK, owner_id uuid FK, name text, address text, client_name text, status text, deleted_at, created_at, updated_at)
- project_members (project_id uuid, user_id uuid, role text, created_at) — composite PK

Use pgTable from drizzle-orm/pg-core.
Add proper TypeScript types with $inferSelect and $inferInsert.
```
