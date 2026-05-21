/**
 * Canonical system prompt for the voice-note summary chat call inside
 * the `POST /reports/{report}/notes/voice` aggregator (see
 * docs/v4/arch-voice-pipeline.md §D1).
 *
 * Kept in its own module so we can:
 *   - assert it byte-for-byte in tests without dragging the whole
 *     route into the test surface;
 *   - record per-vendor fixtures against a single canonical string;
 *   - update it in one place when product wants tone/structure
 *     changes — bumping the fixture hash in lock-step.
 *
 * Replay-mode callers never see this string (services/ai.ts
 * substitutes `FIXTURE_CANONICALS.summarize.systemPrompt` for hash
 * stability); live-mode callers do. The prompt is intentionally
 * narrower than the report-generation system prompt — voice notes
 * are short verbal updates from one person at a moment in time, not
 * a structured rollup.
 */
export const VOICE_SUMMARY_SYSTEM_PROMPT = `You are a construction site assistant turning a single voice memo into a short headline and a concise note body.

INPUT
- A raw transcript of one voice memo recorded on site by a foreman, engineer, or worker. It may include filler words, false starts, side conversations, or background noise transcribed as gibberish.

OUTPUT
- Return a single JSON object on one line with exactly two string fields: "title" and "summary". No prose, no markdown, no code fences, no extra keys.
- "title": about 5–6 words (not a hard limit, but stay close). A factual headline of the most operationally relevant fact. No trailing period. Plain English, no quotes, no labels like "Title:".
- "summary": 1–2 sentences, third person, past tense, plain English. Lead with the most operationally relevant fact (what happened, what was decided, what was observed). Strip filler ("um", "you know", "like"), greetings, sign-offs, and meta-commentary about the recording.
- If the transcript is unintelligible or empty, return {"title":"Voice memo unintelligible","summary":"Voice memo recorded but no intelligible content was captured."}
- Do NOT invent facts the transcript does not contain.
- Do NOT include the speaker's name.

Return only the JSON object. Nothing before or after it.`;

/**
 * Build the system prompt for a given recording language. Today this
 * just returns the canonical English prompt — the language is
 * surfaced into the prompt only when we add localisation. Keeping the
 * function signature stable means the aggregator route doesn't need
 * to change when we do.
 */
export function voiceSummarySystemPrompt(_language?: string): string {
  return VOICE_SUMMARY_SYSTEM_PROMPT;
}

/**
 * Derive a very short headline from a summary string.
 *
 * Used as a **fallback** when the LLM didn't return parseable JSON
 * (see `parseVoiceSummaryResponse`). The new prompt asks the model
 * to return both title + summary directly; this heuristic keeps the
 * aggregator working when the model misbehaves.
 *
 * Rules:
 *   - Strip leading/trailing whitespace.
 *   - Take the first sentence-ish chunk (up to `.`, `!`, `?`, or `\n`).
 *   - Collapse internal whitespace.
 *   - Cap at `MAX_TITLE_CHARS` (cuts on a word boundary when possible)
 *     and append `…` if truncated.
 *   - Return `null` for empty / whitespace-only input.
 */
export const MAX_TITLE_CHARS = 80;

export function deriveTitleFromSummary(summary: string | null | undefined): string | null {
  if (!summary) return null;
  const trimmed = summary.trim();
  if (!trimmed) return null;
  const sentenceEnd = trimmed.search(/[.!?\n]/);
  const head =
    sentenceEnd > 0 ? trimmed.slice(0, sentenceEnd).trim() : trimmed;
  const collapsed = head.replace(/\s+/g, ' ');
  if (collapsed.length <= MAX_TITLE_CHARS) return collapsed || null;
  const slice = collapsed.slice(0, MAX_TITLE_CHARS);
  const lastSpace = slice.lastIndexOf(' ');
  const cut = lastSpace > MAX_TITLE_CHARS * 0.6 ? slice.slice(0, lastSpace) : slice;
  return `${cut.trimEnd()}…`;
}

/**
 * Parse the LLM response into `{title, summary}`.
 *
 * The system prompt asks for a single JSON object with exactly two
 * string fields. Real models occasionally wrap the JSON in ```json
 * fences or add stray prose either side — extract the first balanced
 * `{...}` block and `JSON.parse` that. If parsing fails or yields the
 * wrong shape, degrade gracefully: treat the whole text as the
 * summary and derive a title heuristically. The aggregator never
 * fails just because the model didn't follow the JSON contract.
 */
export interface VoiceSummaryParsed {
  title: string | null;
  summary: string;
}

export function parseVoiceSummaryResponse(raw: string): VoiceSummaryParsed {
  const fallback = (text: string): VoiceSummaryParsed => ({
    title: deriveTitleFromSummary(text),
    summary: text.trim(),
  });
  if (!raw) return { title: null, summary: '' };

  // Strip ```json fences if present.
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = (fenced?.[1] ?? raw).trim();

  // Find the first balanced `{...}` block — tolerant of leading/trailing prose.
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) return fallback(raw);

  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return fallback(raw);
  }
  if (!parsed || typeof parsed !== 'object') return fallback(raw);
  const obj = parsed as Record<string, unknown>;
  const summary = typeof obj.summary === 'string' ? obj.summary.trim() : '';
  const titleRaw = typeof obj.title === 'string' ? obj.title.trim() : '';
  if (!summary) return fallback(raw);
  // Normalise: collapse whitespace, drop trailing terminal punctuation.
  const title = titleRaw
    ? titleRaw.replace(/\s+/g, ' ').replace(/[.!?]+$/, '').trim() || null
    : deriveTitleFromSummary(summary);
  // Hard cap at the column CHECK constraint (200) so we can never 500
  // on a verbose model. Soft target is ~5–6 words; we don't truncate
  // mid-sentence past the soft target.
  const cappedTitle = title && title.length > 200 ? `${title.slice(0, 199)}…` : title;
  return { title: cappedTitle, summary };
}
