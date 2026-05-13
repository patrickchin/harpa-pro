/**
 * Coverage test: every generated mutation hook in `hooks.ts` must have a
 * registered rule in `INVALIDATIONS` (either a list of query-key prefixes
 * or `INVALIDATIONS_NONE`). A new mutation lands without a rule → this
 * test fails → the developer either adds a rule or explicitly opts it
 * out. No silent omissions.
 *
 * We parse the generated file as text rather than importing it (importing
 * pulls in @tanstack/react-query at module-evaluation time, which works
 * fine but isn't necessary for a static check).
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import {
  INVALIDATIONS,
  INVALIDATIONS_NONE,
  invalidationsFor,
} from './invalidation';

const here = dirname(fileURLToPath(import.meta.url));
const hooksSource = readFileSync(resolve(here, 'hooks.ts'), 'utf8');

function extractMutationHookNames(source: string): string[] {
  const names = new Set<string>();
  const re = /export function (use\w+Mutation)\b/g;
  let m;
  while ((m = re.exec(source))) names.add(m[1]!);
  return [...names].sort();
}

function extractQueryHookNames(source: string): string[] {
  const names = new Set<string>();
  const re = /export function (use\w+Query)\b/g;
  let m;
  while ((m = re.exec(source))) names.add(m[1]!);
  return [...names].sort();
}

describe('lib/api/invalidation', () => {
  const mutations = extractMutationHookNames(hooksSource);
  const queries = extractQueryHookNames(hooksSource);

  it('finds at least one mutation and one query in the generated file', () => {
    // Sanity: if this fails, either gen-hooks didn't run or the regex
    // is wrong — every other assertion would be a false positive.
    expect(mutations.length).toBeGreaterThan(0);
    expect(queries.length).toBeGreaterThan(0);
  });

  it('every mutation has an entry in INVALIDATIONS', () => {
    const missing = mutations.filter((name) => invalidationsFor(name) === null);
    expect(missing, 'mutations without a rule').toEqual([]);
  });

  it('no stale entries in INVALIDATIONS that no longer match a hook', () => {
    const validNames = new Set(mutations);
    const stale = Object.keys(INVALIDATIONS).filter((name) => !validNames.has(name));
    expect(stale, 'rules referencing non-existent hooks').toEqual([]);
  });

  it('queries are NOT in the invalidation map (only mutations declare invalidations)', () => {
    const queryEntries = queries.filter((name) =>
      Object.prototype.hasOwnProperty.call(INVALIDATIONS, name),
    );
    expect(queryEntries).toEqual([]);
  });

  it('rules are either a non-empty array of strings or INVALIDATIONS_NONE', () => {
    for (const [name, rule] of Object.entries(INVALIDATIONS)) {
      if (rule === INVALIDATIONS_NONE) continue;
      expect(Array.isArray(rule), `${name}: rule must be array or NONE`).toBe(true);
      expect((rule as readonly string[]).length, `${name}: empty array`).toBeGreaterThan(0);
      for (const head of rule as readonly string[]) {
        expect(typeof head, `${name}: key heads must be strings`).toBe('string');
        expect(head.length, `${name}: key head cannot be ""`).toBeGreaterThan(0);
      }
    }
  });
});
