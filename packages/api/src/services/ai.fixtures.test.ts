/**
 * Per-vendor fixture coverage.
 *
 * For every Vendor the user-settings UI can persist, assert that the
 * checked-in `summarize.basic.<vendor>` and
 * `generate-report.{full,incomplete}.<vendor>` fixtures replay end-to-end
 * via the public AI service API. This catches:
 *
 *  1. A fixture file is missing for a supported vendor (Pitfall 2).
 *  2. The recorded `requestHash` drifts from the canonical inputs in
 *     `FIXTURE_CANONICALS` / `VENDOR_MODELS` (silent breakage).
 *
 * No real provider is hit — replay mode is the default, gated by
 * `process.env.AI_LIVE === '1'` being false.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { chat, generateReport } from './ai.js';
import type { AiVendor } from './settings.js';

const VENDORS: AiVendor[] = ['openai', 'kimi', 'anthropic', 'google', 'zai', 'deepseek'];

describe('AI fixtures — per-vendor replay coverage', () => {
  beforeEach(() => {
    delete process.env.AI_LIVE;
  });

  for (const vendor of VENDORS) {
    describe(`vendor=${vendor}`, () => {
      it('chat() replays summarize.basic', async () => {
        const out = await chat({ vendor, userPrompt: 'ignored in replay' });
        expect(out.text).toMatch(/Crew arrived 8:15/);
      });

      it('generateReport() replays generate-report.full', async () => {
        const out = await generateReport({ vendor, notes: 'ignored in replay' });
        expect(out.body.workers?.length ?? 0).toBeGreaterThan(0);
        expect(out.body.summarySections?.length ?? 0).toBeGreaterThan(0);
      });

      it('generateReport() replays generate-report.incomplete', async () => {
        const out = await generateReport({
          vendor,
          notes: 'ignored in replay',
          fixtureName: 'generate-report.incomplete',
        });
        expect(out.body.workers ?? []).toHaveLength(0);
        expect(out.body.summarySections?.[0]?.title).toBe('Notes captured');
      });
    });
  }
});
