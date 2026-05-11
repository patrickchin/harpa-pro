# P1: API Core (Weeks 2-3)

> Part of [Implementation Plan](./implementation-plan.md)

### Goal
Implement all REST endpoints with full test coverage.

### P1.1 — Auth Middleware

**Deliverables:**
- JWT verification middleware
- User context injection

**Tasks:**

| Task | Description | Est. | Depends On |
|------|-------------|------|------------|
| P1.1.1 | Create auth middleware with `jose` JWT verification | 2h | P0 |
| P1.1.2 | Extract user from JWT, attach to Hono context | 1h | P1.1.1 |
| P1.1.3 | Add tests for valid/invalid/expired tokens | 2h | P1.1.2 |
| P1.1.4 | Create test helpers for generating test JWTs | 1h | P1.1.3 |

**Acceptance Criteria:**
- [ ] Invalid JWT returns 401
- [ ] Expired JWT returns 401
- [ ] Valid JWT populates `c.get('user')` with `{ id, email, phone }`
- [ ] 90%+ test coverage on auth middleware

**Agent Instructions (P1.1.1):**
```markdown
Create packages/api/src/middleware/auth.ts

Requirements:
1. Extract token from Authorization: Bearer <token>
2. Verify using jose.jwtVerify with SUPABASE_JWT_SECRET
3. Check exp claim
4. Extract sub as userId
5. Return 401 with standard error format on failure
6. Store user in Hono context via c.set('user', { id, ... })

Use createMiddleware from hono/factory for type safety.
```

---

### P1.2 — Projects Endpoints

**Deliverables:**
- Full CRUD for projects
- Member management endpoints

**Tasks:**

| Task | Description | Est. | Depends On |
|------|-------------|------|------------|
| P1.2.1 | GET /api/v1/projects — list with role | 2h | P1.1 |
| P1.2.2 | POST /api/v1/projects — create with owner membership | 2h | P1.2.1 |
| P1.2.3 | GET /api/v1/projects/:id — detail | 1h | P1.2.2 |
| P1.2.4 | PATCH /api/v1/projects/:id — update | 1h | P1.2.3 |
| P1.2.5 | DELETE /api/v1/projects/:id — soft delete | 1h | P1.2.4 |
| P1.2.6 | GET /api/v1/projects/:id/members — list members | 1h | P1.2.5 |
| P1.2.7 | POST /api/v1/projects/:id/members — add member | 1h | P1.2.6 |
| P1.2.8 | DELETE /api/v1/projects/:id/members/:userId — remove member | 1h | P1.2.7 |
| P1.2.9 | Integration tests for all project endpoints | 3h | P1.2.8 |
| P1.2.10 | RLS verification tests (cross-user access denied) | 2h | P1.2.9 |

**Acceptance Criteria:**
- [ ] All endpoints return correct status codes
- [ ] Creating project creates owner membership
- [ ] Users can only see projects they own or are members of
- [ ] Soft delete sets deleted_at, doesn't hard delete
- [ ] Contract tests pass for all endpoints

---

### P1.3 — Reports Endpoints

**Deliverables:**
- Report CRUD
- Generate endpoint (AI orchestration)
- PDF endpoint

**Tasks:**

| Task | Description | Est. | Depends On |
|------|-------------|------|------------|
| P1.3.1 | GET /api/v1/projects/:projectId/reports — list | 2h | P1.2 |
| P1.3.2 | POST /api/v1/projects/:projectId/reports — create draft | 1h | P1.3.1 |
| P1.3.3 | GET /api/v1/reports/:id — detail | 1h | P1.3.2 |
| P1.3.4 | PATCH /api/v1/reports/:id — update | 1h | P1.3.3 |
| P1.3.5 | DELETE /api/v1/reports/:id — soft delete | 1h | P1.3.4 |
| P1.3.6 | POST /api/v1/reports/:id/generate — AI generation | 4h | P1.3.5 |
| P1.3.7 | POST /api/v1/reports/:id/finalize — status change | 1h | P1.3.6 |
| P1.3.8 | GET /api/v1/reports/:id/pdf — generate PDF URL | 2h | P1.3.7 |
| P1.3.9 | Integration tests for reports | 3h | P1.3.8 |

**Acceptance Criteria:**
- [ ] Generate endpoint calls AI provider, stores report_data
- [ ] Token usage recorded in token_usage table
- [ ] PDF endpoint returns signed URL
- [ ] Reports scoped to project membership

**Agent Instructions (P1.3.6):**
```markdown
Implement POST /api/v1/reports/:id/generate

Steps:
1. Fetch report_notes for report
2. Build notes array from note.body + note.transcript
3. Get provider/model from request body (default from AI_PROVIDER env)
4. Build system prompt (reuse from supabase/functions/generate-report/)
5. Call AI provider via Vercel AI SDK
6. Validate response with GeneratedSiteReportSchema
7. Update reports.report_data with validated response
8. Insert token_usage row
9. Return the generated report

Port the provider routing logic from supabase/functions/_shared/providers.ts.
Use fixtures in test mode (USE_FIXTURES=true).
```

---

### P1.4 — Notes Endpoints

**Deliverables:**
- Note CRUD with reordering

**Tasks:**

| Task | Description | Est. | Depends On |
|------|-------------|------|------------|
| P1.4.1 | GET /api/v1/reports/:reportId/notes — list | 1h | P1.3 |
| P1.4.2 | POST /api/v1/reports/:reportId/notes — create | 1h | P1.4.1 |
| P1.4.3 | PATCH /api/v1/reports/:reportId/notes/:id — update | 1h | P1.4.2 |
| P1.4.4 | DELETE /api/v1/reports/:reportId/notes/:id — soft delete | 1h | P1.4.3 |
| P1.4.5 | POST /api/v1/reports/:reportId/notes/reorder — batch reorder | 2h | P1.4.4 |
| P1.4.6 | Integration tests for notes | 2h | P1.4.5 |

**Acceptance Criteria:**
- [ ] Notes sorted by sort_order
- [ ] Reorder updates sort_order atomically
- [ ] Delete cascades soft-delete to file if file_id present

---

### P1.5 — Files & Upload Endpoints

**Deliverables:**
- Presigned URL generation
- File metadata CRUD

**Tasks:**

| Task | Description | Est. | Depends On |
|------|-------------|------|------------|
| P1.5.1 | POST /api/v1/uploads/presign — generate signed URL | 2h | P1.1 |
| P1.5.2 | POST /api/v1/files — create file_metadata + report_notes | 2h | P1.5.1 |
| P1.5.3 | GET /api/v1/files/:id — detail with signed URL | 1h | P1.5.2 |
| P1.5.4 | DELETE /api/v1/files/:id — soft delete | 1h | P1.5.3 |
| P1.5.5 | GET /api/v1/projects/:projectId/files — list | 1h | P1.5.4 |
| P1.5.6 | Integration tests for files | 2h | P1.5.5 |

**Acceptance Criteria:**
- [ ] Presign returns valid S3-compatible signed URL
- [ ] Creating file creates report_notes link (R11 prevention)
- [ ] Signed URLs expire in 1 hour

---

### P1.6 — Voice Notes & AI Settings

**Deliverables:**
- Transcription + summarization triggers
- AI provider settings

**Tasks:**

| Task | Description | Est. | Depends On |
|------|-------------|------|------------|
| P1.6.1 | POST /api/v1/voice-notes/:fileId/transcribe | 2h | P1.5 |
| P1.6.2 | POST /api/v1/voice-notes/:fileId/summarize | 2h | P1.6.1 |
| P1.6.3 | GET /api/v1/ai/providers | 30m | P1.1 |
| P1.6.4 | GET /api/v1/ai/settings | 1h | P1.6.3 |
| P1.6.5 | PUT /api/v1/ai/settings | 1h | P1.6.4 |
| P1.6.6 | Integration tests | 2h | P1.6.5 |

**Acceptance Criteria:**
- [ ] Transcription updates file_metadata.transcription
- [ ] Summarization updates file_metadata.voice_title, voice_summary
- [ ] AI settings persisted per user

---

### P1.7 — Rate Limiting & Error Handling

**Deliverables:**
- Rate limiting middleware
- Consistent error responses

**Tasks:**

| Task | Description | Est. | Depends On |
|------|-------------|------|------------|
| P1.7.1 | Implement rate limiting middleware with sliding window | 2h | P1.1 |
| P1.7.2 | Configure per-endpoint limits (standard, AI, upload) | 1h | P1.7.1 |
| P1.7.3 | Add X-RateLimit-* headers | 30m | P1.7.2 |
| P1.7.4 | Standardize error responses across all endpoints | 1h | P1.7.3 |
| P1.7.5 | Add requestId to all responses | 30m | P1.7.4 |
| P1.7.6 | Tests for rate limiting | 1h | P1.7.5 |

**Acceptance Criteria:**
- [ ] 429 returned when rate limit exceeded
- [ ] Retry-After header present on 429
- [ ] All errors match ApiError schema
