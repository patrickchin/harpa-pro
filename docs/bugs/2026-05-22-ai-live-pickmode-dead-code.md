# 2026-05-22 — `AI_LIVE=1` shipped to prod but no request ever reached the live vendor (Pattern R5)

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** Doppler had `AI_LIVE=1` + `OPENAI_API_KEY` set on `prd`,
Fly deploy was green, `/readyz` healthy, no errors in logs. But
`api.openai.com` access logs were empty and reports kept replaying
the canned `generate-report.full` fixture. To users this looked
indistinguishable from working AI — until a customer noticed two
distinct site visits produced byte-identical reports.

**Root cause.** `packages/api/src/services/ai.ts::pickMode(fixtureName)`
short-circuited to `'replay'` whenever the argument was truthy. Each
of the three callers (`transcribe`, `chat`, `generateReport`) derived
a sensible default fixture name (e.g. `summarize.basic.openai`) and
passed it in unconditionally — so the function *always* saw a name
and `AI_LIVE=1` became dead code. Nothing in CI caught this because
every test passed an explicit `fixtureName` (correctly forcing
replay), exercising only the path that was already broken.

**Fix.** `feat/ai-live-prod-dev` — `pickMode()` now takes a
`callerFixtureName?: string` and only forces replay when the
*external* caller passed it. Derived defaults are computed after the
mode decision. Also wired the real provider factory (OpenAI for chat,
Groq `whisper-large-v3-turbo` for transcribe) into `buildProvider()`
so live mode no longer 502s on missing real-factory.

**Test.** `packages/api/src/services/ai.live.test.ts` boots
`services/ai` with `AI_LIVE=1`, stubs `globalThis.fetch`, and calls
`chat()` / `transcribe()` *without* a fixture name. Asserts the
request URL is `api.openai.com` / `api.groq.com`. A regression in
`pickMode()` makes the test fail with "fetch was not called".

**Pattern.** R5 — green tests, broken prod (this time because the
test corpus only exercised the always-replay path; the
default-wiring path had zero coverage). Mirrors Pitfall 13.
