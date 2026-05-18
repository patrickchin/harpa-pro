/**
 * Prompter abstraction.
 *
 * `@clack/prompts` doesn't play nicely with unit testing (real TTY,
 * stdin event-driven). We wrap it behind a small interface so the TUI
 * logic can be driven by a scripted fake in tests, while production
 * uses the clack adapter.
 *
 * The default wiring (`clackPrompter()`) is covered by a node-pty
 * smoke test (see docs/v4/arch-tui.md §6, TUI.6) so we don't fall
 * into Pitfall 13 (DI stub becoming the spec).
 *
 * Cancellation: every prompt may return the cancel symbol. Callers
 * MUST check via `prompter.isCancel(value)` after every await before
 * using the value. Cancellation in the TUI means "return to menu",
 * not "exit process".
 */
import * as p from '@clack/prompts';

export const CANCEL: unique symbol = Symbol.for('harpa-cli/tui/cancel');
export type Cancel = typeof CANCEL;

export interface TextOpts {
  label: string;
  placeholder?: string;
  default?: string;
  validate?: (s: string) => string | undefined;
}

export interface SelectOpts<T extends string> {
  label: string;
  options: ReadonlyArray<{ value: T; label: string; hint?: string }>;
  initialValue?: T;
}

export interface ConfirmOpts {
  label: string;
  default?: boolean;
}

export interface Prompter {
  text(opts: TextOpts): Promise<string | Cancel>;
  multiline(opts: TextOpts): Promise<string | Cancel>;
  filePath(opts: TextOpts): Promise<string | Cancel>;
  select<T extends string>(opts: SelectOpts<T>): Promise<T | Cancel>;
  confirm(opts: ConfirmOpts): Promise<boolean | Cancel>;
  note(message: string, title?: string): void;
  log: {
    info: (message: string) => void;
    success: (message: string) => void;
    error: (message: string) => void;
    warn: (message: string) => void;
  };
  intro(message: string): void;
  outro(message: string): void;
  isCancel(value: unknown): value is Cancel;
}

/**
 * Production wiring: delegates to `@clack/prompts` and normalises
 * clack's own cancel symbol into our local `CANCEL` token so callers
 * only need to check one thing.
 */
export function clackPrompter(): Prompter {
  const norm = <T>(v: T | symbol): T | Cancel => (p.isCancel(v) ? CANCEL : (v as T));
  return {
    text: async (o) =>
      norm(
        await p.text({
          message: o.label,
          placeholder: o.placeholder,
          defaultValue: o.default,
          validate: o.validate ? (v: string | undefined) => o.validate!(v ?? '') : undefined,
        }),
      ),
    multiline: async (o) =>
      norm(
        await p.text({
          message: o.label + ' (multiline; \\n for newline)',
          placeholder: o.placeholder,
        }),
      ),
    filePath: async (o) =>
      norm(
        await p.path({
          message: o.label,
          initialValue: o.placeholder,
          validate: o.validate ? (v: string | undefined) => o.validate!(v ?? '') : undefined,
        }),
      ),
    select: async (o) => {
      const options = o.options.map((opt) => {
        const out: { value: string; label: string; hint?: string } = {
          value: opt.value,
          label: opt.label,
        };
        if (opt.hint !== undefined) out.hint = opt.hint;
        return out;
      });
      const v = await p.select({
        message: o.label,
        options,
        initialValue: o.initialValue,
      });
      return norm(v) as never;
    },
    confirm: async (o) =>
      norm(await p.confirm({ message: o.label, initialValue: o.default })),
    note: (message, title) => p.note(message, title),
    log: {
      info: (m) => p.log.info(m),
      success: (m) => p.log.success(m),
      error: (m) => p.log.error(m),
      warn: (m) => p.log.warn(m),
    },
    intro: (m) => p.intro(m),
    outro: (m) => p.outro(m),
    isCancel: (v): v is Cancel => v === CANCEL,
  };
}

/* -------------------------------------------------------------------------- */
/*  Scripted prompter — DI seam for tests only.                               */
/* -------------------------------------------------------------------------- */

export type PromptStep =
  | { kind: 'text'; expectLabel?: string; answer: string | Cancel }
  | { kind: 'multiline'; expectLabel?: string; answer: string | Cancel }
  | { kind: 'filePath'; expectLabel?: string; answer: string | Cancel }
  | { kind: 'select'; expectLabel?: string; answer: string | Cancel }
  | { kind: 'confirm'; expectLabel?: string; answer: boolean | Cancel };

export interface ScriptedPrompter extends Prompter {
  /** All log/note/intro/outro calls captured, in order. */
  readonly transcript: ReadonlyArray<{ kind: string; payload: unknown }>;
  /** True iff every scripted step was consumed. */
  exhausted(): boolean;
  remaining(): number;
}

class ScriptMismatchError extends Error {
  constructor(expected: string, got: string, step?: PromptStep) {
    super(`scriptedPrompter: expected ${expected} but got ${got}` + (step ? ` (step=${JSON.stringify(step)})` : ''));
    this.name = 'ScriptMismatchError';
  }
}

/**
 * Drives the TUI flow from a pre-recorded list of prompt answers.
 * Order matters; the prompter throws if a prompt arrives that doesn't
 * match the next scripted step. Use this in unit/behaviour tests.
 */
export function scriptedPrompter(steps: ReadonlyArray<PromptStep>): ScriptedPrompter {
  const queue = [...steps];
  const transcript: Array<{ kind: string; payload: unknown }> = [];

  const next = (kind: PromptStep['kind'], label: string): PromptStep => {
    const step = queue.shift();
    if (!step) throw new ScriptMismatchError(`${kind}(${label})`, 'no steps left');
    if (step.kind !== kind) throw new ScriptMismatchError(step.kind, kind, step);
    if (step.expectLabel !== undefined && step.expectLabel !== label) {
      throw new ScriptMismatchError(`label "${step.expectLabel}"`, `label "${label}"`, step);
    }
    return step;
  };

  return {
    async text(o) {
      const step = next('text', o.label);
      transcript.push({ kind: 'text', payload: { label: o.label, answer: step.answer } });
      return step.answer as string | Cancel;
    },
    async multiline(o) {
      const step = next('multiline', o.label);
      transcript.push({ kind: 'multiline', payload: { label: o.label, answer: step.answer } });
      return step.answer as string | Cancel;
    },
    async filePath(o) {
      const step = next('filePath', o.label);
      transcript.push({ kind: 'filePath', payload: { label: o.label, answer: step.answer } });
      return step.answer as string | Cancel;
    },
    async select(o) {
      const step = next('select', o.label);
      transcript.push({ kind: 'select', payload: { label: o.label, answer: step.answer } });
      return step.answer as never;
    },
    async confirm(o) {
      const step = next('confirm', o.label);
      transcript.push({ kind: 'confirm', payload: { label: o.label, answer: step.answer } });
      return step.answer as boolean | Cancel;
    },
    note(message, title) {
      transcript.push({ kind: 'note', payload: { message, title } });
    },
    log: {
      info: (m) => transcript.push({ kind: 'log.info', payload: m }),
      success: (m) => transcript.push({ kind: 'log.success', payload: m }),
      error: (m) => transcript.push({ kind: 'log.error', payload: m }),
      warn: (m) => transcript.push({ kind: 'log.warn', payload: m }),
    },
    intro: (m) => transcript.push({ kind: 'intro', payload: m }),
    outro: (m) => transcript.push({ kind: 'outro', payload: m }),
    isCancel: (v): v is Cancel => v === CANCEL,
    get transcript() {
      return transcript;
    },
    exhausted: () => queue.length === 0,
    remaining: () => queue.length,
  };
}
