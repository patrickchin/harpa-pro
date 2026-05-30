# 2026-05-23 — Generate Report returned 502 "AI provider request failed." in dev because the prompt told GPT-4o to emit v3 JSON while the contract validated v4 (Pattern R5)

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** Tapping **Generate Report** in the mobile dev build
returned a 502 with the canned message `AI provider request
failed.` Fly logs showed
`AiProviderError: generateReport: provider response did not match
report schema` for every request. Every replay-mode integration
test stayed green, so the bug only surfaced in live dev.

**Root cause.** `packages/api/src/prompts/reportGeneration.ts` was
ported verbatim from the v3 source and instructed the model to
return `{ "report": { "meta": {…}, "weather": {conditions,
temperature, wind}, "workers": {totalWorkers, roles}, "materials":
[{quantityUnit}], "issues": [{category, status, details,
actionRequired}], "sections": [{content}] } }`. But the v4
`reportBody` schema in `packages/api-contract/src/schemas/reports.ts`
validates an **unwrapped** shape with completely different field
names (`visitDate`, `weather.condition` / `temperatureC` / `windKph`,
`workers` as an array of `{role,count,hours,notes}`, `materials[].unit`,
`issues[].severity`, `summarySections[{title,body}]`).

So GPT-4o (correctly) followed the prompt and returned the v3 envelope;
Zod (correctly) rejected it; the wire returned a generic 502. The
recorded `generate-report.voice-*.json` fixtures had been hand-massaged
to the v4 shape (because that's what the API needs to persist), so
replay tests never saw the live model's actual output. The
`reportGeneration.ts` header even warned about this divergence —
but the warning didn't trip any test.

**Fix.** `fix(api): align report prompts with v4 reportBody, add live-LLM CI`
— rewrote both `REPORT_SYSTEM_PROMPT` and `REPORT_UPDATE_SYSTEM_PROMPT`
to describe the unwrapped v4 shape using the exact field names from
`reportBody`; switched the report chat call to OpenAI's
`response_format: { type: 'json_object' }`; widened the
server-side log line to include Zod issue paths (not the payload)
so future drift is diagnosable from Fly logs alone.

**Test.** Three layers, so this can't recur silently:

1. `packages/api/src/__tests__/reportPrompt.drift.test.ts` — offline
   drift guard: every PR asserts both prompts mention each required
   `reportBody` field and contain no v3 vocabulary
   (`"report":`, `quantityUnit`, `actionRequired`, `totalWorkers`,
   `"category"`). Cheap and deterministic; would have failed the
   PR that introduced the v3 prompt.
2. `pnpm --filter @harpa/ai-fixtures record` — real recorder
   (was a stub) that regenerates every `generate-report.voice-*`
   fixture against live OpenAI using the current prompt, then
   writes back the canonical replay placeholder. Run it whenever
   you touch the prompt or the schema.
3. `.github/workflows/ai-live.yml` + `pnpm --filter @harpa/api
   test:live` — opt-in live-LLM lane that calls `generateReport()`
   against real OpenAI for 3 scenarios on a weekly schedule, on
   manual dispatch, and on any push/PR that touches
   `prompts/**`, `services/ai.ts`, `schemas/reports.ts`,
   provider adapters, or report fixtures. Catches model-side
   drift even when field names happen to match.

**Pattern.** R5 — fixture-driven tests masquerading as
end-to-end coverage. The hand-massaged `response.text` in the
recorded fixtures _defined_ the schema as far as replay was
concerned, while live mode ran a completely different path. See
also `docs/v4/pitfalls.md` Pitfall 13.
