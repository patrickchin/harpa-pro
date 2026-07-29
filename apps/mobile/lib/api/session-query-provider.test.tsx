import React from 'react';
import { act, create } from 'react-test-renderer';
import {
  QueryClient,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  persistQueryClientRestore,
  persistQueryClientSave,
} from '@tanstack/react-query-persist-client';
import { createMMKV } from 'react-native-mmkv';
import { beforeEach, describe, expect, it } from 'vitest';

import { AuthSessionContext, type AuthSessionValue } from '../auth/session-context';
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
      emailVerified: true,
      name: userId,
      displayName: userId,
      companyName: null,
      createdAt: '2026-07-30T00:00:00.000Z',
    },
    refresh: async () => undefined,
    signOut: async () => undefined,
    signIn: async () => undefined,
  };
}

function unauthenticatedSession(): AuthSessionValue {
  return {
    status: 'unauthenticated',
    user: null,
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

function CacheProbe({
  onRender,
}: {
  onRender: (client: QueryClient, value: unknown) => void;
}): null {
  const client = useQueryClient();
  const { data } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => [],
    enabled: false,
  });
  onRender(client, data);
  return null;
}

async function flushCacheRestore(
  expected: unknown,
  getClient: () => QueryClient | null,
): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const client = getClient();
    if (
      client &&
      JSON.stringify(client.getQueryData(['projects'])) ===
        JSON.stringify(expected)
    ) {
      return;
    }
  }
}

function projectsFrom(client: QueryClient | null): unknown {
  return client?.getQueryData(['projects']);
}

beforeEach(() => {
  createMMKV({ id: 'rq-cache' }).clearAll();
});

describe('SessionQueryProvider', () => {
  it('never renders a previous account snapshot during cold restore', async () => {
    await seedProjects('usr_alice', aliceProjects);
    const observed: unknown[] = [];
    let activeClient: QueryClient | null = null;

    let tree!: ReturnType<typeof create>;
    await act(async () => {
      tree = create(
        <AuthSessionContext.Provider value={sessionFor('usr_bob')}>
          <SessionQueryProvider fallback={null}>
            <CacheProbe
              onRender={(client, value) => {
                activeClient = client;
                observed.push(value);
              }}
            />
          </SessionQueryProvider>
        </AuthSessionContext.Provider>,
      );
    });
    await flushCacheRestore(undefined, () => activeClient);

    expect(observed).not.toContainEqual(aliceProjects);
    expect(projectsFrom(activeClient)).toBeUndefined();
    act(() => tree.unmount());
  });

  it('blocks old data while switching accounts, then restores only the new account', async () => {
    await seedProjects('usr_alice', aliceProjects);
    await seedProjects('usr_bob', bobProjects);
    const observed: unknown[] = [];
    let activeClient: QueryClient | null = null;
    let activeSession = sessionFor('usr_alice');
    const element = () => (
      <AuthSessionContext.Provider value={activeSession}>
        <SessionQueryProvider fallback={null}>
          <CacheProbe
            onRender={(client, value) => {
              activeClient = client;
              observed.push(value);
            }}
          />
        </SessionQueryProvider>
      </AuthSessionContext.Provider>
    );

    let tree!: ReturnType<typeof create>;
    await act(async () => {
      tree = create(element());
    });
    await flushCacheRestore(aliceProjects, () => activeClient);
    expect(projectsFrom(activeClient)).toEqual(aliceProjects);

    const switchRenderStart = observed.length;
    activeSession = sessionFor('usr_bob');
    await act(async () => {
      tree.update(element());
    });
    await flushCacheRestore(bobProjects, () => activeClient);

    expect(observed.slice(switchRenderStart)).not.toContainEqual(aliceProjects);
    expect(projectsFrom(activeClient)).toEqual(bobProjects);
    act(() => tree.unmount());
  });

  it('clears memory and persisted snapshots when a session expires', async () => {
    await seedProjects('usr_alice', aliceProjects);
    const observed: unknown[] = [];
    let activeClient: QueryClient | null = null;
    let activeSession = sessionFor('usr_alice');
    const element = () => (
      <AuthSessionContext.Provider value={activeSession}>
        <SessionQueryProvider fallback={null}>
          <CacheProbe
            onRender={(client, value) => {
              activeClient = client;
              observed.push(value);
            }}
          />
        </SessionQueryProvider>
      </AuthSessionContext.Provider>
    );

    let tree!: ReturnType<typeof create>;
    await act(async () => {
      tree = create(element());
    });
    await flushCacheRestore(aliceProjects, () => activeClient);

    const expiryRenderStart = observed.length;
    activeSession = unauthenticatedSession();
    await act(async () => {
      tree.update(element());
    });
    await flushCacheRestore(undefined, () => activeClient);

    expect(observed.slice(expiryRenderStart)).not.toContainEqual(aliceProjects);
    expect(projectsFrom(activeClient)).toBeUndefined();

    const alice = createQueryPersister('usr_alice');
    const restoredAfterExpiry = new QueryClient();
    await persistQueryClientRestore({
      queryClient: restoredAfterExpiry,
      persister: alice.persister,
      buster: alice.buster,
      maxAge: alice.maxAge,
    });
    expect(restoredAfterExpiry.getQueryData(['projects'])).toBeUndefined();
    act(() => tree.unmount());
  });
});
