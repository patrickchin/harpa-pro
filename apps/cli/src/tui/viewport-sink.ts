/**
 * Viewport sink (arch-tui-layout-v2.md §8).
 *
 * Threads the screen driver's "what to show in the read-only pane"
 * decisions through to the view layer without coupling
 * `runScreen` / `runApp` to OpenTUI. In the classic (clack) code
 * path the sink is a no-op. In the split-pane code path the sink
 * writes to the `UiStore` so the Solid view re-renders.
 *
 * The shape mirrors the v2 ViewportState slice: headline (rank 2),
 * subline (rank 3), body. The breadcrumb stack is also owned here
 * because it's the source of truth for the TopBar.
 */
import type { ViewportBody } from './ui/store.js';

export interface ViewportSink {
  setHeadline(headline: string | undefined, subline?: string | undefined): void;
  setBody(body: ViewportBody | undefined): void;
  pushBreadcrumb(label: string): void;
  popBreadcrumb(): void;
  setInFlight(label: string | undefined): void;
}

/** No-op sink used by tests and the classic clack runner. */
export function nullViewportSink(): ViewportSink {
  return {
    setHeadline: () => {},
    setBody: () => {},
    pushBreadcrumb: () => {},
    popBreadcrumb: () => {},
    setInFlight: () => {},
  };
}
