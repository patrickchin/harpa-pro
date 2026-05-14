# @harpa/report-ui

Shared presentational React Native + RN-Web component library for the
harpa-pro reports experience. Used by `apps/mobile` and (via
React Native Web) `apps/playground` so both apps render the same
report list, report view, and source-note cards with identical
visuals.

## What's in here

```
tokens/         design tokens + tailwind preset
primitives/     Card, SectionHeader, StatTile, EmptyState
report/         StatBar, IssuesCard, WorkersCard, …, ReportView
reports-list/   ReportListRow, ReportListNewButton
notes/          TextNoteCard, VoiceNoteCard, ImageNoteCard
```

Everything is **presentational**: components accept data and
callbacks. No data fetching, no audio player, no AsyncStorage,
no dialogs, no expo-* runtime deps.

## Consuming the library

The host app must:

1. Install / already depend on the peer deps (`react`,
   `react-native`, `nativewind`, `lucide-react-native`,
   `react-native-svg`, `@harpa/report-core`, `clsx`,
   `tailwind-merge`).
2. Add the tailwind preset and include the lib source in
   `content`:

   ```js
   // tailwind.config.js
   const reportUiPreset = require("@harpa/report-ui/tailwind-preset");
   module.exports = {
     content: [
       "./app/**/*.{js,jsx,ts,tsx}",
       "./components/**/*.{js,jsx,ts,tsx}",
       "../../packages/report-ui/src/**/*.{ts,tsx}",
     ],
     presets: [require("nativewind/preset"), reportUiPreset],
   };
   ```

3. Import + render. The package exposes subpath entry points so each
   consumer only pulls the icons / dependencies it actually needs:

   ```tsx
   import { ReportView } from "@harpa/report-ui/report";
   import { ReportListRow, ReportListNewButton } from "@harpa/report-ui/reports-list";
   import { TextNoteCard, VoiceNoteCard, ImageNoteCard } from "@harpa/report-ui/notes";
   import { Card, SectionHeader, StatTile, EmptyState } from "@harpa/report-ui/primitives";
   import { colors } from "@harpa/report-ui/tokens";
   ```

   The barrel `@harpa/report-ui` re-exports everything for ad-hoc
   use, but prefer the subpath imports in production code — they
   keep test mocks simple and tree-shaking effective.

## Tokens

`@harpa/report-ui/tokens` is the **single source of truth** for the
colour ramp, surface-depth shadows, and typography sizes. Don't
inline hex strings — import `colors` from the tokens module so
Lucide icons, `ActivityIndicator`, and shadow surfaces share the
same values that Tailwind classes generate.

## Stability rules

- Never add a heavy runtime dep here. If a component needs network,
  storage, audio, or platform APIs, expose props/callbacks so the
  host wires it up.
- Keep import paths stable — mobile re-exports from this package to
  avoid cascading import-path churn across the app.
