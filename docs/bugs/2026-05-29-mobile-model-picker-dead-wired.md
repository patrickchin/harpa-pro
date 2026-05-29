# 2026-05-29 — Mobile AI model picker was dead-wired (Pattern R5)

> See [`README.md`](README.md) for the index of all bug entries and
> patterns.

**Symptom.** The Developer screen's "AI Provider / Model" picker
visibly persisted user choices across app restarts, but the chosen
model never affected what the API actually ran. `/reports/{id}/generate`
and `/voice/summarize` always used the server-side default model
regardless of what the picker showed.

**Root cause.** `apps/mobile/lib/ai/useAiProvider.ts` saved the
selected `{vendor, model}` to AsyncStorage and exposed it to the
Developer screen, but no code path ever sent that selection to the
API. Server-side, `runGenerate()` and the voice aggregator pulled
their model from `LIVE_DEFAULT_MODELS` (or `FIXTURE_CANONICALS` in
fixture mode) without ever consulting `app.ai_settings`. The
`/settings/ai` route existed and the row was being read by *some*
admin code, but the generation paths never read it. So the picker
was a UI-only stub: it changed AsyncStorage and nothing else.

This is Pattern **R5** (DI stubs / wiring-default broken):
- Unit tests for the picker mocked the AsyncStorage layer and
  asserted the persisted value, never the round-trip from picker
  → API → model that ran.
- The integration tests for `/generate` always passed `vendor` /
  `model` explicitly in the test setup, so the default-wired path
  ("user picked X in their settings") was never exercised.

**Fix.** Three coordinated changes:

1. **Contract** — `packages/api-contract/src/schemas/settings.ts`
   now exports `AI_MODELS` as the single source of truth for
   the picker catalogue (currently OpenAI only, with
   `gpt-4.1-nano`, `gpt-4.1-mini`, `gpt-4.1`). The `aiSettings`
   schema enforces that `vendor` and `model` are both null or
   both non-null. `isValidAiSelection()` rejects unknown ids on
   PATCH.

2. **API service + routes** — `services/ai.ts` introduces
   `LIVE_DEFAULT_MODELS` (currently `gpt-4.1-mini` for both
   report generation and voice summarization) separate from
   `FIXTURE_CANONICALS`. `runGenerate()` and `aiSummarize()` now
   accept `userVendor` / `userModel` and use them when present,
   falling back to `LIVE_DEFAULT_MODELS`. The `/generate`,
   `/regenerate`, voice aggregator, and `/voice/summarize`
   routes all fetch the user's row via `getAiSettings()` and
   pass it through. A live integration test
   (`reportGeneration.live.test.ts`) covers both the override
   case (user picks `gpt-4.1-nano`) and the null-pair fallback.

3. **Mobile** — `apps/mobile/lib/ai/useAiProvider.ts` is
   rewritten to read + write through `/settings/ai` via
   TanStack Query. AsyncStorage is gone. The Developer screen
   becomes a single-step model picker (vendor inferred — only
   OpenAI today) with a leading "Default (recommended)" row
   that PATCHes `{vendor:null, model:null}` to clear any
   override. Cache write-through in the mutation `onSuccess`
   keeps the UI snappy without a refetch.

**Test.** The new live tests in
`packages/api/src/__tests__/live/reportGeneration.live.test.ts`
exercise the full default-wired path: they call `runGenerate()`
without injecting model overrides and assert
`result.model === 'gpt-4.1-mini'`. Two added scenarios cover the
override case (override with `gpt-4.1-nano`, assert that's what
ran) and the explicit `{null, null}` fallback. On the mobile side,
`useAiProvider.test.tsx` covers the round-trip: mounting → read,
`setSelection({vendor, model})` → PATCH + cache write,
`setSelection(null)` → PATCH `{null, null}` + cache returns null.

**Pattern.** R5 — the picker's collaborator factory
(AsyncStorage) was always stubbed in tests, the API integration
tests always supplied an explicit model, and no test ever ran
the picker → API → model-actually-used path end-to-end.

**Commits.** `63be693`, `2a87e81`, `48e01fb`, `bfcb7ab` on
`agents/user-model-selection-spec`.
