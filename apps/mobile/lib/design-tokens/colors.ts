/**
 * Single source of truth for color tokens.
 *
 * Ported verbatim from
 * `../haru3-reports/apps/mobile/lib/design-tokens/colors.ts` on branch
 * `dev` (the canonical port source — see AGENTS.md hard rule #1).
 *
 * Consumed by:
 *   - tailwind.config.js (NativeWind utility classes)
 *   - any .tsx file that needs a literal hex (Lucide icons,
 *     ActivityIndicator, Stack contentStyle, placeholderTextColor,
 *     react-native-svg fills, surface shadows, etc.)
 *
 * Do NOT inline hex strings anywhere else in `app/` or `components/` —
 * `scripts/check-no-hex-colors.sh` is the lint guard (Pitfall 3).
 *
 * Direction: warm-paper background with a softened navy chrome and a
 * single saturated orange accent reserved for the AI/hero action only.
 *
 *   - `foreground` / `primary` is softened from near-black `#1a1a2e` to
 *     `#2d3a5a`. The previous near-black contrast on warm paper (~16:1)
 *     was eye-fatiguing; the softer navy keeps the boxed-report identity
 *     without the harsh ink-on-cream feel.
 *   - `accent` is a bright, saturated orange (`#ea580c`). It is the
 *     ONE pop colour in the system — used exclusively by the AI hero
 *     CTA ("Update report"), the active tab underline, and equivalent
 *     "act here" affordances. It must NOT replace `primary` on routine
 *     chrome (Photo/Voice idle, audio play circle, tab background, etc.).
 *   - `warning` amber retains its semantic role ("Still missing", attn).
 *     `accent` orange is meaningfully more saturated so the two read as
 *     distinct roles (incomplete vs. act-here).
 */

export const colors = {
  background: '#f8f6f1',
  foreground: '#2d3a5a',
  card: '#ffffff',
  cardForeground: '#2d3a5a',

  surface: {
    muted: '#f1eee6',
    emphasis: '#fffdf8',
    shadow: '#1a1a2e',
  },

  primary: {
    DEFAULT: '#2d3a5a',
    foreground: '#f8f6f1',
    alpha30: 'rgba(45, 58, 90, 0.3)',
  },
  secondary: {
    DEFAULT: '#ece8df',
    foreground: '#2d3a5a',
  },
  muted: {
    DEFAULT: '#ebe7dd',
    foreground: '#5f5b66',
    disabled: '#8a8693',
  },
  accent: {
    DEFAULT: '#ea580c',
    foreground: '#ffffff',
  },
  destructive: {
    DEFAULT: '#b91c1c',
    foreground: '#ffffff',
  },

  success: {
    DEFAULT: '#2f6f48',
    soft: '#edf7ef',
    text: '#245338',
    border: '#8fc2a0',
  },
  warning: {
    DEFAULT: '#b66916',
    soft: '#fff4e5',
    text: '#8e510e',
    border: '#e3b16e',
  },
  danger: {
    DEFAULT: '#b91c1c',
    soft: '#fdecea',
    text: '#8f1d18',
    border: '#e0a6a1',
  },
  info: {
    DEFAULT: '#2a5a9f',
    soft: '#edf4ff',
    text: '#244b82',
    border: '#9fb7df',
  },

  border: '#b9b4a8',
  input: '#b9b4a8',
  ring: '#2d3a5a',

  chart: {
    grid: '#b9b4a8',
    track: '#ebe7dd',
    fill: '#2d3a5a',
  },
} as const;

export type Colors = typeof colors;
