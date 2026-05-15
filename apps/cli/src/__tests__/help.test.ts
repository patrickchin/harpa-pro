/**
 * CLI.12 — Help / command-tree drift gate.
 *
 * Snapshots the structure of the citty command tree: every command's
 * name, description, args (with type + description), and recursive
 * subcommands. This is what `harpa --help` and `harpa <cmd> --help`
 * render from, so the snapshot is a stable proxy for the help surface
 * without depending on citty's renderer formatting.
 *
 * Any addition / removal / signature change to a command surface will
 * fail this test until the snapshot is reviewed + regenerated:
 *
 *     pnpm --filter @harpa/cli test -- -u
 */
import { describe, it, expect, beforeAll } from 'vitest';
import chalk from 'chalk';
import { healthCommand } from '../commands/health.js';
import { authCommand } from '../commands/auth.js';
import { meCommand } from '../commands/me.js';
import { projectsCommand } from '../commands/projects.js';
import { reportsCommand } from '../commands/reports.js';
import { notesCommand } from '../commands/notes.js';
import { filesCommand } from '../commands/files.js';
import { voiceCommand } from '../commands/voice.js';
import { settingsCommand } from '../commands/settings.js';

beforeAll(() => {
  chalk.level = 0;
});

interface SerializedCommand {
  name?: string;
  description?: string;
  args: Record<string, unknown>;
  subCommands: Record<string, SerializedCommand>;
}

type CittyCommand = {
  meta?: { name?: string; description?: string } | (() => unknown) | Promise<unknown>;
  args?: Record<string, unknown> | (() => unknown) | Promise<unknown>;
  subCommands?:
    | Record<string, CittyCommand | (() => unknown) | Promise<unknown>>
    | (() => unknown)
    | Promise<unknown>;
};

function pickPlain<T>(v: unknown): T | undefined {
  if (v && typeof v !== 'function' && !(v instanceof Promise)) return v as T;
  return undefined;
}

function serialize(cmd: CittyCommand): SerializedCommand {
  const meta = pickPlain<{ name?: string; description?: string }>(cmd.meta) ?? {};
  const argsRaw = pickPlain<Record<string, unknown>>(cmd.args) ?? {};
  const subsRaw =
    pickPlain<Record<string, CittyCommand>>(cmd.subCommands) ?? {};
  const args: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(argsRaw)) {
    const a = v as { type?: string; required?: boolean; description?: string };
    args[k] = {
      type: a.type,
      ...(a.required ? { required: true } : {}),
      ...(a.description ? { description: a.description } : {}),
    };
  }
  const subCommands: Record<string, SerializedCommand> = {};
  for (const [k, v] of Object.entries(subsRaw)) {
    const child = pickPlain<CittyCommand>(v);
    if (child) subCommands[k] = serialize(child);
  }
  return {
    ...(meta.name ? { name: meta.name } : {}),
    ...(meta.description ? { description: meta.description } : {}),
    args,
    subCommands,
  };
}

describe('command tree (help drift gate)', () => {
  it('matches the recorded snapshot', () => {
    const tree: SerializedCommand = {
      name: 'harpa',
      description: 'Debug / API testing / LLM-driven CLI for the harpa-pro API.',
      args: {},
      subCommands: {
        health: serialize(healthCommand as CittyCommand),
        auth: serialize(authCommand as CittyCommand),
        me: serialize(meCommand as CittyCommand),
        projects: serialize(projectsCommand as CittyCommand),
        reports: serialize(reportsCommand as CittyCommand),
        notes: serialize(notesCommand as CittyCommand),
        files: serialize(filesCommand as CittyCommand),
        voice: serialize(voiceCommand as CittyCommand),
        settings: serialize(settingsCommand as CittyCommand),
      },
    };
    expect(tree).toMatchSnapshot();
  });
});
