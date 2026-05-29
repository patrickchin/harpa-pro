# 2026-05-29 — Report generation 502s in dev: Kimi model sent to OpenAI (Pattern R5)

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** On the dev deployment, every "Generate Report" / "Regenerate"
call returned 502 "AI provider request failed.". Fly logs:

```
[api] ai_provider_error (rid=…) AiProviderError:
  generateReport failed: AdapterError: [ai-fixtures:openai] HTTP 404
```

**Root cause.** Commit `e4c503a` ("switch AI live tests to Kimi, fix
replay vendor mismatch") changed `FIXTURE_CANONICALS.report` from
`openai / gpt-4o` to `kimi / kimi-k2-0520` and patched **replay** mode
to force `providerVendor = canonicals.vendor`, but left **live** mode
routing to the caller-supplied vendor:

```ts
const providerVendor: Vendor = mode === 'replay' ? canonicals.vendor : vendor;
```

In production, the caller's vendor comes from
`getAiSettings(userId).vendor`, whose default is `openai`
(`packages/api/src/services/settings.ts`). So live mode sent the
vendor-specific Kimi model name `kimi-k2-0520` to **OpenAI**, which
404s on the unknown model.

**Fix.** `packages/api/src/services/ai.ts` pins
`providerVendor = canonicals.vendor` unconditionally (live + replay)
until reports actually support multiple vendors with per-vendor
canonical models. Usage accounting and the response `vendor` field
now both report the vendor actually routed to, so the mobile Debug
tab and the `app.usage` rows match reality.

Doppler `dev` and `prd` also need `KIMI_API_KEY` synced to Fly; this
PR does not touch secrets directly — operator action required:

```sh
doppler secrets set KIMI_API_KEY=… --config dev
doppler secrets set KIMI_API_KEY=… --config prd
pnpm secrets:fly:dev && pnpm secrets:fly:prod
```

**Test.** `packages/api/src/__tests__/live/reportGeneration.live.test.ts`
no longer stubs `vendor: 'kimi'` on the call; the live lane now
exercises the default-wired path that the route actually uses. Had
this test been written this way originally, `e4c503a` would have
failed CI rather than shipping to dev.

**Pattern.** R5 — DI stubs become the spec; default wiring silently
broken. Same shape as the May 14 `fakeTurnstile` bug and the May 18
saved-report-body adapter miss: a test injected what should have
been resolved by the default code path, so a regression in that
default path slipped through. Mitigation reminder lives in
[`docs/v4/arch-testing.md` → "Test the default wiring"](../v4/arch-testing.md#test-the-default-wiring).
