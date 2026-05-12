// Color tokens are defined in `./lib/design-tokens/colors.ts` so the
// same values are shared between Tailwind classes and any RN literal
// (Lucide icons, ActivityIndicator, contentStyle, etc.).
//
// Ported from `../haru3-reports/apps/mobile/tailwind.config.js` on branch
// `dev` — see AGENTS.md hard rule #1.
const { colors } = require('./lib/design-tokens/colors');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
    './screens/**/*.{js,jsx,ts,tsx}',
    './lib/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      fontFamily: {
        sans: ['System', 'sans-serif'],
      },
      fontSize: {
        display: ['2.125rem', { lineHeight: '2.5rem', fontWeight: '700' }],
        title: ['1.625rem', { lineHeight: '2rem', fontWeight: '700' }],
        'title-sm': ['1.25rem', { lineHeight: '1.625rem', fontWeight: '700' }],
        metric: ['2rem', { lineHeight: '2.25rem', fontWeight: '700' }],
        body: ['1rem', { lineHeight: '1.5rem' }],
        'body-lg': ['1.125rem', { lineHeight: '1.625rem' }],
        label: ['0.8125rem', { lineHeight: '1rem', fontWeight: '700', letterSpacing: '0.08em' }],
      },
      borderRadius: {
        xl: '12px',
        lg: '8px',
        md: '6px',
        sm: '4px',
      },
      minHeight: {
        touch: '44px',
        'touch-lg': '52px',
      },
      height: {
        touch: '44px',
        'touch-lg': '52px',
      },
      spacing: {
        4.5: '18px',
        5.5: '22px',
        18: '72px',
      },
      colors: {
        background: colors.background,
        foreground: colors.foreground,
        card: colors.card,
        'card-foreground': colors.cardForeground,
        surface: colors.surface,
        primary: colors.primary,
        secondary: colors.secondary,
        muted: colors.muted,
        accent: colors.accent,
        destructive: colors.destructive,
        success: colors.success,
        warning: colors.warning,
        danger: colors.danger,
        info: colors.info,
        border: colors.border,
        input: colors.input,
        ring: colors.ring,
        chart: colors.chart,
      },
    },
  },
  plugins: [],
};
