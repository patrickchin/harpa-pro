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
      systemPrompt: 'Summarise the following transcript into a concise site-note body.',
      userPrompt: 'Site arrival 8:15. Crew of three on rebar...',
    });
    expect(r.text).toMatch(/concrete pour delayed/i);
  });
});
