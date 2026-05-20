/**
 * Color tokens for the OpenTUI view layer (arch-tui-layout.md §3.1).
 *
 * Kept as raw hex strings so components can pass them straight to
 * OpenTUI's `fg` / `bg` props. We intentionally do not depend on
 * `chalk` here — chalk emits ANSI escape codes which OpenTUI does not
 * want inside its own rendered cells.
 */
export const theme = {
  // Foregrounds
  fg: '#e6edf3',
  fgMuted: '#7d8590',
  fgDim: '#484f58',

  // Accents
  primary: '#2f81f7',
  success: '#3fb950',
  warning: '#d29922',
  error: '#f85149',

  // Roles
  selectionFg: '#0d1117',
  selectionBg: '#2f81f7',
  borderActive: '#2f81f7',
  borderIdle: '#30363d',

  // Surfaces
  bg: '#0d1117',
  bgRaised: '#161b22',
  statusBarBg: '#161b22',
} as const;

export type Theme = typeof theme;

/** Mapping from log entry kind to its accent color. */
export function logColor(kind: 'info' | 'success' | 'warn' | 'error' | 'note'): string {
  switch (kind) {
    case 'success': return theme.success;
    case 'warn':    return theme.warning;
    case 'error':   return theme.error;
    case 'note':
    case 'info':
    default:        return theme.fgMuted;
  }
}
