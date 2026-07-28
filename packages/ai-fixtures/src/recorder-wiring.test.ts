import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));

describe('dedicated report fixture recorder', () => {
  it('passes provider output and private transcript context through redactFixture', () => {
    const source = readFileSync(resolve(here, '../scripts/record.ts'), 'utf8');

    expect(source).toMatch(/import\s+\{\s*redactFixture\s*\}/);
    expect(source).toMatch(
      /redactFixture\(\{[\s\S]*request:\s*canonicalRequest[\s\S]*response:[\s\S]*privateContext:\s*realUserPrompt/,
    );
  });
});
