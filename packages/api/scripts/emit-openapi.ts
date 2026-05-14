/**
 * Emit OpenAPI spec to packages/api-contract/openapi.json so the contract
 * test in P1.11 can verify drift. Real generator runs at the end of P1.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../src/app.js';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '../../api-contract/openapi.json');

const app = createApp();
const doc = app.getOpenAPIDocument({
  openapi: '3.1.0',
  info: { title: 'Harpa Pro API', version: '0.0.0' },
});

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(doc, null, 2) + '\n', 'utf8');
console.log(`[openapi] wrote ${out}`);
