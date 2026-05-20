/**
 * Prompter abstraction.
 *
 * The TUI logic is built against a small `Prompter` interface so it
 * can be driven by a scripted fake in tests. Production wiring is
 * `opentuiPrompter()`, which bridges the imperative interface to the
 * reactive Solid/OpenTUI view layer (see arch-tui-layout.md §3.3).
 *
 * The default wiring is covered by a node-pty smoke test
 * (see `__tests__/tui/pty.smoke.integration.test.ts`) so we don't
 * fall into Pitfall 13 (DI stub becoming the spec).
 *
 * Cancellation: every prompt may return the cancel symbol. Callers
 * MUST check via `prompter.isCancel(value)` after every await before
 * using the value. Cancellation in the TUI means "return to menu",
 * not "exit process".
 */
import type { PromptResolution, UiStore } from './ui/store.js';

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
 * Production wiring is `opentuiPrompter()` below. Tests use
 * `scriptedPrompter()`.
 */

/* -------------------------------------------------------------------------- */
/*  OpenTUI prompter — production wiring for the v4 split-pane TUI.           */
/* -------------------------------------------------------------------------- */

/**
 * Bridges the imperative `Prompter` interface to the reactive
 * `UiStore` consumed by the Solid view layer (arch-tui-layout.md §3.3).
 *
 * Each prompt method:
 *   1. Subscribes a resolver for the next `ui.resolve()` call.
 *   2. Pushes its `PromptRequest` into the store (the view mounts the
 *      matching widget).
 *   3. Awaits the resolver; clears the prompt on settle.
 *
 * Sequential by construction — the screen driver only calls the next
 * prompt method after the previous one's Promise settles, so
 * `state.currentPrompt` is always either `undefined` or the unique
 * outstanding request.
 *
 * No `setTimeout` / no fire-and-forget (Pitfall 5): resolution flows
 * synchronously from the widget's keystroke handler to `ui.resolve()`
 * to the awaiter.
 */
export function opentuiPrompter(ui: UiStore): Prompter {
  const ask = <T>(
    req: Parameters<UiStore['setPrompt']>[0] & object,
    decode: (r: PromptResolution) => T | Cancel,
  ): Promise<T | Cancel> =>
    new Promise<T | Cancel>((resolve) => {
      // Register resolver BEFORE mutating the store so an immediate
      // ui.resolve() (e.g. from a synchronous test) is not lost.
      const off = ui.onResolve((r) => {
        ui.setPrompt(undefined);
        off();
        resolve(decode(r));
      });
      ui.setPrompt(req);
    });

  return {
    text: (o) =>
      ask<string>(
        {
          kind: 'text',
          label: o.label,
          ...(o.placeholder !== undefined ? { placeholder: o.placeholder } : {}),
          ...(o.default !== undefined ? { default: o.default } : {}),
          ...(o.validate !== undefined ? { validate: o.validate } : {}),
        },
        (r) => (r.kind === 'cancel' ? CANCEL : (r as { value: string }).value),
      ),
    multiline: (o) =>
      ask<string>(
        {
          kind: 'multiline',
          label: o.label,
          ...(o.placeholder !== undefined ? { placeholder: o.placeholder } : {}),
        },
        (r) => (r.kind === 'cancel' ? CANCEL : (r as { value: string }).value),
      ),
    filePath: (o) =>
      ask<string>(
        {
          kind: 'filePath',
          label: o.label,
          ...(o.placeholder !== undefined ? { placeholder: o.placeholder } : {}),
          ...(o.validate !== undefined ? { validate: o.validate } : {}),
        },
        (r) => (r.kind === 'cancel' ? CANCEL : (r as { value: string }).value),
      ),
    select: <T extends string>(o: SelectOpts<T>): Promise<T | Cancel> => {
      const req: Parameters<UiStore['setPrompt']>[0] & { kind: 'select' } = {
        kind: 'select',
        label: o.label,
        options: o.options.map((opt) => ({
          value: opt.value,
          label: opt.label,
          ...(opt.hint !== undefined ? { hint: opt.hint } : {}),
        })),
        ...(o.initialValue !== undefined ? { initialValue: o.initialValue } : {}),
      };
      return ask<T>(
        req,
        (r) => (r.kind === 'cancel' ? CANCEL : ((r as { value: string }).value as T)),
      );
    },
    confirm: (o) =>
      ask<boolean>(
        {
          kind: 'confirm',
          label: o.label,
          ...(o.default !== undefined ? { default: o.default } : {}),
        },
        (r) => (r.kind === 'cancel' ? CANCEL : (r as { value: boolean }).value),
      ),
    note: (message, title) =>
      ui.log({ kind: 'note', message, ...(title !== undefined ? { title } : {}) }),
    log: {
      info: (m) => ui.log({ kind: 'info', message: m }),
      success: (m) => ui.log({ kind: 'success', message: m }),
      error: (m) => ui.log({ kind: 'error', message: m }),
      warn: (m) => ui.log({ kind: 'warn', message: m }),
    },
    // intro/outro are no-ops in the static-layout TUI: the StatusBar
    // is always visible and never prints framing chrome inline.
    intro: () => {},
    outro: () => {},
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
