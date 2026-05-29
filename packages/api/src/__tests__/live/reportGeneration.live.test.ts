/**
 * Live-LLM smoke for `generateReport()` — runs against real Kimi.
 *
 * This test bypasses fixtures (no `fixtureName` → `pickMode` picks
 * `live`) and exercises the path that broke in dev when the prompt
 * and `reportBody` schema drifted (the v3→v4 mismatch — see
 * docs/bugs/README.md). Replay-mode tests can't catch that because
 * fixture responses are hand-massaged to the current schema, so
 * this lane is the safety net.
 *
 * Triggered only by:
 *   - `.github/workflows/ai-live.yml` (dispatch + push/PR touching
 *      prompts/services/contract/providers/fixtures)
 *   - manual: `AI_LIVE=1 KIMI_API_KEY=… pnpm --filter @harpa/api test:live`
 *
 * Expected cost: ~3 short kimi-k2-instruct calls per run.
 *
 * No skip-guard: this file is only loaded by `vitest.live.config.ts`
 * (the `test:live` script). If you run it, you mean it. Missing
 * `KIMI_API_KEY` skips gracefully — add the key to Doppler `dev`
 * config to enable the test in CI.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { reports as reportSchemas } from '@harpa/api-contract';
import { generateReport } from '../../services/ai.js';

const HAS_KIMI_KEY = !!process.env.KIMI_API_KEY;
const describeOrSkip = HAS_KIMI_KEY ? describe : describe.skip;

// One realistic notes payload per scenario. Kept short to keep
// token cost predictable; the schema check is what we care about,
// not narrative quality.
const SCENARIOS: Array<{ name: string; notes: string }> = [
  {
    name: 'voice-1 — wet weather, concrete pour',
    notes:
      'Site visit 12 April. Overnight rain left the ground waterlogged with potholes. ' +
      'Second floor concrete pour in progress with 6 concrete workers and 2 mix operators. ' +
      'First floor slab ~7 days old, est. 30 MPa. Entrance gate too narrow for delivery trucks. ' +
      'Rebar in storage has surface rust from damp conditions; recommend oil treatment.',
  },
  {
    name: 'voice-2 — formwork prep',
    notes:
      'East footing rebar laid by 3 steel fixers. 2 carpenters on formwork prep. ' +
      'Weather cloudy, ~14°C, light wind. Delivered 12 m³ of C30 concrete, condition OK. ' +
      'Issue: missing torque wrench, may delay tomorrow morning. Action: order replacement today.',
  },
  {
    name: 'voice-3 — minimal notes',
    notes:
      'Quick walk-through. No workers on site (weekend). All materials secure. No issues.',
  },
];

describeOrSkip('generateReport — live Kimi', () => {
  beforeAll(() => {
    if (process.env.AI_LIVE !== '1') {
      throw new Error(
        'test:live invoked without AI_LIVE=1. This lane MUST hit the real provider; ' +
          'set AI_LIVE=1 KIMI_API_KEY=… or run via the ai-live CI workflow.',
      );
    }
    if (!process.env.KIMI_API_KEY) {
      throw new Error(
        'KIMI_API_KEY is required for test:live. Pull it from Doppler (config `dev`) ' +
          'or rely on the ai-live workflow which fetches it automatically.',
      );
    }
  });

  it.each(SCENARIOS)(
    'returns a schema-valid reportBody for: $name',
    async ({ notes }) => {
      // Default-wiring assertion: do NOT pass `vendor` here. The route
      // path resolves vendor from per-user settings (which default to
      // `openai`); reports are then routed to canonicals.vendor inside
      // `generateReport`. Stubbing `vendor: 'kimi'` here would mask the
      // mismatch that caused docs/bugs/2026-05-29-report-vendor-canonical-mismatch.md.
      const result = await generateReport({ notes });

      // The service itself runs safeParse and throws AiProviderError on
      // miss — getting here means the body matched. Re-assert anyway so
      // the failure message is clear if generateReport's validation is
      // ever relaxed.
      expect(result.fixtureMode).toBe('live');
      expect(result.vendor).toBe('kimi');
      const parsed = reportSchemas.reportBody.safeParse(result.body);
      if (!parsed.success) {
        const issues = parsed.error.issues
          .map((i) => `${i.path.join('.') || '<root>'}:${i.code}`)
          .join(', ');
        throw new Error(`reportBody validation failed: ${issues}`);
      }
      // Quick spot-checks on the contract — these are the fields that
      // drifted in the v3→v4 migration, so we want them explicitly
      // present on every successful run.
      expect(parsed.data).toHaveProperty('summarySections');
      expect(Array.isArray(parsed.data.workers)).toBe(true);
      expect(Array.isArray(parsed.data.materials)).toBe(true);
      for (const issue of parsed.data.issues) {
        expect(['low', 'medium', 'high']).toContain(issue.severity);
      }
    },
    60_000,
  );
});
