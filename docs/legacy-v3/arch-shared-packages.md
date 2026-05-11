# Shared Packages

> Part of [Mobile v3 Architecture](./architecture.md)

## 4.1 Package Structure

```
packages/
├── report-core/              # Existing — keep as-is
│   └── src/
│       ├── generated-report.ts
│       ├── report-helpers.ts
│       └── index.ts
├── api-contract/             # NEW — OpenAPI spec + types
│   ├── src/
│   │   ├── generated/
│   │   │   ├── openapi.d.ts  # Generated from openapi.json
│   │   │   └── types.ts      # Re-exported types
│   │   ├── client.ts         # openapi-fetch wrapper
│   │   ├── errors.ts         # Error type guards
│   │   └── index.ts
│   ├── scripts/
│   │   └── generate.ts       # Type generation script
│   └── package.json
└── api/                      # NEW — Hono API server
    ├── src/
    │   ├── routes/
    │   │   ├── projects.ts
    │   │   ├── reports.ts
    │   │   ├── notes.ts
    │   │   ├── files.ts
    │   │   └── ai.ts
    │   ├── middleware/
    │   │   ├── auth.ts
    │   │   ├── error.ts
    │   │   └── rate-limit.ts
    │   ├── services/
    │   │   ├── ai.ts
    │   │   └── storage.ts
    │   ├── db/
    │   │   ├── schema.ts     # Drizzle schema
    │   │   └── client.ts
    │   └── index.ts
    ├── drizzle.config.ts
    └── package.json
```

## 4.2 @harpa/api-contract

```typescript
// packages/api-contract/src/client.ts
import createClient from 'openapi-fetch';
import type { paths } from './generated/openapi';

export function createApiClient(baseUrl: string, getToken: () => Promise<string | null>) {
  return createClient<paths>({
    baseUrl,
    headers: async () => {
      const token = await getToken();
      return token ? { Authorization: `Bearer ${token}` } : {};
    },
  });
}

export type ApiClient = ReturnType<typeof createApiClient>;

// Type exports
export type { paths, components } from './generated/openapi';
export type Project = components['schemas']['Project'];
export type Report = components['schemas']['Report'];
export type ReportNote = components['schemas']['ReportNote'];
export type FileMetadata = components['schemas']['FileMetadata'];
// ... etc
```

## 4.3 Shared Constants

```typescript
// packages/api-contract/src/constants.ts
// Single source of truth — no duplicate string literals

export const AI_PROVIDERS = ['kimi', 'openai', 'anthropic', 'google', 'zai', 'deepseek'] as const;
export type AiProvider = typeof AI_PROVIDERS[number];

export const PROVIDER_MODELS: Record<AiProvider, string[]> = {
  kimi: ['kimi-k2-0905-preview', 'kimi-k2-0711-preview', 'kimi-k2.6'],
  openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini'],
  anthropic: ['claude-sonnet-4-20250514', 'claude-haiku-4-5', 'claude-opus-4-1'],
  google: ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-2.5-pro'],
  zai: ['glm-4.6', 'glm-4-air'],
  deepseek: ['deepseek-chat', 'deepseek-reasoner'],
};

export const REPORT_STATUSES = ['draft', 'saved', 'archived'] as const;
export type ReportStatus = typeof REPORT_STATUSES[number];

export const PROJECT_ROLES = ['owner', 'editor', 'viewer'] as const;
export type ProjectRole = typeof PROJECT_ROLES[number];

export const FILE_CATEGORIES = ['image', 'document', 'voice-note', 'icon'] as const;
export type FileCategory = typeof FILE_CATEGORIES[number];
```
