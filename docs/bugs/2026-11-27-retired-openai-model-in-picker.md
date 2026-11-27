# 2026-11-27 — Retired OpenAI model left in the picker

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** Users who had picked "GPT-4.1 nano" in Developer → AI model
got a generic 502 on every report generation and voice summary after
OpenAI shut `gpt-4.1-nano` down on 2026-10-23. The default
(`gpt-4.1-mini`) and `gpt-4.1` were deprecated with a 2027-01-14
shutdown, so every live call was about to fail the same way.

**Root cause.** The `AI_MODELS` catalogue in
`packages/api-contract/src/schemas/settings.ts` is hard-coded, and
nothing tracks OpenAI's deprecation schedule. Replay fixtures pin their
own model ids, so CI stayed green while live calls failed.

**Fix.** Replaced the catalogue with `gpt-6-luna` only
(`reasoning_effort: none`), pointed `LIVE_DEFAULT_MODELS` at `gpt-6-luna`, and taught the OpenAI
adapter to send `reasoning_effort` and `max_completion_tokens`.
Existing `getAiSettings` behaviour maps any saved model that is no
longer catalogued to `{null, null}`, so affected users fall back to the
default without a data migration.

**Test.** `settings.integration.test.ts` seeds a `gpt-4.1-nano` row and
asserts `GET /settings/ai` returns `{vendor: null, model: null}`; the
contract test asserts retired ids are rejected; the adapter test
asserts `reasoning_effort` is forwarded.

**Pattern.** External dependency retired underneath a pinned id (same
shape as R22, applied to model ids). Check
<https://developers.openai.com/api/docs/deprecations> when touching
`AI_MODELS`.
