import { describe, it, expect } from 'vitest';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createProvider } from './index.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(here, '../fixtures');

describe('committed fixtures replay end-to-end', () => {
  it('transcribe.basic replays the canonical site-arrival transcript', async () => {
    const p = createProvider({
      vendor: 'openai',
      fixtureMode: 'replay',
      fixtureName: 'transcribe.basic',
      fixturesDir,
    });
    const r = await p.transcribe({
      audioUrl: 'https://fixtures.harpa.example/voice.fixture.m4a',
    });
    expect(r.text).toMatch(/Site arrival/);
  });

  it('summarize.basic replays a concise note body', async () => {
    const p = createProvider({
      vendor: 'openai',
      fixtureMode: 'replay',
      fixtureName: 'summarize.basic',
      fixturesDir,
    });
    const r = await p.chat({
      model: 'gpt-4o-mini',
      // Must match FIXTURE_CANONICALS.summarize.systemPrompt /
      // VOICE_SUMMARY_SYSTEM_PROMPT — the replay layer hashes both
      // prompts and any drift fails the lookup.
      systemPrompt:
        'You are a construction site assistant turning a single voice memo into a short headline and a concise note body.\n\nINPUT\n- A raw transcript of one voice memo recorded on site by a foreman, engineer, or worker. It may include filler words, false starts, side conversations, or background noise transcribed as gibberish.\n\nOUTPUT\n- Return a single JSON object on one line with exactly two string fields: "title" and "summary". No prose, no markdown, no code fences, no extra keys.\n- "title": about 5\u20136 words (not a hard limit, but stay close). A factual headline of the most operationally relevant fact. No trailing period. Plain English, no quotes, no labels like "Title:".\n- "summary": 1\u20132 sentences, third person, past tense, plain English. Lead with the most operationally relevant fact (what happened, what was decided, what was observed). Strip filler ("um", "you know", "like"), greetings, sign-offs, and meta-commentary about the recording.\n- If the transcript is unintelligible or empty, return {"title":"Voice memo unintelligible","summary":"Voice memo recorded but no intelligible content was captured."}\n- Do NOT invent facts the transcript does not contain.\n- Do NOT include the speaker\'s name.\n\nReturn only the JSON object. Nothing before or after it.',
      userPrompt: 'Site arrival 8:15. Crew of three on rebar...',
    });
    // Response is a JSON envelope; assert both fields parse cleanly.
    const parsed = JSON.parse(r.text);
    expect(parsed.title).toMatch(/concrete pour delayed/i);
    expect(parsed.summary).toMatch(/concrete pour was delayed/i);
  });
});
