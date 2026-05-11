# File & Line Count Reduction Strategy

> Part of [Mobile v3 Architecture](./architecture.md)

## 6.1 Current vs Target

| Category | Current (v1) | Target (v3) | Reduction |
|----------|--------------|-------------|-----------|
| Screen files | 23 | 15 | 35% |
| Component files | 71 | 40 | 44% |
| Hook files | 22 | 8 | 64% |
| Lib/util files | 46 | 25 | 46% |
| Test files | 79 | 50 | 37% |
| **Total source** | **~167** | **~90** | **46%** |
| **Total with tests** | **~246** | **~140** | **43%** |

## 6.2 Specific Reduction Areas

### A. Direct Supabase Queries → Generated API Client

**Before (v1):** Each hook manually constructs Supabase queries

```typescript
// hooks/useLocalProjects.ts (158 lines)
const { data, error } = await backend
  .from("projects")
  .select("id, name, address, updated_at, owner_id")
  .order("updated_at", { ascending: false });
```

**After (v3):** Generated client, one-line calls

```typescript
// Generated from OpenAPI, type-safe
const { data } = await api.GET('/api/v1/projects');
```

**Impact:** Eliminates ~15 hook files with manual query construction

### B. NativeWind Class Strings → Unistyles Typed Styles

**Before (v1):** Repeated class strings, no type safety

```typescript
<View className="flex-1 bg-background p-4">
  <Text className="text-lg font-semibold text-foreground mb-2">
    {title}
  </Text>
</View>
```

**After (v3):** Typed styles, variants, theme access

```typescript
const { styles } = useStyles(stylesheet);
<View style={styles.container}>
  <Text style={styles.title}>{title}</Text>
</View>

const stylesheet = createStyleSheet((theme) => ({
  container: { flex: 1, backgroundColor: theme.colors.background, padding: theme.spacing.md },
  title: { ...theme.typography.h3, color: theme.colors.foreground, marginBottom: theme.spacing.sm },
}));
```

**Impact:** Centralized tokens, IDE autocomplete, no string typos

### C. Legends State Computed vs Hand-Rolled

**Before (v1):** Manual derived state in hooks

```typescript
// Multiple hooks computing similar derivations
function useActiveProjects() {
  const { data } = useProjects();
  return useMemo(() => data?.filter(p => p.status === 'active'), [data]);
}
```

**After (v3):** Computed observables in state layer

```typescript
// Centralized computed properties
export const activeProjects$ = computed(() =>
  projects$.get().filter(p => p.status === 'active')
);
```

**Impact:** Consolidates ~5-10 thin wrapper hooks

### D. Shared Validation (Zod in api-contract)

**Before (v1):** Duplicate Zod schemas in mobile + edge functions

```typescript
// apps/mobile/lib/generated-report.ts
const ReportSchema = z.object({ ... });

// supabase/functions/generate-report/report-schema.ts
const ReportSchema = z.object({ ... }); // Same schema, different file
```

**After (v3):** Single source in api-contract

```typescript
// packages/api-contract/src/schemas/report.ts
export const ReportSchema = z.object({ ... });

// Used by both API and mobile
import { ReportSchema } from '@harpa/api-contract';
```

**Impact:** Eliminates ~3 duplicate schema files, guarantees consistency

### E. Consolidated Hooks

**Before (v1):** Many thin wrapper hooks

```
hooks/
├── useLocalProjects.ts        # 158 lines
├── useLocalReports.ts         # 120 lines
├── useProjectFiles.ts         # 90 lines
├── useLocalReportNotes.ts     # 85 lines
├── useTokenUsage.ts           # 70 lines
├── useTokenUsageHistory.ts    # 65 lines
├── useAiProvider.ts           # 80 lines
├── useRefresh.ts              # 30 lines
├── ... (22 total)
```

**After (v3):** Generated + factory hooks

```
lib/api/
├── client.ts                  # 20 lines (generated wrapper)
├── hooks.ts                   # 150 lines (all query/mutation hooks)
└── keys.ts                    # 30 lines (query key factories)
```

**Impact:** 22 files → 3 files, ~800 lines → ~200 lines

## 6.3 Summary

| Technique | Files Reduced | Lines Saved |
|-----------|--------------|-------------|
| Generated API client | 15 → 3 | ~600 |
| Unistyles typed styles | Scattered → centralized | ~300 |
| Legends State computed | 10 → 3 | ~400 |
| Shared Zod schemas | 3 → 1 | ~200 |
| Route consolidation | 23 → 15 | ~400 |
| Test consolidation | 79 → 50 | ~1500 |
| **Total** | **~100 files** | **~3400 lines** |
