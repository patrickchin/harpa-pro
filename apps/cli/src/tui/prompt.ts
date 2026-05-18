/**
 * Map a single `ArgPrompt` to a `Prompter` call.
 *
 * Centralised so adding a new arg kind only touches this file.
 * Validators (uuid, phone, number-range) live here and are reused by
 * both the production prompter and the scripted prompter — the
 * validator runs inside the underlying clack prompt, so a scripted
 * test that supplies an invalid value still triggers the same
 * validation path.
 *
 * See docs/v4/arch-tui.md §3.2 (`ArgPrompt`) and §3.4.
 */
import type { ArgPrompt, TuiArgSpec } from '../lib/command.js';
import type { Cancel, Prompter } from './prompter.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PHONE_RE = /^\+[1-9]\d{6,14}$/;

export async function askArg(
  prompter: Prompter,
  name: string,
  spec: TuiArgSpec,
): Promise<unknown | Cancel> {
  const label = `${spec.label}${spec.required ? '' : ' (optional)'}`;
  const prompt: ArgPrompt = spec.prompt;

  switch (prompt.kind) {
    case 'text': {
      const opts: { label: string; placeholder?: string; default?: string; validate?: (s: string) => string | undefined } = { label };
      if (prompt.placeholder !== undefined) opts.placeholder = prompt.placeholder;
      if (prompt.default !== undefined) opts.default = prompt.default;
      if (prompt.validate) opts.validate = prompt.validate;
      return prompter.text(opts);
    }
    case 'multiline': {
      const opts: { label: string; placeholder?: string } = { label };
      if (prompt.placeholder !== undefined) opts.placeholder = prompt.placeholder;
      return prompter.multiline(opts);
    }
    case 'uuid': {
      const opts: { label: string; placeholder?: string; validate: (s: string) => string | undefined } = {
        label,
        validate: (s) => (UUID_RE.test(s) ? undefined : `${name} must be a UUID`),
      };
      if (prompt.placeholder !== undefined) opts.placeholder = prompt.placeholder;
      return prompter.text(opts);
    }
    case 'phone': {
      const opts: { label: string; placeholder?: string; validate: (s: string) => string | undefined } = {
        label,
        validate: (s) => (PHONE_RE.test(s) ? undefined : `${name} must be E.164 (+15551234567)`),
      };
      if (prompt.placeholder !== undefined) opts.placeholder = prompt.placeholder;
      return prompter.text(opts);
    }
    case 'select':
      return prompter.select({ label, options: prompt.options });
    case 'confirm': {
      const opts: { label: string; default?: boolean } = { label };
      if (prompt.default !== undefined) opts.default = prompt.default;
      return prompter.confirm(opts);
    }
    case 'number': {
      const optional = !spec.required;
      const opts: { label: string; default?: string; validate: (s: string) => string | undefined } = {
        label,
        validate: (s) => {
          // Empty input on an optional number = "skip" — no validation,
          // no coercion (the bug was Number("") === 0 falling through
          // min=1 checks despite "(optional)" in the label).
          if (optional && s.trim() === '') return undefined;
          const n = Number(s);
          if (!Number.isFinite(n)) return `${name} must be a number`;
          if (prompt.min !== undefined && n < prompt.min) return `${name} must be >= ${prompt.min}`;
          if (prompt.max !== undefined && n > prompt.max) return `${name} must be <= ${prompt.max}`;
          return undefined;
        },
      };
      if (prompt.default !== undefined) opts.default = String(prompt.default);
      const v = await prompter.text(opts);
      if (prompter.isCancel(v)) return v;
      if (optional && typeof v === 'string' && v.trim() === '') return undefined;
      return Number(v);
    }
  }
}

/**
 * Walk a tuiSpec's args, asking each in order. Returns either the
 * collected answers (keyed by arg name) or the CANCEL sentinel if the
 * user cancelled at any prompt.
 */
/**
 * Walk a tuiSpec's args, asking each in order. Returns either the
 * collected answers (keyed by arg name) or the CANCEL sentinel if the
 * user cancelled at any prompt.
 *
 * `prefill` provides pre-resolved values keyed by arg name. When a
 * key is present in `prefill`, the prompt is skipped and the value
 * is copied verbatim into `answers`. `skipWhen` still runs first
 * (so prefill never overrides an explicit skip). See arch-tui-nav.md §3.3.
 */
export async function collectArgs(
  prompter: Prompter,
  args: Record<string, TuiArgSpec>,
  prefill?: Record<string, unknown>,
): Promise<Record<string, unknown> | Cancel> {
  const answers: Record<string, unknown> = {};
  for (const [name, spec] of Object.entries(args)) {
    if (spec.skipWhen && spec.skipWhen(answers)) continue;
    if (prefill && name in prefill) {
      answers[name] = prefill[name];
      continue;
    }
    const v = await askArg(prompter, name, spec);
    if (prompter.isCancel(v)) return v;
    answers[name] = v;
  }
  return answers;
}
