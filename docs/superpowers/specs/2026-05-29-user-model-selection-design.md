# User Model Selection — Design

## Problem

The mobile app has a model picker in `apps/mobile/app/(app)/developer.tsx`
that lets the user choose an AI provider (Kimi / OpenAI) and one of
their models. The picker writes to `AsyncStorage` and **nothing reads
it**. The selected model is never sent to the API, so it has no effect
on report generation or voice summarisation.

Compounding the bug: the Kimi model IDs the picker offers
(`kimi-k2-0905-preview`, `kimi-k2-0711-preview`, `kimi-k2-thinking`)
don't exist on our Moonshot China account — the server we authenticate
against (`api.moonshot.cn`) returns "model not found" for all of them.
So even if the picker had been wired up, every Kimi selection would
have 404'd.

Worse: even if it did send the model, the API would ignore it.
`generateReport()` and `summarize` pin `vendor` and `model` to
server-side `FIXTURE_CANONICALS` constants. The picker is purely
cosmetic in v4 (and was a leftover port from v3, where the Supabase
edge function did accept `provider`/`model` in the request body).

We need to:

1. Persist the user's choice on the server (we already have
   `app.user_settings(ai_vendor, ai_model)` — currently unused by
   anything that matters).
2. Pass that choice through the `/generate` and `/voice/summarize`
   routes into `ai.ts` so the live LLM call actually uses it.
3. Keep fixture replay deterministic (replay always uses canonical,
   regardless of user choice).
4. Drop Kimi from the picker entirely. The IDs we currently advertise
   don't exist on our account, and the ones that do (`moonshot-v1-*`,
   `kimi-k2.5`, `kimi-k2.6`) are slower than every OpenAI option from
   Fly Frankfurt and add a CN-hosting trust concern. We standardise on
   the GPT-4.1 family.
5. Move the canonical from `gpt-4o` to `gpt-4.1-mini`. GPT-4.1
   (released 2025-04) supersedes 4o for our use case: faster (4.7s vs
   3.4s p50 from Fra), 1M-token context, better instruction following,
   and 4o is being phased out by OpenAI. `gpt-4.1-mini` is the right
   default — cheap enough to never worry about cost ($0.001/report),
   plenty smart for project status reports.

Transcription (whisper-large-v3-turbo) stays pinned to Groq — out of
scope.

## Approach

**Server-backed settings, live-mode-only override, single picker
applies to both `/generate` and `/voice/summarize`.**

The canonicals move to `gpt-4.1-mini` for both report and summarize.
If the user has not made a choice, the canonical is used. This is a
behaviour change from current production (which uses `gpt-4o` for
report, `gpt-4o-mini` for summarize) and requires re-recording fixtures
for both ops as part of this work.

If the user picks a model, the API uses it for **both** `generateReport`
and `summarize` in live mode. The picker shows one provider+model
pair, used for both ops, matching the existing settings shape.

Replay mode (`AI_FIXTURE_MODE=replay`) always uses the per-op
canonical regardless of user choice. This preserves fixture-hash
determinism: replay was already designed around a single canonical
pair per op, and changing that would invalidate every existing
fixture file. Most CI traffic is replay, so this is the right
trade-off.

## Architecture

### Source of truth: `app.user_settings`

The table already exists and `services/settings.ts` already has
`getAiSettings` / `updateAiSettings`. We keep its shape but treat
`{vendor, model}` as **optional** at the API boundary so the
"default" state is representable.

Two states:
- Row exists with non-null `ai_vendor`/`ai_model` → user has picked a
  model. Use it in live mode.
- Row missing OR both columns null → use per-op canonical.

We do NOT migrate the `app.user_settings` schema — `ai_vendor` and
`ai_model` are already nullable. The contract surface changes to
expose nulls (currently it returns a `DEFAULTS` fallback, which hides
the "user has not chosen" state from the client).

### Whitelist: shared between contract and mobile

A new `AI_MODELS` constant in `packages/api-contract/src/schemas/settings.ts`:

```ts
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

export type AiVendor = keyof typeof AI_MODELS;       // 'openai'
export type AiModelId = typeof AI_MODELS[AiVendor][number]['id'];
```

The metadata fields (`tagline`, `latencyMs`, `costPerReport`) are
displayed in the picker per the user-confirmed "tagline + cost +
latency" UI. `latencyMs` is the p50 from a Fly-Frankfurt bench
(see `docs/v4/bench-2026-05-29.md` if/when added; numbers in this
spec serve as the source for now).

Single-vendor whitelist for now. The `AiVendor` type is preserved as
a union so we can add a second vendor later without an API contract
break.

- Kimi removed entirely (server returns 404 for the IDs we list, and
  the working CN models are slower than every OpenAI option).
- `gpt-4o` and `gpt-4o-mini` removed; superseded by 4.1 family.
- Mobile imports `AI_MODELS` from `@harpa/api-contract` and renders
  the picker from it. The duplicate `PROVIDER_MODELS` in
  `useAiProvider.ts` is deleted.
- `updateAiSettings` validates `{vendor, model}` against `AI_MODELS`
  and 400s on mismatch.

### Request flow

```
mobile picker change
  → useUpdateAiSettingsMutation
  → PATCH /me/settings { vendor, model }
  → settings.ts: validate against AI_MODELS, upsert app.user_settings
  → invalidate ['me', 'settings']

mobile triggers report generation
  → POST /projects/:p/reports/:r/generate
  → reports.ts route: fetch user_settings, pass to generateReport()
  → ai.ts: if (live && userVendor && userModel) use those;
          else use FIXTURE_CANONICALS.report
  → provider.generate(...)
```

Same flow for `/voice/summarize`.

### Why not pass model in the request body?

We have a server-side store already; using it removes the need for
mobile to remember to send the field on every call. It also makes
the choice survive reinstall and follow the user across devices,
which is the obvious product expectation.

### Components touched

| File | Change |
| --- | --- |
| `packages/api-contract/src/schemas/settings.ts` | Add `AI_MODELS` constant; make `aiSettings.{vendor,model}` nullable; add validation helper |
| `packages/api/src/services/settings.ts` | Drop hardcoded `DEFAULTS`; return nulls when row absent; validate against `AI_MODELS` on update |
| `packages/api/src/services/ai.ts` | `generateReport` + `summarize` accept optional `userVendor`/`userModel`; use them when in live mode and both present |
| `packages/api/src/routes/reports.ts` | Generate route: fetch user settings, pass into `generateReport` |
| `packages/api/src/routes/voice.ts` | Summarize route: fetch user settings, pass into `summarize` |
| `apps/mobile/lib/ai/useAiProvider.ts` | Replace AsyncStorage with TanStack Query against `/me/settings`; remove duplicate `PROVIDER_MODELS` (import from contract); add explicit "Default" entry that clears the setting |
| `apps/mobile/app/(app)/developer.tsx` | No structural change — already calls `setProvider`/`setModel` |

## Data flow

### Picker → server

```
User taps "GPT-4.1 nano"
  → ai.setModel('gpt-4.1-nano')
  → useUpdateAiSettingsMutation.mutate({ vendor: 'openai', model: 'gpt-4.1-nano' })
  → PATCH /me/settings → 200 { vendor, model }
  → react-query cache updated, picker reflects server state
```

### Picker → "Default"

```
User taps "Default (recommended)"
  → ai.setProvider(null)
  → PATCH /me/settings { vendor: null, model: null }
  → row updated to nulls
  → subsequent /generate calls use FIXTURE_CANONICALS.report (gpt-4.1-mini)
```

### Generate uses user pick

```
POST /generate
  fetch user_settings → { vendor: 'openai', model: 'gpt-4.1-nano' }
  generateReport({ ..., userVendor: 'openai', userModel: 'gpt-4.1-nano' })
  ai.ts live branch:
    providerVendor = 'openai'
    providerModel  = 'gpt-4.1-nano'  (overrides canonical 'gpt-4.1-mini')
  OpenAI call goes to gpt-4.1-nano
```

### Replay ignores user pick

```
AI_FIXTURE_MODE=replay
POST /generate
  fetch user_settings → { vendor: 'openai', model: 'gpt-4.1-nano' }
  generateReport({ ..., userVendor: 'openai', userModel: 'gpt-4.1-nano' })
  ai.ts replay branch:
    providerVendor = canonicals.vendor  ('openai')
    providerModel  = canonicals.model   ('gpt-4.1-mini')
  Hash matches existing fixture, replays canned response.
```

## Error handling

- **Unknown model in `PATCH /me/settings`** — 400 with
  `{ error: 'invalid_model', allowed: AI_MODELS }`.
- **Vendor/model mismatch** (e.g. `vendor:'openai', model:'kimi-k2-0905'`)
  — same 400.
- **Live LLM call fails for the user's chosen model** — current 502
  behaviour (`AI_UNAVAILABLE` envelope from the error mapper). We do
  NOT auto-fallback to canonical; failure is visible.
- **User picks a model that becomes invalid later** (we remove it from
  `AI_MODELS`) — server stores nulls only on explicit update, so a
  stale value can persist. On read, if the persisted `{vendor, model}`
  is no longer in `AI_MODELS`, treat as "default" (fall back to
  canonical) and log a warning. Don't auto-rewrite the row.

## Testing

### Contract (`packages/api-contract`)
- `AI_MODELS` shape — every model has `id` and `label`; no duplicates
- `aiSettings` accepts `{vendor:null, model:null}`, `{vendor:'openai', model:'gpt-4.1-mini'}`, etc.
- `aiSettings` rejects `{vendor:'openai', model:'gpt-4o'}` (no longer in whitelist)
- `aiSettings` rejects `{vendor:'kimi', model:anything}` (vendor removed)

### API integration (`packages/api/src/__tests__/`)
- `settings.integration.test.ts` — extend:
  - `PATCH /me/settings { vendor: 'openai', model: 'gpt-4.1-nano' }` → 200, persisted
  - `PATCH /me/settings { vendor: null, model: null }` → 200, row cleared
  - `PATCH /me/settings { vendor: 'openai', model: 'gpt-4o' }` → 400 (dropped)
  - `PATCH /me/settings { vendor: 'kimi', model: 'kimi-k2.5' }` → 400 (vendor dropped)
  - `PATCH /me/settings { vendor: 'openai', model: 'bogus' }` → 400
- `reports.integration.test.ts` — extend:
  - With user_settings set + stubbed AI provider, assert the stub
    receives `{vendor: userVendor, model: userModel}`
  - With user_settings = nulls, assert stub receives canonicals
  - With `AI_FIXTURE_MODE=replay` + user_settings set, assert
    fixture-replay still matches (canonicals used)

### API live (`packages/api/src/__tests__/live/`)
- `reportGeneration.live.test.ts` — add a fourth scenario that sets
  user_settings to `{openai, gpt-4.1-nano}` and asserts response is
  produced AND `result.model === 'gpt-4.1-nano'`. This is the
  default-wiring test per AGENTS.md pitfall #13.

### Mobile (`apps/mobile/lib/ai/`)
- `useAiProvider.test.tsx` — rewrite for server-backed source:
  - Initial load fetches `/me/settings`, renders default state
  - Selecting a model triggers mutation + query invalidation
  - Selecting "Default" clears server-side value
  - Loading state visible while settings query is in-flight

## Canonical change & fixture re-recording

This spec changes the canonical from `gpt-4o`/`gpt-4o-mini` to
`gpt-4.1-mini` for both ops. That invalidates every existing fixture
in `packages/ai-fixtures/fixtures/generate-report.*.json` and
`summarize-voice.*.json` (hash includes vendor+model).

**Steps as part of this work:**
1. Update `FIXTURE_CANONICALS` in `packages/api/src/services/ai.ts` to
   `{vendor: 'openai', model: 'gpt-4.1-mini'}` for both `report` and
   `summarize`.
2. Re-record fixtures: `AI_FIXTURE_MODE=record pnpm --filter api test:live`
   for the live tests that exercise these ops.
3. Verify replay tests pass against the new fixtures.
4. Add an entry in `docs/bugs/README.md` documenting the canonical swap.

## Out of scope

- Per-operation model selection (one global pick covers both
  generate and summarize)
- Adding Groq llama models, Kimi, Anthropic, or any non-OpenAI vendor
  to the picker (would require additional vendor adapter wiring + key;
  the contract `AiVendor` type is left as a union so a second vendor
  can be added later without breaking changes)
- Token-counting hooks (the existing `usage` field in
  `reportLastGeneration` is already noted as unwired)
- A migration to backfill or clean stale `user_settings` rows (we
  no-op on stale values; explicit user action overwrites)
- Wiring user choice into `/voice/transcribe` (whisper-large-v3-turbo
  on Groq stays pinned)
