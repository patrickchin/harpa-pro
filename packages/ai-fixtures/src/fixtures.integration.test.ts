import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createProvider } from './index.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(here, '../fixtures');

// Replay-layer hashing covers the request payload byte-for-byte, so
// asserting against the canonical fixture inputs (read straight off
// disk) keeps this test stable when the system prompt or transcript
// changes — re-recording with `refresh-hashes.ts` updates both the
// fixture and what we read here in lock-step.
function fixture(name: string) {
  return JSON.parse(readFileSync(resolve(fixturesDir, `${name}.json`), 'utf8'));
}

describe('committed fixtures replay end-to-end', () => {
  it('transcribe.voice-1 replays the canonical site-walk transcript', async () => {
    const f = fixture('transcribe.voice-1');
    const p = createProvider({
      vendor: 'groq',
      fixtureMode: 'replay',
      fixtureName: 'transcribe.voice-1',
      fixturesDir,
    });
    const r = await p.transcribe({ audioUrl: f.request.audioUrl });
    expect(r.text).toMatch(/construction site/i);
    expect(r.text).toMatch(/entrance gate/i);
  });

  it('summarize.voice-1 replays a concise note body', async () => {
    const f = fixture('summarize.voice-1');
    const p = createProvider({
      vendor: 'openai',
      fixtureMode: 'replay',
      fixtureName: 'summarize.voice-1',
      fixturesDir,
    });
    const r = await p.chat({
      model: f.request.model,
      systemPrompt: f.request.systemPrompt,
      userPrompt: f.request.userPrompt,
    });
    // Response is a JSON envelope; assert both fields parse cleanly.
    const parsed = JSON.parse(r.text);
    expect(parsed.title).toMatch(/second floor concrete pour/i);
    expect(parsed.summary).toMatch(/waterlogged/i);
  });
});
