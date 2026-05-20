/**
 * UI store for the OpenTUI-backed TUI (arch-tui-layout.md §3.3).
 *
 * Holds the data the Solid view renders: viewport snapshot, status
 * bar, current prompt request, in-flight indicator. Built on
 * `solid-js/store` so component reads register fine-grained
 * dependencies, but exposes a plain `state` getter so non-Solid
 * consumers (tests, the imperative screen driver) can poll it
 * synchronously.
 *
 * The store is the bridge between two worlds:
 *   - The imperative screen driver (`runApp` / `runScreen`) calls
 *     `opentuiPrompter(ui).select(...)` and awaits a Promise.
 *   - The Solid view mounts the appropriate widget for
 *     `state.currentPrompt`, reads `state.viewport`, and calls
 *     `ui.resolve(...)` from its keystroke handler.
 *
 * One prompt at a time. The driver only ever invokes the next prompt
 * after the previous one's Promise settles, so `currentPrompt` is
 * always either `undefined` or the unique outstanding request.
 *
 * No `setTimeout` / no fire-and-forget (Pitfall 5): resolution is the
 * synchronous keystroke handler calling `ui.resolve(...)`. Cancel is
 * the same handler with `{ kind: 'cancel' }`.
 */
import { createStore, produce, type SetStoreFunction } from 'solid-js/store';

export type LogKind = 'info' | 'success' | 'warn' | 'error' | 'note';

export interface LogEntry {
  readonly kind: LogKind;
  readonly message: string;
  readonly title?: string;
}

export interface ViewportListItem {
  readonly label: string;
  readonly hint?: string;
  /**
   * Informational mirror of an action label — purely a hint to the
   * user. Selection itself happens in the interaction pane.
   */
  readonly mirrorsAction?: string;
}

export type ViewportBody =
  | { readonly kind: 'list'; readonly items: ReadonlyArray<ViewportListItem> }
  | {
      readonly kind: 'detail';
      readonly sections: ReadonlyArray<{
        readonly title?: string;
        readonly lines: ReadonlyArray<string>;
      }>;
    }
  | { readonly kind: 'result'; readonly content: string }
  | { readonly kind: 'empty'; readonly hint?: string };

export interface ViewportState {
  readonly title: string;
  readonly headerLines: ReadonlyArray<string>;
  readonly body?: ViewportBody;
  readonly logTail: ReadonlyArray<LogEntry>;
}

export interface StatusState {
  readonly apiUrl: string;
  readonly user?: string;
  readonly breadcrumb: ReadonlyArray<string>;
  readonly keymapHint: string;
}

export interface PromptOption {
  readonly value: string;
  readonly label: string;
  readonly hint?: string;
}

export type PromptRequest =
  | {
      readonly kind: 'select';
      readonly label: string;
      readonly options: ReadonlyArray<PromptOption>;
      readonly initialValue?: string;
    }
  | {
      readonly kind: 'text';
      readonly label: string;
      readonly placeholder?: string;
      readonly default?: string;
      readonly validate?: (s: string) => string | undefined;
    }
  | {
      readonly kind: 'multiline';
      readonly label: string;
      readonly placeholder?: string;
    }
  | {
      readonly kind: 'filePath';
      readonly label: string;
      readonly placeholder?: string;
      readonly validate?: (s: string) => string | undefined;
    }
  | {
      readonly kind: 'confirm';
      readonly label: string;
      readonly default?: boolean;
    };

export type PromptResolution =
  | { readonly kind: 'text'; readonly value: string }
  | { readonly kind: 'select'; readonly value: string }
  | { readonly kind: 'confirm'; readonly value: boolean }
  | { readonly kind: 'cancel' };

export interface UiState {
  viewport: ViewportState;
  status: StatusState;
  currentPrompt: PromptRequest | undefined;
  inFlight: { readonly label: string } | undefined;
}

export type ResolveListener = (r: PromptResolution) => void;

export interface UiStore {
  /** Reactive snapshot for Solid components. */
  readonly state: UiState;
  /**
   * Resolve the outstanding prompt. No-op if no listener is registered
   * (the prompter façade always registers before mutating
   * `currentPrompt`).
   */
  resolve(r: PromptResolution): void;
  /** Subscribe to the *next* resolve call. Returns an unsubscribe fn. */
  onResolve(cb: ResolveListener): () => void;
  log(entry: LogEntry): void;
  setViewport(patch: Partial<ViewportState>): void;
  setStatus(patch: Partial<StatusState>): void;
  setInFlight(v: { label: string } | undefined): void;
  setPrompt(p: PromptRequest | undefined): void;
}

export interface CreateUiStoreOptions {
  /** Cap on the in-viewport log tail (older entries are dropped). */
  readonly logCap?: number;
  readonly initialStatus?: Partial<StatusState>;
  readonly initialViewport?: Partial<ViewportState>;
}

const EMPTY_VIEWPORT: ViewportState = {
  title: '',
  headerLines: [],
  logTail: [],
};

const EMPTY_STATUS: StatusState = {
  apiUrl: '',
  breadcrumb: [],
  keymapHint: '',
};

export function createUiStore(opts: CreateUiStoreOptions = {}): UiStore {
  const logCap = opts.logCap ?? 5;
  const [state, setState] = createStore<UiState>({
    viewport: { ...EMPTY_VIEWPORT, ...opts.initialViewport },
    status: { ...EMPTY_STATUS, ...opts.initialStatus },
    currentPrompt: undefined,
    inFlight: undefined,
  });

  const listeners = new Set<ResolveListener>();

  const set: SetStoreFunction<UiState> = setState;

  return {
    state,
    resolve(r) {
      // Snapshot so a listener that re-registers during dispatch does
      // not get called for the resolution that triggered it.
      const fired = Array.from(listeners);
      listeners.clear();
      for (const cb of fired) cb(r);
    },
    onResolve(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    log(entry) {
      set(
        'viewport',
        produce<ViewportState>((v) => {
          const next = [...v.logTail, entry];
          (v as { logTail: ReadonlyArray<LogEntry> }).logTail =
            next.length > logCap ? next.slice(next.length - logCap) : next;
        }),
      );
    },
    setViewport(patch) {
      set('viewport', (prev) => ({ ...prev, ...patch }));
    },
    setStatus(patch) {
      set('status', (prev) => ({ ...prev, ...patch }));
    },
    setInFlight(v) {
      set('inFlight', v);
    },
    setPrompt(p) {
      set('currentPrompt', p);
    },
  };
}
