# Data Layer Design

> Part of [Mobile v3 Architecture](./architecture.md)

## 5.1 Generated API Client

```typescript
// apps/mobile-v3/lib/api/client.ts
import { createApiClient } from '@harpa/api-contract';
import { backend } from './supabase';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL!;

async function getToken(): Promise<string | null> {
  const { data } = await backend.auth.getSession();
  return data.session?.access_token ?? null;
}

export const api = createApiClient(API_BASE_URL, getToken);
```

## 5.2 React Query Hook Patterns

```typescript
// apps/mobile-v3/lib/api/hooks.ts
import { useQuery, useMutation, useQueryClient, UseQueryOptions } from '@tanstack/react-query';
import { api } from './client';
import type { Project, Report, ReportNote } from '@harpa/api-contract';

// ─────────────────────────────────────────────────────────────
// Query Key Factories
// ─────────────────────────────────────────────────────────────

export const keys = {
  projects: {
    all: ['projects'] as const,
    list: () => [...keys.projects.all, 'list'] as const,
    detail: (id: string) => [...keys.projects.all, 'detail', id] as const,
  },
  reports: {
    all: ['reports'] as const,
    list: (projectId: string) => [...keys.reports.all, 'list', projectId] as const,
    detail: (id: string) => [...keys.reports.all, 'detail', id] as const,
  },
  notes: {
    all: ['notes'] as const,
    list: (reportId: string) => [...keys.notes.all, 'list', reportId] as const,
  },
  files: {
    all: ['files'] as const,
    list: (projectId: string) => [...keys.files.all, 'list', projectId] as const,
  },
};

// ─────────────────────────────────────────────────────────────
// Projects
// ─────────────────────────────────────────────────────────────

export function useProjects() {
  return useQuery({
    queryKey: keys.projects.list(),
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/projects');
      if (error) throw new Error(error.error.message);
      return data.data;
    },
  });
}

export function useProject(id: string | undefined) {
  return useQuery({
    queryKey: keys.projects.detail(id!),
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/projects/{id}', {
        params: { path: { id: id! } },
      });
      if (error) throw new Error(error.error.message);
      return data.data;
    },
    enabled: !!id,
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (input: { name: string; address?: string; clientName?: string }) => {
      const { data, error } = await api.POST('/api/v1/projects', { body: input });
      if (error) throw new Error(error.error.message);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.projects.all });
    },
  });
}

// ─────────────────────────────────────────────────────────────
// Reports
// ─────────────────────────────────────────────────────────────

export function useReports(projectId: string | undefined) {
  return useQuery({
    queryKey: keys.reports.list(projectId!),
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/projects/{projectId}/reports', {
        params: { path: { projectId: projectId! } },
      });
      if (error) throw new Error(error.error.message);
      return data.data;
    },
    enabled: !!projectId,
  });
}

export function useGenerateReport() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ reportId, provider, model }: { reportId: string; provider?: string; model?: string }) => {
      const { data, error } = await api.POST('/api/v1/reports/{id}/generate', {
        params: { path: { id: reportId } },
        body: { provider, model },
      });
      if (error) throw new Error(error.error.message);
      return data.data;
    },
    onSuccess: (data, { reportId }) => {
      // Optimistic update with generated report
      queryClient.setQueryData(keys.reports.detail(reportId), data);
    },
  });
}
```

## 5.3 Optimistic Update Patterns

**Addressing R3 (mutation success without optimistic update) and R11 (stable keys for pending→real swaps):**

```typescript
// Example: Creating a text note with optimistic update
export function useCreateNote(reportId: string) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (input: { body: string }) => {
      const { data, error } = await api.POST('/api/v1/reports/{reportId}/notes', {
        params: { path: { reportId } },
        body: input,
      });
      if (error) throw new Error(error.error.message);
      return data.data;
    },
    
    // Optimistic update BEFORE the request
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: keys.notes.list(reportId) });
      
      const previousNotes = queryClient.getQueryData<ReportNote[]>(keys.notes.list(reportId));
      
      const optimisticNote: ReportNote = {
        id: `temp-${Date.now()}`,  // Temporary ID
        reportId,
        body: input.body,
        kind: 'text',
        createdAt: new Date().toISOString(),
        isOptimistic: true,        // UI can show pending indicator
      };
      
      queryClient.setQueryData<ReportNote[]>(keys.notes.list(reportId), (old) => 
        old ? [optimisticNote, ...old] : [optimisticNote]
      );
      
      return { previousNotes };
    },
    
    // Replace optimistic with real on success
    onSuccess: (newNote, _, context) => {
      queryClient.setQueryData<ReportNote[]>(keys.notes.list(reportId), (old) =>
        old?.map(n => n.id.startsWith('temp-') ? newNote : n) ?? [newNote]
      );
    },
    
    // Rollback on error
    onError: (_, __, context) => {
      if (context?.previousNotes) {
        queryClient.setQueryData(keys.notes.list(reportId), context.previousNotes);
      }
    },
    
    // Always refetch for consistency
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: keys.notes.list(reportId) });
    },
  });
}
```

**File upload with pending→real bridging (R11):**

```typescript
// Pending photo needs stable key across the upload lifecycle
export function useNoteTimeline(reportId: string) {
  const { data: notes } = useNotes(reportId);
  const pendingJobs = useObservable(uploadQueue$.jobs);
  
  return useMemo(() => {
    const items: TimelineItem[] = [];
    const pendingFileIds = new Set<string>();
    
    // Build pending items with stable keys
    for (const job of pendingJobs.filter(j => j.reportId === reportId)) {
      if (job.fileId) {
        pendingFileIds.add(job.fileId);
      }
      
      items.push({
        type: 'pending',
        id: `pending-${job.id}`,      // Stable key based on job.id
        stableKey: job.id,             // Used for React key
        addedAt: job.addedAt,          // Original capture time for sorting
        job,
      });
    }
    
    // Build note items, bridging pending→real
    for (const note of notes ?? []) {
      const pendingJob = pendingJobs.find(j => j.fileId === note.fileId);
      
      items.push({
        type: note.kind,
        id: note.id,
        stableKey: pendingJob?.id ?? note.id,  // Use pending key if bridging
        addedAt: pendingJob?.addedAt ?? new Date(note.createdAt).getTime(),
        note,
      });
    }
    
    // Filter: don't show pending if real exists with same fileId
    const filtered = items.filter(item => {
      if (item.type === 'pending' && item.job.fileId) {
        return !notes?.some(n => n.fileId === item.job.fileId);
      }
      return true;
    });
    
    // Sort by addedAt (capture time, not server time)
    return filtered.sort((a, b) => b.addedAt - a.addedAt);
  }, [notes, pendingJobs, reportId]);
}
```

## 5.4 Error Handling Patterns

```typescript
// lib/api/errors.ts
import type { ApiError } from '@harpa/api-contract';

export function isApiError(error: unknown): error is { error: ApiError['error'] } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'error' in error &&
    typeof (error as any).error === 'object'
  );
}

export function getErrorMessage(error: unknown): string {
  if (isApiError(error)) {
    return error.error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'An unexpected error occurred';
}

// Usage in components
function CreateProjectForm() {
  const create = useCreateProject();
  
  const handleSubmit = async (data: FormData) => {
    try {
      await create.mutateAsync(data);
      router.back();
    } catch (error) {
      Alert.alert('Error', getErrorMessage(error));
    }
  };
}
```

## 5.5 Cache Invalidation Strategy

```typescript
// Invalidation patterns by entity relationship

const invalidationRules = {
  // Creating a project
  'project.create': [keys.projects.all],
  
  // Updating a project
  'project.update': (id: string) => [
    keys.projects.list(),
    keys.projects.detail(id),
  ],
  
  // Deleting a project
  'project.delete': (id: string) => [
    keys.projects.all,
    keys.reports.list(id),  // Associated reports
    keys.files.list(id),    // Associated files
  ],
  
  // Generating a report
  'report.generate': (id: string, projectId: string) => [
    keys.reports.detail(id),
    keys.reports.list(projectId),
  ],
  
  // Creating a note
  'note.create': (reportId: string) => [
    keys.notes.list(reportId),
  ],
  
  // Uploading a file
  'file.upload': (projectId: string, reportId: string) => [
    keys.files.list(projectId),
    keys.notes.list(reportId),  // File creates report_notes row
  ],
};
```
