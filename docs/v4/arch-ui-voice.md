# Shared UI Voice Package (`packages/ui-voice`)

> **Design document** — defines the cross-platform voice-notes and
> report UI components shared between `apps/mobile` (React Native) and
> `apps/marketing` (Astro + React islands).
>
> Resolves: sharing voice demo components for M2 and eventual mobile
> feature parity without duplicating JSX/styling.
>
> Related:
> - [arch-mobile.md](arch-mobile.md) — mobile app structure
> - [arch-shared-packages.md](arch-shared-packages.md) — package patterns
> - [docs/marketing/plan-m2-voice-demo.md](../marketing/plan-m2-voice-demo.md) — demo scope

## Scope

Marketing M2 voice demo and the post-P3 mobile app both need to render a voice-notes list and a voice-report view (summary, work, blockers, safety, next steps). Duplicating across two codebases drifts visually and on schema. This package authors components once with RN primitives + NativeWind v4 and ships them to both surfaces via react-native-web (Vite alias on marketing, Metro workspace resolution on mobile). Tamagui/NativeBase rejected per AGENTS.md hard rule (NativeWind only).

## Package structure

```
packages/ui-voice/
  package.json              # peerDeps: react, react-native, nativewind
  tsconfig.json             # extends ../../tsconfig.base.json
  src/
    index.ts                # public exports (components + types + fixtures)
    components/
      VoiceNoteList.tsx
      VoiceNoteListItem.tsx
      VoiceReportView.tsx
      VoiceReportSection.tsx
      VoiceReportSummary.tsx
      VoiceReportWorkCompleted.tsx
      VoiceReportBlockers.tsx
      VoiceReportSafety.tsx
      VoiceReportNextSteps.tsx
      VoiceReportEmptyState.tsx
      VoiceReportSkeleton.tsx
    types/
      index.ts              # re-exports from api-contract + local presentation props
    fixtures/
      demo-report.json      # moved from apps/marketing/src/fixtures/demo/report.json
      demo-transcript.json  # moved from apps/marketing/src/fixtures/demo/transcript.json
      index.ts              # typed exports
    __tests__/
      VoiceNoteList.test.tsx
      VoiceReportView.test.tsx
      __snapshots__/
```

### `package.json`

```json
{
  "name": "@harpa/ui-voice",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./fixtures": "./src/fixtures/index.ts"
  },
  "peerDependencies": {
    "react": "^18.3.1 || ^19.0.0",
    "react-native": "*",
    "nativewind": "^4.1.0"
  },
  "dependencies": {
    "@harpa/api-contract": "workspace:*",
    "clsx": "^2.1.1",
    "tailwind-merge": "^3.6.0"
  },
  "devDependencies": {
    "@testing-library/react": "^16.1.0",
    "jsdom": "^25.0.1",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-native": "0.76.3",
    "react-native-web": "^0.19.13",
    "typescript": "^5.6.2",
    "vitest": "^2.1.2"
  },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  }
}
```

Source-only (no build step). `peerDependencies` for `react`/`react-native`/`nativewind` so each app supplies its own versions; `react-native-web` is a devDep used by Vitest jsdom tests.

### `tsconfig.json`

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "react",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "types": ["vitest/globals"]
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "**/*.test.ts", "**/*.test.tsx"]
}
```

## Build / resolution wiring

### Marketing (Astro + Vite)

`apps/marketing/astro.config.mjs`:

```js
// @ts-check
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import mdx from "@astrojs/mdx";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  site: "https://harpapro.com",
  output: "static",
  integrations: [react(), mdx()],
  vite: {
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        "react-native": "react-native-web",
        "react-native/Libraries/Components/View/ViewStylePropTypes":
          "react-native-web/dist/exports/View/ViewStylePropTypes",
        "react-native/Libraries/Image/AssetRegistry":
          "react-native-web/dist/modules/AssetRegistry",
      },
      extensions: [".web.js", ".web.ts", ".web.tsx", ".js", ".ts", ".tsx", ".json"],
    },
    optimizeDeps: { include: ["react-native-web", "@harpa/ui-voice"] },
    ssr: { noExternal: ["@harpa/ui-voice", "nativewind", "react-native-css-interop"] },
  },
});
```

`ssr.noExternal` is required: Astro's static-build SSR pass must bundle the shared package inline rather than treat it as an external CJS module.

`apps/marketing/package.json` adds:

```json
"dependencies": {
  "@harpa/ui-voice": "workspace:*",
  "react-native-web": "^0.19.13"
}
```

`apps/marketing/src/styles/globals.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

#root {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}
```

Tailwind content glob (or `@source` for v4):

```js
// tailwind.config.* (v3)
content: [
  "./src/**/*.{astro,html,js,jsx,ts,tsx}",
  "../../packages/ui-voice/src/**/*.{ts,tsx}",
],
```

```css
/* globals.css (v4 @tailwindcss/vite) */
@import "tailwindcss";
@source "../../packages/ui-voice/src";
```

### Mobile (Expo + Metro)

Metro resolves workspaces via pnpm symlinks — no config change. Extend `apps/mobile/tailwind.config.js` content:

```js
content: [
  './app/**/*.{js,jsx,ts,tsx}',
  './components/**/*.{js,jsx,ts,tsx}',
  './screens/**/*.{js,jsx,ts,tsx}',
  './lib/**/*.{js,jsx,ts,tsx}',
  '../../packages/ui-voice/src/**/*.{ts,tsx}',  // ← ADD
],
```

Babel: existing `nativewind/babel` already handles transforms for `packages/ui-voice/src/**/*.tsx`.

## NativeWind v4 sharing

Both apps consume the same Tailwind tokens by **name** (`text-foreground`, `bg-card`, `border-border`). For M2, hex values may differ — visual parity enforced by manual review. Post-M2, extract `packages/design-tokens` if stricter sync is needed.

**`react-native-css-interop` version pinning:** the existing patch (`patches/react-native-css-interop@0.2.3.patch`) removes the `react-native-worklets/plugin` requirement. Both apps must use the same patched version. Pin `react-native-css-interop@0.2.3` as a `devDependency` of `packages/ui-voice` for tests; pnpm's global patch system applies the patch transitively to marketing.

## Component API

### `VoiceNoteList`

```tsx
export interface VoiceNoteListProps {
  notes: VoiceNote[];
  onNotePress?: (noteId: string) => void;
  onNotePlay?: (noteId: string) => void;
  onNoteDelete?: (noteId: string) => void;
  loading?: boolean;
  emptyMessage?: string;
  className?: string;
}

export interface VoiceNote {
  id: string;
  transcript: string;
  durationSec: number;
  createdAt: string; // ISO-8601
  isPlaying?: boolean; // injected by mobile playback provider
}
```

Renders a scrollable list of `VoiceNoteListItem`; skeletons when `loading`; `VoiceReportEmptyState` when `notes.length === 0`. Playback is injected via `onNotePlay` — no audio inside the component.

### `VoiceNoteListItem`

```tsx
export interface VoiceNoteListItemProps {
  note: VoiceNote;
  onPress?: () => void;
  onPlay?: () => void;
  onDelete?: () => void;
  className?: string;
}
```

Renders truncated transcript (2 lines), MM:SS duration badge, play/pause button (icon by `isPlaying`), delete control, relative or absolute timestamp.

### `VoiceReportView`

```tsx
export interface VoiceReportViewProps {
  report: VoiceReport;
  loading?: boolean;
  watermark?: string; // "Demo report" | "Preview" | undefined
  onSectionPress?: (sectionId: string) => void;
  className?: string;
}

export interface VoiceReport {
  id: string;
  summary: string;
  workCompleted: ReportSection[];
  blockers: ReportSection[];
  safety: ReportSection[];
  nextSteps: ReportSection[];
  createdAt: string; // ISO-8601
  projectName?: string;
}

export interface ReportSection {
  id: string;
  text: string;
  metadata?: Record<string, unknown>; // future: photos, tags
}
```

Renders all sections via `VoiceReportSection` (or specialised variants). Shows `VoiceReportSkeleton` when loading and a watermark badge when `watermark` is set. Scrollable on mobile, print-friendly on web.

### `VoiceReportSection`

```tsx
export interface VoiceReportSectionProps {
  title: string;
  items: ReportSection[];
  icon?: React.ReactNode;
  variant?: "default" | "warning" | "success";
  className?: string;
}
```

### `VoiceReportEmptyState`

```tsx
export interface VoiceReportEmptyStateProps {
  message: string;
  icon?: React.ReactNode;
  className?: string;
}
```

Mirrors mobile's `EmptyState` primitive (centered icon + message).

### `VoiceReportSkeleton`

Animated placeholder rows matching the report's section structure (mobile `Skeleton` pulse pattern).

## Fixtures

Moved from `apps/marketing/src/fixtures/demo/` to `packages/ui-voice/src/fixtures/`.

`demo-transcript.json`:

```json
{
  "text": "Morning check-in, January 15th. We completed the foundation pour for the north wing, approximately 120 cubic yards of concrete. The rebar inspection passed yesterday, so we were cleared to proceed. Weather held up nicely, no rain delays. Crew of eight on site. One minor safety incident: Tom slipped near the washout pit, no injury but we reviewed non-slip boot requirements with the whole crew. Concrete supplier arrived 20 minutes late, but we adjusted the schedule and still finished by 2 PM. Next steps: tomorrow we'll start the formwork for the south wing footings, and the electrician is scheduled to rough-in the panel boxes on Thursday.",
  "language": "en",
  "durationSec": 47
}
```

`demo-report.json`:

```json
{
  "id": "rpt_demo_0001",
  "summary": "Foundation pour completed for north wing with minor weather and crew coordination issues.",
  "workCompleted": [
    { "id": "1", "text": "Foundation pour (north wing) — 120 cubic yards" },
    { "id": "2", "text": "Rebar inspection passed" },
    { "id": "3", "text": "Concrete pour finished by 2 PM" }
  ],
  "blockers": [
    { "id": "1", "text": "Concrete supplier 20 minutes late" }
  ],
  "safety": [
    { "id": "1", "text": "Tom slipped near washout pit (no injury); reviewed non-slip boot policy" }
  ],
  "nextSteps": [
    { "id": "1", "text": "Start formwork for south wing footings (tomorrow)" },
    { "id": "2", "text": "Electrician to rough-in panel boxes (Thursday)" }
  ],
  "createdAt": "2026-01-15T14:30:00Z",
  "projectName": "Acme Office Building"
}
```

```ts
// packages/ui-voice/src/fixtures/index.ts
import demoTranscriptData from './demo-transcript.json';
import demoReportData from './demo-report.json';
import type { VoiceReport } from '../types';

export const demoTranscript = demoTranscriptData;
export const demoReport = demoReportData as VoiceReport;
```

Both apps import via `import { demoReport } from '@harpa/ui-voice/fixtures'`.

## Test strategy

### Unit (Vitest + jsdom + react-native-web)

```ts
// packages/ui-voice/vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
  },
  resolve: {
    alias: { 'react-native': 'react-native-web' },
  },
});
```

```ts
// packages/ui-voice/vitest.setup.ts
import '@testing-library/jest-dom/vitest';

vi.mock('lucide-react-native', () => ({
  Clock: () => null,
  Check: () => null,
  AlertTriangle: () => null,
}));
```

Cases:

- **VoiceNoteList:** renders items, skeleton on loading, empty state on empty, calls `onNotePress`, structural snapshot.
- **VoiceReportView:** renders all sections, watermark prop, skeleton on loading, full snapshot.

Coverage gate: ≥ 80% on `packages/ui-voice/src/components/`.

### Default-wiring integration tests (Pitfall 13 / rule #10)

Both apps must import the shared package without stubs and assert it renders.

Mobile (`apps/mobile/__tests__/VoiceReportView.integration.test.tsx`) using react-test-renderer + `act` per the react19 testing pattern:

```tsx
import { create, act } from 'react-test-renderer';
import { VoiceReportView } from '@harpa/ui-voice';
import { demoReport } from '@harpa/ui-voice/fixtures';

test('VoiceReportView renders with mobile theme', () => {
  let tree;
  act(() => {
    tree = create(<VoiceReportView report={demoReport} />);
  });
  expect(tree.toJSON()).toBeTruthy();
});
```

Marketing (`apps/marketing/e2e/voice-demo-shared-ui.spec.ts`):

```ts
import { test, expect } from '@playwright/test';

test('voice demo renders report from shared package', async ({ page }) => {
  await page.goto('/voice-demo');
  await page.locator('[data-testid="report-view"]').waitFor();

  await expect(page.locator('text=Work Completed')).toBeVisible();
  await expect(page.locator('text=Blockers')).toBeVisible();
  await expect(page.locator('text=Safety')).toBeVisible();
  await expect(page.locator('text=Next Steps')).toBeVisible();

  await expect(page.locator('text=Foundation pour (north wing)')).toBeVisible();
  await expect(page.locator('text=Concrete supplier 20 minutes late')).toBeVisible();
});
```

## Risks

| Risk | Mitigation |
|---|---|
| RNW + NativeWind v4 compat edges (e.g. `shadow-*`) | Pin patched `react-native-css-interop@0.2.3`; smoke-test with View/Text/Button before porting full components; use `Platform.select` for web-only fallbacks. |
| Astro SSR crashes on RN primitives | `client:only="react"` islands; `ssr.noExternal` set above. |
| Hydration mismatches | Use `client:only="react"` (skip SSR); avoid `useEffect`-driven initial layout. |
| `Pressable` web a11y | Set `accessibilityRole="button"` + `accessibilityLabel`; verify with Playwright + Lighthouse. |
| Bundle size (RNW ~110 KB gz) | Acceptable for demo page; Lighthouse budget ≥ 90 (vs ≥ 95 elsewhere) per M2 exit gate. |

## Rollout

1. Scaffold package (`packages/ui-voice/{src,vitest.config.ts,…}`).
2. Move fixtures from `apps/marketing/src/fixtures/demo/` → `packages/ui-voice/src/fixtures/`; update marketing imports.
3. Implement empty component shells; export from `src/index.ts`.
4. Wire marketing Vite/Astro resolution + RNW dep; smoke-test a `client:only="react"` View/Text island.
5. Wire mobile `tailwind.config.js` content glob.
6. Implement `VoiceReportView` against `demoReport` fixture; snapshot test.
7. Replace M2.4 semantic-HTML report panel in `apps/marketing/src/components/VoiceDemo.tsx` with `<VoiceReportView report={demoReport} watermark="Demo report" />`.
8. Adopt `VoiceReportView` in the mobile voice-report screen under `app/(app)/`.
9. Add the integration tests above (Vitest, react-test-renderer, Playwright).
10. `VoiceNoteList` deferred to P3 mobile work.
11. Remove old M2.4 placeholder HTML once Step 7 lands.
12. Update this doc + `docs/marketing/plan-m2-voice-demo.md` + `docs/v4/architecture.md` index.

Each step is one commit (`feat(ui-voice): …`, `feat(marketing): …`, `feat(mobile): …`).

## Out of scope

- Audio playback / recording (mobile-only adapter; marketing demo discards audio).
- Real-time waveform (web-only `AnalyserNode` + `<canvas>` in `VoiceDemo.tsx`).
- API wiring / auth (M4+).
- PDF export, multi-language transcription, photo attachments (deferred).

## Pitfalls addressed

- **Pitfall 3** (visual drift) — shared package guarantees identical JSX.
- **Pitfall 13** (DI stubs become the spec) — default-wiring tests on both apps.
- **Pitfall 10** (tests/docs in later phases) — tests + docs ship in the same commit as the package.
