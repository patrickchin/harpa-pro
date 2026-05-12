/**
 * Generates packages/api-contract/src/generated/types.ts from openapi.json.
 * The openapi.json itself is emitted by `pnpm spec:emit` in @harpa/api.
 *
 * In P0 the spec doesn't exist yet, so we emit a placeholder so downstream
 * type imports compile. Full generation is wired in P1.11.
 */
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '../src/generated/types.ts');
mkdirSync(dirname(out), { recursive: true });

const specPath = resolve(here, '../openapi.json');
if (!existsSync(specPath)) {
  writeFileSync(
    out,
    `// AUTO-GENERATED — placeholder until @harpa/api emits openapi.json (P1.11)
.
export type paths = Record<string, never>;
export type operations = Record<string, never>;
`,
  );
  console.log('Wrote placeholder', out);
  process.exit(0);
}

// Real generation path (works in P1+ once openapi.json exists).
const { default: openapiTypescript, astToString } = await import('openapi-typescript');
const ast = await openapiTypescript(new URL('file://' + specPath));
const output = astToString(ast);
writeFileSync(out, output);
console.log('Wrote', out);
