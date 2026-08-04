import { createMMKV } from 'react-native-mmkv';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  createMobileQueryClient,
  registerActiveQueryClient,
  resetQueryCache,
} from './query-client';

beforeEach(() => {
  createMMKV({ id: 'rq-cache' }).clearAll();
});

describe('resetQueryCache', () => {
  it('clears the query client registered for the active auth scope', async () => {
    const activeClient = createMobileQueryClient();
    activeClient.setQueryData(['projects'], [{ slug: 'private' }]);
    const unregister = registerActiveQueryClient(activeClient);

    await resetQueryCache();

    expect(activeClient.getQueryData(['projects'])).toBeUndefined();
    unregister();
  });

  it('does not let stale scope cleanup unregister the newer active client', async () => {
    const aliceClient = createMobileQueryClient();
    const unregisterAlice = registerActiveQueryClient(aliceClient);
    const bobClient = createMobileQueryClient();
    bobClient.setQueryData(['projects'], [{ slug: 'bob-private' }]);
    const unregisterBob = registerActiveQueryClient(bobClient);

    unregisterAlice();
    await resetQueryCache();

    expect(bobClient.getQueryData(['projects'])).toBeUndefined();
    unregisterBob();
  });
});
