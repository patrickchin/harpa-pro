/**
 * useRefresh — small helper that orchestrates pull-to-refresh across N
 * refetchers. Ported from
 * `../haru3-reports/apps/mobile/hooks/useRefresh.ts`.
 */
import { useCallback, useState } from 'react';

export function useRefresh(refetchers: ReadonlyArray<() => Promise<unknown>>) {
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all(refetchers.map((fn) => fn()));
    } finally {
      setRefreshing(false);
    }
  }, [refetchers]);

  return { refreshing, onRefresh };
}
