#!/usr/bin/env node
/**
 * @harpa/cli entry point.
 *
 * Env is parsed lazily inside command handlers (so `--help` works
 * without env vars). Commands import `getEnv()` from `./lib/env-runtime`
 * to access the parsed env on demand and fail fast with a friendly
 * Zod error if anything's missing.
 *
 * `main` is exported so tests (e.g. the TUI registry-completeness gate)
 * can walk the real subcommand tree without triggering `runMain`. The
 * `runMain` call below is guarded so it only runs when this file is
 * executed as the process entrypoint.
 */
import { defineCommand, runMain } from 'citty';
import { fileURLToPath } from 'node:url';
import { healthCommand } from './commands/health.js';
import { authCommand } from './commands/auth.js';
import { meCommand } from './commands/me.js';
import { projectsCommand } from './commands/projects.js';
import { reportsCommand } from './commands/reports.js';
import { notesCommand } from './commands/notes.js';
import { filesCommand } from './commands/files.js';
import { voiceCommand } from './commands/voice.js';
import { settingsCommand } from './commands/settings.js';
import { tuiCommand } from './tui/index.js';

export const main = defineCommand({
  meta: {
    name: 'harpa',
    version: '0.1.0',
    description: 'Debug / API testing / LLM-driven CLI for the harpa-pro API.',
  },
  subCommands: {
    health: healthCommand,
    auth: authCommand,
    me: meCommand,
    projects: projectsCommand,
    reports: reportsCommand,
    notes: notesCommand,
    files: filesCommand,
    voice: voiceCommand,
    settings: settingsCommand,
    tui: tuiCommand,
  },
});

// Only invoke runMain when this module is executed directly (e.g.
// `node dist/index.js`). Importing `main` from a test must not exit
// the process or start a TTY session.
const isEntry = (() => {
  const arg = process.argv[1];
  if (!arg) return false;
  try {
    return fileURLToPath(import.meta.url) === arg;
  } catch {
    return false;
  }
})();

if (isEntry) {
  runMain(main);
}
