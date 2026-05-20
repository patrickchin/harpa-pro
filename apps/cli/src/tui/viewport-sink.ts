/**
 * Viewport sink (arch-tui-layout.md §3.4).
 *
 * Threads the screen driver's "what to show in the read-only pane"
 * decisions through to the view layer without coupling
 * `runScreen` / `runApp` to OpenTUI. In the classic (clack) code
 * path the sink is a no-op — header info is already rendered
 * inline by `prompter.note(...)`. In the split-pane code path the
 * sink writes to the `UiStore` so the Solid view re-renders.
 */
import type { ViewportBody } from './ui/store.js';

export interface ViewportSink {
  setHeader(title: string, lines: ReadonlyArray<string>): void;
  setBody(body: ViewportBody | undefined): void;
  pushBreadcrumb(label: string): void;
  popBreadcrumb(): void;
  setInFlight(label: string | undefined): void;
}

/** No-op sink used by tests and the classic clack runner. */
export function nullViewportSink(): ViewportSink {
  return {
    setHeader: () => {},
    setBody: () => {},
    pushBreadcrumb: () => {},
    popBreadcrumb: () => {},
    setInFlight: () => {},
  };
}
