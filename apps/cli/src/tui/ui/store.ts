/**
 * UI store for the OpenTUI-backed TUI (arch-tui-layout-v2.md §8).
 *
 * Holds the data the Solid view renders, split into four slices that
 * map 1:1 onto the v2 layout chrome:
 *
 *   topbar      — breadcrumb + identity strip (loud-left, muted-right)
 *   viewport    — read-only "what's here": headline + subline + body
 *   interaction — outstanding prompt, in-flight spinner, keymap hint
 *   log         — newest log entry (single line, shown in LogStrip)
 *
 * Built on `solid-js/store` so component reads register fine-grained
 * dependencies, but exposes a plain `state` getter so non-Solid
 * consumers (tests, the imperative screen driver) can poll it.
 *
 * One prompt at a time. The driver only ever invokes the next prompt
 * after the previous one's Promise settles, so `interaction.currentPrompt`
 * is always either `undefined` or the unique outstanding request.
 *
 * No `setTimeout` / no fire-and-forget (Pitfall 5): resolution is the
 * synchronous keystroke handler calling `ui.resolve(...)`. Cancel is
 * the same handler with `{ kind: 'cancel' }`.
 */
import { createStore, type SetStoreFunction } from 'solid-js/store';

export type LogKind = 'info' | 'success' | 'warn' | 'error' | 'note';

export interface LogEntry {
  readonly kind: LogKind;
  readonly message: string;
  readonly title?: string;
}

export interface ViewportListItem {
  /** Primary column (always rendered). */
  readonly label: string;
  /** Subsequent columns; collapsed right-to-left when the pane is narrow. */
  readonly columns?: ReadonlyArray<string>;
  /** Fallback for narrow panes when columns are dropped entirely. */
  readonly hint?: string;
}

export type ViewportBody =
  | { readonly kind: 'list'; readonly items: ReadonlyArray<ViewportListItem>; readonly columnTitles?: ReadonlyArray<string> }
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
  /** Rank-2 row at the top of the viewport — what we're looking at. */
  readonly headline?: string;
  /** Rank-3 summary line under the headline (counts, status, etc). */
  readonly subline?: string;
  readonly body?: ViewportBody;
}

export interface IdentityStrip {
  readonly user?: string;
  /** Short label for HARPA_API_URL — `prod` / `dev` / `localhost` / hostname. */
  readonly apiLabel: string;
  /** AI fixtures mode; rendered in LogStrip when not `live`/undefined. */
  readonly fixtureMode?: 'replay' | 'record' | 'live';
}

export interface TopBarState {
  readonly breadcrumb: ReadonlyArray<string>;
  readonly identity: IdentityStrip;
}

export interface InteractionState {
  readonly currentPrompt: PromptRequest | undefined;
  readonly inFlight: { readonly label: string } | undefined;
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
      /**
       * Fired on every highlight change (ranger-style preview). The
       * scripted prompter ignores it; the OpenTUI prompter wires it
       * to the native `<select>`'s SELECTION_CHANGED event.
       */
      readonly onHighlight?: (value: string) => void;
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
    }
  | {
      /**
       * Focus-transfer prompt. While active, the picker is rendered
       * in the ViewportPane (left) and the InteractionPane (right)
       * drops to a muted hint. Items mirror the rich preview rows so
       * the visual jump from "browsing" to "picking" is minimal.
       */
      readonly kind: 'viewportSelect';
      readonly label: string;
      readonly items: ReadonlyArray<{
        readonly value: string;
        readonly label: string;
        readonly hint?: string;
        readonly columns?: ReadonlyArray<string>;
      }>;
      readonly initialValue?: string;
      readonly onHighlight?: (value: string) => void;
    };

export type PromptResolution =
  | { readonly kind: 'text'; readonly value: string }
  | { readonly kind: 'select'; readonly value: string }
  | { readonly kind: 'confirm'; readonly value: boolean }
  | { readonly kind: 'cancel' };

export interface UiState {
  topbar: TopBarState;
  viewport: ViewportState;
  interaction: InteractionState;
  /** Newest log entry; the LogStrip never shows more than one. */
  log: LogEntry | undefined;
}

export type ResolveListener = (r: PromptResolution) => void;

export interface UiStore {
  readonly state: UiState;
  resolve(r: PromptResolution): void;
  onResolve(cb: ResolveListener): () => void;
  /** Replace the LogStrip entry. */
  log(entry: LogEntry): void;
  setTopBar(patch: Partial<TopBarState>): void;
  setIdentity(patch: Partial<IdentityStrip>): void;
  setViewport(patch: Partial<ViewportState>): void;
  setInteraction(patch: Partial<InteractionState>): void;
  setInFlight(v: { label: string } | undefined): void;
  setPrompt(p: PromptRequest | undefined): void;
}

export interface CreateUiStoreOptions {
  readonly initialTopBar?: Partial<TopBarState>;
  readonly initialIdentity?: Partial<IdentityStrip>;
  readonly initialViewport?: Partial<ViewportState>;
  readonly initialInteraction?: Partial<InteractionState>;
}

const EMPTY_IDENTITY: IdentityStrip = { apiLabel: '' };

const EMPTY_TOPBAR: TopBarState = {
  breadcrumb: [],
  identity: EMPTY_IDENTITY,
};

const EMPTY_VIEWPORT: ViewportState = {};

const EMPTY_INTERACTION: InteractionState = {
  currentPrompt: undefined,
  inFlight: undefined,
  keymapHint: '',
};

export function createUiStore(opts: CreateUiStoreOptions = {}): UiStore {
  const topbarInit = opts.initialTopBar ?? {};
  const [state, setState] = createStore<UiState>({
    topbar: {
      ...EMPTY_TOPBAR,
      ...topbarInit,
      identity: {
        ...EMPTY_IDENTITY,
        ...(topbarInit.identity ?? {}),
        ...(opts.initialIdentity ?? {}),
      },
    },
    viewport: { ...EMPTY_VIEWPORT, ...opts.initialViewport },
    interaction: { ...EMPTY_INTERACTION, ...opts.initialInteraction },
    log: undefined,
  });

  const listeners = new Set<ResolveListener>();
  const set: SetStoreFunction<UiState> = setState;

  return {
    state,
    resolve(r) {
      const fired = Array.from(listeners);
      listeners.clear();
      for (const cb of fired) cb(r);
    },
    onResolve(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    log(entry) {
      set('log', entry);
    },
    setTopBar(patch) {
      set('topbar', (prev) => ({ ...prev, ...patch }));
    },
    setIdentity(patch) {
      set('topbar', (prev) => ({
        ...prev,
        identity: { ...prev.identity, ...patch },
      }));
    },
    setViewport(patch) {
      set('viewport', (prev) => ({ ...prev, ...patch }));
    },
    setInteraction(patch) {
      set('interaction', (prev) => ({ ...prev, ...patch }));
    },
    setInFlight(v) {
      set('interaction', (prev) => ({ ...prev, inFlight: v }));
    },
    setPrompt(p) {
      set('interaction', (prev) => ({ ...prev, currentPrompt: p }));
    },
  };
}
