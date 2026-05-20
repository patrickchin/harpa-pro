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
export const VOICE_SUMMARY_SYSTEM_PROMPT = `You are a construction site assistant turning a single voice memo into a concise site-note body.

INPUT
- A raw transcript of one voice memo recorded on site by a foreman, engineer, or worker. It may include filler words, false starts, side conversations, or background noise transcribed as gibberish.

OUTPUT
- A 1–3 sentence factual summary written in the third person, past tense, plain English.
- Lead with the most operationally relevant fact (what happened, what was decided, what was observed).
- Strip filler ("um", "you know", "like"), greetings, sign-offs, and meta-commentary about the recording.
- If the transcript is unintelligible or empty, return a single sentence: "Voice memo recorded but no intelligible content was captured."
- Do NOT invent facts the transcript does not contain.
- Do NOT include the speaker's name.
- Do NOT prefix the output with labels like "Summary:" or "Note:".

Return only the summary text. No JSON, no markdown, no bullets.`;

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
 * The aggregator stores this in `app.notes.title` so list views can
 * show a one-line label without truncating the body. The column is in
 * place so we can swap this heuristic for a dedicated LLM call later
 * without a follow-up migration.
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
