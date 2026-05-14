// Tailwind preset for `@harpa/report-ui`. Consumes the shared colour
// ramp from src/tokens/colors.ts so utilities and literal-hex usages
// share the same source of truth.
//
// Host apps merge this preset alongside `nativewind/preset` and add
// `../../packages/report-ui/src/**/*.{ts,tsx}` to their tailwind
// `content` glob so NativeWind picks up the classes used by lib
// components.

const { colors } = require("./src/tokens/colors");

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [],
  theme: {
    extend: {
      fontFamily: {
        sans: ["System", "sans-serif"],
      },
      fontSize: {
        display: ["2.125rem", { lineHeight: "2.5rem", fontWeight: "700" }],
        title: ["1.625rem", { lineHeight: "2rem", fontWeight: "700" }],
        "title-sm": ["1.25rem", { lineHeight: "1.625rem", fontWeight: "700" }],
        metric: ["2rem", { lineHeight: "2.25rem", fontWeight: "700" }],
        body: ["1rem", { lineHeight: "1.5rem" }],
        "body-lg": ["1.125rem", { lineHeight: "1.625rem" }],
        label: [
          "0.8125rem",
          { lineHeight: "1rem", fontWeight: "700", letterSpacing: "0.08em" },
        ],
      },
      borderRadius: {
        xl: "12px",
        lg: "8px",
        md: "6px",
        sm: "4px",
      },
      minHeight: {
        touch: "44px",
        "touch-lg": "52px",
      },
      height: {
        touch: "44px",
        "touch-lg": "52px",
      },
      spacing: {
        4.5: "18px",
        5.5: "22px",
        18: "72px",
      },
      colors: {
        background: colors.background,
        foreground: colors.foreground,
        card: colors.card,
        "card-foreground": colors.cardForeground,
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
