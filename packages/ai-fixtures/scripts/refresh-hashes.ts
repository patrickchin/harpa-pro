/**
 * Recompute requestHash for every fixture file in fixtures/ so the canonical
 * hash matches its `request` payload. Run after editing a fixture by hand.
 *
 *   pnpm --filter @harpa/ai-fixtures exec tsx scripts/refresh-hashes.ts
 */
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashRequest } from '../src/hash.js';

const here = dirname(fileURLToPath(import.meta.url));
const dir = resolve(here, '../fixtures');

let updated = 0;
for (const f of readdirSync(dir).filter((n) => n.endsWith('.json'))) {
  const p = join(dir, f);
  // Skip placeholder/empty fixtures — they are recorded later and would
  // crash JSON.parse here. The replay path also short-circuits on empty
  // files with a FixtureMiss, so leaving them alone is safe.
  if (statSync(p).size === 0) {
    console.log('skip empty', f);
    continue;
  }
  const j = JSON.parse(readFileSync(p, 'utf8'));
  const h = hashRequest(j.request);
  if (j.requestHash !== h) {
    j.requestHash = h;
    writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
    updated++;
    console.log('refreshed', f);
  }
}
console.log(`done — ${updated} fixture(s) updated`);
