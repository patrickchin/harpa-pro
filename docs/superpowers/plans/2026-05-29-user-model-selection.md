# User Model Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the mobile model picker to actually drive `/reports/.../generate` and `/voice/summarize` via the existing `app.user_settings` row, replace the broken catalogue (Kimi IDs that don't exist on our account, deprecated 4o) with a single-vendor GPT-4.1 family, and bump the live-mode default from `gpt-4o`/`gpt-4o-mini` to `gpt-4.1-mini`.

**Architecture:** Server-backed settings via existing `/settings/ai` route. New `AI_MODELS` whitelist in the contract is the single source of truth — both the server validates against it and the mobile picker renders from it. `FIXTURE_CANONICALS` (which pin replay-mode hashes) stay on the existing `gpt-4o`/`gpt-4o-mini` so fixtures don't need re-recording; new `LIVE_DEFAULT_MODELS` constant is what live mode falls back to when the user hasn't picked. Fixture replay always uses canonicals regardless of user choice — keeps CI deterministic.

**Tech Stack:** TypeScript, Hono + `@hono/zod-openapi`, Drizzle, Zod, React Native + Expo Router, TanStack Query, Vitest.

**Spec:** `docs/superpowers/specs/2026-05-29-user-model-selection-design.md`

---

## File Structure

| File | Responsibility |
| --- | --- |
| `packages/api-contract/src/schemas/settings.ts` | `AI_MODELS` whitelist (single source of truth for vendor + model IDs + picker metadata); nullable `aiSettings` shape; vendor/model pair validator |
| `packages/api/src/services/settings.ts` | `getAiSettings` returns `{vendor: null, model: null}` when row absent (no DEFAULTS fallback); `updateAiSettings` validates patch against `AI_MODELS`; clears row on `{vendor: null, model: null}` |
| `packages/api/src/services/ai.ts` | New `LIVE_DEFAULT_MODELS = { report: 'gpt-4.1-mini', summarize: 'gpt-4.1-mini' }`; `generateReport` and `summarize` accept `userVendor`/`userModel`; live mode picks user value or live default; replay still pins canonical |
| `packages/api/src/routes/reports.ts` | Pass `settings.model` (in addition to `settings.vendor`) into `generateReport` |
| `packages/api/src/routes/voice.ts` | Fetch `getAiSettings`, pass `vendor`/`model` into `aiSummarize` |
| `apps/mobile/lib/ai/useAiProvider.ts` | TanStack Query against `/settings/ai`; expose `selection` (server state) + `setSelection`; "Default" entry maps to `{vendor: null, model: null}`; AsyncStorage code deleted |
| `apps/mobile/app/(app)/developer.tsx` | Adapt to new hook API (no `provider`/`model` strings — `selection` object); render picker rows from imported `AI_MODELS` |
| `packages/api/src/__tests__/settings.integration.test.ts` | Update existing tests for new shape (nulls) + new whitelist (drop kimi tests, add 4.1 family) |
| `packages/api/src/__tests__/reports.integration.test.ts` | Add: assert `generateReport` receives user-picked model in live mode (via stub) |
| `packages/api/src/__tests__/live/reportGeneration.live.test.ts` | Add 4th scenario: user_settings = `{openai, gpt-4.1-nano}` → `result.model === 'gpt-4.1-nano'` (default-wiring per AGENTS.md pitfall #13) |
| `apps/mobile/lib/ai/useAiProvider.test.tsx` | Rewrite for server-backed source |

---

## Pre-flight

- [ ] **Verify branch + worktree**

```bash
cd /Users/patchin/Workspace/test/harpa-pro-opus.worktrees/agents-curl-journey-dev-deployment
git status
git branch --show-current
```

Expected: branch `agents/user-model-selection-spec`, working tree clean (spec already committed at `fed58ac`).

- [ ] **Verify baseline tests pass before changes**

```bash
pnpm --filter @harpa/api-contract test 2>&1 | tail -10
pnpm --filter @harpa/api test:unit 2>&1 | tail -10
```

Expected: green. If anything fails here, stop — fix the baseline before continuing.

---

## Task 1: Add `AI_MODELS` whitelist to the contract

**Files:**
- Modify: `packages/api-contract/src/schemas/settings.ts`
- Test: `packages/api-contract/src/__tests__/settings.test.ts` (NEW)

The contract is the single source of truth — both server validation and mobile picker render from it. Drop the `kimi` vendor entirely (the IDs we list don't exist on our Moonshot China account; verified via `/v1/models` from Fly Frankfurt).

- [ ] **Step 1: Write failing test for the new schema shape**

Create `packages/api-contract/src/__tests__/settings.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  AI_MODELS,
  aiSettings,
  updateAiSettingsRequest,
  isValidAiSelection,
} from '../schemas/settings.js';

describe('AI_MODELS', () => {
  it('lists only openai with the GPT-4.1 family', () => {
    expect(Object.keys(AI_MODELS)).toEqual(['openai']);
    expect(AI_MODELS.openai.map((m) => m.id)).toEqual([
      'gpt-4.1-nano',
      'gpt-4.1-mini',
      'gpt-4.1',
    ]);
  });

  it('every entry has tagline + latencyMs + costPerReport', () => {
    for (const m of AI_MODELS.openai) {
      expect(typeof m.label).toBe('string');
      expect(typeof m.tagline).toBe('string');
      expect(typeof m.latencyMs).toBe('number');
      expect(typeof m.costPerReport).toBe('number');
    }
  });

  it('exactly one entry is marked isDefault', () => {
    const defaults = AI_MODELS.openai.filter((m) => m.isDefault);
    expect(defaults).toHaveLength(1);
    expect(defaults[0].id).toBe('gpt-4.1-mini');
  });
});

describe('aiSettings', () => {
  it('accepts {vendor: null, model: null} (the "Default" state)', () => {
    expect(aiSettings.parse({ vendor: null, model: null })).toEqual({
      vendor: null,
      model: null,
    });
  });

  it('accepts a valid pair', () => {
    expect(aiSettings.parse({ vendor: 'openai', model: 'gpt-4.1-nano' })).toEqual({
      vendor: 'openai',
      model: 'gpt-4.1-nano',
    });
  });

  it('rejects vendor without model', () => {
    expect(() => aiSettings.parse({ vendor: 'openai', model: null })).toThrow();
  });

  it('rejects model without vendor', () => {
    expect(() => aiSettings.parse({ vendor: null, model: 'gpt-4.1-nano' })).toThrow();
  });
});

describe('isValidAiSelection', () => {
  it('returns true for null/null (default)', () => {
    expect(isValidAiSelection({ vendor: null, model: null })).toBe(true);
  });

  it('returns true for any whitelisted pair', () => {
    expect(isValidAiSelection({ vendor: 'openai', model: 'gpt-4.1-mini' })).toBe(true);
  });

  it('returns false for a model not in the whitelist', () => {
    expect(isValidAiSelection({ vendor: 'openai', model: 'gpt-4o' })).toBe(false);
  });

  it('returns false for an unknown vendor', () => {
    expect(isValidAiSelection({ vendor: 'kimi' as never, model: 'kimi-k2.5' })).toBe(false);
  });
});

describe('updateAiSettingsRequest', () => {
  it('accepts {vendor, model} pair', () => {
    expect(updateAiSettingsRequest.parse({ vendor: 'openai', model: 'gpt-4.1-mini' })).toBeTruthy();
  });

  it('accepts {vendor: null, model: null} (clear to default)', () => {
    expect(updateAiSettingsRequest.parse({ vendor: null, model: null })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @harpa/api-contract test settings.test 2>&1 | tail -20
```

Expected: FAIL — `AI_MODELS` is not exported, `isValidAiSelection` doesn't exist.

- [ ] **Step 3: Replace `packages/api-contract/src/schemas/settings.ts`**

```ts
import { z } from 'zod';

/**
 * AI model whitelist — single source of truth for both API validation
 * and mobile picker rendering. Each entry carries display metadata
 * (tagline, latency, cost) so the picker doesn't need a parallel table.
 *
 * Bench numbers are p50 from Fly Frankfurt (our prod region). Cost is
 * USD per report at ~1.2K input + 0.5K output tokens. See
 * docs/superpowers/specs/2026-05-29-user-model-selection-design.md.
 */
export const AI_MODELS = {
  openai: [
    {
      id: 'gpt-4.1-nano',
      label: 'GPT-4.1 nano',
      tagline: 'Fastest and cheapest',
      latencyMs: 2100,
      costPerReport: 0.0003,
    },
    {
      id: 'gpt-4.1-mini',
      label: 'GPT-4.1 mini',
      tagline: 'Default — balanced',
      latencyMs: 4700,
      costPerReport: 0.001,
      isDefault: true,
    },
    {
      id: 'gpt-4.1',
      label: 'GPT-4.1',
      tagline: 'Highest quality',
      latencyMs: 2600,
      costPerReport: 0.006,
    },
  ],
} as const;

export type AiVendor = keyof typeof AI_MODELS;
export type AiModelId = (typeof AI_MODELS)[AiVendor][number]['id'];

export const aiVendor = z.enum(['openai']);

/**
 * Settings shape. Both fields are nullable as a pair: `{null, null}`
 * means "use server default", `{vendor, model}` means "user picked".
 * Mixed `{vendor, null}` or `{null, model}` is rejected.
 */
export const aiSettings = z
  .object({
    vendor: aiVendor.nullable(),
    model: z.string().nullable(),
  })
  .refine(
    (v) => (v.vendor === null && v.model === null) || (v.vendor !== null && v.model !== null),
    { message: 'vendor and model must be both null or both set' },
  );

export const updateAiSettingsRequest = aiSettings;

/**
 * Validate a vendor/model pair against `AI_MODELS`. Both null is valid
 * (the "Default" state). Used by the API on PATCH to 400 unknown ids.
 */
export function isValidAiSelection(s: { vendor: AiVendor | null; model: string | null }): boolean {
  if (s.vendor === null && s.model === null) return true;
  if (s.vendor === null || s.model === null) return false;
  const list = AI_MODELS[s.vendor];
  if (!list) return false;
  return list.some((m) => m.id === s.model);
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm --filter @harpa/api-contract test settings.test 2>&1 | tail -10
```

Expected: PASS — all eleven assertions green.

- [ ] **Step 5: Regenerate the OpenAPI types**

```bash
pnpm --filter @harpa/api-contract build 2>&1 | tail -5
```

Expected: build succeeds. The generated `types.ts` now reflects the new `vendor: "openai" | null` and `model: string | null` shape.

- [ ] **Step 6: Commit**

```bash
git add packages/api-contract/src/schemas/settings.ts \
        packages/api-contract/src/__tests__/settings.test.ts \
        packages/api-contract/src/generated/types.ts
git commit -m "feat(contract): AI_MODELS whitelist; nullable aiSettings

Drops kimi vendor (IDs don't exist on our account) and 4o family.
Single source of truth for picker rendering and API validation.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 2: Settings service returns nulls + validates

**Files:**
- Modify: `packages/api/src/services/settings.ts`
- Test: `packages/api/src/__tests__/settings.integration.test.ts` (modify existing)

Drop `DEFAULTS`. The service now models the "user has not chosen" state as `{vendor: null, model: null}` so callers can distinguish it from `{vendor: 'openai', model: 'gpt-4.1-mini'}`. PATCH validates against `AI_MODELS`.

- [ ] **Step 1: Update the integration test for the new shape**

Replace the entire `describe('/settings/ai', ...)` block in `packages/api/src/__tests__/settings.integration.test.ts` with:

```ts
describe('/settings/ai', () => {
  it('GET returns {vendor: null, model: null} when row absent', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request('/settings/ai', { headers: { authorization: `Bearer ${tok}` } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { vendor: string | null; model: string | null };
    expect(body).toEqual({ vendor: null, model: null });
  });

  it('PATCH sets vendor + model and persists across GETs', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const patch = await app.request('/settings/ai', {
      method: 'PATCH',
      headers: headers(tok),
      body: JSON.stringify({ vendor: 'openai', model: 'gpt-4.1-nano' }),
    });
    expect(patch.status).toBe(200);
    expect(await patch.json()).toEqual({ vendor: 'openai', model: 'gpt-4.1-nano' });

    const get = await app.request('/settings/ai', { headers: { authorization: `Bearer ${tok}` } });
    expect(await get.json()).toEqual({ vendor: 'openai', model: 'gpt-4.1-nano' });
  });

  it('PATCH {vendor: null, model: null} clears the row back to default', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    // Set a value first
    await app.request('/settings/ai', {
      method: 'PATCH',
      headers: headers(tok),
      body: JSON.stringify({ vendor: 'openai', model: 'gpt-4.1' }),
    });
    // Clear it
    const cleared = await app.request('/settings/ai', {
      method: 'PATCH',
      headers: headers(tok),
      body: JSON.stringify({ vendor: null, model: null }),
    });
    expect(cleared.status).toBe(200);
    expect(await cleared.json()).toEqual({ vendor: null, model: null });
    const get = await app.request('/settings/ai', { headers: { authorization: `Bearer ${tok}` } });
    expect(await get.json()).toEqual({ vendor: null, model: null });
  });

  it('PATCH 400 on unknown model', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request('/settings/ai', {
      method: 'PATCH',
      headers: headers(tok),
      body: JSON.stringify({ vendor: 'openai', model: 'gpt-4o' }),
    });
    expect(res.status).toBe(400);
  });

  it('PATCH 400 on dropped vendor (kimi)', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request('/settings/ai', {
      method: 'PATCH',
      headers: headers(tok),
      body: JSON.stringify({ vendor: 'kimi', model: 'kimi-k2.5' }),
    });
    expect(res.status).toBe(400);
  });

  it('PATCH 400 on mixed null/non-null', async () => {
    const app = createApp();
    const tok = await signTestToken(alice, aliceSid);
    const res = await app.request('/settings/ai', {
      method: 'PATCH',
      headers: headers(tok),
      body: JSON.stringify({ vendor: 'openai', model: null }),
    });
    expect(res.status).toBe(400);
  });

  it('GET 401 without auth', async () => {
    const app = createApp();
    const res = await app.request('/settings/ai');
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @harpa/api test:run settings.integration 2>&1 | tail -30
```

Expected: FAIL — current service returns DEFAULTS, not nulls; PATCH partial signature is wrong.

- [ ] **Step 3: Replace `packages/api/src/services/settings.ts`**

```ts
/**
 * Settings service — per-user AI provider preference.
 *
 * Two states are representable:
 *   - {vendor: null, model: null}   → user has not picked; live calls use
 *                                     LIVE_DEFAULT_MODELS (services/ai.ts).
 *   - {vendor: 'openai', model: …}  → user picked; live calls use it.
 *
 * Replay-mode hashes are unaffected — they always use FIXTURE_CANONICALS
 * regardless of this row.
 */
import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { isValidAiSelection, type AiVendor } from '@harpa/api-contract';
import { HTTPException } from 'hono/http-exception';
import * as schema from '../db/schema.js';

type Db = NodePgDatabase<typeof schema>;

export interface AiSettings {
  vendor: AiVendor | null;
  model: string | null;
}

export async function getAiSettings(db: Db, userId: string): Promise<AiSettings> {
  const r = await db.execute<{ ai_vendor: AiVendor | null; ai_model: string | null }>(sql`
    SELECT ai_vendor, ai_model FROM app.user_settings WHERE user_id = ${userId} LIMIT 1
  `);
  const row = r.rows[0];
  if (!row) return { vendor: null, model: null };
  return { vendor: row.ai_vendor, model: row.ai_model };
}

export async function updateAiSettings(
  db: Db,
  userId: string,
  patch: AiSettings,
): Promise<AiSettings> {
  if (!isValidAiSelection(patch)) {
    throw new HTTPException(400, { message: 'invalid_model' });
  }
  await db.execute(sql`
    INSERT INTO app.user_settings(user_id, ai_vendor, ai_model)
    VALUES (${userId}, ${patch.vendor}, ${patch.model})
    ON CONFLICT (user_id) DO UPDATE SET
      ai_vendor = EXCLUDED.ai_vendor,
      ai_model = EXCLUDED.ai_model,
      updated_at = now()
  `);
  return patch;
}
```

- [ ] **Step 4: Run the integration tests to verify they pass**

```bash
pnpm --filter @harpa/api test:run settings.integration 2>&1 | tail -20
```

Expected: all seven `/settings/ai` cases PASS.

- [ ] **Step 5: Run the broader API test suite to catch ripple effects**

```bash
pnpm --filter @harpa/api test:run 2>&1 | tail -30
```

Expected: green or only red spots in `reports.ts`/`voice.ts` route handlers — those are intentional and Task 3+ fixes them. Note the failing files; you'll address them in the next tasks.

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/services/settings.ts \
        packages/api/src/__tests__/settings.integration.test.ts
git commit -m "feat(api): nullable settings + AI_MODELS validation

getAiSettings returns nulls when row absent (was: hardcoded DEFAULTS).
updateAiSettings rejects unknown models with 400.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 3: AI service accepts user pick + live default

**Files:**
- Modify: `packages/api/src/services/ai.ts`

Add `LIVE_DEFAULT_MODELS` (gpt-4.1-mini for both ops). Wire `userVendor`/`userModel` through `generateReport` and `summarize`. Replay still pins `FIXTURE_CANONICALS` (so existing fixtures keep working — no re-record).

- [ ] **Step 1: Find the existing `FIXTURE_CANONICALS` block**

```bash
grep -n "FIXTURE_CANONICALS = {" packages/api/src/services/ai.ts
```

Expected: one match around line 112.

- [ ] **Step 2: Add `LIVE_DEFAULT_MODELS` constant immediately after the `FIXTURE_CANONICALS` closing brace** (around line 158)

```ts
/**
 * Live-mode model defaults — used when the user has not picked one in
 * `app.user_settings`. Distinct from FIXTURE_CANONICALS because:
 *   - FIXTURE_CANONICALS pins replay-hash fields and MUST match the
 *     vendor/model embedded in checked-in fixture JSON files.
 *   - LIVE_DEFAULT_MODELS is what we'd actually like to send to the
 *     real provider when nothing else is specified. Bumping it does
 *     not require re-recording fixtures.
 *
 * Both default to the same model today (gpt-4.1-mini) but the
 * indirection lets us roll one forward without a fixture refresh.
 */
export const LIVE_DEFAULT_MODELS = {
  report: { vendor: 'openai' as Vendor, model: 'gpt-4.1-mini' },
  summarize: { vendor: 'openai' as Vendor, model: 'gpt-4.1-mini' },
} as const;
```

- [ ] **Step 3: Update `SummarizeInput` interface — add `userVendor` and `userModel`**

Locate the existing `SummarizeInput` interface (around line 350-365). Add these fields below the existing `vendor?: Vendor;`:

```ts
  /**
   * User-selected provider override (live mode only). When set, takes
   * precedence over LIVE_DEFAULT_MODELS.summarize. Ignored in replay
   * because fixture hashes are pinned to FIXTURE_CANONICALS.summarize.
   */
  userVendor?: Vendor | null;
  userModel?: string | null;
```

- [ ] **Step 4: Rewrite `summarize()` body to use the new precedence**

Replace the existing function body (around line 371-402) with:

```ts
export async function summarize(input: SummarizeInput): Promise<SummarizeOutput> {
  const mode = pickMode(input.fixtureName);
  const scenario =
    (input.fixtureName ? scenarioFromName(input.fixtureName) : null) ??
    FIXTURE_CANONICALS.summarize.defaultScenario;
  const fixtureName =
    input.fixtureName ?? FIXTURE_CANONICALS.summarize.name(scenario);

  // Replay must use canonicals so the recorded hash matches.
  // Live: user pick > caller default > live default.
  const vendor: Vendor =
    mode === 'replay'
      ? FIXTURE_CANONICALS.summarize.vendor
      : input.userVendor ?? input.vendor ?? LIVE_DEFAULT_MODELS.summarize.vendor;
  const liveModel =
    input.userModel ?? input.model ?? LIVE_DEFAULT_MODELS.summarize.model;
  const canonicalModel = FIXTURE_CANONICALS.summarize.model;
  const req =
    mode === 'replay'
      ? {
          model: canonicalModel,
          systemPrompt: FIXTURE_CANONICALS.summarize.systemPrompt,
          userPrompt: FIXTURE_CANONICALS.summarize.userPrompt(scenario),
        }
      : {
          model: liveModel,
          systemPrompt: input.systemPrompt,
          userPrompt: input.userPrompt,
          temperature: input.temperature,
          maxTokens: input.maxTokens,
        };
  const provider = buildProviderWithMode(vendor, fixtureName, mode);
  const out = await withUsageAccounting(
    input.usageContext,
    { vendor, model: req.model, operation: 'chat', fixtureMode: mode },
    'summarize',
    () => provider.chat(req),
  );
  return { text: out.text, vendor, model: req.model };
}
```

- [ ] **Step 5: Update `GenerateReportInput` interface — add `userVendor` and `userModel`**

Find the `GenerateReportInput` interface (around line 410-438). Add these fields below the existing `vendor?: Vendor;`:

```ts
  /**
   * User-selected provider override (live mode only). When set, takes
   * precedence over LIVE_DEFAULT_MODELS.report. Ignored in replay
   * because fixture hashes are pinned to FIXTURE_CANONICALS.report.
   */
  userVendor?: Vendor | null;
  userModel?: string | null;
```

- [ ] **Step 6: Rewrite the model/vendor resolution inside `generateReport()`**

In `generateReport()` (around line 465-490), replace the `providerVendor` / `canonicalModel` block with:

```ts
  const canonicals = FIXTURE_CANONICALS.report;
  const isUpdate = input.existingBody != null;
  const mode = pickMode(input.fixtureName);
  const scenario =
    (input.fixtureName ? scenarioFromName(input.fixtureName) : null) ??
    canonicals.defaultScenario;
  const fixtureName = input.fixtureName ?? canonicals.name(scenario);

  // Replay pins canonicals (vendor + model) so the recorded hash
  // matches. Live picks: user override > LIVE_DEFAULT_MODELS.
  // The legacy `input.vendor` field remains accepted but is ignored
  // for routing — it never affected anything in replay and is shadowed
  // by the user pick path in live mode.
  const providerVendor: Vendor =
    mode === 'replay'
      ? canonicals.vendor
      : input.userVendor ?? LIVE_DEFAULT_MODELS.report.vendor;
  const liveModel = input.userModel ?? LIVE_DEFAULT_MODELS.report.model;
```

- [ ] **Step 7: Update the `req` object inside `generateReport()` to use `liveModel`**

Find the `const req = mode === 'replay' ? { ... } : { ... }` block (around line 508-525). In the live branch only, change `model: canonicalModel` to `model: liveModel`. Keep the replay branch using `canonicals.model`.

The block should read:

```ts
  const req =
    mode === 'replay'
      ? {
          model: canonicals.model,
          systemPrompt: canonicals.systemPrompt,
          userPrompt: canonicals.userPrompt(scenario),
          responseFormat: 'json_object' as const,
        }
      : {
          model: liveModel,
          systemPrompt: liveSystemPrompt,
          userPrompt: liveUserPrompt,
          responseFormat: 'json_object' as const,
        };
```

(`canonicalModel` is no longer referenced anywhere — remove its declaration. The diff for the surrounding rewrite is already in Step 6.)

- [ ] **Step 8: Run the full API unit suite**

```bash
pnpm --filter @harpa/api test:run 2>&1 | tail -30
```

Expected: green except for `reports.ts`/`voice.ts` route tests if any reference the old function signatures (Task 4 fixes them).

- [ ] **Step 9: Commit**

```bash
git add packages/api/src/services/ai.ts
git commit -m "feat(api): wire userVendor/userModel through ai service

LIVE_DEFAULT_MODELS = gpt-4.1-mini for report+summarize. Live mode
picks user override first, default second; replay still pins
FIXTURE_CANONICALS so existing fixtures keep working without
re-record.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 4: Routes pass user model into AI service

**Files:**
- Modify: `packages/api/src/routes/reports.ts`
- Modify: `packages/api/src/routes/voice.ts`

Both routes already fetch `getAiSettings`. They currently pass only `settings.vendor`; we extend to pass `userVendor` + `userModel`. For `/voice/summarize` they aren't fetching at all — add it.

- [ ] **Step 1: Find the report generate call sites**

```bash
grep -n "runGenerate\|getAiSettings\|generateReport" packages/api/src/routes/reports.ts | head -10
```

Expected: `runGenerate` defined around line 318; called twice (generate + regenerate) around lines 405-433. Both already fetch settings.

- [ ] **Step 2: Update the `runGenerate` signature to accept `userModel`**

Find `async function runGenerate(...)` (around line 318). Change the signature:

```ts
async function runGenerate(
  db: NonNullable<AppEnv['Variables']['db']>,
  userId: string,
  report: ReportRow,
  fixtureName: string | undefined,
  userVendor: Parameters<typeof aiGenerateReport>[0]['userVendor'],
  userModel: Parameters<typeof aiGenerateReport>[0]['userModel'],
  options: { mode: 'generate' | 'regenerate' },
) {
```

(The previous parameter was named `vendor`; replace it with the `userVendor`/`userModel` pair.)

- [ ] **Step 3: Update the `aiGenerateReport(...)` call inside `runGenerate`**

Find the `await aiGenerateReport({ ... })` call inside `runGenerate` (around line 346-352). Replace the `vendor,` line with:

```ts
  const out = await aiGenerateReport({
    notes,
    existingBody,
    fixtureName,
    userVendor,
    userModel,
    usageContext: { db, userId, projectId: report.projectId, reportId: report.id },
  });
```

- [ ] **Step 4: Update both call sites of `runGenerate`**

Find the two `runGenerate` calls (around lines 406 and 433). Change each:

```ts
    const settings = await db((d) => getAiSettings(d, userId));
    const result = await runGenerate(
      db,
      userId,
      report,
      body.fixtureName,
      settings.vendor,
      settings.model,
      { mode: 'generate' },
    );
```

(And the same with `mode: 'regenerate'` for the second call site.)

- [ ] **Step 5: Update the voice summarize route**

In `packages/api/src/routes/voice.ts`, find the POST `/voice/summarize` handler (around line 234). Inside the handler body, before the `await aiSummarize({ ... })` call (around line 254), add:

```ts
    const settings = await db((d) => getAiSettings(d, userId));
```

And add `getAiSettings` to the imports at the top of the file:

```ts
import { getAiSettings } from '../services/settings.js';
```

Then update the `aiSummarize` call inside the POST handler to pass user pick:

```ts
    const out = await aiSummarize({
      // ...existing fields...
      userVendor: settings.vendor,
      userModel: settings.model,
    });
```

(Keep all existing fields — `systemPrompt`, `userPrompt`, etc. — exactly as they were. Only `userVendor` + `userModel` are added.)

- [ ] **Step 6: Apply the same change to the inline summarize step inside `/voice/transcribe-and-summarize`**

In the same file, find the other `aiSummarize` call inside the combined transcribe-and-summarize route (around line 150). Apply the same pattern: fetch `settings` once near the top of the handler if not already fetched, then add `userVendor: settings.vendor` and `userModel: settings.model` to the `aiSummarize({...})` call.

- [ ] **Step 7: Run the route integration tests**

```bash
pnpm --filter @harpa/api test:run reports.integration voice.integration 2>&1 | tail -30
```

Expected: green. Existing tests use either replay mode (which ignores user pick) or stubbed providers — neither path is broken.

- [ ] **Step 8: Run the full API suite once more**

```bash
pnpm --filter @harpa/api test:run 2>&1 | tail -10
```

Expected: all green.

- [ ] **Step 9: Commit**

```bash
git add packages/api/src/routes/reports.ts packages/api/src/routes/voice.ts
git commit -m "feat(api): forward user model pick to /generate and /voice/summarize

Both routes now read app.user_settings.{ai_vendor,ai_model} and pass
them through as userVendor/userModel. Replay path is unaffected.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 5: Live default-wiring test (AGENTS.md hard rule #5)

**Files:**
- Modify: `packages/api/src/__tests__/live/reportGeneration.live.test.ts`

Per AGENTS.md: every collaborator factory needs a live integration test that exercises the route without stubbing it, asserting the real side-effect. The user-model path qualifies — we add a scenario that PATCHes `/settings/ai`, calls `generateReport()`, and asserts the response model matches.

- [ ] **Step 1: Add a default-wiring scenario at the bottom of the file**

After the existing `describeOrSkip(...)` block, append:

```ts
describeOrSkip('generateReport — user-picked model is honoured (live)', () => {
  it('respects userModel when provided', async () => {
    const out = await generateReport({
      notes:
        'Site visit 12 April. Quick walk-through. No workers on site (weekend). ' +
        'All materials secure. No issues to report.',
      existingBody: null,
      // No fixtureName → live mode.
      userVendor: 'openai',
      userModel: 'gpt-4.1-nano',
    });
    expect(out.fixtureMode).toBe('live');
    expect(out.vendor).toBe('openai');
    expect(out.model).toBe('gpt-4.1-nano');
    // Sanity: the body still validated against reportSchemas.reportBody —
    // generateReport throws AiProviderError if it doesn't.
    expect(out.body).toBeTruthy();
  }, 30_000);

  it('falls back to LIVE_DEFAULT_MODELS when user fields are null', async () => {
    const out = await generateReport({
      notes: 'Brief site walkthrough; nothing to report.',
      existingBody: null,
      userVendor: null,
      userModel: null,
    });
    expect(out.fixtureMode).toBe('live');
    expect(out.model).toBe('gpt-4.1-mini');
  }, 30_000);
});
```

- [ ] **Step 2: Run the live test**

```bash
AI_LIVE=1 OPENAI_API_KEY=$(doppler secrets get OPENAI_API_KEY --plain --config dev 2>/dev/null) \
  pnpm --filter @harpa/api test:live reportGeneration.live 2>&1 | tail -20
```

Expected: PASS for both new cases. Each costs ~$0.001. If `OPENAI_API_KEY` is unavailable, the test is automatically skipped (existing `HAS_OPENAI_KEY` guard) — that's fine for CI; this test is the safety net the doc asks for.

- [ ] **Step 3: Commit**

```bash
git add packages/api/src/__tests__/live/reportGeneration.live.test.ts
git commit -m "test(api): live default-wiring for user-picked model

Per AGENTS.md hard rule #5 and pitfall #13. Asserts that:
- userModel='gpt-4.1-nano' makes the LLM call use gpt-4.1-nano
- userModel=null falls back to LIVE_DEFAULT_MODELS.report (gpt-4.1-mini)

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 6: Mobile picker — server-backed via TanStack Query

**Files:**
- Replace: `apps/mobile/lib/ai/useAiProvider.ts`
- Modify: `apps/mobile/app/(app)/developer.tsx`
- Replace: `apps/mobile/lib/ai/useAiProvider.test.tsx`

Hook now fetches `/settings/ai` and exposes a single `selection` (or `null` for "default"). Mutation patches the same endpoint. AsyncStorage code is deleted; the contract `AI_MODELS` is the catalogue.

- [ ] **Step 1: Find the existing API client/hooks pattern**

```bash
grep -rn "useQuery\|QueryClient" apps/mobile/lib --include="*.ts" --include="*.tsx" | head -10
```

Confirm there's already a TanStack Query client + an `apiFetch`-style helper. (If not, the call sites for `/projects` and `/notes` will show the existing pattern to follow.)

- [ ] **Step 2: Write the failing hook test**

Replace `apps/mobile/lib/ai/useAiProvider.test.tsx` with:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useAiProvider } from './useAiProvider';

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  globalThis.fetch = mockFetch as unknown as typeof fetch;
});

function withQueryClient(client: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

describe('useAiProvider', () => {
  it('initial state is loading; resolves to selection from /settings/ai', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ vendor: 'openai', model: 'gpt-4.1-nano' }));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useAiProvider(), { wrapper: withQueryClient(qc) });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.selection).toEqual({ vendor: 'openai', model: 'gpt-4.1-nano' });
  });

  it('selection is null when server returns nulls (the "Default" state)', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ vendor: null, model: null }));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useAiProvider(), { wrapper: withQueryClient(qc) });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.selection).toBeNull();
  });

  it('setSelection PATCHes /settings/ai and updates cache', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ vendor: null, model: null }))
      .mockResolvedValueOnce(jsonResponse({ vendor: 'openai', model: 'gpt-4.1' }));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useAiProvider(), { wrapper: withQueryClient(qc) });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.setSelection({ vendor: 'openai', model: 'gpt-4.1' });
    });

    const patchCall = mockFetch.mock.calls.find((c) => c[1]?.method === 'PATCH');
    expect(patchCall).toBeTruthy();
    expect(JSON.parse(patchCall![1].body as string)).toEqual({
      vendor: 'openai',
      model: 'gpt-4.1',
    });
    expect(result.current.selection).toEqual({ vendor: 'openai', model: 'gpt-4.1' });
  });

  it('setSelection(null) clears the row to {vendor: null, model: null}', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ vendor: 'openai', model: 'gpt-4.1' }))
      .mockResolvedValueOnce(jsonResponse({ vendor: null, model: null }));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useAiProvider(), { wrapper: withQueryClient(qc) });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.setSelection(null);
    });

    const patchCall = mockFetch.mock.calls.find((c) => c[1]?.method === 'PATCH');
    expect(JSON.parse(patchCall![1].body as string)).toEqual({ vendor: null, model: null });
    expect(result.current.selection).toBeNull();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
pnpm --filter @harpa/mobile test useAiProvider 2>&1 | tail -20
```

Expected: FAIL — current hook reads AsyncStorage and exposes a different API.

- [ ] **Step 4: Replace `apps/mobile/lib/ai/useAiProvider.ts`**

```ts
/**
 * Server-backed AI model selection.
 *
 * The picker reads from AND writes to `/settings/ai`. The server is
 * the single source of truth — we removed AsyncStorage and the
 * dead-wired `useAvailableProviders` static probe. Catalogue lives in
 * `@harpa/api-contract`'s `AI_MODELS` constant; this file only owns
 * the I/O.
 *
 * `selection === null` means the user has not picked — server falls
 * back to LIVE_DEFAULT_MODELS (currently gpt-4.1-mini for both
 * `generate` and `summarize`).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AI_MODELS, type AiVendor } from '@harpa/api-contract';

import { apiFetch } from '@/lib/api/client';

export { AI_MODELS };
export type { AiVendor };

export interface AiSelection {
  vendor: AiVendor;
  model: string;
}

const QUERY_KEY = ['settings', 'ai'] as const;

export interface UseAiProviderApi {
  /** `null` = server default; otherwise the user's picked pair. */
  selection: AiSelection | null;
  /** Pass `null` to clear back to default. */
  setSelection: (next: AiSelection | null) => Promise<void>;
  isLoading: boolean;
  isUpdating: boolean;
}

interface AiSettingsResponse {
  vendor: AiVendor | null;
  model: string | null;
}

export function useAiProvider(): UseAiProviderApi {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async (): Promise<AiSettingsResponse> => {
      const res = await apiFetch('/settings/ai', { method: 'GET' });
      if (!res.ok) throw new Error(`GET /settings/ai → ${res.status}`);
      return (await res.json()) as AiSettingsResponse;
    },
    staleTime: 30_000,
  });

  const mutation = useMutation({
    mutationFn: async (next: AiSelection | null): Promise<AiSettingsResponse> => {
      const body = next ?? { vendor: null, model: null };
      const res = await apiFetch('/settings/ai', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`PATCH /settings/ai → ${res.status}`);
      return (await res.json()) as AiSettingsResponse;
    },
    onSuccess: (data) => {
      qc.setQueryData(QUERY_KEY, data);
    },
  });

  const raw = query.data;
  const selection: AiSelection | null =
    raw && raw.vendor !== null && raw.model !== null
      ? { vendor: raw.vendor, model: raw.model }
      : null;

  return {
    selection,
    setSelection: async (next) => {
      await mutation.mutateAsync(next);
    },
    isLoading: query.isLoading,
    isUpdating: mutation.isPending,
  };
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
pnpm --filter @harpa/mobile test useAiProvider 2>&1 | tail -20
```

Expected: all four cases PASS.

(If the mobile workspace doesn't have a stand-alone `apiFetch` at the path above, find the actual helper and update the import. Search: `grep -rn "apiFetch\|API_BASE_URL" apps/mobile/lib | head`.)

- [ ] **Step 6: Update the developer screen to consume the new API**

Replace `apps/mobile/app/(app)/developer.tsx` body. The screen previously consumed `provider`/`model` strings; now it consumes a `selection` object. The picker shows AI_MODELS.openai entries plus a "Default" row.

```tsx
/**
 * Developer route — wires AI provider hooks into the props-only
 * `Developer` body. Lives on its own page so the Profile (settings)
 * screen stays focused on account / usage / sign-out.
 */
import { useRouter } from 'expo-router';

import { Developer } from '@/screens/developer';
import { AI_MODELS, useAiProvider, type AiSelection } from '@/lib/ai/useAiProvider';
import { useDeveloperFlags } from '@/lib/config/dev-flags';
import { safeBack } from '@/lib/nav/safe-back';

export default function DeveloperRoute() {
  const router = useRouter();
  const ai = useAiProvider();
  const devFlags = useDeveloperFlags();

  const onSelect = (s: AiSelection | null) => {
    void ai.setSelection(s);
  };

  return (
    <Developer
      onBack={() => safeBack(router, '/(app)/profile')}
      aiModels={AI_MODELS.openai}
      aiSelection={ai.selection}
      onSelectModel={onSelect}
      isLoadingSelection={ai.isLoading || ai.isUpdating}
      showGenerateDebugTab={devFlags.showGenerateDebugTab}
      onToggleGenerateDebugTab={devFlags.setShowGenerateDebugTab}
      showGenerateEditTab={devFlags.showGenerateEditTab}
      onToggleGenerateEditTab={devFlags.setShowGenerateEditTab}
    />
  );
}
```

- [ ] **Step 7: Update the `Developer` screen prop signature**

```bash
grep -n "aiProvider\|aiProviders\|aiModel\|aiModels\|onSelectProvider\|onSelectModel" apps/mobile/screens/developer.tsx
```

Locate the `DeveloperProps` interface (and any `AI_PROVIDERS`/`provider` UI block). Apply this surgical change:

1. Remove props: `aiProviders`, `aiProvider`, `onSelectProvider`, `availableProviderKeys`, and the existing `aiModel: string` / `onSelectModel: (model: string) => void` pair.
2. Add props (matching the new prop block above):

```tsx
  aiModels: ReadonlyArray<{
    id: string;
    label: string;
    tagline?: string;
    latencyMs?: number;
    costPerReport?: number;
    isDefault?: boolean;
  }>;
  aiSelection: { vendor: 'openai'; model: string } | null;
  onSelectModel: (next: { vendor: 'openai'; model: string } | null) => void;
  isLoadingSelection: boolean;
```

3. In the JSX body, render one row per `aiModels` entry plus a leading "Default (recommended)" row. Selected state matches when `aiSelection?.model === entry.id` (or `aiSelection === null` for the Default row). Tapping a row calls `onSelectModel({ vendor: 'openai', model: entry.id })` or `onSelectModel(null)` for Default. Display `tagline`, `latencyMs/1000` (1 dp), and `costPerReport` underneath the label per spec.

(Keep the full file — only the AI section changes. Provider-switcher UI is removed entirely; we have one vendor.)

- [ ] **Step 8: Run mobile typecheck + tests**

```bash
pnpm --filter @harpa/mobile typecheck 2>&1 | tail -10
pnpm --filter @harpa/mobile test 2>&1 | tail -15
```

Expected: clean. Any "module not found" hints to the wrong `apiFetch` import path; fix and re-run.

- [ ] **Step 9: Commit**

```bash
git add apps/mobile/lib/ai/useAiProvider.ts \
        apps/mobile/lib/ai/useAiProvider.test.tsx \
        apps/mobile/app/\(app\)/developer.tsx \
        apps/mobile/screens/developer.tsx
git commit -m "feat(mobile): server-backed model picker via /settings/ai

Replaces AsyncStorage round-trip with TanStack Query against the
existing route. AI_MODELS catalogue imported from contract — no
duplication. Default = null/null = server uses LIVE_DEFAULT_MODELS.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 7: Document + open PR

**Files:**
- Modify: `docs/bugs/README.md`
- Create: `docs/bugs/2026-05-29-mobile-model-picker-dead-wired.md`

Per AGENTS.md hard rule #3 (docs in same PR) and pitfall #13. Document the dead-wired-picker bug we just fixed so future agents recognise the pattern.

- [ ] **Step 1: Create the bug entry**

Create `docs/bugs/2026-05-29-mobile-model-picker-dead-wired.md`:

```markdown
# Mobile model picker was dead-wired (cosmetic since v3→v4 port)

**Status:** Fixed in `feat: server-backed model picker` PR.
**Surface:** Mobile Developer screen → AI provider section.

## Symptom

User taps a model in the Developer screen picker, sees the radio
selection update, closes and re-opens the screen, the choice is
preserved. Triggers a report generation. The report still uses the
server-side canonical model regardless of what was picked.

## Root cause

Two independent bugs stacking:

1. `apps/mobile/lib/ai/useAiProvider.ts` wrote the choice to
   `AsyncStorage` only. Nothing read it back into any API mutation —
   no `/generate` or `/voice/summarize` call referenced it. The hook
   was ported from v3 (where the Supabase edge function read
   `provider`/`model` from the request body) but the v4 API
   replacement never received the wiring.
2. The contract's Kimi model IDs (`kimi-k2-0905-preview`,
   `kimi-k2-0711-preview`, `kimi-k2-thinking`) don't exist on our
   Moonshot China account. The actual `/v1/models` listing on
   `api.moonshot.cn` is `kimi-k2.5`, `kimi-k2.6`, `moonshot-v1-*`.
   Even if the picker had been wired, every Kimi selection would
   have 502'd with "model not found".

## Fix

- New `AI_MODELS` whitelist in `@harpa/api-contract` is the single
  source of truth; mobile picker renders from it; API validates
  against it.
- `app.user_settings.{ai_vendor, ai_model}` (already existed) becomes
  the actual storage; AsyncStorage code deleted.
- Routes pass `userVendor`/`userModel` into `services/ai.ts`, which
  honours them in live mode (replay still pins canonicals so fixtures
  don't need re-recording).
- Dropped Kimi entirely. New default = `gpt-4.1-mini`.

## Repro guard

`packages/api/src/__tests__/live/reportGeneration.live.test.ts`
includes a default-wiring test that PATCHes a user pick and asserts
the LLM response carries the picked model. Per pitfall #13.

## Lesson

When porting a hook from a previous codebase, check that **something
on the other side actually reads the value**. A picker without a
mutation that sends the value to the server is just decorative.
```

- [ ] **Step 2: Add an entry to `docs/bugs/README.md`**

Add a row to the recurring-bugs index. Find the existing format (probably a table or list) and add:

```markdown
- [Mobile model picker was dead-wired](./2026-05-29-mobile-model-picker-dead-wired.md) — picker writes to AsyncStorage, nothing reads it. Pattern: ported hook with no API consumer. **Lesson:** always grep for who reads the persisted value.
```

(If the file uses a different structure, match the existing style.)

- [ ] **Step 3: Commit docs**

```bash
git add docs/bugs/README.md docs/bugs/2026-05-29-mobile-model-picker-dead-wired.md
git commit -m "docs: bug entry for dead-wired mobile model picker

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

- [ ] **Step 4: Push and open the PR**

```bash
git push -u origin agents/user-model-selection-spec
gh pr create \
  --base dev \
  --title "feat: server-backed mobile model picker (drop kimi, default gpt-4.1-mini)" \
  --body "$(cat <<'EOF'
## Summary

Wires the mobile model picker (currently dead-wired to AsyncStorage)
to the existing `/settings/ai` route so it actually drives report
generation and voice summarisation.

## Changes

- New `AI_MODELS` whitelist in `@harpa/api-contract` (single source of
  truth for vendor + model IDs + picker metadata).
- Drop `kimi` vendor — IDs we listed don't exist on our Moonshot China
  account (verified via `api.moonshot.cn/v1/models` from Fly Frankfurt).
- Drop `gpt-4o`/`gpt-4o-mini` — superseded by GPT-4.1 family.
- New `LIVE_DEFAULT_MODELS = gpt-4.1-mini` (live mode default when user
  hasn't picked). `FIXTURE_CANONICALS` unchanged so existing fixtures
  keep working without re-record.
- Mobile picker now uses TanStack Query against `/settings/ai`;
  AsyncStorage code deleted.
- Default-wiring live test added per AGENTS.md pitfall #13.

## Spec + plan

- Design: docs/superpowers/specs/2026-05-29-user-model-selection-design.md
- Plan: docs/superpowers/plans/2026-05-29-user-model-selection.md

## Testing

- Contract: 11 new assertions for `AI_MODELS`, nullable `aiSettings`, validator
- API integration: 7 cases for `/settings/ai` (incl. 400s for old kimi + dropped 4o)
- API live: user-picked model is honoured + default falls back to gpt-4.1-mini
- Mobile: 4 cases for the new TanStack Query wiring

EOF
)"
```

---

## Self-Review Checklist

- [ ] **Spec coverage** — every spec section has at least one task:
  - Approach (server-backed, live-only override) → Tasks 2, 3, 4
  - `AI_MODELS` whitelist shared between contract and mobile → Task 1, 6
  - Replay-mode determinism preserved → Task 3 (canonicals untouched)
  - Default = `gpt-4.1-mini` → Task 3 (`LIVE_DEFAULT_MODELS`)
  - Drop kimi + 4o → Task 1 (whitelist) + Task 2 (validator rejects them)
  - Default-wiring test → Task 5
  - Mobile picker rewrite → Task 6
  - Bug doc → Task 7

- [ ] **Placeholder scan** — no "TBD"/"TODO"/"similar to". Every code step shows the code.

- [ ] **Type consistency** — `userVendor`/`userModel` used identically across services/ai.ts (Task 3), routes (Task 4), and tests (Task 5). `selection` (mobile) is `{vendor, model} | null` consistently in Task 6.

- [ ] **Spec divergence noted** — spec said "re-record fixtures"; the plan diverges by introducing `LIVE_DEFAULT_MODELS` distinct from `FIXTURE_CANONICALS` so we don't need to re-record. The replay path still uses gpt-4o; live default is gpt-4.1-mini. This is strictly less work and equally correct. Documented in Task 3 step 2 docstring.

- [ ] **Out-of-scope respected** — no Groq/Anthropic added; `/voice/transcribe` whisper pinning untouched; no usage-token wiring.
