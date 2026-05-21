# AI fixtures (`packages/ai-fixtures`)

> Resolves [Pitfall 2](pitfalls.md#pitfall-2--llm-fixtures-retrofitted-not-designed-in).

## Goals

1. **No real LLM calls in CI**, ever.
2. **Easy to record a new fixture** when a new endpoint or prompt
   is added (`pnpm fixtures:record <name>`).
3. **Deterministic replay** in tests + `:mock` builds — same input
   always produces the same fixture output.
4. **Provider-agnostic** — same API for Kimi, OpenAI, Anthropic,
   Google, Z.AI, DeepSeek.
5. **Redacted by default** — no PII / no API keys in committed
   fixtures.

## Layout

```
packages/ai-fixtures/
  src/
    index.ts           # createProvider({ fixtureMode })
    providers/
      openai.ts        # chat (api.openai.com/v1/chat/completions)
      groq.ts          # transcribe (api.groq.com/openai/v1, whisper-large-v3-turbo)
      factory-from-env.ts  # realProviderFactoryFromEnv — routes vendor → adapter
      error.ts         # AdapterError
    fixture-store.ts   # read/write fixtures/<name>.json
    redact.ts          # PII redaction
    hash.ts            # canonical-json hash for fixture lookup
  fixtures/
    transcribe.basic.groq.json         # groq (whisper-large-v3-turbo)
    summarize.basic.json               # openai default
    summarize.basic.kimi.json          # kimi (replay-only)
    generate-report.full.json          # openai default
    generate-report.full.kimi.json
    generate-report.incomplete.json    # openai default
    generate-report.incomplete.kimi.json
    generate-report.update.json        # openai default
    generate-report.update.kimi.json
    …
  package.json
```

User-facing vendors (`aiVendor` enum): `openai`, `kimi`. OpenAI is
the default and the only one with a live adapter today; kimi is
replay-only (chat fixtures kept; calling it under `AI_LIVE=1`
throws `LiveAdapterMissingError` → 502). Anthropic / Google / Z.AI /
DeepSeek were removed in `feat/ai-live-prod-dev` along with all
their fixtures.

Transcription is **not** user-selectable — every transcribe request
routes to Groq (`whisper-large-v3-turbo`), which is ~10× cheaper than
OpenAI Whisper-1 with comparable quality. `groq` is an internal-only
member of the ai-fixtures `Vendor` union; it doesn't appear in the
user-facing `aiVendor` enum. OpenAI keeps the un-suffixed fixture
names for backwards compat. Each vendor has its own canonical model
id — see `VENDOR_MODELS` in `packages/api/src/services/ai.ts`.

### Live mode wiring (Pitfall 13)

`@harpa/ai-fixtures` exports `realProviderFactoryFromEnv({ openaiApiKey,
groqApiKey, … })` which `packages/api/src/services/ai.ts::buildProvider()`
passes into `createProvider` whenever `mode !== 'replay'`. Replay mode
*never* invokes the factory and never reads the API keys, so local
dev / CI / `:mock` keep working with `OPENAI_API_KEY` unset.

Route handlers don't plumb any AI config. They just call
`services/ai.ts::{transcribe,chat,generateReport}` and the service
decides:

- If the caller passed `fixtureName` → replay (force).
- Else if `AI_LIVE=1` → live (factory invoked).
- Else → replay (canonical fixture name).

The "default wiring" test
(`packages/api/src/services/ai.live.test.ts`) stubs `globalThis.fetch`
and asserts chat hits `api.openai.com`, transcribe hits
`api.groq.com` — guarding against the regression that motivated this
doc rewrite (bugs/README.md 2026-05-22).

## Modes

```ts
type FixtureMode = 'replay' | 'record' | 'live';

const provider = createProvider({
  vendor: 'openai',
  fixtureMode: process.env.AI_FIXTURE_MODE as FixtureMode,
  fixtureName: 'transcribe.basic', // declared by caller
});
```

| Mode | Behaviour |
|---|---|
| `replay` | Look up `fixtures/<name>.json`. Hash the request body; if hash matches `fixture.requestHash`, return `fixture.response`. If missing or mismatched, throw `FixtureMissError`. **Default in CI + tests + `:mock`.** |
| `record` | Hit the real provider, redact, write to `fixtures/<name>.json`, then return the response. Used by humans running `pnpm fixtures:record <name>` once per new endpoint. |
| `live` | Hit the real provider with no fixture interaction. **Only enabled when `AI_LIVE=1`.** Production deploys set this. |

CI asserts `AI_FIXTURE_MODE=replay` and `AI_LIVE` unset.

## Hashing

Fixture lookup uses a canonical-JSON hash of:

- model id,
- system + user messages (post-prompt-build),
- temperature, max_tokens, etc.

The hash is included in the fixture file so a stale fixture (prompt
template changed) fails loudly with a clear error pointing at the
fixture name to re-record.

## Redaction (`src/redact.ts`)

Before writing a fixture:

- Strip API keys, bearer tokens, and any header.
- Replace phone numbers with `+10000000000`.
- Replace email addresses with `redacted@example.com`.
- Replace UUIDs in user content with `00000000-0000-0000-0000-000000000000`.
- Truncate file URLs to host + last path segment.

A fixture file:

```json
{
  "vendor": "openai",
  "model": "gpt-4o-mini",
  "fixtureName": "transcribe.basic",
  "recordedAt": "2026-05-12T00:00:00Z",
  "requestHash": "sha256:a7c3…",
  "request": { "...redacted summary..." : true },
  "response": {
    "text": "Site arrival 8:15. Crew of three…",
    "usage": { "input": 12, "output": 88 }
  }
}
```

## Usage in the API

```ts
// packages/api/src/services/ai.ts
import { createProvider } from '@harpa/ai-fixtures';

export const transcribe = (audioUrl: string) =>
  createProvider({
    vendor: 'openai',
    fixtureMode: env.AI_FIXTURE_MODE,
    fixtureName: 'transcribe.basic',
  }).transcribe({ audioUrl });
```

Route handlers pick the fixture name based on a deterministic
mapping (e.g. by report id in `:mock` builds, or by an explicit
header `X-Fixture-Name` accepted only when
`AI_FIXTURE_MODE !== 'live'`).

## Recording a new fixture

```bash
# 1. Set creds, set mode, run a single test that exercises the path.
AI_FIXTURE_MODE=record OPENAI_API_KEY=… pnpm test:api -- transcribe.basic

# 2. Inspect, commit.
git add packages/ai-fixtures/fixtures/transcribe.basic.json
git commit -m "test(ai-fixtures): record transcribe.basic"
```

Pre-commit hook checks fixture files for un-redacted strings
matching API key patterns or +1[0-9]{10} phone numbers other than
`+10000000000`.

## Mobile `:mock` build

The `:mock` build sets `EXPO_PUBLIC_USE_FIXTURES=true`, which makes
the API client always send `X-Fixture-Mode: replay` and pick a
predictable fixture name based on the screen flow being demoed
(e.g. recording a voice note in `:mock` always replays
`transcribe.basic` then `summarize.basic`).
