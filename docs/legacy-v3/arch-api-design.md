# API Design

> Part of [Mobile v3 Architecture](./architecture.md)

## 2.1 Endpoint Catalog

### Auth & Profile

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/profile` | Get current user's profile |
| `PATCH` | `/api/v1/profile` | Update profile (name, company, avatar) |
| `GET` | `/api/v1/profile/usage` | Get token usage summary |
| `GET` | `/api/v1/profile/usage/history` | Paginated usage history |

### Projects

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/projects` | List projects (with role) |
| `POST` | `/api/v1/projects` | Create project |
| `GET` | `/api/v1/projects/:id` | Get project detail |
| `PATCH` | `/api/v1/projects/:id` | Update project |
| `DELETE` | `/api/v1/projects/:id` | Soft-delete project |
| `GET` | `/api/v1/projects/:id/members` | List project members |
| `POST` | `/api/v1/projects/:id/members` | Add member |
| `PATCH` | `/api/v1/projects/:id/members/:userId` | Update member role |
| `DELETE` | `/api/v1/projects/:id/members/:userId` | Remove member |

### Reports

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/projects/:projectId/reports` | List reports for project |
| `POST` | `/api/v1/projects/:projectId/reports` | Create draft report |
| `GET` | `/api/v1/reports/:id` | Get report detail |
| `PATCH` | `/api/v1/reports/:id` | Update report (title, status, report_data) |
| `DELETE` | `/api/v1/reports/:id` | Soft-delete report |
| `POST` | `/api/v1/reports/:id/generate` | Generate AI report from notes |
| `POST` | `/api/v1/reports/:id/finalize` | Finalize draft → saved |
| `GET` | `/api/v1/reports/:id/pdf` | Get PDF download URL |

### Report Notes

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/reports/:reportId/notes` | List notes for report |
| `POST` | `/api/v1/reports/:reportId/notes` | Create text note |
| `PATCH` | `/api/v1/reports/:reportId/notes/:id` | Update note |
| `DELETE` | `/api/v1/reports/:reportId/notes/:id` | Soft-delete note |
| `POST` | `/api/v1/reports/:reportId/notes/reorder` | Batch reorder notes |

### Files & Uploads

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/projects/:projectId/files` | List files for project |
| `POST` | `/api/v1/uploads/presign` | Get presigned upload URL |
| `POST` | `/api/v1/files` | Create file_metadata record |
| `GET` | `/api/v1/files/:id` | Get file detail with signed URL |
| `DELETE` | `/api/v1/files/:id` | Soft-delete file |

### Voice Notes & Transcription

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/voice-notes/:fileId/transcribe` | Trigger transcription |
| `POST` | `/api/v1/voice-notes/:fileId/summarize` | Trigger summarization |

### AI Settings

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/ai/providers` | List available providers + models |
| `GET` | `/api/v1/ai/settings` | Get user's AI preferences |
| `PUT` | `/api/v1/ai/settings` | Update AI preferences |

## 2.2 Auth Model

```
┌─────────────────────────────────────────────────────────────────┐
│ Mobile App                                                       │
│  1. Signs in via Supabase Auth SDK                              │
│  2. Receives JWT (access_token) + refresh_token                 │
│  3. Sends JWT in Authorization header to Hono API               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ Hono API (Auth Middleware)                                       │
│  1. Extract JWT from Authorization: Bearer <token>              │
│  2. Verify signature using Supabase JWT secret                  │
│  3. Check exp claim                                             │
│  4. Extract user_id from sub claim                              │
│  5. Attach user to request context                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ Route Handler                                                    │
│  - c.get('user') returns { id, email, phone, role }             │
│  - Application-level authz: check project membership, etc.      │
└─────────────────────────────────────────────────────────────────┘
```

**Key decisions:**

1. **Supabase Auth issues JWTs** — we don't build our own auth
2. **Hono verifies JWTs** — using `jose` library + Supabase JWT secret
3. **Application-level authz** — route handlers check project membership via DB
4. **RLS still enforced** — Drizzle connects as authenticated user when needed

## 2.3 Error Response Format

```typescript
// Standard error envelope
interface ApiError {
  error: {
    code: string;           // Machine-readable code (e.g., "validation_error")
    message: string;        // Human-readable message
    details?: FieldError[]; // Field-level validation errors
    requestId?: string;     // For debugging/support
  };
}

interface FieldError {
  field: string;
  message: string;
  code: string;
}

// Example validation error (422)
{
  "error": {
    "code": "validation_error",
    "message": "Request validation failed",
    "details": [
      { "field": "name", "message": "Must be at least 1 character", "code": "too_small" }
    ],
    "requestId": "req_abc123"
  }
}

// Example not found (404)
{
  "error": {
    "code": "not_found",
    "message": "Project not found",
    "requestId": "req_abc123"
  }
}

// Example forbidden (403)
{
  "error": {
    "code": "forbidden",
    "message": "You don't have access to this project",
    "requestId": "req_abc123"
  }
}
```

**HTTP Status Codes:**

| Code | Usage |
|------|-------|
| 200 | Success (GET, PATCH, DELETE) |
| 201 | Created (POST) |
| 204 | No content (DELETE with no body) |
| 400 | Bad request (malformed JSON) |
| 401 | Unauthorized (missing/invalid JWT) |
| 403 | Forbidden (valid JWT but no access) |
| 404 | Not found |
| 409 | Conflict (duplicate, version mismatch) |
| 422 | Validation error |
| 429 | Rate limit exceeded |
| 500 | Internal server error |

## 2.4 Pagination (Cursor-Based)

```typescript
// Request
GET /api/v1/projects/:projectId/reports?cursor=eyJpZCI6Inh4eCJ9&limit=20

// Response
{
  "data": [...],
  "meta": {
    "hasNext": true,
    "nextCursor": "eyJpZCI6Inl5eSJ9",
    "count": 20
  }
}
```

**Implementation:**

- Cursor encodes `{ id, sortValue }` as base64 JSON
- Default limit: 20, max: 100
- Stable under concurrent inserts (unlike offset)
- `hasNext` determined by fetching limit+1

## 2.5 Rate Limiting

| Tier | Limit | Window | Applies To |
|------|-------|--------|------------|
| Standard | 100 req | 1 min | All authenticated endpoints |
| AI Generation | 10 req | 1 min | `/reports/:id/generate` |
| Transcription | 20 req | 1 min | `/voice-notes/:id/transcribe` |
| Presign | 60 req | 1 min | `/uploads/presign` |

**Headers:**

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640000000
```

**429 Response:**

```json
{
  "error": {
    "code": "rate_limit_exceeded",
    "message": "Too many requests. Try again in 45 seconds.",
    "retryAfter": 45
  }
}
```

## 2.6 OpenAPI Spec Strategy

**Approach:** Code-first using `@hono/zod-openapi`

```typescript
// packages/api/src/routes/projects.ts
import { createRoute, z } from '@hono/zod-openapi';

const ProjectSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200),
  address: z.string().nullable(),
  clientName: z.string().nullable(),
  ownerId: z.string().uuid(),
  role: z.enum(['owner', 'editor', 'viewer']),
  updatedAt: z.string().datetime(),
});

export const listProjects = createRoute({
  method: 'get',
  path: '/api/v1/projects',
  tags: ['Projects'],
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      content: { 'application/json': { schema: z.object({ data: z.array(ProjectSchema) }) } },
      description: 'List of projects',
    },
  },
});
```

**Generated outputs:**

1. `openapi.json` — served at `/api/openapi.json`
2. TypeScript types via `openapi-typescript`
3. Typed fetch client via `openapi-fetch`

**CI integration:**

```yaml
# .github/workflows/api-contract.yml
- name: Generate OpenAPI spec
  run: pnpm --filter @harpa/api generate:openapi

- name: Generate client types
  run: pnpm --filter @harpa/api-contract generate

- name: Verify no drift
  run: git diff --exit-code packages/api-contract/src/generated/
```
