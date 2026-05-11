# Token Usage (Sub-screen)

> **Prompt for design tool:** The Usage screen shows the user's AI token consumption broken down by category (transcription, LLM, image processing) and displays a monthly reset countdown. A card-based layout shows current month's total usage with a horizontal bar chart for each category. Below that is a History section listing individual usage events (date + provider/model + input/output/cached token counts). A monthly reset timer shows when the quota resets.

**Route:** `app/(app)/profile/usage.tsx`
**Reference screenshot:** (none)
**v3 source:** apps/mobile-v3/app/(app)/profile/usage.tsx
**Mobile-old source:** (?) — UsageBarChart component from mobile-old (find via grep in dump)

## Purpose

Display transparency about AI usage. Show user how many tokens have been consumed this month and when the quota resets. Itemized history helps users understand which operations are consuming tokens.

## Layout (top → bottom)

1. **ScreenHeader** — "Usage" title, back button.

2. **Summary section** (`mx-5 gap-2`):
   - **Total usage card**: Large text "1,234 tokens used this month" (text-lg font-bold) + reset countdown "Resets in 5 days" (text-sm text-muted-foreground).
   - Or: 3 side-by-side StatCard components showing:
     - Input tokens: value + label "Input".
     - Output tokens: value + label "Output".
     - Cached tokens: value + label "Cached".

3. **Usage by category** (if detailed breakdown exists):
   - Card for each category (Transcription, LLM, Image processing):
     - Category name (text-base font-semibold text-foreground).
     - Horizontal bar chart: `h-2 rounded-full bg-secondary` with inner bar `h-2 rounded-full bg-{category-color}` width=(count/totalCount)*100%.
     - Count + percentage: "1,234 (45%)" (text-sm text-muted-foreground).
   - Or: `UsageBarChart` component (ported from mobile-old) showing stacked or grouped bars.

4. **History section** (`mx-5 mt-6`):
   - Header: "Usage History" (text-sm font-semibold uppercase tracking-widest text-muted-foreground).
   - List of `HistoryRow` cards (or FlatList):
     - Each row: Card (variant="default" padding="md").
     - Date + time (text-sm text-muted-foreground): "May 11, 3:45 PM".
     - Provider + model (text-xs text-muted-foreground): "OpenAI / gpt-4".
     - Token columns (flex-row gap-3):
       - Input: "1,234" (text-base font-semibold) + "Input" (text-xs text-muted-foreground).
       - Output: "456" + "Output".
       - Cached: "78" + "Cached".
   - Loading state (if fetching): Skeleton cards for 3–5 rows.
   - Empty state (if no history): EmptyState icon (FileText) + "No usage yet".

5. **Footer spacer** (safe area).

## Components

| Component | Type | Props / state |
|-----------|------|---|
| `UsageScreen` | Screen | Reads usage summary from useUsage() hook. Reads history from useUsageHistory(). |
| `StatCard` | Component | label, value. Renders as Card with stat value + label text. |
| `UsageBarChart` | Component | (?) — ported from mobile-old. Shows stacked or grouped horizontal bars for each category. |
| `HistoryRow` | Component | item: HistoryEntry { createdAt, provider, model, inputTokens, outputTokens, cachedTokens }. |
| `HistoryList` | FlatList | data={history}, renderItem={HistoryRow}, keyExtractor. |

## Interactions

- **Scroll**: History list is scrollable. Top summary section may be sticky or scroll with list.
- **Tap history row** (optional): Expand to show full details or copy tokens to clipboard.

## Data shown

- **Summary**: Total tokens used this month (input + output + cached), monthly reset countdown.
- **Category breakdown**: Transcription / LLM / Image processing token counts and percentages.
- **History rows**: Timestamped entries with provider/model info and token counts.
- **Monthly reset**: Next reset date/time (e.g., "Resets in 5 days at 2:00 AM").

## Visual tokens

Use Unistyles tokens only:
- Summary card: `theme.colors.card` background, `theme.colors.foreground` title.
- Category bars: `theme.colors.foreground` (LLM color) / `theme.colors.warning.text` (transcription) / `theme.colors.success.text` (image processing) or custom category colors.
- History card: `theme.colors.card` background.
- Text: `theme.colors.foreground` (primary) / `theme.colors.mutedForeground` (secondary).
- Spacing: `mx-5` (outer padding), `gap-2` (summary cards), `gap-3` (token columns in history).
- Radii: `theme.radii.lg` (cards), rounded-full (bars).
- Icons: 20px in EmptyState.

## Acceptance checklist

- [ ] ScreenHeader shows "Usage" title + back button.
- [ ] Summary section shows total tokens used + reset countdown.
- [ ] (?) 3 StatCard tiles show Input / Output / Cached totals.
- [ ] (?) Category breakdown shows Transcription / LLM / Image processing with bar charts + counts.
- [ ] History section lists usage events in chronological order (newest first?).
- [ ] Each history row shows date/time + provider/model + input/output/cached tokens.
- [ ] Loading state shows skeleton cards while useUsageHistory is fetching.
- [ ] Empty state ("No usage yet") appears if history is empty.
- [ ] History list is scrollable (FlatList or ScrollView).
- [ ] All text uses Unistyles tokens.
- [ ] (?) Copy-to-clipboard on tap for token counts.
- [ ] (?) Monthly reset countdown updates in real-time (or at least on screen focus).
- [ ] (?) Provider/model in history helps user understand which operation consumed tokens.
