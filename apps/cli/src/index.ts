#!/usr/bin/env node
/**
 * @harpa/cli entry point.
 *
 * Env is parsed lazily inside command handlers (so `--help` works
 * without env vars). Commands import `getEnv()` from `./lib/env-runtime`
 * to access the parsed env on demand and fail fast with a friendly
 * Zod error if anything's missing.
 */
import { defineCommand, runMain } from 'citty';
import { healthCommand } from './commands/health.js';
import { authCommand } from './commands/auth.js';

const main = defineCommand({
  meta: {
    name: 'harpa',
    version: '0.1.0',
    description: 'Debug / API testing / LLM-driven CLI for the harpa-pro API.',
  },
  subCommands: {
    health: healthCommand,
    auth: authCommand,
  },
});

runMain(main);
