import React from 'react';
import { act, create } from 'react-test-renderer';
import {
  dehydrate,
  QueryClient,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type { PersistedClient } from '@tanstack/react-query-persist-client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AuthSessionContext,
  type AuthSessionValue,
} from '../auth/session-context';

const restoreByUser = vi.hoisted(
  () => new Map<string, () => Promise<PersistedClient | undefined>>(),
);

vi.mock('./query-persister', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('./query-persister')>();
  return {
    ...actual,
    createQueryPersister(userId: string) {
      return {
        buster: 'race-test',
        maxAge: 24 * 60 * 60 * 1_000,
        persister: {
          persistClient: async () => undefined,
          restoreClient: () => restoreByUser.get(userId)?.(),
          removeClient: async () => undefined,
        },
      };
    },
  };
});

import { SessionQueryProvider } from './session-query-provider';

const aliceProjects = [{ slug: 'alice-private' }];
const bobProjects = [{ slug: 'bob-private' }];

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

function persistedProjects(
  projects: Array<Record<string, string>>,
  dataUpdatedAt: number,
): PersistedClient {
  const client = new QueryClient();
  client.setQueryData(['projects'], projects, { updatedAt: dataUpdatedAt });
  return {
    timestamp: Date.now(),
    buster: 'race-test',
    clientState: dehydrate(client),
  };
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

async function flush(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function projectsFrom(client: QueryClient | null): unknown {
  return client?.getQueryData(['projects']);
}

beforeEach(() => {
  restoreByUser.clear();
});

describe('SessionQueryProvider restore isolation', () => {
  it('ignores a previous user restore that resolves after an account switch', async () => {
    let resolveAlice!: (value: PersistedClient) => void;
    restoreByUser.set(
      'usr_alice',
      () =>
        new Promise((resolve) => {
          resolveAlice = resolve;
        }),
    );
    restoreByUser.set(
      'usr_bob',
      async () => persistedProjects(bobProjects, 1),
    );

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
    await flush();

    activeSession = sessionFor('usr_bob');
    await act(async () => {
      tree.update(element());
    });
    await flush();
    expect(projectsFrom(activeClient)).toEqual(bobProjects);

    const lateRestoreStart = observed.length;
    await act(async () => {
      resolveAlice(persistedProjects(aliceProjects, 2));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(observed.slice(lateRestoreStart)).not.toContainEqual(aliceProjects);
    expect(projectsFrom(activeClient)).toEqual(bobProjects);
    tree.unmount();
  });
});
