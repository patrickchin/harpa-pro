/**
 * In-flight spinner shown in the interaction pane while a screen
 * action runs (arch-tui-layout.md §3.5).
 *
 * Animation is a simple braille frame rotation driven by setInterval;
 * cost is one cell per ~80ms.
 */
import { createSignal, onCleanup } from 'solid-js';
import { theme } from '../theme.js';

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export interface SpinnerProps {
  readonly label: string;
}

export function Spinner(props: SpinnerProps) {
  const [i, setI] = createSignal(0);
  const id = setInterval(() => setI((n) => (n + 1) % FRAMES.length), 80);
  onCleanup(() => clearInterval(id));
  return (
    <box flexDirection="row">
      <text fg={theme.primary}>{FRAMES[i()]}</text>
      <text fg={theme.fg}>{` ${props.label}`}</text>
    </box>
  );
}
