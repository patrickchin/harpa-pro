import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { reportMutationInput } from './report-mutation-input';

const EXPECTED_UPDATED_AT = '2026-07-29T00:00:00.000Z';

describe('reportMutationInput', () => {
  it('builds lifecycle mutation arguments with the concurrency precondition', () => {
    expect(
      reportMutationInput('highland-tower', 7, EXPECTED_UPDATED_AT),
    ).toEqual({
      params: { project: 'highland-tower', number: 7 },
      body: { expectedUpdatedAt: EXPECTED_UPDATED_AT },
    });
  });

  it('is used by generate, regenerate, finalize, and unfinalize callers', () => {
    const generateRoute = readFileSync(
      resolve(
        process.cwd(),
        'app/(app)/projects/[project]/reports/[number]/generate.tsx',
      ),
      'utf8',
    );
    const savedRoute = readFileSync(
      resolve(
        process.cwd(),
        'app/(app)/projects/[project]/reports/[number]/index.tsx',
      ),
      'utf8',
    );

    expect(generateRoute.match(/reportMutationInput\(/g)).toHaveLength(2);
    expect(savedRoute.match(/reportMutationInput\(/g)).toHaveLength(1);
  });
});
