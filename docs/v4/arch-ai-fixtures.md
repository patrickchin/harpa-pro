# AI fixtures (`packages/ai-fixtures`)

> Resolves [Pitfall 2](pitfalls.md#pitfall-2--llm-fixtures-retrofitted-not-designed-in).

## Goals

1. **Keep normal CI deterministic.** Unit and integration lanes use
   replay. Explicit live-AI lanes are cost-bearing exceptions.
2. **Keep runtime mode server-owned.** Request data can select a
   replay scenario, but it cannot switch provider mode.
3. **Fail on fixture drift.** Replay rejects missing files and request
   hash mismatches.
4. **Keep provider access behind one boundary.** The package includes
   OpenAI chat, Groq transcription, and Kimi chat adapters. Current user
   settings expose OpenAI models only.
5. **Redact fixture writes.** Remove known secrets and personal-data
   patterns before a fixture reaches the repository.

## Layout

```
packages/ai-fixtures/
  src/
    index.ts           # createProvider({ fixtureMode })
    providers/
      openai.ts          # chat / report generation (live + replay)
      groq.ts            # transcription (live + replay)
      kimi.ts            # chat via Moonshot REST (live + replay)
      error.ts
      factory-from-env.ts
    fixture-store.ts   # read/write fixtures/<name>.json
    redact.ts          # PII redaction
    hash.ts            # canonical-json hash for fixture lookup
  fixtures/
    transcribe.voice-{1..5}.json        # five redacted site-walk scenarios
    summarize.voice-{1..5}.json         # title + summary per transcript
    generate-report.voice-{1..5}.json   # full report body per transcript
    …
  package.json
```

Five scenarios — `voice-1` … `voice-5` — each backed by a redacted,
representative construction-site voice memo. `voice-1` is the rich
default; `voice-4` is the sparse case (empty `workers`/`materials`,
one summary section) exercised by the regenerate test. Per-vendor
fixture variants were removed: a single set of OpenAI fixtures covers
every scenario in replay mode. Current user settings whitelist only
OpenAI, so ordinary API traffic cannot select the retained Kimi
adapter. The per-user OpenAI model preference does not steer fixture
selection.

## Modes

```ts
type FixtureMode = 'replay' | 'record' | 'live';

const provider = createProvider({
  vendor: 'openai',
  fixtureMode: 'replay',
  fixtureName: 'transcribe.basic', // declared by caller
});
```

These modes belong to the provider package:

| Mode     | Behavior                                                                                                                           |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `replay` | Read `fixtures/<name>.json`. Return the response only when the canonical request hash matches. Otherwise throw `FixtureMissError`. |
| `record` | Call an injected real provider, redact the request and response, then write the named fixture. The API does not select this mode.  |
| `live`   | Call the real provider without fixture access. `createProvider` rejects this mode unless `AI_LIVE=1`.                              |

The API service owns this mode decision. `env.AI_LIVE === '1'`
selects `live`; every other value selects `replay`. The API currently
does not use `AI_FIXTURE_MODE` for this decision. A request-body
`fixtureName` selects a scenario only after replay is active. It cannot
downgrade a live deployment.

## Hashing

Fixture lookup uses a canonical-JSON hash of the operation kind,
vendor, and normalized request fields. For chat, these fields include
the model, prompts, output format, temperature, and token limit.

The hash is included in the fixture file so a stale fixture (prompt
template changed) fails loudly with a clear error pointing at the
fixture name to re-record.

## Redaction (`src/redact.ts`)

Before writing a fixture, the redactor:

- Redacts known API keys, bearer tokens, and authentication header
  fields.
- Replace phone numbers with `+10000000000`.
- Replace email addresses with `redacted@example.com`.
- Replace UUIDs in user content with `00000000-0000-0000-0000-000000000000`.
- Replace customer, company, project, and site names with
  `<redacted-organization>`.
- Replace street addresses and postcodes with `<redacted-address>`.

`redactFixture()` discovers identifiers across the request, provider
response, and optional private source context, then writes only the
redacted request and response. This matters when a canonical replay
request omits the real transcript but the provider repeats a customer
name from that transcript. The private context is used only to find
terms; it is never returned or stored. Both the generic record-mode
provider and the dedicated report recorder use this boundary.

A fixture file:

```json
{
  "vendor": "openai",
  "model": "gpt-4o-mini",
  "fixtureName": "transcribe.voice-1",
  "recordedAt": "2026-05-12T00:00:00Z",
  "requestHash": "sha256:a7c3…",
  "request": { "...redacted summary...": true },
  "response": {
    "text": "I just arrived at the site, so the construction site…",
    "usage": { "input": 12, "output": 88 }
  }
}
```

## Usage in the API

```ts
// packages/api/src/services/ai.ts
function pickMode(): FixtureMode {
  return env.AI_LIVE === '1' ? 'live' : 'replay';
}
```

Route handlers may forward a fixture name from the test harness.
`services/ai.ts` honours it only after parsed server configuration
has selected replay mode. In live mode the real request body flows to
the provider and no fixture store read occurs.

## Recording report fixtures

The report fixtures have a custom recorder
(`packages/ai-fixtures/scripts/record.ts`, exposed as
`pnpm fixtures:record`) because their request
hash depends on the API's `REPORT_SYSTEM_PROMPT`. Every time that
prompt changes the fixtures go stale; the recorder regenerates them
in one pass, using the recorded `transcribe.voice-N.json`
transcripts as the realistic notes payload and writing back the
canonical placeholder user prompt (`<notes payload voice-N>`) so
replay-mode lookup still hits the file.

Before writing, the recorder passes the canonical request, provider
response, and private transcript through `redactFixture()`. The
transcript supplies cross-response identifiers for redaction but is
not persisted in the report fixture.

```bash
AI_LIVE=1 OPENAI_API_KEY=sk-… pnpm --filter @harpa/ai-fixtures record
# Restrict the write to one scenario.
AI_LIVE=1 OPENAI_API_KEY=sk-… pnpm --filter @harpa/ai-fixtures record -- --scenario voice-3
```

The recorder refuses to run without `AI_LIVE=1` so it cannot
silently clobber fixtures from an unrelated test or script import.
It records only `generate-report.voice-1` through `voice-5`. There is
no generic `pnpm fixtures:record <name>` command for transcription or
summary fixtures.

Review every changed fixture before commit. The pre-push hook checks
fixture hashes and scans common secret formats. It does not replace a
content review for names, addresses, or other personal data.

## Usage accounting (`app.llm_usage_events`)

Every call routed through `services/ai.ts` lands one row in
`app.llm_usage_events` via the `withUsageAccounting` chokepoint
(see [P3.15.5](plan-p3-feature-build.md#p3155--llm-token-accounting)).
Token-count conventions per operation — full doc lives on
`RecordLlmUsageParams` in `services/ai-usage.ts`:

| `operation`                | `input_tokens` | `output_tokens`   | `cached_tokens`                                                                    | `input_seconds`                           |
| -------------------------- | -------------- | ----------------- | ---------------------------------------------------------------------------------- | ----------------------------------------- |
| `chat` / `generate_report` | prompt tokens  | completion tokens | subset of input that hit the provider's prompt cache (0 if vendor does not report) | `NULL`                                    |
| `transcribe`               | `0`            | `0`               | `0`                                                                                | audio duration in seconds (numeric(10,3)) |

`input_seconds` lives in its own column (migration
`0008_llm_usage_input_seconds.sql`) so the `sum(input_tokens)`
aggregates in `auth/service.ts::fetchUsage` and
`services/usage-limits.ts::loadMonthUsage` only ever mix like units.
The token-bucket rate gate (`ai_input_tokens`, `ai_output_tokens`)
filters on `operation IN ('chat', 'generate_report')` as
defence-in-depth.

Vendor extraction (live mode):

- **OpenAI** — `response.usage.{prompt_tokens, completion_tokens,
prompt_tokens_details.cached_tokens}`.
- **Kimi (Moonshot)** — same shape; Moonshot's REST API is
  OpenAI-compatible.
- **Groq (Whisper-class transcription)** — bills by audio seconds, no
  per-token field. `services/ai.ts::transcribe()` passes
  `durationSec` straight into `input_seconds`.

Replay mode reads `usage` straight from the recorded fixture file,
so replay-mode tests have deterministic token counts that match the
checked-in fixture without re-hitting the provider.

## Live-CI lane

Replay fixtures cannot catch prompt/schema drift on their own —
the fixture `response.text` is hand-massaged to match whatever
shape the contract currently expects, so a broken prompt
("emit v3 wrapped JSON") looks healthy in CI while the live
production path 502s ("AI provider request failed."). That's
Pitfall 13 in `pitfalls.md`, and it is exactly the bug recorded
in `docs/bugs/README.md` as **"Prompt/schema drift in
generateReport"**.

Three guards run at three layers:

| Lane                                                                                  | When                                                                                            | What it catches                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Offline drift guard** (`packages/api/src/__tests__/reportPrompt.drift.test.ts`)     | Every PR, in the unit lane                                                                      | Prompt text no longer mentions every required `reportBody` field (including the `meta` envelope keys), or has re-acquired v3 vocabulary (`"report":` wrapper, `quantityUnit`, `actionRequired`, `totalWorkers`, `"category"`). |
| **Replay integration** (`reports.integration.test.ts`)                                | Every PR                                                                                        | The fixture-driven happy path still produces a schema-valid `reportBody` end-to-end.                                                                                                                                           |
| **Live LLM** (`.github/workflows/ai-live.yml` → `pnpm --filter @harpa/api test:live`) | Manual dispatch, matching pushes to `dev` or `main`, and matching same-repository pull requests | The real report model still returns a payload that parses against `reportBody`.                                                                                                                                                |

The live workflow uses a Doppler development token to fetch provider
keys. Fork pull requests skip the live job because they cannot read the
token. A pull request to `main` also runs the deployed development
journeys through `main-gate.yml`; those journeys use live AI.

When the live lane fails, the next step is almost always:

1. Look at the failure — Zod issue paths are in the test output
   AND (in production) in the Fly log line
   `ai_provider_error … issues=<path>:<code>, …`.
2. Update `packages/api/src/prompts/reportGeneration.ts` to match
   the schema (or update the schema if the contract is changing).
3. Re-record report fixtures with
   `pnpm --filter @harpa/ai-fixtures record`.

## Mobile fixture-input build

`pnpm --filter @harpa/mobile ios:mock` sets
`EXPO_PUBLIC_USE_FIXTURES=true` at bundle time. This swaps the native
audio recorder for the checked-in `voice-sample.m4a` input and enables
selected display fallbacks.

The mobile API client sends no fixture-mode header and does not add a
fixture name to AI requests. The target API still decides between live
and replay. For a cost-free run, use an API with `AI_LIVE=0`. Do not
point a fixture-input build at production and assume it disables live
provider calls.
