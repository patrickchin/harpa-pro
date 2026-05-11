# Migration Path

> Part of [Mobile v3 Architecture](./architecture.md)

## 8.1 Parallel Development

```
haru3-reports/
├── apps/
│   ├── mobile/           # Existing app (maintained)
│   ├── mobile-v3/        # New app (development)
│   └── playground/       # Existing (unchanged)
├── packages/
│   ├── report-core/      # Existing (unchanged)
│   ├── api-contract/     # NEW
│   └── api/              # NEW
└── supabase/             # Existing (shared)
```

## 8.2 Shared Assets Strategy

```typescript
// apps/mobile-v3/app.config.ts
export default {
  // ...
  extra: {
    eas: {
      projectId: process.env.EAS_PROJECT_ID,
    },
  },
  // Share assets with v1
  assetBundlePatterns: [
    '../mobile/assets/**/*',  // Reuse existing assets
    './assets/**/*',
  ],
};
```

## 8.3 EAS Build Profile

```json
// apps/mobile-v3/eas.json
{
  "cli": { "version": ">= 10.0.0" },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "env": {
        "EXPO_PUBLIC_API_URL": "https://api-dev.harpa.app"
      }
    },
    "preview": {
      "distribution": "internal",
      "env": {
        "EXPO_PUBLIC_API_URL": "https://api-staging.harpa.app"
      }
    },
    "production": {
      "env": {
        "EXPO_PUBLIC_API_URL": "https://api.harpa.app"
      }
    }
  },
  "submit": {
    "production": {}
  }
}
```

## 8.4 Feature Flag for Gradual Rollout

```typescript
// Controlled via EAS Updates metadata
const useV3Api = () => {
  const update = Updates.useUpdates();
  return update?.manifest?.extra?.useV3Api === true;
};

// During transition period
function App() {
  const v3 = useV3Api();
  
  if (v3) {
    return <V3App />;
  }
  return <V1App />;
}
```

## 8.5 Migration Checklist

| Phase | Milestone | Criteria |
|-------|-----------|----------|
| P0 | API Contract | OpenAPI spec complete, types generating |
| P1 | API Core | All CRUD endpoints passing contract tests |
| P2 | Mobile Shell | Auth flow, navigation, design system |
| P3 | Feature Parity | All screens implemented, 80% tests passing |
| P4 | E2E Coverage | All 49 Maestro flows ported |
| P5 | Production | Beta rollout via feature flag |

---

## Appendix A: Key Decisions Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| API Framework | Hono on Fly.io | Fast, lightweight, excellent DX |
| ORM | Drizzle | Type-safe, SQL-like, good migrations |
| State (client) | Legends State | Reactive, persisted, fine-grained |
| State (server) | React Query | Battle-tested, excellent caching |
| Styling | Unistyles | Type-safe, variants, theme support |
| API Client | openapi-fetch | Generated from spec, type-safe |
| Auth | Supabase Auth (JWT) | Already integrated, phone OTP |
| Storage | Supabase Storage | Already integrated, signed URLs |

## Appendix B: Recurring Bugs Integration

This architecture addresses the documented recurring bugs (R1-R11):

| Bug Pattern | How v3 Addresses It |
|-------------|---------------------|
| R1 (Fixture stubs hiding writes) | Contract tests use real DB |
| R2 (optional: true on assertions) | CI lint rule, review checklist |
| R3 (No optimistic updates) | Documented patterns in §5.3 |
| R4 (Mock tests for boundary code) | Integration layer with Testcontainers |
| R5 (Short fixtures) | Fixture validation in CI |
| R6 (testID drift) | Catalog + coverage gate |
| R7 (Fixture-mode tagging) | Tag all AI flows |
| R8 (Hardcoded nav depth) | Derived cleanup in subflows |
| R9 (E2E triage order) | Documented in testing docs |
| R10 (RLS matrix) | Integration tests cover full matrix |
| R11 (Pending→real bridging) | useNoteTimeline pattern in §5.3 |

---

*End of architecture document.*
