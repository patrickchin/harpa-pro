# Testing Architecture

> Part of [Mobile v3 Architecture](./architecture.md)

## 7.1 Test Pyramid

```
                    ┌─────────────────┐
                   │   E2E (Maestro)  │  ~40 flows
                   │   Full user      │
                  │   journeys       │
                 └─────────────────┘
                ▲
               │ Fewer, slower, more valuable
              │
        ┌─────────────────────────┐
       │   Contract (OpenAPI)    │  ~100 tests
       │   API spec compliance   │
       │   Real JWT, real DB     │
      └─────────────────────────┘
     ▲
    │
   ┌───────────────────────────────┐
  │   Integration (Testcontainers) │  ~150 tests
  │   API routes + DB + RLS        │
  │   Real Postgres, mocked AI     │
 └───────────────────────────────┘
▲
│ More, faster, isolated
│
┌───────────────────────────────────────┐
│           Unit (Vitest)               │  ~200 tests
│   Hooks, utils, components, schemas   │
│   Everything mocked                   │
└───────────────────────────────────────┘
```

## 7.2 Test Distribution

| Layer | Location | Runner | Coverage Target |
|-------|----------|--------|-----------------|
| Unit (Mobile) | `apps/mobile-v3/**/*.test.{ts,tsx}` | Vitest | 80% |
| Unit (API) | `packages/api/**/*.test.ts` | Vitest | 80% |
| Integration | `packages/api/tests/integration/` | Vitest + Testcontainers | Key paths |
| Contract | `packages/api/tests/contract/` | Vitest | All endpoints |
| E2E | `apps/mobile-v3/.maestro/` | Maestro | Critical flows |

## 7.3 What Gets Tested at Each Layer

### Unit Tests

```typescript
// Mobile: Component behavior
describe('NoteTimeline', () => {
  it('renders notes in reverse chronological order');
  it('shows pending indicator for optimistic notes');
  it('bridges pending→real with stable keys (R11)');
});

// Mobile: Hook logic
describe('useNoteTimeline', () => {
  it('merges pending uploads with server notes');
  it('uses addedAt for sorting, not createdAt');
  it('removes pending when real arrives');
});

// API: Schema validation
describe('ProjectSchema', () => {
  it('accepts valid project');
  it('rejects missing name');
  it('coerces string numbers');
});

// API: Service logic
describe('generateReport', () => {
  it('builds prompt from notes');
  it('validates LLM response');
  it('records token usage');
});
```

### Integration Tests (Testcontainers)

```typescript
// packages/api/tests/integration/projects.test.ts
describe('Projects API', () => {
  let db: PostgresTestcontainer;
  let app: Hono;
  
  beforeAll(async () => {
    db = await PostgresTestcontainer.start();
    await db.runMigrations('./supabase/migrations');
    app = createApp(db.connectionString);
  });
  
  it('creates project with owner membership', async () => {
    const res = await app.request('/api/v1/projects', {
      method: 'POST',
      headers: { Authorization: `Bearer ${testJwt}` },
      body: JSON.stringify({ name: 'Test Project' }),
    });
    
    expect(res.status).toBe(201);
    const { data } = await res.json();
    expect(data.role).toBe('owner');
    
    // Verify DB state
    const members = await db.query('SELECT * FROM project_members WHERE project_id = $1', [data.id]);
    expect(members.rows).toHaveLength(1);
    expect(members.rows[0].role).toBe('owner');
  });
  
  it('enforces RLS: user cannot see others projects', async () => {
    // Create as user A
    await app.request('/api/v1/projects', {
      method: 'POST',
      headers: { Authorization: `Bearer ${userAJwt}` },
      body: JSON.stringify({ name: 'Private Project' }),
    });
    
    // List as user B
    const res = await app.request('/api/v1/projects', {
      headers: { Authorization: `Bearer ${userBJwt}` },
    });
    
    const { data } = await res.json();
    expect(data).toHaveLength(0);
  });
});
```

### Contract Tests (OpenAPI compliance)

```typescript
// packages/api/tests/contract/openapi.test.ts
import { validateResponse } from 'openapi-response-validator';
import openapi from '../../../api-contract/openapi.json';

describe('OpenAPI Contract', () => {
  it('GET /api/v1/projects matches schema', async () => {
    const res = await app.request('/api/v1/projects', {
      headers: { Authorization: `Bearer ${testJwt}` },
    });
    
    const body = await res.json();
    const errors = validateResponse(openapi, 'GET', '/api/v1/projects', res.status, body);
    
    expect(errors).toEqual([]);
  });
  
  // Test all documented endpoints...
});
```

## 7.4 Mock/Fixture Strategy (Avoiding R1 and R4)

**R1 reminder:** Fixture stubs must not hide real DB side effects
**R4 reminder:** Boundary tests need real integration, not mocks

```typescript
// ❌ BAD: Stub that hides DB write (R1 violation)
const mockSupabase = {
  from: () => ({
    insert: jest.fn().mockResolvedValue({ data: {}, error: null }),
  }),
};

// ✅ GOOD: Stub LLM, let DB write happen
const mockAiProvider = {
  generateText: jest.fn().mockResolvedValue({
    text: JSON.stringify(fixtureReport),
    usage: { inputTokens: 100, outputTokens: 500 },
  }),
};

// In integration test:
app.use('/api/v1/reports/:id/generate', (c) => {
  // AI is mocked, but DB writes are real
  const report = await generateReport(notes, mockAiProvider);
  await db.insert(reports).values({ ...report, id: reportId });
  return c.json({ data: report });
});
```

**Contract tests use real JWT + real Postgres:**

```typescript
// tests/contract/setup.ts
export async function setupContractTests() {
  // Real Postgres via Testcontainers
  const db = await PostgresTestcontainer.start();
  await db.runMigrations();
  
  // Real JWT generation (same secret as Supabase)
  const testJwt = jwt.sign(
    { sub: testUserId, role: 'authenticated' },
    process.env.SUPABASE_JWT_SECRET,
  );
  
  return { db, testJwt };
}
```

## 7.5 Maestro E2E

**Flow structure mirrors v1:**

```
apps/mobile-v3/.maestro/
├── config.yaml
├── subflows/
│   ├── ensure-logged-out.yaml
│   ├── login-otp.yaml
│   └── create-project.yaml
├── auth/
│   ├── login-phone-otp.yaml
│   └── onboarding.yaml
├── projects/
│   ├── create-project.yaml
│   └── delete-project.yaml
├── reports/
│   ├── generate-fixture.yaml
│   └── edit-report.yaml
├── voice-notes/
│   └── record-transcribe.yaml
└── files/
    └── upload-photo.yaml
```

**Tags for filtering:**

| Tag | Purpose |
|-----|---------|
| `smoke` | Critical happy paths (~10 flows) |
| `fixture-mode` | Requires USE_FIXTURES=true |
| `rls` | Tests cross-user security |
| `offline` | Tests queue persistence |

**Coverage targets:**

- All 49 existing flows ported to v3
- New flows for REST API error handling
- Tag `fixture-mode` on all AI-dependent flows (R7)
