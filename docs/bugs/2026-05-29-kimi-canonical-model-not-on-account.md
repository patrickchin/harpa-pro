# 2026-05-29 — Report canonical pinned to a Kimi model the account doesn't host (Pattern R5)

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** After the vendor-routing fix
([2026-05-29 report vendor canonical mismatch](2026-05-29-report-vendor-canonical-mismatch.md))
shipped to `dev`, Generate Report still 502'd. Fly logs flipped from
`[ai-fixtures:openai] HTTP 404` to `[ai-fixtures:kimi] HTTP 404` —
proving the request was now hitting Moonshot, but Moonshot was
refusing the model.

**Root cause.** `FIXTURE_CANONICALS.report.model = 'kimi-k2-0520'`
(in `packages/api/src/services/ai.ts`) is a dated K2 snapshot that
this Doppler `KIMI_API_KEY` does **not** have access to. Probing
`https://api.moonshot.cn/v1/models` from the Fly machine returned
only `kimi-k2.5`, `kimi-k2.6`, and the `moonshot-v1-*` family.
Every `kimi-k2-XXXX` snapshot (0520, 0905, 0711-preview,
turbo-preview, instruct) → HTTP 404. The default vendor (`openai`)
was masking this for weeks because the wrong-vendor 404 looked
identical to a wrong-model 404, and the live test stubbed
`vendor: 'kimi'` so it never actually called Kimi.

**Fix.** PR #103.
- `FIXTURE_CANONICALS.report.model` → `kimi-k2.6` (the newest model
  the account hosts).
- `packages/ai-fixtures/scripts/record.ts` was writing
  `request.vendor='openai'`, `request.model='gpt-4o'` into the
  hashed canonical request, which would never match the API
  runtime (which hashes with `canonicals.vendor='kimi'`,
  `canonicals.model=...`). Updated the script to hash the canonical
  vendor/model so the script and the runtime stay in sync.
- Re-recorded all `generate-report.voice-{1..5}.json` and rehashed
  `generate-report.update.json` against the new canonical.

**Test.** The existing live-LLM CI lane
(`packages/api/src/__tests__/live/reportGeneration.live.test.ts`)
now exercises the real Kimi endpoint with the canonical model, so
any future "this snapshot isn't on this account" regression will
fail in CI rather than in dev after deploy.

**Pattern.** R5 — implicit assumption ("the model we pinned exists
on the account we have a key for") not pinned anywhere. The hashes
in the replay-mode fixtures gave a false signal of correctness
because they were computed from a vendor/model the runtime never
actually called against.

**Recurrence guard.** When changing
`FIXTURE_CANONICALS.<task>.model`:

1. Probe the live provider's `/models` endpoint with the Doppler
   key for the target env (`dev` and `prd`) — the model must be in
   the response.
2. Re-run `pnpm --filter @harpa/ai-fixtures record` (which now hashes
   with the canonical vendor/model).
3. Verify the live CI lane runs green before merging.
