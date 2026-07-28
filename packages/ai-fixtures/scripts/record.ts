/**
 * record.ts — re-record the live `generate-report.voice-{1..5}` fixtures
 * against OpenAI gpt-4o using the current REPORT_SYSTEM_PROMPT.
 *
 * Why this exists:
 *   The API's request hash includes the system prompt. Every time
 *   `packages/api/src/prompts/reportGeneration.ts` changes, every
 *   recorded fixture goes stale and replay tests start to lie.
 *   This script regenerates them in one pass.
 *
 * What it does (per scenario voice-1..voice-5):
 *   1. Reads the recorded transcript from `transcribe.voice-N.json`
 *      and uses it as a realistic notes payload.
 *   2. Sends a live chat request to OpenAI with that payload + the
 *      current REPORT_SYSTEM_PROMPT, in `response_format: json_object`
 *      mode.
 *   3. Sanity-checks the response parses as JSON; aborts loudly
 *      otherwise.
 *   4. Writes `generate-report.voice-N.json` with the canonical
 *      placeholder user prompt (`<notes payload voice-N>`) so the
 *      API's replay-mode lookup still hits the fixture.
 *
 * Usage:
 *   AI_LIVE=1 OPENAI_API_KEY=sk-... \
 *     pnpm --filter @harpa/ai-fixtures record [--scenario voice-3]
 *
 * Cost: ~5 short gpt-4o calls per full run. Safe to re-run.
 *
 * Guardrails: refuses to write if AI_LIVE !== '1' (no accidental
 * fixture clobbering by a stray import).
 *
 * See docs/v4/arch-ai-fixtures.md §Recording.
 */
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createOpenAiProvider } from '../src/providers/openai.js';
import { hashRequest } from '../src/hash.js';
import { redactFixture } from '../src/redact.js';
import type { FixtureFile } from '../src/fixture-store.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');
const fixturesDir = resolve(here, '../fixtures');
const promptsFile = join(
  repoRoot,
  'packages/api/src/prompts/reportGeneration.ts',
);

if (process.env.AI_LIVE !== '1') {
  console.error(
    'record.ts: AI_LIVE=1 is required. Refusing to run — set AI_LIVE=1 explicitly.',
  );
  process.exit(2);
}
const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error('record.ts: OPENAI_API_KEY env var is required.');
  process.exit(2);
}

/**
 * Extract the value of `export const X = \`...\`;` from the prompts
 * source file. Avoids a workspace dep on @harpa/api (would create a
 * cycle: ai-fixtures → api → ai-fixtures).
 */
function extractPrompt(name: string): string {
  const src = readFileSync(promptsFile, 'utf8');
  const re = new RegExp(`export const ${name}\\s*=\\s*\`([\\s\\S]*?)\`;`);
  const m = src.match(re);
  if (!m) throw new Error(`record.ts: could not find ${name} in ${promptsFile}`);
  return m[1];
}

const REPORT_SYSTEM_PROMPT = extractPrompt('REPORT_SYSTEM_PROMPT');

interface TranscribeFixture {
  response: { text?: string };
}

function readTranscript(scenario: string): string {
  const p = join(fixturesDir, `transcribe.${scenario}.json`);
  if (statSync(p).size === 0) {
    throw new Error(`transcribe.${scenario}.json is empty — record it first`);
  }
  const j = JSON.parse(readFileSync(p, 'utf8')) as TranscribeFixture;
  const t = j.response?.text;
  if (!t) throw new Error(`transcribe.${scenario}.json has no response.text`);
  return t;
}

const ALL_SCENARIOS = ['voice-1', 'voice-2', 'voice-3', 'voice-4', 'voice-5'];
const onlyArg = process.argv.indexOf('--scenario');
const scenarios = onlyArg >= 0 ? [process.argv[onlyArg + 1]!] : ALL_SCENARIOS;

const provider = createOpenAiProvider({ apiKey });

async function recordScenario(scenario: string): Promise<void> {
  console.log(`[record] ${scenario}: building notes payload…`);
  const transcript = readTranscript(scenario);
  // Mirror the API's live user-prompt format: bare notes text.
  const realUserPrompt = transcript;

  console.log(`[record] ${scenario}: calling OpenAI gpt-4o…`);
  const out = await provider.chat({
    model: 'gpt-4o',
    systemPrompt: REPORT_SYSTEM_PROMPT,
    userPrompt: realUserPrompt,
    responseFormat: 'json_object',
  });

  try {
    JSON.parse(out.text);
  } catch (err) {
    throw new Error(
      `[record] ${scenario}: OpenAI returned non-JSON (despite json_object mode): ${(err as Error).message}\n\n${out.text.slice(0, 400)}`,
    );
  }

  // Save fixture with the CANONICAL placeholder user prompt + canonical
  // vendor/model so the API's replay-mode hash lookup (which uses
  // `FIXTURE_CANONICALS.report.{vendor,model}`) hits this file. Real
  // notes content is discarded — only the model's response shape matters
  // for replay. Keep these in sync with `FIXTURE_CANONICALS.report` in
  // packages/api/src/services/ai.ts.
  const canonicalUserPrompt = `<notes payload ${scenario}>`;
  const canonicalRequest = {
    kind: 'chat' as const,
    vendor: 'openai' as const,
    model: 'gpt-4o',
    systemPrompt: REPORT_SYSTEM_PROMPT,
    userPrompt: canonicalUserPrompt,
    responseFormat: 'json_object' as const,
  };
  const redacted = redactFixture({
    request: canonicalRequest,
    response: { text: out.text, usage: out.usage },
    privateContext: realUserPrompt,
  });
  const file: FixtureFile = {
    vendor: 'openai',
    model: 'gpt-4o',
    fixtureName: `generate-report.${scenario}`,
    recordedAt: new Date().toISOString(),
    requestHash: hashRequest(canonicalRequest),
    request: redacted.request,
    response: redacted.response,
  };
  const outPath = join(fixturesDir, `generate-report.${scenario}.json`);
  writeFileSync(outPath, JSON.stringify(file, null, 2) + '\n', 'utf8');
  console.log(`[record] ${scenario}: wrote ${outPath}`);
}

(async () => {
  for (const s of scenarios) {
    await recordScenario(s);
  }
  console.log(`[record] done — ${scenarios.length} scenario(s) recorded.`);
})().catch((err) => {
  console.error('[record] FAILED:', err);
  process.exit(1);
});
