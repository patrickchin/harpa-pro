/**
 * `harpa health` — GET /healthz
 *
 * Public route. Useful as a smoke test against any deployed API:
 *   HARPA_API_URL=https://api.harpapro.com harpa health
 */
import { defineCommand } from 'citty';
import chalk from 'chalk';
import { getEnv } from '../lib/env-runtime.js';
import { createApiClient } from '../lib/client.js';
import { runRequest } from '../lib/run.js';

export const healthCommand = defineCommand({
  meta: {
    name: 'health',
    description: 'Check API health (GET /healthz).',
  },
  args: {
    json: { type: 'boolean', description: 'Print raw JSON to stdout.' },
    verbose: { type: 'boolean', description: 'Print response metadata to stderr.' },
  },
  async run({ args }) {
    const env = getEnv();
    const client = createApiClient(env);
    await runRequest({
      json: args.json,
      verbose: args.verbose,
      request: () => client.GET('/healthz', {}),
      format: (data) => `${chalk.green('✓')} API healthy: ${JSON.stringify(data)}`,
    });
  },
});
