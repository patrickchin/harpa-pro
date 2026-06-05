/**
 * Emit OpenAPI spec to packages/api-contract/openapi.json so the contract
 * test in P1.11 can verify drift. Real generator runs at the end of P1.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Spec emission only loads route definitions to build the OpenAPI doc — it
// never serves traffic, so the dev-OTP route's DEV_OTP_TOKEN refine in
// env.ts would otherwise crash CI lint runs that don't (and shouldn't)
// expose the token. Disable the dev-OTP wiring for the duration of this
// script so env.ts parses cleanly. See env.ts refines around DEV_OTP_TOKEN.
process.env.HARPA_DEV_OTP_DISABLED ??= '1';

const { createApp } = await import('../src/app.js');

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
