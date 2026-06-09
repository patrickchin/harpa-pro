/**
 * Drift guard: report system prompts vs. `reportBody` schema.
 *
 * Background — every site report flows through:
 *
 *   notes → LLM (REPORT_SYSTEM_PROMPT) → JSON → reportBody.safeParse
 *
 * If the prompt and schema disagree on field names OR on nullability,
 * the live path fails with a generic 502 ("AI provider request
 * failed.") while recorded fixtures keep passing — because fixture
 * responses are hand-massaged to match whatever shape the schema
 * currently expects. That is exactly the family of bugs in
 * `docs/bugs/README.md` (2026-05-23, 2026-05-28, 2026-06-05) and the
 * failure mode described in `docs/v4/pitfalls.md` Pitfall 13.
 *
 * This test is intentionally cheap and offline so it runs on every
 * PR. It asserts:
 *   - every required `reportBody` top-level field is mentioned in
 *     both prompts;
 *   - every scalar leaf (e.g. `temperatureC`, `count`) has the
 *     correct type hint (`int>=0|null`, `num>=0|null`, `str`, …) in
 *     both prompts. The expected hints are GENERATED from
 *     `reportBody` itself so the schema is the single source of
 *     truth — flipping a field to `.nullable()` without updating the
 *     prompts fails this test immediately;
 *   - v3 vocabulary (the things that caused the original drift)
 *     does NOT appear.
 *
 * The complementary live-LLM lane (`.github/workflows/ai-live.yml`)
 * actually executes the prompts against OpenAI to catch value-shape
 * drift that the offline guard cannot see.
 */
import { describe, expect, it } from 'vitest';
import { reports as reportSchemas } from '@harpa/api-contract';
import { z } from 'zod';
import {
  REPORT_SYSTEM_PROMPT,
  REPORT_UPDATE_SYSTEM_PROMPT,
} from '../prompts/reportGeneration.js';

// ── Schema reflection ────────────────────────────────────────────
//
// Walk reportBody and emit one entry per scalar leaf. Each entry
// carries a JSON-path-ish `path` (purely for assertion messages),
// the leaf field `name` (what we grep for in the prompt), and the
// `hint` string we expect the prompt to advertise next to it.
//
// We deliberately ignore container shapes (arrays, objects) — the
// existing free-form "top-level fields are mentioned" check still
// covers those, and prompts spell containers out as JSON syntax
// (`{`, `[`) rather than a single hint string we could match on.

type Leaf = { path: string; name: string; hint: string };

function isNullable(schema: z.ZodTypeAny): boolean {
  if (schema instanceof z.ZodNullable) return true;
  if (schema instanceof z.ZodOptional) return isNullable(schema.unwrap());
  return false;
}

function unwrap(schema: z.ZodTypeAny): z.ZodTypeAny {
  while (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) {
    schema = schema.unwrap();
  }
  return schema;
}

function hintFor(schema: z.ZodTypeAny): string {
  const nullable = isNullable(schema);
  const core = unwrap(schema);

  if (core instanceof z.ZodString) {
    return nullable ? 'str|null' : 'str';
  }
  if (core instanceof z.ZodNumber) {
    const checks = core._def.checks ?? [];
    const isInt = checks.some((c) => c.kind === 'int');
    const isNonNeg = checks.some(
      (c) => c.kind === 'min' && c.value === 0 && c.inclusive,
    );
    const head = isInt ? 'int' : 'num';
    const bound = isNonNeg ? '>=0' : '';
    return nullable ? `${head}${bound}|null` : `${head}${bound}`;
  }
  if (core instanceof z.ZodEnum) {
    const opts = (core.options as string[]).map((o) => `"${o}"`).join('|');
    return nullable ? `${opts}|null` : opts;
  }
  if (core instanceof z.ZodBoolean) {
    return nullable ? 'bool|null' : 'bool';
  }
  // Date-ish — visitDate is `isoDateTime.nullable()` (ZodEffects)
  // and the prompt advertises it as an ISO datetime string. We
  // treat any non-primitive leaf as "skip" so the test never
  // false-positives on shapes we don't claim to cover here.
  return '';
}

function collectLeaves(
  schema: z.ZodTypeAny,
  path: string[] = [],
): Leaf[] {
  const core = unwrap(schema);

  if (core instanceof z.ZodObject) {
    return Object.entries(core.shape).flatMap(([k, v]) =>
      collectLeaves(v as z.ZodTypeAny, [...path, k]),
    );
  }
  if (core instanceof z.ZodArray) {
    const elemCore = unwrap(core.element);
    if (elemCore instanceof z.ZodObject) {
      // Array of objects — recurse into the object so each inner
      // scalar gets its own `"<name>": <hint>` assertion. We mark
      // the path with `[]` purely for assertion messages.
      return collectLeaves(core.element, [
        ...path.slice(0, -1),
        `${path.at(-1)}[]`,
      ]);
    }
    // Array of primitives (e.g. `nextSteps: z.array(z.string())`) —
    // the prompt advertises the whole array as `"name": [ hint ]`,
    // so emit one bracketed-hint leaf for the array field itself.
    const elemHint = hintFor(core.element);
    if (!elemHint) return [];
    return [
      {
        path: path.join('.'),
        name: path.at(-1)!,
        hint: `[ ${elemHint} ]`,
      },
    ];
  }

  const hint = hintFor(schema);
  if (hint === '') return [];

  return [
    {
      path: path.join('.'),
      name: path.at(-1)!,
      hint,
    },
  ];
}

const LEAVES = collectLeaves(reportSchemas.reportBody);

// Sanity check — if the schema ever shrinks to zero scalars the
// reflection logic is broken, not the prompts.
if (LEAVES.length === 0) {
  throw new Error(
    'reportPrompt.drift: schema reflection produced 0 leaves — fix the helper, not the prompt.',
  );
}

// ── Legacy curated assertions (kept) ─────────────────────────────

const REQUIRED_FIELDS = [
  // top-level containers — these don't appear as leaves above and
  // we still want a positive "mentioned in the prompt" assertion.
  'meta',
  'weather',
  'workers',
  'materials',
  'issues',
  'nextSteps',
  'summarySections',
];

const SEVERITY_VALUES = ['"low"', '"medium"', '"high"'];

const FORBIDDEN_V3_VOCAB = [
  '"report":',
  'quantityUnit',
  'actionRequired',
  'totalWorkers',
  '"category"',
];

// ── Tests ────────────────────────────────────────────────────────

describe('report prompts vs. reportBody schema (offline drift guard)', () => {
  describe.each([
    ['REPORT_SYSTEM_PROMPT', REPORT_SYSTEM_PROMPT],
    ['REPORT_UPDATE_SYSTEM_PROMPT', REPORT_UPDATE_SYSTEM_PROMPT],
  ])('%s', (_name, prompt) => {
    it.each(REQUIRED_FIELDS)('mentions required container %s', (field) => {
      expect(prompt).toContain(field);
    });

    it.each(SEVERITY_VALUES)('mentions allowed severity literal %s', (lit) => {
      expect(prompt).toContain(lit);
    });

    it.each(FORBIDDEN_V3_VOCAB)('does NOT contain v3 vocab %s', (banned) => {
      expect(prompt).not.toContain(banned);
    });

    it('explicitly forbids the "report" wrapper', () => {
      expect(prompt).toMatch(/do NOT wrap.*"report"/i);
    });

    it('explicitly forbids markdown fences', () => {
      expect(prompt).toMatch(/markdown fences/i);
    });

    // GENERATED — one assertion per scalar leaf in `reportBody`.
    // For each `(name, hint)` pair we expect to find a literal
    // `"<name>": <hint>` substring in the prompt. The hint comes
    // from the Zod schema, so widening / narrowing a field's type
    // in the contract immediately fails this test until BOTH
    // prompts are updated to match.
    //
    // This is what would have caught HARPA-PRO-6 offline: when
    // `workers[].count` flipped from `int>=0` to `int>=0|null` in
    // the contract, the prompt-side hint `"count": int>=0` would
    // have stopped matching.
    it.each(LEAVES)(
      'advertises $path as $hint',
      ({ name, hint }) => {
        // Permit any amount of whitespace between the colon and
        // the hint, AND around `|` / brackets within the hint
        // itself — the two prompts mix styles ("str | null" vs
        // "str|null", "[ str ]" vs "[str]") and the test should
        // not police formatting.
        const hintPattern = escapeRegExp(hint)
          .replace(/\\\|/g, '\\s*\\|\\s*')
          .replace(/\\\[/g, '\\[\\s*')
          .replace(/\\\]/g, '\\s*\\]');
        const re = new RegExp(
          `"${escapeRegExp(name)}":\\s*${hintPattern}(?=[\\s,}\\]\\n]|$)`,
        );
        expect(prompt).toMatch(re);
      },
    );
  });
});

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
