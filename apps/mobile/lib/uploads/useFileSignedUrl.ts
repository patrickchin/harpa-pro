/**
 * `useFileSignedUrl(fileId)` — fetch and cache a short-lived signed
 * GET URL for an R2-backed file.
 *
 * Thin wrapper over the generated `useFileUrlQuery` hook. We set
 * cache defaults specifically for signed URLs:
 *
 *   - `staleTime` defaults to 4 minutes. The API mints URLs that
 *     expire in 5 minutes (see `services/storage.ts`); refetching at
 *     4 leaves slack for clock skew + in-flight image loads.
 *   - `gcTime` is 10 minutes so a screen remount inside the same
 *     navigation session reuses the same URL (and therefore the same
 *     `expo-image` disk-cache entry — see `CachedImage`).
 *   - `enabled` is auto-false when `fileId` is null so callers can
 *     declare the hook unconditionally.
 */
import { useFileUrlQuery } from '@/lib/api/hooks';

export interface UseFileSignedUrlOptions {
  /** Override the auto-disable when `fileId` is null. */
  enabled?: boolean;
}

const STALE_MS = 4 * 60 * 1000;
const GC_MS = 10 * 60 * 1000;

export function useFileSignedUrl(
  fileId: string | null | undefined,
  options: UseFileSignedUrlOptions = {},
) {
  return useFileUrlQuery(
    { params: { id: (fileId ?? '') as never } },
    {
      enabled: options.enabled ?? Boolean(fileId),
      staleTime: STALE_MS,
      gcTime: GC_MS,
      retry: 1,
    },
  );
}
