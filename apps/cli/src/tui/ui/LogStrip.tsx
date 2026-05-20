/**
 * LogStrip (arch-tui-layout-v2.md §2.1).
 *
 * Single row at the bottom of the screen:
 *   - left  : most recent log entry (rank-5 muted, colour by kind).
 *   - right : fixture mode (`fixtures: replay` / `record`), shown
 *             only when AI fixtures aren't in `live` mode.
 *
 * Multi-line messages are promoted to a viewport section by the
 * screen that produces them — this strip is intentionally just one
 * line so the chrome stays quiet.
 */
import { Show } from 'solid-js';
import type { UiStore } from './store.js';
import { theme, logColor } from './theme.js';

export interface LogStripProps {
  readonly ui: UiStore;
}

export function LogStrip(props: LogStripProps) {
  const entry = () => props.ui.state.log;
  const fixtureMode = () => props.ui.state.topbar.identity.fixtureMode;
  const showFixture = () => {
    const m = fixtureMode();
    return m && m !== 'live' ? m : undefined;
  };
  return (
    <box
      flexDirection="row"
      backgroundColor={theme.bg}
      paddingLeft={1}
      paddingRight={1}
      width="100%"
    >
      <Show when={entry()} fallback={<text fg={theme.fgDim}> </text>}>
        {(e: () => NonNullable<ReturnType<typeof entry>>) => (
          <text fg={logColor(e().kind)}>
            {(e().title ? `${e().title}: ` : '') + e().message}
          </text>
        )}
      </Show>
      <box flexGrow={1} />
      <Show when={showFixture()}>
        <text fg={theme.fgDim}>{`fixtures: ${showFixture()}`}</text>
      </Show>
    </box>
  );
}
