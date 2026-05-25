/**
 * Lightweight fetcher + React hook for the API's `/healthz` payload so
 * the BuildBadge can render the backend version next to the frontend
 * version.
 *
 * - Unauthenticated: `/healthz` is public; we don't drag the typed
 *   client through `lib/api/client.ts` for this since we want this to
 *   work even before sign-in.
 * - Best-effort: a network error renders as `?` on the badge — we
 *   never block UI on the version probe.
 * - Cached per `apiUrl` so flipping API targets refetches.
 */
import { useEffect, useState } from 'react';

export type BackendVersion = {
  version: string;
  gitCommit: string;
  buildTime?: string;
};

const cache = new Map<string, Promise<BackendVersion | null>>();

export async function fetchBackendVersion(apiUrl: string): Promise<BackendVersion | null> {
  const cached = cache.get(apiUrl);
  if (cached) return cached;

  const promise = (async (): Promise<BackendVersion | null> => {
    try {
      const res = await fetch(`${apiUrl.replace(/\/+$/, '')}/healthz`, {
        headers: { accept: 'application/json' },
      });
      if (!res.ok) return null;
      const body = (await res.json()) as Partial<BackendVersion> & { service?: string };
      if (typeof body.version !== 'string' || typeof body.gitCommit !== 'string') {
        return null;
      }
      return {
        version: body.version,
        gitCommit: body.gitCommit,
        buildTime: typeof body.buildTime === 'string' ? body.buildTime : undefined,
      };
    } catch {
      return null;
    }
  })();

  cache.set(apiUrl, promise);
  return promise;
}

/** Test seam — clears the in-memory cache between tests. */
export function __resetBackendVersionCache(): void {
  cache.clear();
}

/**
 * Resolves the backend version for the given API URL. Returns `null`
 * while pending or on failure (callers render a placeholder).
 */
export function useBackendVersion(apiUrl: string | null): BackendVersion | null {
  const [version, setVersion] = useState<BackendVersion | null>(null);

  useEffect(() => {
    if (!apiUrl) {
      setVersion(null);
      return;
    }
    let cancelled = false;
    fetchBackendVersion(apiUrl).then((v) => {
      if (!cancelled) setVersion(v);
    });
    return () => {
      cancelled = true;
    };
  }, [apiUrl]);

  return version;
}
