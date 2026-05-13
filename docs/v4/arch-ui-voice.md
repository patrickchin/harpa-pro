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

## Problem statement

The marketing M2 voice demo (launching pre-signup) and the mobile app
(launching post-P3) both need to render:

1. A **voice-notes list** — timeline of transcribed voice recordings.
2. A **voice-report view** — structured daily report with sections
   (summary, work completed, blockers, safety, next steps).

Duplicating these across two codebases means:
- Twice the maintenance burden when the report schema evolves.
- Visual drift between the demo UX and the app UX.
- Wasted effort porting design changes in both directions.

## Design alternatives considered

### Alt 1: Duplicate (semantic HTML in marketing, RN primitives in mobile)

**Rejected.** The M2 plan's original M2.4 approach — "render the JSON
with simple semantic HTML" in marketing, then separately build mobile
screens in P3. Fails on visual parity (Pitfall 3) and schema sync
burden. When the report payload gains a new section or renames a field,
both implementations drift.

### Alt 2: Shared package with react-native-web (selected)

Author components once with RN primitives (`View`, `Text`, `Pressable`,
`ScrollView`, `Image`) + NativeWind v4 `className` strings. Marketing
aliases `react-native` → `react-native-web` via Vite resolve. Mobile
consumes directly via Metro workspace resolution. Single Tailwind token
source (`content` globs include `packages/ui-voice/src/**/*.{ts,tsx}`
in both apps). **Platform-specific behavior** (audio playback, recording)
is injected via props/callbacks — the shared components are pure
presentational.

**Why this wins:**
- JSX structure identical on both sides → no translation layer.
- NativeWind classes work on web and native with the same token defs.
- Fixtures live in the shared package → both apps import the same data.
- When M4 wires the marketing demo to the real API, the component props
  are already typed from `api-contract` → mechanical swap.
- Mobile voice-notes screens (not yet built) consume the same components
  → guaranteed visual parity with the demo.

### Alt 3: Tamagui or NativeBase

**Rejected.** Hard rule #5 (AGENTS.md) — NativeWind only, no Unistyles,
no alternative style systems. Tamagui and NativeBase would require
learning new primitives, rewriting mobile's existing component library,
and risking the same Unistyles-style realignment drift that killed v3.

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

**Key decisions:**
- **Source-only** (no `build` script). Metro and Vite both handle TS.
- **peerDependencies** on `react`, `react-native`, `nativewind` so both
  apps provide their own versions (avoids React 18 vs 19 conflicts).
- **devDependencies** include `react-native-web` for Vitest jsdom tests.
- Depends on `api-contract` for report payload types.

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

## Build/resolution wiring

### Marketing (Astro + Vite)

**`apps/marketing/astro.config.mjs`** (new config):

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
        // Alias react-native to react-native-web for all RN imports
        "react-native": "react-native-web",
        // Ensure react-native-web's internals resolve correctly
        "react-native/Libraries/Components/View/ViewStylePropTypes":
          "react-native-web/dist/exports/View/ViewStylePropTypes",
        "react-native/Libraries/Image/AssetRegistry":
          "react-native-web/dist/modules/AssetRegistry",
      },
      extensions: [".web.js", ".web.ts", ".web.tsx", ".js", ".ts", ".tsx", ".json"],
    },
    optimizeDeps: {
      include: [
        "react-native-web",
        "@harpa/ui-voice",
      ],
    },
    ssr: {
      noExternal: [
        "@harpa/ui-voice",
        "nativewind",
        "react-native-css-interop",
      ],
    },
  },
});
```

**Key decisions:**
- `react-native` → `react-native-web` alias at the Vite resolve layer.
- `optimizeDeps.include` pre-bundles RNW + the shared package.
- `ssr.noExternal` forces SSR to bundle the shared package inline
  (Astro's SSR phase runs during static build; the package must not
  be treated as an external CJS module).
- `.web.{js,ts,tsx}` extension priority lets platform-specific files
  override shared ones (useful for images, but we don't use it yet).

**`apps/marketing/package.json`** (add dependencies):

```json
"dependencies": {
  "@harpa/ui-voice": "workspace:*",
  "react-native-web": "^0.19.13"
}
```

**`apps/marketing/src/styles/globals.css`** (extend existing):

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

/* React Native Web reset — matches mobile's base styles */
#root {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}
```

**Tailwind content glob** (if marketing has a `tailwind.config.*`):

```js
module.exports = {
  content: [
    "./src/**/*.{astro,html,js,jsx,ts,tsx}",
    "../../packages/ui-voice/src/**/*.{ts,tsx}",
  ],
  // ... existing theme
};
```

If marketing uses `@tailwindcss/vite` plugin (Tailwind v4), the `content`
glob is auto-scanned from `@import` dependencies. Verify that
`packages/ui-voice/src/**` is picked up; if not, add an explicit
`@source` directive in `globals.css`:

```css
@import "tailwindcss";
@source "../../packages/ui-voice/src";
```

### Mobile (Expo + Metro)

Metro already resolves workspace packages via symlinks (pnpm hoisted).
No config change required — `import { VoiceReportView } from '@harpa/ui-voice'`
works out of the box.

**`apps/mobile/tailwind.config.js`** (extend existing `content`):

```js
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
    './screens/**/*.{js,jsx,ts,tsx}',
    './lib/**/*.{js,jsx,ts,tsx}',
    '../../packages/ui-voice/src/**/*.{ts,tsx}',  // ← ADD THIS
  ],
  // ... existing presets, theme
};
```

**Babel config** (no change needed):

The existing `babel.config.js` already loads `nativewind/babel`. The
shared package's NativeWind classes will transform correctly when Metro
processes `packages/ui-voice/src/**/*.tsx`.

## NativeWind v4 sharing strategy

Both apps consume the **same Tailwind token definitions** (colors,
spacing, typography). Mobile's `lib/design-tokens/colors.ts` is the
source. Marketing either:

1. **Imports the same file** via a symlink or workspace alias, OR
2. **Duplicates the hex values** into its own Tailwind config (acceptable
   because marketing is a separate brand surface and may diverge post-M2).

**Recommendation for M2:** Keep them separate for now. Marketing's color
palette is already defined in `apps/marketing/src/styles/globals.css`
or its Tailwind config. The shared package uses **semantic token names**
(`text-foreground`, `bg-card`, `border-border`) that both apps define.
Visual parity is enforced by manual review, not by forcing identical
hex values.

Post-M2, if we want stricter token sync, we can extract
`packages/design-tokens` with a `colors.ts` both apps import.

### react-native-css-interop version

The existing patch (`patches/react-native-css-interop@0.2.3.patch`)
removes the `react-native-worklets/plugin` requirement. Both apps MUST
use the **same patched version** of `react-native-css-interop` to avoid
Babel transform mismatches.

**Action:** Pin `react-native-css-interop@0.2.3` in
`packages/ui-voice/package.json` as a `devDependency` (for tests) and
verify marketing installs the same patched version via its hoisted
resolution.

If marketing doesn't install `react-native-css-interop` directly (because
it's only a transitive dep of `nativewind`), the patch still applies via
pnpm's global patch system.

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

**Responsibilities:**
- Renders a scrollable list of `VoiceNoteListItem`.
- Shows skeleton placeholders when `loading`.
- Shows `VoiceReportEmptyState` when `notes.length === 0 && !loading`.
- No playback logic — `onNotePlay` is injected by the parent.

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

**Renders:**
- Transcript text (truncated to 2 lines with ellipsis).
- Duration badge (MM:SS format).
- Play/pause button (icon switches based on `note.isPlaying`).
- Delete button (three-dot menu or trash icon).
- Timestamp (relative: "2 hours ago" or absolute: "Jan 15, 10:30 AM").

No audio playback inside the component — `onPlay` is a callback.

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

**Responsibilities:**
- Renders the full report with section headings.
- Each section is a `VoiceReportSection` (or specialised variants like
  `VoiceReportSummary`, `VoiceReportWorkCompleted`, etc.).
- If `loading`, shows `VoiceReportSkeleton`.
- If `watermark` is set, overlays a subtle "Demo" badge in the top-right.
- Scrollable on mobile; print-friendly on web.

### `VoiceReportSection`

```tsx
export interface VoiceReportSectionProps {
  title: string;
  items: ReportSection[];
  icon?: React.ReactNode; // mobile: Lucide icon; web: SVG
  variant?: "default" | "warning" | "success";
  className?: string;
}
```

**Renders:**
- Section heading with icon.
- Bulleted list or numbered list (depending on section type).
- Each item is a `Text` block with `className="text-body text-foreground"`.

### `VoiceReportEmptyState`

```tsx
export interface VoiceReportEmptyStateProps {
  message: string;
  icon?: React.ReactNode;
  className?: string;
}
```

Reuses the mobile `EmptyState` primitive pattern (centered icon + message).

### `VoiceReportSkeleton`

Shows animated skeleton placeholders for the report sections. Uses the
mobile `Skeleton` primitive pattern (grey pulse).

## Fixtures

Moved from `apps/marketing/src/fixtures/demo/` to
`packages/ui-voice/src/fixtures/` so both apps import the same data.

### `demo-transcript.json`

```json
{
  "text": "Morning check-in, January 15th. We completed the foundation pour for the north wing, approximately 120 cubic yards of concrete. The rebar inspection passed yesterday, so we were cleared to proceed. Weather held up nicely, no rain delays. Crew of eight on site. One minor safety incident: Tom slipped near the washout pit, no injury but we reviewed non-slip boot requirements with the whole crew. Concrete supplier arrived 20 minutes late, but we adjusted the schedule and still finished by 2 PM. Next steps: tomorrow we'll start the formwork for the south wing footings, and the electrician is scheduled to rough-in the panel boxes on Thursday.",
  "language": "en",
  "durationSec": 47
}
```

### `demo-report.json`

Typed from `api-contract` schemas:

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

**Typed export:**

```ts
// packages/ui-voice/src/fixtures/index.ts
import demoTranscriptData from './demo-transcript.json';
import demoReportData from './demo-report.json';
import type { VoiceReport } from '../types';

export const demoTranscript = demoTranscriptData;
export const demoReport = demoReportData as VoiceReport;
```

Mobile dev-gallery and marketing demo both:

```ts
import { demoReport } from '@harpa/ui-voice/fixtures';
```

## Test strategy

### Unit tests (Vitest + jsdom + react-native-web)

Located in `packages/ui-voice/src/__tests__/`.

**Setup:**

```ts
// packages/ui-voice/vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
  },
  resolve: {
    alias: {
      'react-native': 'react-native-web',
    },
  },
});
```

```ts
// packages/ui-voice/vitest.setup.ts
import '@testing-library/jest-dom/vitest';

// Mock Lucide icons if they cause issues in jsdom
vi.mock('lucide-react-native', () => ({
  Clock: () => null,
  Check: () => null,
  AlertTriangle: () => null,
  // ... other icons used
}));
```

**Test cases:**

1. **VoiceNoteList.test.tsx**
   - Renders list items for each note.
   - Shows skeleton when `loading`.
   - Shows empty state when `notes.length === 0`.
   - Calls `onNotePress` when item is tapped.
   - Snapshot test for structure.

2. **VoiceReportView.test.tsx**
   - Renders all sections (summary, work, blockers, safety, next steps).
   - Shows watermark when `watermark` prop is set.
   - Shows skeleton when `loading`.
   - Snapshot test for full report.

**Coverage gate:** ≥ 80% line coverage on `packages/ui-voice/src/components/`.

### Integration tests (mobile)

Mobile app adds **one** integration test in `apps/mobile/__tests__/` that
wraps `VoiceReportView` in a real screen with the mobile theme/providers
and asserts it renders without crashing. Uses `react-test-renderer` +
`act` per the react19-testing user memory pattern.

```tsx
// apps/mobile/__tests__/VoiceReportView.integration.test.tsx
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

### Integration tests (marketing)

Marketing adds **one** Playwright case in `apps/marketing/e2e/` that
renders the voice demo island with the shared components and asserts
the report sections are visible.

```ts
// apps/marketing/e2e/voice-demo-shared-ui.spec.ts
import { test, expect } from '@playwright/test';

test('voice demo renders report from shared package', async ({ page }) => {
  await page.goto('/voice-demo'); // M2 demo page
  
  // Wait for demo to finish scripted pipeline
  await page.locator('[data-testid="report-view"]').waitFor();
  
  // Assert section headings from demo-report.json
  await expect(page.locator('text=Work Completed')).toBeVisible();
  await expect(page.locator('text=Blockers')).toBeVisible();
  await expect(page.locator('text=Safety')).toBeVisible();
  await expect(page.locator('text=Next Steps')).toBeVisible();
  
  // Assert one item from each section
  await expect(page.locator('text=Foundation pour (north wing)')).toBeVisible();
  await expect(page.locator('text=Concrete supplier 20 minutes late')).toBeVisible();
});
```

### Default-wiring tests (rule #10)

Both apps must have **at least one test** that imports the shared package
WITHOUT mocking/stubbing any internal dependencies and asserts the
components render. This proves the default Metro/Vite wiring works.

The integration tests above satisfy this requirement.

## Risks and mitigations

### Risk 1: react-native-web + NativeWind v4 compatibility

**Symptom:** RNW may not support all NativeWind transforms, or
`react-native-css-interop` may behave differently on web vs native.

**Mitigation:**
1. The existing mobile app already uses the patched
   `react-native-css-interop@0.2.3` successfully. Pin that version.
2. Start with a **minimal smoke test** in the shared package (`Button`,
   `Text`, `View` with basic Tailwind classes) before porting complex
   components.
3. If a class doesn't work on web (e.g., `shadow-*` behaves differently),
   use platform-specific overrides via `Platform.select` or web-specific
   CSS (acceptable for edge cases).

**Status:** Low probability given mobile's working setup, but test early.

### Risk 2: Astro SSR vs client-only islands

**Symptom:** RNW components may expect a browser `window` and crash
during Astro's static build SSR phase.

**Mitigation:**
1. Mark all islands that use `@harpa/ui-voice` as `client:visible` or
   `client:load` to skip SSR.
2. Add `ssr.noExternal: ["@harpa/ui-voice", "react-native-web"]` to
   force Astro to bundle them inline (done above).
3. If Astro still tries to SSR, wrap the import in a dynamic `import()`
   client-side only.

**Status:** Medium probability. Test on first island import.

### Risk 3: Hydration mismatches

**Symptom:** Astro's static HTML doesn't match the React hydration output
from RNW, causing console warnings or layout shifts.

**Mitigation:**
1. Use `client:only="react"` directive if `client:visible` causes
   mismatches. This skips SSR entirely and renders only client-side.
2. Ensure `VoiceReportView` doesn't rely on `useEffect` for initial
   layout (hydration mismatch vector).

**Status:** Low probability if we use `client:only="react"` from the start.

### Risk 4: Pressable web accessibility

**Symptom:** `Pressable` may not have correct ARIA roles/keyboard nav
on web by default.

**Mitigation:**
1. Wrap interactive elements in `Pressable` with explicit
   `accessibilityRole="button"` and `accessibilityLabel`.
2. RNW translates these to `<button>` or `<div role="button">`.
3. Verify with Lighthouse accessibility audit in Playwright.

**Status:** Low probability (RNW handles this), but verify.

### Risk 5: Bundle size

**Symptom:** Marketing bundle grows significantly after adding RNW +
shared package.

**Mitigation:**
1. RNW is ~110 KB gzipped (acceptable for a demo page that's already
   loading React).
2. The shared package is JSX + styles (no heavy deps).
3. Lighthouse budget: marketing demo page is allowed ≥ 90 (vs ≥ 95 for
   non-demo pages) per M2 exit gate.

**Status:** Low risk. Monitor Lighthouse after M2.4.

## Acceptance contract (rule #10)

Both apps must have **default-wiring integration tests** that import the
shared package and assert rendering without injecting stubs. Specifically:

1. **Mobile:** `apps/mobile/__tests__/VoiceReportView.integration.test.tsx`
   renders `VoiceReportView` with `demoReport` fixture and asserts
   `toJSON()` is truthy. Uses `react-test-renderer` + `act`.

2. **Marketing:** `apps/marketing/e2e/voice-demo-shared-ui.spec.ts`
   visits the demo page, waits for the report to render, and asserts
   section headings are visible. Uses Playwright + real browser.

These tests MUST NOT inject any stubs for RNW, NativeWind, or the shared
package internals. If they pass, the default wiring works.

## Incremental rollout (implementation checklist)

### Step 1: Scaffold the package

```bash
mkdir -p packages/ui-voice/src/{components,types,fixtures,__tests__}
touch packages/ui-voice/package.json
touch packages/ui-voice/tsconfig.json
touch packages/ui-voice/vitest.config.ts
touch packages/ui-voice/vitest.setup.ts
touch packages/ui-voice/src/index.ts
pnpm install
```

**Commit:** `feat(ui-voice): scaffold shared package structure`

### Step 2: Move fixtures from marketing

```bash
mv apps/marketing/src/fixtures/demo/report.json packages/ui-voice/src/fixtures/demo-report.json
mv apps/marketing/src/fixtures/demo/transcript.json packages/ui-voice/src/fixtures/demo-transcript.json
```

Create `packages/ui-voice/src/fixtures/index.ts` with typed exports.

Update `apps/marketing/src/components/VoiceDemo.tsx` to import from
`@harpa/ui-voice/fixtures`.

**Commit:** `refactor(ui-voice): move demo fixtures to shared package`

### Step 3: Implement base components (no behavior)

Create empty shells for:
- `VoiceReportView.tsx`
- `VoiceReportSection.tsx`
- `VoiceReportSkeleton.tsx`
- `VoiceReportEmptyState.tsx`

Each renders a placeholder `<View><Text>TODO</Text></View>`.

Export from `src/index.ts`.

**Commit:** `feat(ui-voice): add report component shells`

### Step 4: Wire Vite/Astro resolution

Update `apps/marketing/astro.config.mjs` with RNW alias + optimizeDeps.

Add `react-native-web` to `apps/marketing/package.json`.

Run `pnpm install`.

Smoke test: create a tiny Astro page that imports
`import { View, Text } from 'react-native'` and renders
`<View><Text>Hello RNW</Text></View>` in a `client:only="react"` island.
Verify it builds without crashing.

**Commit:** `feat(marketing): wire react-native-web alias for shared UI`

### Step 5: Wire mobile Tailwind content glob

Update `apps/mobile/tailwind.config.js` to include
`../../packages/ui-voice/src/**/*.{ts,tsx}`.

Rebuild mobile to verify Metro + NativeWind pick up the new glob.

**Commit:** `feat(mobile): include ui-voice in Tailwind content scan`

### Step 6: Implement VoiceReportView (full)

Port the report rendering logic from the M2.4 semantic HTML version into
`VoiceReportView.tsx` using RN primitives + NativeWind classes.

Use `demoReport` fixture for snapshot test.

**Commit:** `feat(ui-voice): implement VoiceReportView`

### Step 7: Test in marketing demo page

Update `apps/marketing/src/components/VoiceDemo.tsx` (M2.3 result reveal)
to replace the semantic HTML report panel with:

```tsx
import { VoiceReportView } from '@harpa/ui-voice';
import { demoReport } from '@harpa/ui-voice/fixtures';

// In the "done" state:
<VoiceReportView report={demoReport} watermark="Demo report" />
```

Verify it renders correctly in `pnpm dev` (marketing).

**Commit:** `feat(marketing): use shared VoiceReportView in demo`

### Step 8: Test in mobile dev-gallery

Create `apps/mobile/app/(dev)/voice-report.tsx`:

```tsx
import { VoiceReportView } from '@harpa/ui-voice';
import { demoReport } from '@harpa/ui-voice/fixtures';

export default function VoiceReportDevScreen() {
  return (
    <ScrollView className="flex-1 bg-background">
      <VoiceReportView report={demoReport} watermark="Dev" />
    </ScrollView>
  );
}
```

Add entry to `apps/mobile/screens/dev-gallery.rows.ts`.

Verify it renders correctly in `pnpm ios`.

**Commit:** `feat(mobile): add VoiceReportView to dev-gallery`

### Step 9: Add integration tests (both apps)

Create `packages/ui-voice/src/__tests__/VoiceReportView.test.tsx` (Vitest
+ jsdom + RNW).

Create `apps/mobile/__tests__/VoiceReportView.integration.test.tsx`
(react-test-renderer + act).

Create `apps/marketing/e2e/voice-demo-shared-ui.spec.ts` (Playwright).

Run `pnpm test` and `pnpm test:e2e` to verify all pass.

**Commit:** `test(ui-voice): add integration tests for VoiceReportView`

### Step 10: Implement VoiceNoteList (future, not M2)

Deferred to P3 mobile voice-notes screen work. The structure is ready;
the component is a TODO.

**Commit:** (P3) `feat(ui-voice): implement VoiceNoteList`

### Step 11: Delete placeholder semantic HTML (M2.4 cleanup)

Once Step 7 is merged and the marketing demo renders the report from the
shared package, delete the old semantic HTML rendering code from M2.4.

**Commit:** `refactor(marketing): remove placeholder semantic HTML report`

### Step 12: Update docs

Revise `docs/marketing/plan-m2-voice-demo.md` (see diff below).

Add this doc (`docs/v4/arch-ui-voice.md`).

Update `docs/v4/architecture.md` to add this doc to the section index.

**Commit:** `docs(ui-voice): architecture + M2 plan revision`

## Explicit exclusions (not in this design)

- **Audio playback** — mobile adapter lives in
  `apps/mobile/features/voice/useVoiceNotePlayer.ts`. Marketing demo
  doesn't need playback (M2 discards audio). Injected via `onNotePlay`
  callback prop when `VoiceNoteList` is built in P3.
- **Real-time waveform** — lives in `apps/marketing/src/components/VoiceDemo.tsx`
  only. Not shared (uses `AnalyserNode` + `<canvas>`, web-only).
- **API wiring** — M4. Demo uses fixtures; mobile uses React Query hooks.
- **Auth** — M4+. Demo is anonymous; mobile is authenticated.
- **PDF export** — mobile feature, not shared.
- **Multi-language transcription** — deferred.
- **Photo attachments in reports** — future schema change, deferred.

## Pitfalls addressed

- **Pitfall 3** (visual drift) — shared package guarantees identical JSX.
- **Pitfall 13 / Pattern R5** (DI stubs become the spec) — default-wiring
  integration tests on both apps (rule #10).
- **Pitfall 10** (tests/docs in later phases) — tests and docs ship in
  the same commit as the package.

## Design summary

- **Package:** `packages/ui-voice` (source-only, peer deps on React +
  RN + NativeWind).
- **Cross-platform layer:** react-native-web (aliased in marketing Vite).
- **Styling:** NativeWind v4 with shared Tailwind content globs.
- **Fixtures:** Moved to shared package, typed from `api-contract`.
- **Behavior injection:** Audio playback, recording, API calls injected
  via props/callbacks — components are pure presentational.
- **Tests:** Vitest + jsdom + RNW for unit; react-test-renderer for
  mobile integration; Playwright for marketing E2E. Coverage ≥ 80%.
- **Risks:** RNW+NativeWind compat (low), Astro SSR (medium), hydration
  (low), Pressable a11y (low), bundle size (low). Mitigations documented.

---

**Next steps:** Proceed with incremental rollout (12 steps above). Start
with Step 1 (scaffold) and smoke-test Vite resolution (Step 4) before
porting full report logic (Step 6).
