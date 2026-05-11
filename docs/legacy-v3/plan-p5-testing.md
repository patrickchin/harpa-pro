# P5: Testing Plan

> Part of [Implementation Plan](./implementation-plan.md)
>
> **Status**: Planning document
>
> **Last updated**: 2026-05-11

This document defines the comprehensive testing strategy for the v3 rewrite,
covering API route stubs, mobile component testing, test infrastructure,
Maestro E2E gate, and removal verification gates.

---

## Part 1: API Route Testing (Critical Stubs)

Each of the 8 stubbed routes below needs fixture-mode support, real
implementation tests, and edge-case coverage. All integration tests use
real Postgres via Testcontainers with mocked AI providers (R1, R4).

Estimated test count for Part 1: **~95 tests**

---

### 1. POST /api/v1/reports/:id/generate

**File**: `packages/api/src/routes/reports.ts:407-420`

**Fixture mode** (`USE_FIXTURES=true`):

Return a canned `GeneratedSiteReport` matching the v1 fixture format from
`supabase/functions/generate-report/index.ts`. The fixture must include
all top-level fields (`meta`, `weather`, `workers`, `materials`, `issues`,
`nextSteps`, `sections`) so downstream UI rendering is fully exercisable.

```typescript
// packages/api/src/fixtures/generate-report.ts
export const FIXTURE_REPORT = {
  report: {
    meta: {
      title: 'Site Visit -- Foundation Pour',
      reportType: 'daily',
      summary: 'Concrete pour completed in zone A despite wet weather.',
      visitDate: '2026-05-10',
    },
    weather: {
      conditions: 'overcast',
      temperature: '18C',
      wind: 'light',
      impact: 'Minor delay to external painting',
    },
    workers: {
      totalWorkers: 12,
      workerHours: '96',
      notes: 'Full crew on site',
      roles: [
        { role: 'Concrete finisher', count: 4, notes: null },
        { role: 'Labourer', count: 8, notes: null },
      ],
    },
    materials: [
      {
        name: 'Concrete',
        quantity: '50',
        quantityUnit: 'm3',
        condition: null,
        status: 'delivered',
        notes: 'Grade N32',
      },
    ],
    issues: [
      {
        title: 'Formwork misalignment zone B',
        category: 'quality',
        severity: 'medium',
        status: 'open',
        details: 'North wall 15mm out of plumb',
        actionRequired: 'Re-align before next pour',
        sourceNoteIndexes: [2],
      },
    ],
    nextSteps: ['Order rebar for level 2', 'Schedule crane for Thursday'],
    sections: [
      {
        title: 'Foundation Work',
        content: 'Concrete pour started at 07:30 in zone A.',
        sourceNoteIndexes: [1, 2],
      },
    ],
  },
};

export const FIXTURE_USAGE = {
  inputTokens: 450,
  outputTokens: 820,
  cachedTokens: 0,
};
```

Fixture handler delays by `FIXTURES_DELAY_MS` (default 5000, overridable)
to simulate real latency. The fixture must still write `report_data` and
insert a `token_usage` row against the real DB -- only the LLM call is
stubbed (R1).

**Real implementation**:

1. Fetch `report_notes` for the report (join `file_metadata` for transcripts).
2. Build notes array: `note.body ?? file.voiceSummary ?? file.transcription`.
3. Resolve provider/model from request body, falling back to user AI settings
   then `AI_PROVIDER` env var. Port routing logic from
   `supabase/functions/_shared/providers.ts:92-154`.
4. Call AI via Vercel AI SDK `generateText`, using the system prompt from
   `supabase/functions/generate-report/index.ts:38-68`.
5. Parse response with `extractJson` + `parseGeneratedSiteReport`.
6. Update `reports.report_data` and `reports.last_generation` (store
   provider, model, usage, timestamp).
7. Insert `token_usage` row.
8. Return updated report.

**Integration tests** (~15 tests):

```typescript
// packages/api/tests/integration/reports-generate.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDb, createTestApp, testJwt, seedProject } from '../helpers';

describe('POST /api/v1/reports/:id/generate', () => {
  let ctx: Awaited<ReturnType<typeof setupTestDb>>;
  let app: ReturnType<typeof createTestApp>;

  beforeAll(async () => {
    ctx = await setupTestDb();
    app = createTestApp(ctx.connectionString, {
      aiProvider: mockAiProvider, // mock LLM, real DB
    });
  });

  afterAll(() => ctx.teardown());

  it('generates report from notes and stores report_data', async () => {
    const { projectId, reportId } = await seedProject(ctx, {
      notes: ['Foundation pour started', 'Rebar delivery delayed'],
    });

    const res = await app.request(`/api/v1/reports/${reportId}/generate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${testJwt()}` },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.reportData).toHaveProperty('report');
    expect(data.reportData.report.meta.title).toBeTruthy();
  });

  it('inserts token_usage row with correct provider/model', async () => {
    const { reportId } = await seedProject(ctx, { notes: ['Test note'] });

    await app.request(`/api/v1/reports/${reportId}/generate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${testJwt()}` },
      body: JSON.stringify({ provider: 'openai', model: 'gpt-4o-mini' }),
    });

    const rows = await ctx.query(
      'SELECT * FROM token_usage WHERE report_id = $1',
      [reportId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].provider).toBe('openai');
    expect(rows[0].model).toBe('gpt-4o-mini');
    expect(rows[0].input_tokens).toBeGreaterThan(0);
  });

  it('uses user AI settings when no provider specified', async () => {
    // Seed user AI settings first, then generate without provider
    // Verify token_usage row uses the saved provider
  });

  it('returns 404 for non-existent report', async () => {
    const res = await app.request(
      `/api/v1/reports/00000000-0000-0000-0000-000000000000/generate`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${testJwt()}` },
        body: JSON.stringify({}),
      },
    );
    expect(res.status).toBe(404);
  });

  it('returns 403 for non-member', async () => {
    const { reportId } = await seedProject(ctx, { notes: ['Note'] });
    const otherUserJwt = testJwt({ sub: 'other-user-id' });

    const res = await app.request(`/api/v1/reports/${reportId}/generate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${otherUserJwt}` },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(403);
  });

  it('returns 502 when LLM returns unparseable JSON', async () => {
    // Configure mockAiProvider to return invalid JSON
  });

  it('returns 200 with empty report when no notes exist', async () => {
    const { reportId } = await seedProject(ctx, { notes: [] });
    // Should either return error or generate with empty notes
  });

  it('sets report status to draft after generation', async () => {
    // Verify status field after generate
  });

  it('stores last_generation metadata (provider, model, timestamp)', async () => {
    // Verify last_generation jsonb column
  });

  it('respects project membership (viewer can generate)', async () => {
    // Viewer role should be allowed to generate
  });

  it('handles concurrent generation requests gracefully', async () => {
    // Two simultaneous generate calls should not corrupt report_data
  });
});
```

**Edge cases**:
- Report with only voice notes (no text body, only transcriptions)
- Report with 50+ notes (prompt length limits)
- LLM returns markdown-fenced JSON (the `extractJson` code path)
- Provider API key missing at runtime (should 500, not crash)
- Request body specifies invalid provider/model combination (422)

---

### 2. GET /api/v1/reports/:id/pdf

**File**: `packages/api/src/routes/reports.ts:445-456`

**Fixture mode**: Return a static presigned URL pointing to a sample PDF
hosted in the local Supabase Storage bucket. The fixture PDF should be a
valid 1-page document so mobile preview rendering can be tested.

```typescript
export const FIXTURE_PDF_URL =
  'http://127.0.0.1:54321/storage/v1/object/sign/reports/fixture-report.pdf?token=fixture';
```

**Real implementation**:
1. Render report HTML from `report_data` using a template.
2. Convert HTML to PDF (Puppeteer/Playwright in headless mode, or a
   third-party API like Gotenberg).
3. Upload PDF to Supabase Storage under `reports/{reportId}/{timestamp}.pdf`.
4. Generate a signed URL with 1-hour expiry.
5. Return `{ url: signedUrl }`.

**Integration tests** (~8 tests):

```typescript
describe('GET /api/v1/reports/:id/pdf', () => {
  it('returns a signed URL for a report with report_data');
  it('returns 404 for report without report_data (not yet generated)');
  it('returns 404 for non-existent report');
  it('returns 403 for non-member');
  it('signed URL expires after configured TTL');
  it('returns 404 for soft-deleted report');
  it('generates fresh PDF on each call (not cached indefinitely)');
  it('handles report_data with unicode/CJK characters');
});
```

**Edge cases**:
- Very large report_data (100+ sections) -- PDF generation timeout
- Report with no sections but valid meta -- should produce a minimal PDF
- Concurrent PDF requests for the same report -- no duplicate uploads

---

### 3. POST /api/v1/uploads/presign

**File**: `packages/api/src/routes/files.ts:274-282`

**Fixture mode**: Return a deterministic signed URL pointing to the local
Supabase Storage instance. The URL must actually accept PUT uploads so the
mobile upload queue works end-to-end in fixture mode (R1).

```typescript
// Fixture: generate real presigned URL against local Supabase Storage
export async function fixturePresign(fileName: string, mimeType: string) {
  const storagePath = `uploads/${randomUUID()}/${fileName}`;
  const { data } = await supabaseAdmin.storage
    .from('project-files')
    .createSignedUploadUrl(storagePath);
  return { signedUrl: data.signedUrl, storagePath };
}
```

**Real implementation**:
1. Validate `fileName`, `mimeType`, `category` from request body.
2. Generate storage path: `{userId}/{projectId}/{uuid}/{fileName}`.
3. Call `supabase.storage.from(bucket).createSignedUploadUrl(path)`.
4. Return `{ signedUrl, storagePath }`.

**Integration tests** (~8 tests):

```typescript
describe('POST /api/v1/uploads/presign', () => {
  it('returns a valid signed URL and storage path');
  it('storage path includes user ID for isolation');
  it('returns 401 without auth token');
  it('validates fileName is not empty');
  it('validates mimeType is a valid MIME string');
  it('rejects excessively long filenames (>255 chars)');
  it('sanitizes path-traversal attempts in fileName (../../etc)');
  it('rate-limits presign requests (AI tier)');
});
```

---

### 4. GET /api/v1/files/:id

**File**: `packages/api/src/routes/files.ts:318-344`

**Fixture mode**: The current stub returns a placeholder URL. In fixture
mode, generate a real signed download URL against local Supabase Storage
so the mobile image viewer and audio player work.

**Real implementation**:
1. Fetch file_metadata row.
2. Verify project membership.
3. Call `supabase.storage.from(bucket).createSignedUrl(storagePath, 3600)`.
4. Return file metadata with `signedUrl` field appended.

**Integration tests** (~8 tests):

```typescript
describe('GET /api/v1/files/:id', () => {
  it('returns file metadata with signed download URL');
  it('signed URL is valid for the configured TTL');
  it('returns 404 for non-existent file');
  it('returns 404 for soft-deleted file');
  it('returns 404 when user is not a project member');
  it('returns file metadata for voice-note category with voiceTitle/voiceSummary');
  it('returns file metadata for image category with width/height/blurhash');
  it('does not leak file data across projects (R10)');
});
```

---

### 5. POST /api/v1/voice-notes/:fileId/transcribe

**File**: `packages/api/src/routes/files.ts:383-412`

**Fixture mode**: Return a canned transcript. The fixture transcript must
exceed `LONG_TRANSCRIPT_CHAR_THRESHOLD` (400 chars) so the auto-summarize
UI is visible (R5). The fixture must still write `file_metadata.transcription`
to the real DB (R1).

```typescript
export const FIXTURE_TRANSCRIPT =
  'Today we inspected the foundation works in zone A. The concrete pour ' +
  'for pad footings F1 through F8 was completed yesterday afternoon. ' +
  'Surface finish quality is acceptable with minor honeycombing on the ' +
  'east face of F3 which will need patching before waterproofing. Rebar ' +
  'placement in the ground beams between F4 and F5 has a spacing issue -- ' +
  'bars are at 250mm centres instead of the specified 200mm. Structural ' +
  'engineer has been notified and will inspect tomorrow morning. ' +
  'Formwork for the ground floor slab edge beams is 60 percent complete. ' +
  'The crane was idle for two hours this morning due to a hydraulic leak ' +
  'which maintenance resolved by 10am. Weather was overcast with light ' +
  'rain expected in the afternoon.';
// 650+ chars -- exceeds 400-char threshold (R5)

export const FIXTURE_USAGE_TRANSCRIBE = {
  inputTokens: 0,     // audio tokens are provider-specific
  outputTokens: 180,
  cachedTokens: 0,
};
```

**Real implementation**:
1. Fetch file_metadata row, verify `category === 'voice-note'`.
2. Download audio file from Supabase Storage.
3. Call Whisper API (OpenAI) or equivalent speech-to-text provider.
4. Update `file_metadata` row: set a `transcription` field (or store in
   `report_notes.body` for the linked note).
5. Insert `token_usage` row.
6. Return updated file metadata.

**Integration tests** (~12 tests):

```typescript
describe('POST /api/v1/voice-notes/:fileId/transcribe', () => {
  it('transcribes audio and updates file_metadata', async () => {
    // Mock Whisper API, verify DB write
    const file = await ctx.query(
      'SELECT * FROM file_metadata WHERE id = $1',
      [fileId],
    );
    expect(file[0].voice_title).toBeNull(); // not set by transcribe
    // transcription stored -- check the linked report_notes.body or a dedicated column
  });

  it('inserts token_usage row for transcription');
  it('returns 400 for non-voice-note file (e.g., image)');
  it('returns 404 for non-existent file');
  it('returns 404 for non-member');
  it('returns 404 for soft-deleted file');
  it('handles empty audio file gracefully (0 bytes)');
  it('handles very long audio (>30 min) -- timeout or chunk');
  it('returns 409 if file already has transcription');
  it('does not overwrite existing transcription without force flag');
  it('handles Whisper API failure with 502 and descriptive error');
  it('updates linked report_notes.body with transcript text');
});
```

---

### 6. POST /api/v1/voice-notes/:fileId/summarize

**File**: `packages/api/src/routes/files.ts:416-441`

**Fixture mode**: Return canned `voice_title` and `voice_summary`. Both
must be written to the real DB (R1). The fixture handler must NOT stub
`updateFileMetadataFn` (this was the exact root cause documented on
2026-05-08 in `docs/bugs/README.md`).

```typescript
export const FIXTURE_VOICE_TITLE = 'Foundation Inspection Zone A';
export const FIXTURE_VOICE_SUMMARY =
  'Concrete pour for pad footings F1-F8 complete. Minor honeycombing on ' +
  'F3 east face needs patching. Rebar spacing issue in ground beams F4-F5 ' +
  '(250mm vs specified 200mm). Crane idle 2hrs due to hydraulic leak.';
```

**Real implementation**:
1. Fetch file_metadata, verify voice-note category.
2. Read the transcription (from a prior transcribe call).
3. Call LLM with summarization prompt (port from
   `supabase/functions/summarize-voice-note/`).
4. Update `file_metadata.voice_title` and `file_metadata.voice_summary`.
5. Insert `token_usage` row.
6. Return updated file metadata.

**Integration tests** (~10 tests):

```typescript
describe('POST /api/v1/voice-notes/:fileId/summarize', () => {
  it('summarizes transcript and writes voice_title + voice_summary to DB', async () => {
    // Seed file with transcription, mock LLM
    const res = await app.request(
      `/api/v1/voice-notes/${fileId}/summarize`,
      { method: 'POST', headers: { Authorization: `Bearer ${jwt}` } },
    );
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.voiceTitle).toBeTruthy();
    expect(data.voiceSummary).toBeTruthy();

    // Verify DB side effect (R1: do not rely on response alone)
    const row = await ctx.query(
      'SELECT voice_title, voice_summary FROM file_metadata WHERE id = $1',
      [fileId],
    );
    expect(row[0].voice_title).toBeTruthy();
    expect(row[0].voice_summary).toBeTruthy();
  });

  it('inserts token_usage row for summarization');
  it('returns 400 when file has no transcription yet');
  it('returns 404 for non-existent file');
  it('returns 404 for non-member');
  it('uses user AI settings for provider/model selection');
  it('handles LLM returning malformed summary gracefully');
  it('does not re-summarize if voice_summary already exists (idempotent)');
  it('rate-limits summarization requests');
  it('records correct provider in token_usage (not hardcoded)');
});
```

---

### 7. GET /api/v1/ai/settings

**File**: `packages/api/src/routes/ai.ts:101-105`

**Fixture mode**: Return the default provider/model. No special fixture
needed since this is a read-only endpoint.

**Real implementation**:
1. Query `user_ai_settings` table (or a jsonb column on `profiles`) for
   the authenticated user.
2. If no row exists, return defaults: `{ provider: DEFAULT_PROVIDER,
   model: PROVIDER_MODELS[DEFAULT_PROVIDER].default }`.
3. Validate that the stored provider/model still exist in the current
   `PROVIDER_MODELS` registry (providers can be removed between deploys).

**Integration tests** (~8 tests):

```typescript
describe('GET /api/v1/ai/settings', () => {
  it('returns default settings for new user (no saved preferences)');
  it('returns saved settings for user with preferences');
  it('falls back to defaults if saved provider no longer exists');
  it('falls back to default model if saved model removed from provider');
  it('returns 401 without auth token');
  it('returns consistent shape regardless of stored state');
  it('does not leak other users settings');
  it('handles corrupted settings row gracefully');
});
```

---

### 8. PUT /api/v1/ai/settings

**File**: `packages/api/src/routes/ai.ts:107-126`

**Fixture mode**: Accept the request and return the submitted values.
In fixture mode, still persist to DB so subsequent GET calls reflect
the change (R1).

**Real implementation**:
1. Validate `provider` exists in `AI_PROVIDERS`.
2. Validate `model` exists in `PROVIDER_MODELS[provider]`.
3. Upsert into `user_ai_settings` table.
4. Return the saved settings.

**Integration tests** (~8 tests):

```typescript
describe('PUT /api/v1/ai/settings', () => {
  it('persists provider and model for user', async () => {
    await app.request('/api/v1/ai/settings', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${jwt}` },
      body: JSON.stringify({ provider: 'anthropic', model: 'claude-sonnet-4-20250514' }),
    });

    // Verify via GET
    const res = await app.request('/api/v1/ai/settings', {
      headers: { Authorization: `Bearer ${jwt}` },
    });
    const { data } = await res.json();
    expect(data.provider).toBe('anthropic');
    expect(data.model).toBe('claude-sonnet-4-20250514');
  });

  it('returns 422 for invalid provider');
  it('returns 422 for invalid model for given provider');
  it('returns 401 without auth token');
  it('overwrites previous settings on second PUT');
  it('does not affect other users settings');
  it('rejects empty body with 400');
  it('accepts valid provider with its default model');
});
```

---

## Part 2: Mobile Component Testing

Estimated test count: **~120 tests**

### 2.1 API Client Mocking Strategy

Use **MSW (Mock Service Worker)** as the primary mock layer for mobile
tests. MSW intercepts at the network level, which means the `openapi-fetch`
client, React Query hooks, and error handling all exercise their real code
paths -- only the HTTP transport is stubbed. This avoids the R4 pattern
of mocking too close to the call site.

```typescript
// apps/mobile-v3/test/setup/msw.ts
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

export const server = setupServer();

// Reusable handler factories
export const handlers = {
  listProjects: (data: any[] = []) =>
    http.get('*/api/v1/projects', () =>
      HttpResponse.json({ data, meta: { hasNext: false, nextCursor: null, count: data.length } }),
    ),

  generateReport: (reportData: any = FIXTURE_REPORT) =>
    http.post('*/api/v1/reports/:id/generate', () =>
      HttpResponse.json({ data: { id: 'report-1', reportData, status: 'draft' } }),
    ),

  generateReportError: (status: number, message: string) =>
    http.post('*/api/v1/reports/:id/generate', () =>
      HttpResponse.json({ error: { code: 'error', message } }, { status }),
    ),
};
```

```typescript
// apps/mobile-v3/test/setup/wrapper.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { server } from './msw';

export function createTestWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  }

  return { Wrapper, queryClient };
}
```

### 2.2 React Query Hook Testing

Test hooks via `renderHook` with the MSW-backed wrapper. Each hook test
verifies: (a) correct query key usage, (b) data unwrapping, (c) cache
invalidation on mutation success, (d) error propagation.

**Hooks to test** (from `apps/mobile-v3/lib/api/hooks.ts`):

| Hook | Test focus | Tests |
|------|-----------|-------|
| `useProjects` | List fetch, cursor pagination | 4 |
| `useProject` | Detail fetch, `enabled` flag | 3 |
| `useCreateProject` | Mutation + `projects.all` invalidation | 3 |
| `useReports` | Scoped to projectId, pagination | 4 |
| `useGenerateReport` | Mutation success invalidates detail | 4 |
| `useReportPdf` | Query for PDF URL, `enabled` flag | 3 |
| `useNotes` | List scoped to reportId | 3 |
| `useCreateNote` | Mutation + notes.list invalidation | 3 |
| `useReorderNotes` | Batch reorder mutation | 3 |
| `useFiles` | Category filter, pagination | 3 |
| `usePresignUpload` | Mutation returns signedUrl | 3 |
| `useTranscribe` | Mutation invalidates file detail | 3 |
| `useSummarize` | Mutation invalidates file detail | 3 |
| `useAiSettings` | Default fallback, query key | 3 |
| `useUpdateAiSettings` | Mutation invalidates settings key | 3 |

```typescript
// apps/mobile-v3/lib/api/__tests__/hooks.test.ts
import { renderHook, waitFor } from '@testing-library/react-native';
import { useGenerateReport, useReport } from '../hooks';
import { createTestWrapper } from '../../test/setup/wrapper';
import { server, handlers } from '../../test/setup/msw';

describe('useGenerateReport', () => {
  const { Wrapper, queryClient } = createTestWrapper();

  it('calls POST /reports/:id/generate and returns report data', async () => {
    server.use(handlers.generateReport());

    const { result } = renderHook(() => useGenerateReport(), { wrapper: Wrapper });

    result.current.mutate('report-1');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data.reportData).toHaveProperty('report');
  });

  it('invalidates report detail cache on success', async () => {
    server.use(handlers.generateReport());
    const spy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useGenerateReport(), { wrapper: Wrapper });
    result.current.mutate('report-1');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['reports', 'detail', 'report-1'] }),
    );
  });

  it('propagates 502 LLM error to isError state', async () => {
    server.use(handlers.generateReportError(502, 'LLM returned invalid JSON'));

    const { result } = renderHook(() => useGenerateReport(), { wrapper: Wrapper });
    result.current.mutate('report-1');

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
```

### 2.3 Component Testing

Components worth testing are those with meaningful render logic beyond
simple prop display. Test with `@testing-library/react-native`.

**Key components to test**:

| Component | What to test | Tests |
|-----------|-------------|-------|
| `NoteTimeline` | Render order, pending indicators, R11 bridging | 8 |
| `ReportCard` | Status badge, date formatting, tap handler | 4 |
| `VoiceNoteCard` | Title/summary display, summarize button visibility (R5) | 5 |
| `ProjectList` | Empty state, loading skeleton, error retry | 4 |
| `UploadProgressBar` | Progress percentage, error state | 3 |
| `AiSettingsPicker` | Provider/model dropdowns, save handler | 4 |
| `ReportPdfViewer` | Loading state, error state, URL binding | 3 |
| `FilePreview` | Image vs audio vs document rendering | 4 |
| `NoteEditor` | Text input, voice toggle, image attach | 5 |

```typescript
// apps/mobile-v3/components/__tests__/VoiceNoteCard.test.tsx
import { render, screen } from '@testing-library/react-native';
import { VoiceNoteCard } from '../VoiceNoteCard';

describe('VoiceNoteCard', () => {
  it('shows summarize button when no voice_summary exists', () => {
    render(<VoiceNoteCard file={{ ...baseFile, voiceSummary: null }} />);
    expect(screen.getByTestId('btn-voice-note-summarize')).toBeTruthy();
  });

  it('hides summarize button when voice_summary exists', () => {
    render(<VoiceNoteCard file={{ ...baseFile, voiceSummary: 'A summary' }} />);
    expect(screen.queryByTestId('btn-voice-note-summarize')).toBeNull();
  });

  it('displays voice_title when available', () => {
    render(
      <VoiceNoteCard file={{ ...baseFile, voiceTitle: 'Foundation Inspection' }} />,
    );
    expect(screen.getByText('Foundation Inspection')).toBeTruthy();
  });

  // R5: fixture transcripts must exceed threshold
  it('shows summary section for long transcripts', () => {
    render(
      <VoiceNoteCard
        file={{ ...baseFile, voiceSummary: 'A long summary text here' }}
      />,
    );
    expect(screen.getByTestId('voice-note-summary')).toBeTruthy();
  });
});
```

### 2.4 Legends State Observable Testing

If the mobile app uses Legends State for local-first observables,
test the observable layer independently from React components:

```typescript
// apps/mobile-v3/lib/state/__tests__/report-store.test.ts
import { reportStore$ } from '../report-store';

describe('reportStore$', () => {
  it('merges server data with pending edits');
  it('clears pending edits after successful sync');
  it('preserves pending edits across observable resets');
  it('handles concurrent updates without data loss');
});
```

### 2.5 Error, Loading, and Empty State Testing

Every list screen and detail screen must have tests for all three states:

```typescript
describe('ProjectList states', () => {
  it('shows skeleton while loading', () => {
    server.use(http.get('*/api/v1/projects', () => new Promise(() => {})));
    // Render, assert skeleton
  });

  it('shows empty state with CTA when no projects', () => {
    server.use(handlers.listProjects([]));
    // Render, assert empty message
  });

  it('shows error state with retry button on network error', () => {
    server.use(
      http.get('*/api/v1/projects', () => HttpResponse.error()),
    );
    // Render, assert error + retry
  });
});
```

### 2.6 Upload Queue Provider Testing

The upload queue manages presign, upload, and file creation as a
multi-step pipeline. Test the provider/context:

```typescript
// apps/mobile-v3/providers/__tests__/upload-queue.test.ts
describe('UploadQueueProvider', () => {
  it('enqueues a file and transitions pending -> uploading -> uploaded');
  it('retries failed uploads up to 3 times with backoff');
  it('creates file_metadata after successful upload');
  it('links file to report_notes when reportId is provided');
  it('persists queue across provider remounts (R11 bridging)');
  it('removes completed jobs after file is confirmed in server response');
  it('handles presign failure (server 500) gracefully');
  it('handles upload failure (network timeout) gracefully');
  it('does not duplicate uploads on rapid queue additions');
  it('respects max concurrent uploads limit');
});
```

### 2.7 Audio Provider / Recorder Testing

Audio recording is stubbed in E2E mock mode (`EXPO_PUBLIC_E2E_MOCK_VOICE_NOTE=true`).
Unit tests should test the state machine, not actual audio:

```typescript
describe('AudioProvider', () => {
  it('transitions idle -> recording -> stopped');
  it('exposes duration while recording');
  it('writes placeholder file in mock mode');
  it('triggers transcribe mutation after recording completes');
  it('handles permission denied gracefully');
  it('cleans up temporary files on unmount');
});
```

---

## Part 3: Test Infrastructure Setup

### 3.1 Testcontainers Configuration

```typescript
// packages/api/tests/helpers/testcontainers.ts
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import * as schema from '../../src/db/schema';

export async function setupTestDb() {
  const container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('test_harpa')
    .withUsername('test')
    .withPassword('test')
    .start();

  const connectionString = container.getConnectionUri();
  const pool = new Pool({ connectionString });
  const db = drizzle(pool, { schema });

  // Run all Supabase migrations
  await migrate(db, { migrationsFolder: './supabase/migrations' });

  // Seed auth.users equivalent (profiles table)
  await seedTestUsers(db);

  return {
    container,
    connectionString,
    db,
    pool,
    query: async (sql: string, params?: any[]) => {
      const result = await pool.query(sql, params);
      return result.rows;
    },
    teardown: async () => {
      await pool.end();
      await container.stop();
    },
  };
}

async function seedTestUsers(db: ReturnType<typeof drizzle>) {
  const testUsers = [
    { id: 'user-a-id', phone: '+15551000001', fullName: 'User A' },
    { id: 'user-b-id', phone: '+15551000002', fullName: 'User B' },
    { id: 'admin-id', phone: '+15551000003', fullName: 'Admin' },
  ];

  for (const user of testUsers) {
    await db.insert(schema.profiles).values(user).onConflictDoNothing();
  }
}
```

### 3.2 JWT Test Helper

```typescript
// packages/api/tests/helpers/jwt.ts
import * as jose from 'jose';

const JWT_SECRET = new TextEncoder().encode('test-jwt-secret-for-tests-only');

export async function testJwt(overrides: Record<string, unknown> = {}) {
  const payload = {
    sub: 'user-a-id',
    role: 'authenticated',
    email: 'user-a@test.com',
    phone: '+15551000001',
    aud: 'authenticated',
    ...overrides,
  };

  return new jose.SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(JWT_SECRET);
}

export async function expiredJwt() {
  return new jose.SignJWT({ sub: 'user-a-id', role: 'authenticated' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
    .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
    .sign(JWT_SECRET);
}
```

### 3.3 Fixture Data Factories

```typescript
// packages/api/tests/helpers/factories.ts
import { randomUUID } from 'node:crypto';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../../src/db/schema';

type Db = NodePgDatabase<typeof schema>;

export async function createProject(db: Db, ownerId = 'user-a-id') {
  const [project] = await db
    .insert(schema.projects)
    .values({ ownerId, name: `Test Project ${randomUUID().slice(0, 8)}` })
    .returning();

  await db.insert(schema.projectMembers).values({
    projectId: project.id,
    userId: ownerId,
    role: 'admin',
  });

  return project;
}

export async function createReport(db: Db, projectId: string, ownerId = 'user-a-id') {
  const [report] = await db
    .insert(schema.reports)
    .values({ projectId, ownerId, title: 'Test Report' })
    .returning();
  return report;
}

export async function createNote(
  db: Db,
  reportId: string,
  projectId: string,
  authorId = 'user-a-id',
  body = 'Test note content',
) {
  const [note] = await db
    .insert(schema.reportNotes)
    .values({
      reportId,
      projectId,
      authorId,
      position: 0,
      kind: 'text',
      body,
    })
    .returning();
  return note;
}

export async function createVoiceNote(
  db: Db,
  projectId: string,
  uploadedBy = 'user-a-id',
) {
  const [file] = await db
    .insert(schema.fileMetadata)
    .values({
      projectId,
      uploadedBy,
      bucket: 'project-files',
      storagePath: `uploads/${randomUUID()}/recording.m4a`,
      category: 'voice-note',
      filename: 'recording.m4a',
      mimeType: 'audio/mp4',
      sizeBytes: 102400,
      durationMs: 30000,
    })
    .returning();
  return file;
}

/** Seed a project with a report and N notes, ready for generate tests. */
export async function seedProject(
  ctx: { db: Db },
  opts: { notes?: string[]; ownerId?: string } = {},
) {
  const ownerId = opts.ownerId ?? 'user-a-id';
  const project = await createProject(ctx.db, ownerId);
  const report = await createReport(ctx.db, project.id, ownerId);

  const notes = opts.notes ?? [];
  for (let i = 0; i < notes.length; i++) {
    await createNote(ctx.db, report.id, project.id, ownerId, notes[i]);
  }

  return { projectId: project.id, reportId: report.id };
}
```

### 3.4 Mock AI Provider

```typescript
// packages/api/tests/helpers/mock-ai.ts
import { FIXTURE_REPORT, FIXTURE_USAGE } from '../../src/fixtures/generate-report';

export function createMockAiProvider(overrides?: {
  text?: string;
  usage?: { inputTokens: number; outputTokens: number; cachedTokens: number };
  shouldFail?: boolean;
  failMessage?: string;
}) {
  return {
    generateText: vi.fn(async () => {
      if (overrides?.shouldFail) {
        throw new Error(overrides.failMessage ?? 'AI provider error');
      }
      return {
        text: overrides?.text ?? JSON.stringify(FIXTURE_REPORT),
        usage: overrides?.usage ?? FIXTURE_USAGE,
      };
    }),
  };
}

export function createMockTranscriptionProvider(overrides?: {
  transcript?: string;
  shouldFail?: boolean;
}) {
  return {
    transcribe: vi.fn(async () => {
      if (overrides?.shouldFail) {
        throw new Error('Transcription failed');
      }
      return {
        text: overrides?.transcript ?? 'Default transcription text for testing.',
      };
    }),
  };
}
```

### 3.5 MSW Setup for Mobile Tests

```typescript
// apps/mobile-v3/test/setup/setup.ts
import { beforeAll, afterAll, afterEach } from 'vitest';
import { server } from './msw';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

Add to `apps/mobile-v3/vitest.config.ts`:

```typescript
export default defineConfig({
  test: {
    setupFiles: ['./test/setup/setup.ts'],
    environment: 'jsdom',
    globals: true,
  },
});
```

### 3.6 CI Pipeline Integration

```
CI Pipeline (GitHub Actions)
================================

Job: unit-tests
  runs-on: ubuntu-latest
  steps:
    - pnpm install
    - pnpm -r test          # All workspace unit tests
    - pnpm -r test:coverage  # Coverage report
  Parallelism: all workspaces run in parallel

Job: integration-tests
  runs-on: ubuntu-latest
  services: [docker]        # Required for Testcontainers
  steps:
    - pnpm install
    - pnpm --filter @harpa/api test:integration
  Timeout: 10min (Testcontainers startup + migration)

Job: contract-tests
  runs-on: ubuntu-latest
  services: [docker]
  needs: [unit-tests]
  steps:
    - pnpm --filter @harpa/api test:contract

Job: e2e-tests (Maestro)
  runs-on: macos-latest
  needs: [integration-tests]
  steps:
    - pnpm ios:mock:release
    - maestro test apps/mobile-v3/.maestro/ --tags smoke
  Note: Full suite runs nightly; PRs run smoke only

Job: type-check
  runs-on: ubuntu-latest
  steps:
    - pnpm -r typecheck     # tsc --noEmit across all packages
```

| What | Where it runs | Trigger |
|------|--------------|---------|
| Unit tests | `unit-tests` job | Every push/PR |
| Integration tests | `integration-tests` job | Every push/PR |
| Contract tests | `contract-tests` job | Every push/PR |
| Maestro smoke | `e2e-tests` job | PR to dev/main |
| Maestro full suite | `e2e-tests` nightly | Nightly schedule |
| Type checking | `type-check` job | Every push/PR |
| Coverage report | `unit-tests` job | Every push/PR |

---

## Part 4: Maestro E2E Gate (P4 exit requirement)

All 49 Maestro flows must pass before P5 begins. This is verified in
the P4.5 exit gate ([`plan-p4-e2e-polish.md` § P4.5](./plan-p4-e2e-polish.md#p45--p4-exit-gate-must-pass-before-starting-p5)).

### 4.0 Maestro Flow Verification

| Check | How to verify |
|-------|---------------|
| All 49 flows ported | `ls apps/mobile-v3/.maestro/**/*.yaml \| wc -l` ≥ 49 |
| All flows pass locally | `cd apps/mobile-v3 && maestro test .maestro/` exits 0 |
| Smoke flows pass in CI | `maestro test .maestro/ --tags smoke` exits 0 |
| Fixture-mode AI flows pass | `maestro test .maestro/ --tags fixture` exits 0 |
| No `optional: true` on mandatory assertions | `grep -r 'optional: true' apps/mobile-v3/.maestro/` returns 0 results (R2) |
| Voice note flows exercise full pipeline | record → upload → transcribe → summary visible |
| Camera flows exercise full pipeline | capture → upload queue → file visible in timeline |
| Report generate flows exercise full pipeline | add notes → generate → report sections visible |

**Failure policy**: Any Maestro failure blocks P5. Fix in P4.3 (bug fixing)
and re-run the full suite before proceeding.

```bash
# Full verification command
cd apps/mobile-v3 && maestro test .maestro/ 2>&1 | tee maestro-results.log
echo "Exit code: $?"
```

---

## Part 5: Removal Verification

Before removing any v1 code, the following test gates must pass. Each gate
is a set of tests that prove the v3 replacement is feature-complete and
the old code is no longer called.

### 5.1 Before removing `supabase/functions/generate-report/`

**Gate**: All of the following must be true:

1. `packages/api/tests/integration/reports-generate.test.ts` -- all tests pass.
2. Fixture mode in the API server returns the same response shape as
   the v1 edge function (verify with a snapshot test comparing output
   schemas).
3. `token_usage` rows are inserted by the v3 API with the same columns
   as the v1 edge function.
4. Maestro flow `reports/generate-fixture.yaml` passes against the v3
   API server (not the edge function).
5. Mobile `useGenerateReport` hook points to `POST /api/v1/reports/:id/generate`,
   not `supabase.functions.invoke('generate-report')`.

```typescript
// packages/api/tests/removal-gates/generate-report.test.ts
describe('v1 generate-report removal gate', () => {
  it('v3 API returns same top-level response keys as v1', async () => {
    // Call v3 API, verify response has: data.reportData.report.meta, .weather, etc.
    const res = await app.request(`/api/v1/reports/${reportId}/generate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${jwt}` },
      body: JSON.stringify({}),
    });
    const { data } = await res.json();
    const report = data.reportData.report;

    expect(report).toHaveProperty('meta');
    expect(report).toHaveProperty('weather');
    expect(report).toHaveProperty('workers');
    expect(report).toHaveProperty('materials');
    expect(report).toHaveProperty('issues');
    expect(report).toHaveProperty('nextSteps');
    expect(report).toHaveProperty('sections');
  });

  it('v3 API records token_usage with same schema as v1', async () => {
    // Verify columns: user_id, project_id, input_tokens, output_tokens,
    // cached_tokens, model, provider
  });

  it('no mobile code references supabase.functions.invoke(generate-report)', async () => {
    // Static analysis: grep for 'generate-report' in apps/mobile-v3/
    // This can also be a lint rule
  });

  it('fixture mode produces valid report without calling any edge function');
});
```

### 5.2 Before removing `supabase/functions/transcribe-audio/`

**Gate**:

1. `packages/api/tests/integration/files-transcribe.test.ts` -- all pass.
2. The v3 API transcribe endpoint writes to the same DB columns
   (`file_metadata` transcription field or `report_notes.body`).
3. Maestro flow `voice-notes/record-transcribe.yaml` passes against v3 API.
4. No mobile code calls `supabase.functions.invoke('transcribe-audio')`.

```typescript
describe('v1 transcribe-audio removal gate', () => {
  it('v3 transcribe writes to same DB location as v1');
  it('v3 transcribe returns same response shape as v1');
  it('no mobile code references transcribe-audio edge function');
  it('fixture mode returns transcript exceeding LONG_TRANSCRIPT_CHAR_THRESHOLD (R5)');
});
```

### 5.3 Before removing `supabase/functions/summarize-voice-note/`

**Gate**:

1. `packages/api/tests/integration/files-summarize.test.ts` -- all pass.
2. The v3 API writes `voice_title` and `voice_summary` to `file_metadata`
   (not stubbed away -- R1 from the 2026-05-08 bug).
3. Maestro flow assertions for voice note summary are NOT marked
   `optional: true` (R2).
4. No mobile code calls `supabase.functions.invoke('summarize-voice-note')`.

```typescript
describe('v1 summarize-voice-note removal gate', () => {
  it('v3 summarize writes voice_title + voice_summary to file_metadata', async () => {
    // Mock LLM, call v3 API, verify DB columns
    const row = await ctx.query(
      'SELECT voice_title, voice_summary FROM file_metadata WHERE id = $1',
      [fileId],
    );
    expect(row[0].voice_title).toBeTruthy();
    expect(row[0].voice_summary).toBeTruthy();
  });

  it('no mobile code references summarize-voice-note edge function');
  it('fixture mode writes to DB, not a no-op stub (R1)');
  it('Maestro flow asserts summary visibility without optional:true (R2)');
});
```

### 5.4 Before removing `apps/mobile-old/` (v1 mobile app)

**Gate**:

1. All 49 existing Maestro flows pass against `apps/mobile-v3`.
2. Unit test coverage for `apps/mobile-v3` >= 80%.
3. All integration tests in `packages/api/tests/integration/` pass.
4. All contract tests in `packages/api/tests/contract/` pass.
5. No import paths in `apps/mobile-v3` reference `apps/mobile-old`.
6. Performance metrics meet targets:
   - Cold start < 2s
   - API p95 latency < 200ms
   - Bundle size <= v1 bundle size

```typescript
describe('v1 mobile-old removal gate', () => {
  it('all 49 Maestro flows pass (run separately, assert exit code 0)');
  it('no imports reference apps/mobile-old');
  it('test coverage >= 80%');
  it('contract tests all pass');
  it('bundle size is <= v1 baseline');
});
```

---

## Test Count Summary

| Section | Estimated Tests |
|---------|----------------|
| 1. generate report | 15 |
| 2. report PDF | 8 |
| 3. presign upload | 8 |
| 4. file detail | 8 |
| 5. transcribe | 12 |
| 6. summarize | 10 |
| 7. GET ai/settings | 8 |
| 8. PUT ai/settings | 8 |
| **Part 1 subtotal** | **~77** |
| Hook tests | ~48 |
| Component tests | ~40 |
| State/provider tests | ~16 |
| Loading/error/empty | ~16 |
| **Part 2 subtotal** | **~120** |
| Infrastructure (setup, not test count) | -- |
| Maestro E2E flows | 49 |
| **Part 4 subtotal** | **49** |
| Removal gate tests | ~20 |
| **Part 5 subtotal** | **~20** |
| **Grand total** | **~266** |

This aligns with the test pyramid targets in
[`docs/v3/arch-testing.md`](./arch-testing.md):
~200 unit tests, ~150 integration tests, ~100 contract tests, ~40 E2E flows.

---

## Bug Pattern Cross-Reference

| Pattern | Where it applies in this plan |
|---------|-------------------------------|
| R1 (fixture stubs hiding failures) | All 8 stubs: fixture handlers must write to real DB |
| R2 (optional:true on Maestro) | Part 4 Maestro gate + Part 5 removal gates: verify no optional assertions |
| R3 (mutation without optimistic update) | Part 2 hook tests: verify cache invalidation |
| R4 (mocked tests missing integration) | Part 1: use Testcontainers, not DB mocks |
| R5 (threshold-gated UI) | Stub 5 (transcribe): fixture exceeds 400 chars |
| R10 (RLS hardening) | Part 1 stubs 3-6: cross-project access denied tests |
| R11 (optimistic row swap) | Part 2 component tests: NoteTimeline bridging |

---

*End of testing plan.*
