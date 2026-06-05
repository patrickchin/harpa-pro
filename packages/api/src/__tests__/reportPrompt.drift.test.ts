/**
 * Drift guard: report system prompts vs. `reportBody` schema.
 *
 * Background — every site report flows through:
 *
 *   notes → GPT-4o (REPORT_SYSTEM_PROMPT) → JSON → reportBody.safeParse
 *
 * If the prompt and schema disagree on field names, the live path
 * fails with a generic 502 ("AI provider request failed.") while
 * recorded fixtures keep passing — because fixture responses are
 * hand-massaged to match whatever shape the schema currently
 * expects. That is exactly the bug in
 * docs/bugs/README.md "Prompt/schema drift in generateReport"
 * and the failure mode described in docs/v4/pitfalls.md Pitfall 13.
 *
 * This test is intentionally cheap and offline so it runs on every
 * PR. It asserts:
 *   - every required `reportBody` top-level field is mentioned in
 *     both prompts;
 *   - every nested field name (e.g. `temperatureC`, `summarySections`)
 *     appears in both prompts;
 *   - v3 vocabulary (the things that caused the original drift)
 *     does NOT appear.
 *
 * The complementary live-LLM lane (.github/workflows/ai-live.yml)
 * actually executes the prompt against OpenAI to catch any model
 * behaviour that drifts even when the field names match.
 */
import { describe, it, expect } from 'vitest';
import {
  REPORT_SYSTEM_PROMPT,
  REPORT_UPDATE_SYSTEM_PROMPT,
} from '../prompts/reportGeneration.js';

const REQUIRED_FIELDS = [
  // top-level
  'meta',
  'weather',
  'workers',
  'materials',
  'issues',
  'nextSteps',
  'summarySections',
  // meta subfields
  'summary',
  'visitDate',
  // weather subfields
  'condition',
  'temperatureC',
  'windKph',
  'impact',
  // workers subfields
  'role',
  'count',
  'hours',
  // materials subfields
  'name',
  'quantity',
  'unit',
  'status',
  // issues subfields
  'title',
  'severity',
  'description',
  'action',
  // summarySections subfields
  'body',
];

const SEVERITY_VALUES = ['"low"', '"medium"', '"high"'];

const FORBIDDEN_V3_VOCAB = [
  // The v3 envelope that the live response.text used to be wrapped in.
  // `"report":` (with colon) catches the JSON wrapper; bare "report"
  // appears in English prose ("the report object") so we don't ban it.
  '"report":',
  // v3-only field names — replaced by v4 equivalents.
  'quantityUnit',
  'actionRequired',
  // v3 had a workers OBJECT with `roles` / `totalWorkers`. v4 is an array.
  // (We allow the prompt to mention "role" in the singular as a field name.)
  'totalWorkers',
  // v3 had a free-form `category` on issues; v4 dropped it.
  '"category"',
];

describe('report prompts vs. reportBody schema (offline drift guard)', () => {
  describe.each([
    ['REPORT_SYSTEM_PROMPT', REPORT_SYSTEM_PROMPT],
    ['REPORT_UPDATE_SYSTEM_PROMPT', REPORT_UPDATE_SYSTEM_PROMPT],
  ])('%s', (_name, prompt) => {
    it.each(REQUIRED_FIELDS)('mentions required field %s', (field) => {
      expect(prompt).toContain(field);
    });

    it.each(SEVERITY_VALUES)('mentions allowed severity literal %s', (lit) => {
      expect(prompt).toContain(lit);
    });

    it.each(FORBIDDEN_V3_VOCAB)('does NOT contain v3 vocab %s', (banned) => {
      expect(prompt).not.toContain(banned);
    });

    // HARPA-PRO-6 regression guard: the schema allows
    // `workers[].count: null`, so the prompt must advertise the
    // nullable form. If this drifts back to a non-nullable hint,
    // the LLM emits null anyway and the route 502s.
    it('declares workers[].count as int>=0|null', () => {
      expect(prompt).toContain('"count": int>=0|null');
    });
    it('does NOT advertise workers[].count as strict int>=0', () => {
      expect(prompt).not.toMatch(/"count": int>=0(?!\|null)/);
    });

    it('explicitly forbids the "report" wrapper', () => {
      // Both prompts must instruct the model to emit the unwrapped
      // body — otherwise GPT-4o re-introduces the v3 envelope.
      expect(prompt).toMatch(/do NOT wrap.*"report"/i);
    });

    it('explicitly forbids markdown fences', () => {
      expect(prompt).toMatch(/markdown fences/i);
    });
  });
});
