/**
 * AI provider wrapper.
 *
 * Thin layer over @harpa/ai-fixtures. Selects fixture mode from env
 * (AI_LIVE=1 → 'live', otherwise 'replay') and, in replay mode,
 * normalises the request body to the canonical inputs that the
 * checked-in fixtures were recorded against — so route handlers can
 * forward whatever the caller supplied (a real signed audio URL, a
 * client-supplied transcript) without breaking the request-hash
 * lookup in `@harpa/ai-fixtures`.
 *
 * In live mode (future) the inputs flow through unchanged.
 *
 * `FixtureMissError` (or any other provider-side failure) is wrapped
 * in `AiProviderError` so the route layer / errorMapper can map it to
 * a 502 + code=ai_provider_error without leaking provider internals.
 *
 * Refs: docs/v4/arch-ai-fixtures.md, plan-p1-api-core.md §P1.6.
 */
import {
  createProvider,
  FixtureMissError,
  type AiProvider,
  type FixtureMode,
  type Vendor,
} from '@harpa/ai-fixtures';
import { reports as reportSchemas } from '@harpa/api-contract';
import type { z } from 'zod';
import type { ScopedDb } from '../db/scope.js';
import { recordLlmUsage, type LlmOperation } from './ai-usage.js';
import { VOICE_SUMMARY_SYSTEM_PROMPT } from '../prompts/voiceSummary.js';

/**
 * Context the route passes when it wants the call recorded in
 * `app.llm_usage_events`. The `db` field is the same scoped accessor
 * routes get from `c.get('db')` — passing the accessor (not a raw
 * handle) keeps RLS per-request scoping intact: the INSERT runs under
 * the caller's `app.user_id`, and `llm_usage_events_self_insert`
 * enforces the user_id claim independently of the chokepoint.
 *
 * Optional everywhere — fixture-driven unit tests can still call
 * chat/transcribe/generateReport without it. The Pitfall 13
 * integration test is what keeps us honest: if a route stops passing
 * the context, that test goes red because the expected row never lands.
 */
export interface LlmUsageContext {
  db: <T>(fn: (db: ScopedDb) => Promise<T>) => Promise<T>;
  userId: string;
  projectId?: string | null;
  reportId?: string | null;
}

export class AiProviderError extends Error {
  readonly code = 'ai_provider_error';
  readonly inner?: unknown;
  constructor(message: string, inner?: unknown) {
    super(message);
    this.name = 'AiProviderError';
    this.inner = inner;
  }
}

/**
 * System prompt for the `generateReport` chat call. Ported verbatim
 * from canonical
 * `../haru3-reports/supabase/functions/generate-report/index.ts`
 * (`SYSTEM_PROMPT`). v4-specific schema diffs are intentionally NOT
 * applied here — the canonical prompt produces a `report` envelope
 * that we parse + validate against `reportBody` in `generateReport()`.
 * If we ever diverge from the canonical contract, update this prompt
 * AND re-record every generate-report.* fixture (see refresh-hashes
 * script).
 */
export const REPORT_SYSTEM_PROMPT =
  `You are a construction site report assistant. You convert numbered site notes from a construction site into a structured JSON report.

INPUT
- NOTES: numbered site notes captured on site. Each note is one input item — text, voice transcript, image, video, or document. Non-text items appear as numbered placeholders (e.g. "[image 1]", "[image 2]", "[video 1]", "[document 1]") at their position. You cannot see their contents, but you should acknowledge that the attachment exists.

OUTPUT
Return ONLY valid minified JSON in this exact shape:
  { "report": { "meta": {...}, "weather": ..., "workers": ..., "materials": [...], "issues": [...], "nextSteps": [...], "sections": [...] } }

- Always return the FULL report. Include every top-level field, even when empty.
- Use null for missing "weather" / "workers", [] for empty arrays, "" for missing strings.
- Do NOT wrap the JSON in markdown fences. Do NOT add prose before or after.

SCHEMA
"meta":          { "title": str, "reportType": "site_visit|daily|inspection|safety|incident|progress", "summary": str, "visitDate": "YYYY-MM-DD"|null }
"weather":       { "conditions", "temperature", "wind", "impact" }              (object or null)
"workers":       { "totalWorkers": num, "workerHours", "notes",
                   "roles": [{ "role", "count": num, "notes" }] }                (object or null)
"materials":     [{ "name", "quantity", "quantityUnit", "condition", "status", "notes" }]
"issues":        [{ "title", "category", "severity", "status", "details", "actionRequired" }]
"nextSteps":     [str]
"sections":      [{ "title", "content": "markdown" }]

RULES
- Populate "meta.title" with a short, human-readable title (e.g. "Site Visit — Wet Weather") and "meta.summary" with a one-sentence overview.
- Use sections to capture work progress, observations, and narrative detail. Materials list everything mentioned (concrete, steel, timber, pipes, etc.) — do NOT extract cost/price information; that's handled outside this flow.
- NEVER invent data not in the notes. Keep strings concise. Deduplicate facts.

EXAMPLE
{ "report": { "meta": { "title": "Site Visit — Wet Weather", "reportType": "daily", "summary": "Wet conditions delayed concrete pour", "visitDate": null }, "weather": { "conditions": "wet", "temperature": "20C", "wind": null, "impact": "Pour delayed by 1 hour" }, "workers": null, "materials": [{ "name": "Concrete", "quantity": "50", "quantityUnit": "m³", "condition": null, "status": "delivered", "notes": null }], "issues": [], "nextSteps": ["Order rebar"], "sections": [{ "title": "Foundation Work", "content": "Concrete pour started in zone A despite wet weather." }] } }`;

/**
 * System prompt for the *update* path — when the caller supplies an
 * existing report body alongside fresh notes. The model is told to
 * MERGE: integrate information from the new notes into the existing
 * report while preserving fields the user has hand-edited.
 *
 * Selected automatically by `generateReport()` when `existingBody`
 * is non-null. Cold-start callers (no existing body) still get
 * `REPORT_SYSTEM_PROMPT` so the recorded fixtures continue to match.
 *
 * NOTE: changing this string changes the request hash for any
 * fixture recorded against the update path — re-record under
 * `generate-report.update.*` after edits.
 */
export const REPORT_UPDATE_SYSTEM_PROMPT =
  `You are a construction site report assistant. You are UPDATING an existing structured JSON report with new site notes. The existing report may include manual edits made by a human; preserve those.

INPUT
- EXISTING REPORT: the current JSON report (matches the OUTPUT schema). May contain hand-edited values.
- NEW NOTES: numbered new site notes since the report was last generated. Each note is one input item — text, voice transcript, image, video, or document. Non-text items appear as numbered placeholders (e.g. "[image 1]"). You cannot see their contents, but you should acknowledge that the attachment exists.

OUTPUT
Return ONLY valid minified JSON in this exact shape:
  { "report": { "meta": {...}, "weather": ..., "workers": ..., "materials": [...], "issues": [...], "nextSteps": [...], "sections": [...] } }

- Always return the FULL report. Include every top-level field, even when empty.
- Use null for missing "weather" / "workers", [] for empty arrays, "" for missing strings.
- Do NOT wrap the JSON in markdown fences. Do NOT add prose before or after.

SCHEMA
"meta":          { "title": str, "reportType": "site_visit|daily|inspection|safety|incident|progress", "summary": str, "visitDate": "YYYY-MM-DD"|null }
"weather":       { "conditions", "temperature", "wind", "impact" }              (object or null)
"workers":       { "totalWorkers": num, "workerHours", "notes",
                   "roles": [{ "role", "count": num, "notes" }] }                (object or null)
"materials":     [{ "name", "quantity", "quantityUnit", "condition", "status", "notes" }]
"issues":        [{ "title", "category", "severity", "status", "details", "actionRequired" }]
"nextSteps":     [str]
"sections":      [{ "title", "content": "markdown" }]

UPDATE RULES — these override the generate-from-scratch behaviour
- PRESERVE manual edits: if a field in the EXISTING REPORT contains a non-empty value, do not regress it to null/"" unless a new note explicitly contradicts it.
- APPEND, do not replace, list-typed fields (materials, issues, nextSteps, sections, workers.roles) when new notes introduce new entries. Update existing entries in place when the same item is referenced again.
- Merge "meta.summary" so it reflects both the existing summary and the new notes; keep "meta.title" unless the user has clearly retitled the report (only override if the new notes describe a different report type).
- Re-evaluate "issues.status" and "issues.severity" only if the new notes provide an update for that specific issue; otherwise keep what's there.
- NEVER invent data not in the existing report or the new notes. Keep strings concise. Deduplicate facts across the existing report and new notes.

EXAMPLE INPUT
EXISTING REPORT: {"meta":{"title":"East footing","reportType":"daily","summary":"Concrete pour started","visitDate":null},"weather":null,"workers":null,"materials":[{"name":"Concrete","quantity":"50","quantityUnit":"m³","condition":null,"status":"delivered","notes":null}],"issues":[],"nextSteps":["Cure for 24h"],"sections":[{"title":"Foundation Work","content":"Pour completed in zone A."}]}
NEW NOTES:
[1] Rebar delivery delayed to tomorrow morning.
EXAMPLE OUTPUT
{"report":{"meta":{"title":"East footing","reportType":"daily","summary":"Concrete pour completed; rebar delivery delayed","visitDate":null},"weather":null,"workers":null,"materials":[{"name":"Concrete","quantity":"50","quantityUnit":"m³","condition":null,"status":"delivered","notes":null}],"issues":[{"title":"Rebar delivery delayed","category":"other","severity":"medium","status":"open","details":"Rebar delivery delayed to tomorrow morning.","actionRequired":null}],"nextSteps":["Cure for 24h","Follow up on rebar delivery"],"sections":[{"title":"Foundation Work","content":"Pour completed in zone A."}]}}`;

/**
 * Canonical inputs for the checked-in voice-note fixtures. Replay-mode
 * normalisation rewrites caller-supplied values to these so that the
 * fixture request-hash always matches. Update if/when fixtures are
 * re-recorded with different canonicals.
 *
 * Five scenarios — `voice-1` … `voice-5` — each backed by a real
 * site-walk transcript. Source of truth:
 *   packages/ai-fixtures/fixtures/{transcribe,summarize,generate-report}.voice-N.json
 *
 * Per-vendor fixture variants have been removed: a single set of OpenAI
 * fixtures covers every scenario. The per-user `AiVendor` preference is
 * still tracked for live-mode routing and accounting, but replay always
 * resolves through these canonicals.
 */
type ScenarioKey = 'voice-1' | 'voice-2' | 'voice-3' | 'voice-4' | 'voice-5';

export const DEFAULT_SCENARIO: ScenarioKey = 'voice-1';
const SCENARIOS: readonly ScenarioKey[] = ['voice-1', 'voice-2', 'voice-3', 'voice-4', 'voice-5'];

/**
 * Canonical transcript text per scenario — what the recorded
 * `summarize.voice-N.json` fixture was hashed against as `userPrompt`.
 * Keep in sync with the `response.text` of `transcribe.voice-N.json`.
 */
const SUMMARIZE_USER_PROMPTS: Record<ScenarioKey, string> = {
  'voice-1':
    "I just arrived at the site, so the construction site, and I can see, I think, like the entrance gate. There's some problems with it. It cannot be opened clearly for like a bigger truck to be able to pass through. So, like, there's a bit of a problem with the door, the entrance door of the construction site. So it might be an issue if we have like delivery trucks coming in. So yeah, but yeah, I'm heading in now. And yeah, like the ground is a bit like waterlogged because like the rain of last night. So there seemed to be like a lot of potholes and a little bit difficult for people to walk through the site. but yeah but i would go check with like the workers and see if everybody has on like their ppe and then make sure like all the safety rules are followed before like a construction commence i think today like you're floating the second floor so i guess it will be more of like checking the curing state of the concrete. Sorry, like they're going to be pouring concrete for like the second floor and then also like checking the current state of like the floor beneath because that because that was poured I think seven days ago The concrete strength might have reached its seven strength I guess like 30 MPa of strength. So I'm on my way to the workers and I'll check the current progress of the work. yeah so i see like uh they are like the the uh the workers for like the uh the mixed truck uh for the cement and then also uh the foreman for like uh the uh concrete works they're also like there uh i think i can count like uh six for one for like the concrete works and then two for the concrete mix, the concrete mix machine. So I would say like, well, so far like everything is going on. Well, so to ask when like the, if like how far like the work would be done for today and see if there has to be like further concrete pour for tomorrow. And also I check like if there is enough mix enough concrete mix for like to do this work and yeah and then I get back to it on that so i guess i go in the in the structure and then look around and see the quality of work and see yeah and see how like progress has been you know um yeah so i found like there's like a lot of uh tools like the on the floor which might be a safety issues for the workers so I'll try to see if there can be because I told like some of the workers to like pick the tools and I put it on the side of like one of like the tool shed but try to see like if we can find a way to like make things more organized so that there is safety on site and yeah yeah so so I'll go like to storage room and see like the materials that it has been delivered yeah so yeah so like yeah so far like the cement bags are here and like the plaster also is here and they like there's some like wood like it was how do I say I just had wood for the foam work I guess like tomorrow some of the formwork workers would be here to do the other side of the building, to create formwork for the other side of the building. And then the concrete works for that side would also commence afterwards and yeah so i guess like all those hair wood has been delivered and i see like the rebuys here some but like there a bit of rust in some so i don't know it's probably because of like last night rain and i guess like the storage room is a bit of it's a bit damp and like there's a bit of rust on the rebars that are stored here so we'd see like if we could like put some oil and lubricate them and it's like keep it to like uh how do you say prevent water from like uh touching like the iron in it so like to prevent the rust yeah but yeah so far like everything is good so i guess like there would be there'll be two more concrete mix trucks that will be coming later today so I'll see if I can stay for a couple of hours and see if I can meet with the truck delivery guys and then try to talk with them about like the other side of the building because like that those foam works would be started like tomorrow and then hopefully by next week we can have like the concrete mix done for that side and yeah so like yeah so i've gone up and then to check like the curing of like the concrete everything is fine like the great the quality of work is good so far so yeah",
  'voice-2':
    "yeah so this is like the 12 of April 2026 and it's like 7 30 in the morning I'm at the side and we're building a an LGS like frame for the modular house that we're supposed to like a send to like a client from the Stonebridge company yeah so the water is good like the weather condition is good like no rain for the past few days now today also there's no rain it's sunny and so far like the workers are now coming in so like we have let's say three three electricians and then four LGS framers that like start that will start like framing the shell of the structure and And yeah, the LGS panels are already here. Like all the structural frames are already here. And it like the flat screws and then some other types of screws for like the framing are still yet to be delivered But I guess the flat-heart screws would be enough for the initial starting point of the frame. So I'll go talk to some of the crews and see what's their progress. So I guess they already started the framing and they're still waiting for the other screw types, but they already started work. So everything is going as planned so far. But they complained about the site's condition because things are not organized at the warehouse. So where things are placed, like the equipment and machineries, help them work. So some of them have to find where those tools were. So I guess we have to find a way to organize the place so that it easier to find tools and to reduce the delay starting work So I go to storage room and see like which materials we have at the store and see like because like there supposed to be some deliveries I don know like when that would happen but I have to like check with like the store manager and see when the deliveries have been brought yeah okay so like we have some OSB boards and some VCL membranes for like a damp preventing yeah so I guess like that would be for like the flooring the flooring is not yet like probably next week the flooring will happen so like you're just like the wall framing that's going on currently with the LGS that have been delivered so I guess like they will only need like the OSB boards and some plywoods and then and then like you're just like the interior finish I guess like plaster but yeah but like currently they just have to like frame just like the initial layers of the wall and then allow the electricians to pass their wires and then have like that done before the wall finishes would be added to it so yeah so i guess like yeah probably just wait for like the i think the the store manager said like the plaster the wall plaster would be delivered tomorrow so yeah that would yeah i guess like the work is is it's on schedule that that wouldn't like create any delays so that's good yeah so yeah so so so for like uh yeah there is no other risk or issues on site apart from like the tools organization part and then also like making sure everybody wear like their safety helmets and and suits yeah so yeah so for like i guess like next steps would be finishing like the wall prints and then starting the the floors of the the modular unit and then yeah so tomorrow I would come back to site and see what's been was like the current progress so far so far today everything looks good",
  'voice-3':
    "I just arrived at the site. The ground is very very terrible for work and I think it's been raining last night the whole night and then this morning also. It's currently 10 a.m. in the morning. It stops raining but the ground is waterlogged and it's very difficult to work. on the site so but I would get to like the construction site where the construction is happening and then try to talk to some of the workers and see if what what can be done today so I have spoken to like few of the workers like you're the electricians are not here yet yeah but like the second floor has been floated and the concrete has hardened and I think it has been floated like since a week ago so the next phase of like the next phase of the world like installing like the drywalls can be done but like we're waiting on the electricians and then see what like what's like the project scope is because i had like some of them have not been paid for the like the old work like the past work they've done so i guess like this bill of worker issues with that and then we'll see like if we can put those as an areas about a backlog of pay and then they can start like the new work with the drywall and pass like the electric cables in the wall and yeah",
  'voice-4':
    "So I just arrived at the site. I'm on site right now. It's 10 a.m. in the morning and it's been raining all night until like this morning also. So yeah so like the the site is quite waterlogged like there is a lot of water and a lot of damper things let's see let me go check on the workers and see if everybody's here because like they're supposed to do like the trench for the foundation and to place like the reinforcement still for the Padfoot Foundation, but based on the current situation on site, I don't know if that can be done today, but I'll go check. So, yes, so I've... Short notes, short notes.",
  'voice-5':
    "yeah so the electricians have agreed to like start work on the drywall today and but they are having issues with the truck coming in because like because of the waterlog situation at site so we'd see if the work can actually be done today or we'd have to like postpone it for a couple of until like the site is good for work so yeah",
};

export const FIXTURE_CANONICALS = {
  transcribe: {
    vendor: 'openai' as Vendor,
    model: 'whisper-1',
    defaultScenario: DEFAULT_SCENARIO,
    audioUrl: (scenario: ScenarioKey) =>
      `https://fixtures.harpa.example/${scenario}.fixture.m4a`,
    name: (scenario: ScenarioKey) => `transcribe.${scenario}`,
  },
  summarize: {
    vendor: 'openai' as Vendor,
    model: 'gpt-4o-mini',
    // Must match `VOICE_SUMMARY_SYSTEM_PROMPT` (imported above) so
    // replay-mode hashes line up with the fixture files. Sharing the
    // string means changing the prompt in one place forces fixtures
    // to be re-recorded (`refresh-hashes.ts`) in lock-step.
    systemPrompt: VOICE_SUMMARY_SYSTEM_PROMPT,
    defaultScenario: DEFAULT_SCENARIO,
    userPrompt: (scenario: ScenarioKey) => SUMMARIZE_USER_PROMPTS[scenario],
    name: (scenario: ScenarioKey) => `summarize.${scenario}`,
  },
  /**
   * Report fixtures cover the five voice-note scenarios end-to-end.
   * Each `generate-report.voice-N.json` is hashed against a placeholder
   * `<notes payload voice-N>` user prompt — the actual concatenated
   * notes flow through only in live mode.
   *
   * Source: ../haru3-reports/supabase/functions/generate-report/index.ts
   * (canonical `SYSTEM_PROMPT`). NOTE: changing the system prompt
   * changes the request hash — re-record every generate-report.* fixture
   * via `pnpm --filter @harpa/ai-fixtures exec tsx scripts/refresh-hashes.ts`.
   */
  report: {
    vendor: 'openai' as Vendor,
    model: 'gpt-4o',
    systemPrompt: REPORT_SYSTEM_PROMPT,
    // Distinct system prompt for the *update* path. See
    // REPORT_UPDATE_SYSTEM_PROMPT — instructs the model to preserve
    // hand-edited fields while integrating new notes. No update
    // fixtures are checked in yet (would need a separate recording
    // pass); the system prompt is wired through for completeness.
    updateSystemPrompt: REPORT_UPDATE_SYSTEM_PROMPT,
    defaultScenario: DEFAULT_SCENARIO,
    userPrompt: (scenario: ScenarioKey) => `<notes payload ${scenario}>`,
    name: (scenario: ScenarioKey) => `generate-report.${scenario}`,
  },
} as const;

/**
 * Resolve a caller-supplied fixture name to a scenario key. Returns
 * `null` if the name does not match a known scenario suffix — callers
 * fall back to the default scenario for prompt normalisation, which
 * causes the underlying FixtureStore lookup to surface a clear
 * FixtureMissError if the requested file does not exist.
 */
function scenarioFromName(name: string): ScenarioKey | null {
  for (const s of SCENARIOS) {
    if (name.endsWith(s)) return s;
  }
  return null;
}

function pickMode(fixtureName?: string): FixtureMode {
  if (fixtureName) return 'replay';
  if (process.env.AI_LIVE === '1') return 'live';
  return 'replay';
}

function buildProvider(vendor: Vendor, fixtureName: string): AiProvider {
  return createProvider({ vendor, fixtureMode: pickMode(fixtureName), fixtureName });
}

async function withErrorWrap<T>(label: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof FixtureMissError) {
      // Surface the provider-level message so test failures are debuggable,
      // but route handlers map AiProviderError to a generic 502 envelope —
      // the FixtureMissError details never reach the wire.
      throw new AiProviderError(`${label}: ${err.message}`, err);
    }
    if (err instanceof AiProviderError) throw err;
    throw new AiProviderError(`${label} failed`, err);
  }
}

/**
 * Run the provider call and (best-effort) record a usage row. The
 * recorder never throws — accounting failures must not surface to the
 * user-facing request. On provider failure we still record an `error`
 * row so cost postmortems include attempted calls.
 *
 * Vendor SDK responses vary in usage shape. Today every code path
 * exercises @harpa/ai-fixtures, which standardises on
 * `{ input, output }`. Live mode will need adapters per vendor — see
 * docs/v4/plan-p3-feature-build.md §P3.15.5 vendor table.
 */
async function withUsageAccounting<T extends { usage?: { input?: number; output?: number; cached?: number } }>(
  ctx: LlmUsageContext | undefined,
  meta: { vendor: Vendor; model: string; operation: LlmOperation; fixtureMode: FixtureMode },
  label: string,
  fn: () => Promise<T>,
): Promise<T> {
  const start = Date.now();
  const record = (status: 'ok' | 'error', usage?: { input?: number; output?: number; cached?: number }) => {
    if (!ctx) return;
    const params = {
      userId: ctx.userId,
      projectId: ctx.projectId ?? null,
      reportId: ctx.reportId ?? null,
      vendor: meta.vendor,
      model: meta.model,
      operation: meta.operation,
      inputTokens: usage?.input ?? 0,
      outputTokens: usage?.output ?? 0,
      cachedTokens: usage?.cached ?? 0,
      latencyMs: Date.now() - start,
      fixtureMode: meta.fixtureMode,
      status,
    };
    // Wrap in the scoped accessor so the INSERT runs under the caller's
    // RLS context (`llm_usage_events_self_insert` enforces this). We
    // await so callers can rely on the row being visible before the
    // response leaves the handler — important for the integration test
    // and for /me/usage immediately after a write.
    return ctx.db((d) => recordLlmUsage(d, params));
  };
  try {
    const out = await withErrorWrap(label, fn);
    await record('ok', out.usage);
    return out;
  } catch (err) {
    await record('error');
    throw err;
  }
}

export interface TranscribeInput {
  /**
   * The real (signed) audio URL the provider would fetch. In replay
   * mode this is ignored and the canonical fixture URL is used.
   */
  audioUrl: string;
  fixtureName?: string;
  language?: string;
  /**
   * Optional accounting context. When provided, a row lands in
   * `app.llm_usage_events` with operation='transcribe'. Whisper-class
   * providers don't expose tokens, so the row carries zero tokens —
   * downstream aggregations distinguish transcribe usage by operation,
   * not token count.
   */
  usageContext?: LlmUsageContext;
}

export interface TranscribeOutput {
  text: string;
  durationSec?: number;
  vendor: Vendor;
  model: string;
}

export async function transcribe(input: TranscribeInput): Promise<TranscribeOutput> {
  const scenario =
    (input.fixtureName ? scenarioFromName(input.fixtureName) : null) ??
    FIXTURE_CANONICALS.transcribe.defaultScenario;
  const fixtureName =
    input.fixtureName ?? FIXTURE_CANONICALS.transcribe.name(scenario);
  const mode = pickMode(fixtureName);
  const audioUrl =
    mode === 'replay'
      ? FIXTURE_CANONICALS.transcribe.audioUrl(scenario)
      : input.audioUrl;
  const vendor = FIXTURE_CANONICALS.transcribe.vendor;
  const model = FIXTURE_CANONICALS.transcribe.model;
  const provider = buildProvider(vendor, fixtureName);
  const result = await withUsageAccounting(
    input.usageContext,
    { vendor, model, operation: 'transcribe', fixtureMode: mode },
    'transcribe',
    () => provider.transcribe({ audioUrl }) as Promise<Omit<TranscribeOutput, 'vendor' | 'model'> & { usage?: undefined }>,
  );
  return { ...result, vendor, model };
}

export interface ChatInput {
  systemPrompt?: string;
  userPrompt: string;
  model?: string;
  fixtureName?: string;
  temperature?: number;
  maxTokens?: number;
  /**
   * Optional vendor override. Tracked for usage accounting only —
   * fixture selection no longer depends on vendor (a single set of
   * OpenAI fixtures covers every scenario in replay mode).
   */
  vendor?: Vendor;
  /** Optional accounting context — see `transcribe` for semantics. */
  usageContext?: LlmUsageContext;
}

export interface ChatOutput {
  text: string;
  vendor: Vendor;
  model: string;
}

export async function chat(input: ChatInput): Promise<ChatOutput> {
  const vendor: Vendor = input.vendor ?? FIXTURE_CANONICALS.summarize.vendor;
  const scenario =
    (input.fixtureName ? scenarioFromName(input.fixtureName) : null) ??
    FIXTURE_CANONICALS.summarize.defaultScenario;
  const fixtureName =
    input.fixtureName ?? FIXTURE_CANONICALS.summarize.name(scenario);
  const canonicalModel = FIXTURE_CANONICALS.summarize.model;
  const mode = pickMode(fixtureName);
  const req =
    mode === 'replay'
      ? {
          model: canonicalModel,
          systemPrompt: FIXTURE_CANONICALS.summarize.systemPrompt,
          userPrompt: FIXTURE_CANONICALS.summarize.userPrompt(scenario),
        }
      : {
          model: input.model ?? canonicalModel,
          systemPrompt: input.systemPrompt,
          userPrompt: input.userPrompt,
          temperature: input.temperature,
          maxTokens: input.maxTokens,
        };
  const provider = buildProvider(vendor, fixtureName);
  const out = await withUsageAccounting(
    input.usageContext,
    { vendor, model: req.model, operation: 'chat', fixtureMode: mode },
    'chat',
    () => provider.chat(req),
  );
  return { text: out.text, vendor, model: req.model };
}

// ---------------------------------------------------------------------------
// Report generation
// ---------------------------------------------------------------------------

export type ReportBody = z.infer<typeof reportSchemas.reportBody>;

export interface GenerateReportInput {
  /**
   * Concatenated note content to feed the model. Ignored in replay mode
   * (the canonical user prompt is substituted so the request hash matches
   * the recorded fixture).
   */
  notes: string;
  /**
   * Optional existing report body. When provided, switches to the
   * UPDATE path: uses `REPORT_UPDATE_SYSTEM_PROMPT` and prepends an
   * `EXISTING REPORT:` block to the user prompt so the model preserves
   * manual edits rather than regenerating from scratch.
   *
   * In replay mode the contents of `existingBody` are replaced with
   * the canonical update payload so the request hash matches the
   * recorded fixture. A non-null value selects the update fixture
   * (`generate-report.update.*`); pass `null` (or omit) for the
   * cold-start path.
   */
  existingBody?: ReportBody | null;
  fixtureName?: string;
  /**
   * Optional vendor override. Tracked for usage accounting only —
   * fixture selection no longer depends on vendor. Defaults to
   * `openai`.
   */
  vendor?: Vendor;
  /** Optional accounting context — see `transcribe` for semantics. */
  usageContext?: LlmUsageContext;
}

export interface GenerateReportOutput {
  /** Parsed + schema-validated body, ready to persist. */
  body: ReportBody;
  /** Raw model text (the JSON it returned, before parsing). */
  text: string;
  /** System prompt used in the request. Surfaced for the mobile Debug tab. */
  systemPrompt: string;
  /** User prompt sent to the provider (notes payload or replay canonical). */
  userPrompt: string;
  /** Model identifier used. */
  model: string;
  /** Vendor used. */
  vendor: Vendor;
}

/**
 * Generate a structured report body from notes via the AI provider.
 *
 * The model returns a JSON string matching `api-contract.reports.reportBody`.
 * We parse + validate here so the route handler can persist a known-good
 * shape; any parse/schema mismatch is wrapped as `AiProviderError` so it
 * surfaces as a 502 (provider misbehaviour) rather than a 500.
 */
export async function generateReport(input: GenerateReportInput): Promise<GenerateReportOutput> {
  const canonicals = FIXTURE_CANONICALS.report;
  const vendor: Vendor = input.vendor ?? canonicals.vendor;
  const canonicalModel = canonicals.model;
  const isUpdate = input.existingBody != null;
  const scenario =
    (input.fixtureName ? scenarioFromName(input.fixtureName) : null) ??
    canonicals.defaultScenario;
  const fixtureName = input.fixtureName ?? canonicals.name(scenario);
  const mode = pickMode(fixtureName);

  // Build the LIVE user prompt — what we'd send the real provider.
  // In replay mode this is overridden with the canonical string so the
  // request hash matches the recorded fixture, but it's still surfaced
  // back to the caller via the response so the Debug tab shows what
  // the operator actually fed in.
  const liveUserPrompt = isUpdate
    ? `EXISTING REPORT:\n${JSON.stringify(input.existingBody)}\n\nNEW NOTES:\n${input.notes}`
    : input.notes;

  // Pick the right system prompt for the LIVE path. Update prompt
  // preserves manual edits; cold-start prompt generates from scratch.
  // Replay mode always uses REPORT_SYSTEM_PROMPT because that's the
  // prompt the checked-in voice fixtures were recorded with (no
  // update-flavour fixtures exist on disk).
  const liveSystemPrompt = isUpdate
    ? canonicals.updateSystemPrompt
    : canonicals.systemPrompt;

  const req =
    mode === 'replay'
      ? {
          model: canonicalModel,
          systemPrompt: canonicals.systemPrompt,
          // Map the requested fixture name to its recorded canonical user
          // prompt. Unknown names fall through to the default scenario —
          // they will FixtureMiss against the on-disk store and surface
          // as a generic 502, matching the voice route's behaviour.
          userPrompt: canonicals.userPrompt(scenario),
        }
      : {
          model: canonicalModel,
          systemPrompt: liveSystemPrompt,
          userPrompt: liveUserPrompt,
        };

  const provider = buildProvider(vendor, fixtureName);
  const out = await withUsageAccounting(
    input.usageContext,
    { vendor, model: canonicalModel, operation: 'generate_report', fixtureMode: mode },
    'generateReport',
    () => provider.chat(req),
  );

  let parsed: unknown;
  try {
    parsed = JSON.parse(out.text);
  } catch (err) {
    throw new AiProviderError('generateReport: provider response was not valid JSON', err);
  }
  const result = reportSchemas.reportBody.safeParse(parsed);
  if (!result.success) {
    // Don't leak the failing payload — keep the error surface generic.
    throw new AiProviderError('generateReport: provider response did not match report schema');
  }
  return {
    body: result.data,
    text: out.text,
    systemPrompt: req.systemPrompt,
    // Always surface the real (formatted) live prompt to the caller so
    // the mobile Debug tab shows what the operator actually fed in. The
    // provider request itself uses `req.userPrompt`, which is the
    // canonical placeholder in replay mode (so the recorded hash
    // matches) — but that's not what we want operators to see.
    userPrompt: liveUserPrompt.length > 0 ? liveUserPrompt : req.userPrompt,
    model: req.model,
    vendor,
  };
}
