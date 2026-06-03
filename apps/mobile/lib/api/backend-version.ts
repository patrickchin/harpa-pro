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
  readyzCache.clear();
}

export type BackendReadyz = {
  ok: boolean;
  db?: string;
  head?: string | null;
  expected?: string;
  actual?: string | null;
  message?: string;
  status: number;
};

const readyzCache = new Map<string, Promise<BackendReadyz | null>>();

export async function fetchBackendReadyz(apiUrl: string): Promise<BackendReadyz | null> {
  const cached = readyzCache.get(apiUrl);
  if (cached) return cached;

  const promise = (async (): Promise<BackendReadyz | null> => {
    try {
      const res = await fetch(`${apiUrl.replace(/\/+$/, '')}/readyz`, {
        headers: { accept: 'application/json' },
      });
      const body = (await res.json().catch(() => null)) as Partial<BackendReadyz> | null;
      return {
        status: res.status,
        ok: Boolean(body?.ok ?? res.ok),
        db: typeof body?.db === 'string' ? body.db : undefined,
        head: typeof body?.head === 'string' || body?.head === null ? body?.head : undefined,
        expected: typeof body?.expected === 'string' ? body.expected : undefined,
        actual:
          typeof body?.actual === 'string' || body?.actual === null ? body?.actual : undefined,
        message: typeof body?.message === 'string' ? body.message : undefined,
      };
    } catch {
      return null;
    }
  })();

  readyzCache.set(apiUrl, promise);
  return promise;
}

export function useBackendReadyz(apiUrl: string | null): BackendReadyz | null {
  const [readyz, setReadyz] = useState<BackendReadyz | null>(null);

  useEffect(() => {
    if (!apiUrl) {
      setReadyz(null);
      return;
    }
    let cancelled = false;
    fetchBackendReadyz(apiUrl).then((r) => {
      if (!cancelled) setReadyz(r);
    });
    return () => {
      cancelled = true;
    };
  }, [apiUrl]);

  return readyz;
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
