# Mobile v3 + REST API Architecture

> **Status**: Planning document — North-star reference for `apps/mobile-v3` and `packages/api`.
>
> **Last updated**: 2026-05-10

## System Architecture Overview

### High-Level Component Diagram

```mermaid
flowchart TB
    subgraph Client["Mobile App (apps/mobile-v3)"]
        UI[React Native UI]
        RQ[TanStack React Query]
        LS[Legends State]
        API[Generated API Client]
    end

    subgraph API_Server["REST API (packages/api → Fly.io)"]
        HONO[Hono Router]
        DRIZZLE[Drizzle ORM]
        AUTH_MW[Auth Middleware]
        AI_SVC[AI Service Layer]
    end

    subgraph Supabase["Supabase (Managed)"]
        SB_AUTH[Supabase Auth]
        PG[(PostgreSQL + RLS)]
        STORAGE[Supabase Storage]
    end

    subgraph AI["AI Providers"]
        KIMI[Kimi]
        OPENAI[OpenAI]
        ANTHROPIC[Anthropic]
        GOOGLE[Google]
        ZAI[Z.AI]
        DEEPSEEK[DeepSeek]
    end

    UI --> RQ
    UI --> LS
    RQ --> API
    API -->|HTTPS + JWT| HONO
    HONO --> AUTH_MW
    AUTH_MW -->|Verify JWT| SB_AUTH
    HONO --> DRIZZLE
    DRIZZLE --> PG
    HONO --> AI_SVC
    AI_SVC --> KIMI & OPENAI & ANTHROPIC & GOOGLE & ZAI & DEEPSEEK
    API -->|Direct signed URLs| STORAGE
    SB_AUTH -->|Issues JWT| API
```

### Responsibility Split

| Component | Responsibilities | What Stays with Supabase |
|-----------|-----------------|-------------------------|
| **Supabase Auth** | JWT issuance, phone OTP, session management | ✅ All auth flows |
| **Supabase Storage** | File storage, signed URLs | ✅ All file storage |
| **Supabase Postgres** | Data persistence, RLS enforcement | ✅ Database hosting |
| **Hono API** | Business logic, validation, AI orchestration, rate limiting | N/A |
| **Mobile App** | UI, local state, caching, offline queue | N/A |

## Section Index

| # | Section | File | Description |
|---|---------|------|-------------|
| 2 | API Design | [arch-api-design.md](./arch-api-design.md) | Endpoints, auth model, error format, pagination, rate limiting, OpenAPI strategy |
| 3 | Mobile Architecture | [arch-mobile.md](./arch-mobile.md) | Directory structure, navigation, state management, component patterns, upload queue, audio |
| 4 | Shared Packages | [arch-shared-packages.md](./arch-shared-packages.md) | report-core, api-contract, shared constants |
| 5 | Data Layer Design | [arch-data-layer.md](./arch-data-layer.md) | Generated API client, React Query hooks, optimistic updates, error handling, cache invalidation |
| 6 | File & Line Count Reduction | [arch-reduction.md](./arch-reduction.md) | Current vs target file counts, specific reduction techniques |
| 7 | Testing Architecture | [arch-testing.md](./arch-testing.md) | Test pyramid, distribution, mock strategy, Maestro E2E |
| 8 | Migration Path | [arch-migration.md](./arch-migration.md) | Parallel development, EAS builds, feature flags, migration checklist, appendices |
