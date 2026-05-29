# 2026-05-29 — Generate Report unacceptably slow on `kimi-k2.6` (Pattern R5)

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** After
[the canonical model was pinned to `kimi-k2.6`](2026-05-29-kimi-canonical-model-not-on-account.md)
to unblock the 404s, Generate Report on `harpa-pro-api-dev.fly.dev`
took **47–87 seconds** end-to-end. Back-to-back curl runs against
the deployed `POST /reports/:id/generate` confirmed it was not a
cold start — `time_connect=0.2s`, `time_starttransfer ≈ time_total`,
all time spent server-side on the LLM call.

**Root cause.** `kimi-k2.6` is a **reasoning model** (like OpenAI's
`o1` family). It emits a long chain of internal "thinking" tokens
before producing the JSON body. The
[previous bug entry](2026-05-29-kimi-canonical-model-not-on-account.md)
already flagged this in passing — the live-test timeout was bumped
from 60s → 180s to accommodate it — but for an interactive
"generate report from notes" flow the latency is a product-killer.

A side-by-side benchmark against the real REPORT_SYSTEM_PROMPT and
a realistic 1KB notes payload (3 runs each, p50):

| Vendor / model                | p50    | Notes                                    |
| ----------------------------- | ------ | ---------------------------------------- |
| groq / llama-3.3-70b-versatile| 1.4s   | schema-perfect output                    |
| groq / llama-3.1-8b-instant   | 1.4s   | valid, slightly less detail              |
| openai / gpt-4.1-nano         | 3.0s   | valid                                    |
| groq / openai/gpt-oss-20b     | 3.1s   | valid (reasoning model, verbose)         |
| openai / gpt-4o               | 5.0s   | valid, already used by `summarize`       |
| openai / gpt-4o-mini          | 14.6s  | valid (one slow run, otherwise ~3s)      |
| kimi / kimi-k2.6              | 50–80s | reasoning model — emits thinking tokens  |

**Fix.** This PR.

- `FIXTURE_CANONICALS.report.{vendor, model}` →
  `{ openai, gpt-4o }`. Picked `gpt-4o` over the faster Groq options
  to keep vendor count down (it's already canonical for
  `summarize`) and to reuse the existing OpenAI capacity/quota.
- `packages/ai-fixtures/scripts/record.ts` updated to write
  `request.vendor='openai'` and `request.model='gpt-4o'` into the
  hashed canonical request so the recorder hash matches the API
  runtime hash (mirrors the fix in
  [2026-05-29-kimi-canonical-model-not-on-account.md](2026-05-29-kimi-canonical-model-not-on-account.md)).
- Re-recorded every `generate-report.voice-{1..5}.json` against
  live `gpt-4o` via `pnpm --filter @harpa/ai-fixtures record`.
- Updated `generate-report.update.json` by hand (no recorder yet)
  to point at `openai/gpt-4o` + refreshed its hash via
  `scripts/refresh-hashes.ts`.
- Live test (`reportGeneration.live.test.ts`) switched from
  `KIMI_API_KEY` to `OPENAI_API_KEY` (the live workflow already
  pulls both from Doppler, so no workflow-secrets change needed).
  `expect(result.vendor).toBe('openai')` and "live OpenAI" in the
  describe title now match the canonical.
- `vitest.live.config.ts` test timeout pulled back from 180s → 60s
  (gpt-4o p50 is 5s; 60s is comfortable headroom).

**Verification.** Live test run on this branch:

```text
✓ src/__tests__/live/reportGeneration.live.test.ts (3 tests) 9702ms
  ✓ voice-1 — wet weather, concrete pour  4361ms
  ✓ voice-2 — formwork prep               3758ms
  ✓ voice-3 — minimal notes               1582ms
```

End-to-end through Fly dev to be re-timed after merge; expected to
match the local 3–5s observation since the latency was vendor/model,
not network.

**Pattern.** R5 — canonical-model drift. The default-wiring
integration test
([Pitfall 13](../v4/pitfalls.md#pitfall-13--di-stubs-become-the-spec-default-wiring-silently-broken))
catches *correctness* (does the call land + return a valid body)
but does NOT catch *latency*. Going forward, treat the live test
timeout as an explicit contract: a 180s ceiling is a red flag, not
a safety margin.

## How to swap the report model again

1. Pick a model. Validate p50 latency + JSON quality with a quick
   curl loop against the real `REPORT_SYSTEM_PROMPT`.
2. Update `FIXTURE_CANONICALS.report.{vendor, model}` in
   `packages/api/src/services/ai.ts`.
3. Update the matching `vendor`/`model` literals in
   `packages/ai-fixtures/scripts/record.ts` (the canonical request
   used to compute the fixture's request hash).
4. Re-record: `AI_LIVE=1 OPENAI_API_KEY=… pnpm --filter
   @harpa/ai-fixtures record`.
5. Hand-patch `generate-report.update.json` (no recorder) — set
   `request.vendor`/`request.model`, then run
   `pnpm --filter @harpa/ai-fixtures exec tsx scripts/refresh-hashes.ts`.
6. Update the live test's `OPENAI_API_KEY` guard and the
   `expect(result.vendor)` assertion to match the new canonical.
7. Add a new bug doc here describing why the previous model was
   swapped, and bump the index.
