import React from 'react';
import { act, create } from 'react-test-renderer';
import { QueryClient, useQuery, type QueryClient as QueryClientType } from '@tanstack/react-query';
import { persistQueryClientSave } from '@tanstack/react-query-persist-client';
import { createMMKV } from 'react-native-mmkv';
import { beforeEach, describe, expect, it } from 'vitest';

import { AuthSessionContext, type AuthSessionValue } from '../auth/session-context';
import { queryClient } from './query-client';
import { createQueryPersister, shouldDehydrateQuery } from './query-persister';
import { SessionQueryProvider } from './session-query-provider';

const aliceProjects = [{ slug: 'alice-private', name: 'Alice Private' }];
const bobProjects = [{ slug: 'bob-private', name: 'Bob Private' }];

function sessionFor(userId: string): AuthSessionValue {
  return {
    status: 'authenticated',
    user: {
      id: userId,
      email: `${userId}@example.com`,
      displayName: userId,
      companyName: null,
    },
    refresh: async () => undefined,
    signOut: async () => undefined,
    signIn: async () => undefined,
  };
}

async function seedProjects(
  userId: string,
  projects: Array<Record<string, string>>,
): Promise<void> {
  const cache = new QueryClient();
  cache.setQueryData(['projects'], projects);
  const scoped = createQueryPersister(userId);
  await persistQueryClientSave({
    queryClient: cache,
    persister: scoped.persister,
    buster: scoped.buster,
    dehydrateOptions: { shouldDehydrateQuery },
  });
}

function CacheProbe({ onRender }: { onRender: (value: unknown) => void }): null {
  const { data } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => [],
    enabled: false,
  });
  onRender(data);
  return null;
}

async function flushCacheRestore(
  expected: unknown,
  client: QueryClientType = queryClient,
): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    if (JSON.stringify(client.getQueryData(['projects'])) === JSON.stringify(expected)) {
      return;
    }
  }
}

beforeEach(() => {
  queryClient.clear();
  createMMKV({ id: 'rq-cache' }).clearAll();
});

describe('SessionQueryProvider', () => {
  it('never renders a previous account snapshot during cold restore', async () => {
    await seedProjects('usr_alice', aliceProjects);
    const observed: unknown[] = [];

    await act(async () => {
      create(
        <AuthSessionContext.Provider value={sessionFor('usr_bob')}>
          <SessionQueryProvider fallback={null}>
            <CacheProbe onRender={(value) => observed.push(value)} />
          </SessionQueryProvider>
        </AuthSessionContext.Provider>,
      );
    });
    await flushCacheRestore(undefined);

    expect(observed).not.toContainEqual(aliceProjects);
    expect(queryClient.getQueryData(['projects'])).toBeUndefined();
  });

  it('blocks old data while switching accounts, then restores only the new account', async () => {
    await seedProjects('usr_alice', aliceProjects);
    await seedProjects('usr_bob', bobProjects);
    const observed: unknown[] = [];
    let activeSession = sessionFor('usr_alice');
    const element = () => (
      <AuthSessionContext.Provider value={activeSession}>
        <SessionQueryProvider fallback={null}>
          <CacheProbe onRender={(value) => observed.push(value)} />
        </SessionQueryProvider>
      </AuthSessionContext.Provider>
    );

    let tree!: ReturnType<typeof create>;
    await act(async () => {
      tree = create(element());
    });
    await flushCacheRestore(aliceProjects);
    expect(queryClient.getQueryData(['projects'])).toEqual(aliceProjects);

    const switchRenderStart = observed.length;
    activeSession = sessionFor('usr_bob');
    await act(async () => {
      tree.update(element());
    });
    await flushCacheRestore(bobProjects);

    expect(observed.slice(switchRenderStart)).not.toContainEqual(aliceProjects);
    expect(queryClient.getQueryData(['projects'])).toEqual(bobProjects);
  });
});
