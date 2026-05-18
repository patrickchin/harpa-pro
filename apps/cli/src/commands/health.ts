/**
 * `harpa health` — GET /healthz
 *
 * Public route. Useful as a smoke test against any deployed API:
 *   HARPA_API_URL=https://api.harpapro.com harpa health
 *
 * Built via `defineHarpaCommand()` so the same execution function backs
 * both the citty flag CLI and the menu-driven `harpa tui`.
 */
import chalk from 'chalk';
import { defineHarpaCommand } from '../lib/command.js';

export const health = defineHarpaCommand({
  meta: {
    name: 'health',
    description: 'Check API health (GET /healthz).',
  },
  args: {
    json: { type: 'boolean', description: 'Print raw JSON to stdout.' },
    verbose: { type: 'boolean', description: 'Print response metadata to stderr.' },
  },
  tui: {
    group: 'health',
    label: 'API health check',
    hint: 'GET /healthz — verify the API is reachable',
    cittyPath: ['health'],
    requiresToken: false,
    args: {},
  },
  execute({ client }) {
    return {
      request: () => client.GET('/healthz', {}),
      format: (data) => `${chalk.green('✓')} API healthy: ${JSON.stringify(data)}`,
    };
  },
});

export const healthCommand = health.cittyCommand;
