/**
 * Tests for `lib/api/query-persister.ts`.
 *
 * Covers:
 *  - MMKV-backed `AsyncStorage` adapter round-trips strings.
 *  - `shouldDehydrateQuery` allowlist + optimistic-row exclusion.
 *  - Full persister round-trip: dehydrate → persist → restore.
 *  - Buster mismatch nukes the cache on restore.
 *  - `removeClient()` wipes the persisted blob (logout path).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { QueryClient, type Query } from '@tanstack/react-query';
import {
  persistQueryClientRestore,
  persistQueryClientSave,
} from '@tanstack/react-query-persist-client';
import { createMMKV } from 'react-native-mmkv';
import {
  createMmkvAsyncStorage,
  createQueryPersister,
  shouldDehydrateQuery,
} from './query-persister';

function clearPersistedStore(): void {
  createMMKV({ id: 'rq-cache' }).clearAll();
}

function makeQuery(
  key: readonly unknown[],
  data: unknown,
  status: 'success' | 'pending' | 'error' = 'success',
): Query {
  return {
    queryKey: key,
    state: { status, data },
  } as unknown as Query;
}

describe('createMmkvAsyncStorage', () => {
  beforeEach(() => clearPersistedStore());

  it('round-trips strings', async () => {
    const s = createMmkvAsyncStorage();
    expect(await s.getItem('k')).toBeNull();
    await s.setItem('k', 'hello');
    expect(await s.getItem('k')).toBe('hello');
    await s.removeItem('k');
    expect(await s.getItem('k')).toBeNull();
  });
});

describe('shouldDehydrateQuery', () => {
  it('allows whitelisted query heads', () => {
    expect(shouldDehydrateQuery(makeQuery(['projects'], []))).toBe(true);
    expect(shouldDehydrateQuery(makeQuery(['project', { project: 'p' }], {}))).toBe(true);
    expect(shouldDehydrateQuery(makeQuery(['me'], {}))).toBe(true);
    expect(shouldDehydrateQuery(makeQuery(['meLimits'], {}))).toBe(true);
  });

  it('blocks non-whitelisted heads', () => {
    expect(shouldDehydrateQuery(makeQuery(['meUsage'], {}))).toBe(false);
    expect(shouldDehydrateQuery(makeQuery(['health'], {}))).toBe(false);
    expect(shouldDehydrateQuery(makeQuery(['resolveProjectSlug'], {}))).toBe(false);
  });

  it('blocks queries that are not in success state', () => {
    expect(shouldDehydrateQuery(makeQuery(['projects'], [], 'pending'))).toBe(false);
    expect(shouldDehydrateQuery(makeQuery(['projects'], [], 'error'))).toBe(false);
  });

  it('blocks reportNotes pages that still contain optimistic ids', () => {
    const allowed = makeQuery(
      ['reportNotes', { project: 'p', number: 1 }],
      [{ id: 'note_real', text: 'ok' }],
    );
    const withOptimistic = makeQuery(
      ['reportNotes', { project: 'p', number: 1 }],
      [{ id: 'not_opt_abc', text: 'pending' }],
    );
    expect(shouldDehydrateQuery(allowed)).toBe(true);
    expect(shouldDehydrateQuery(withOptimistic)).toBe(false);
  });
});

describe('createQueryPersister round-trip', () => {
  beforeEach(() => clearPersistedStore());

  it('persists allowed queries and restores them into a fresh client', async () => {
    const { persister, buster, maxAge } = createQueryPersister('usr_alice');

    const writer = new QueryClient();
    writer.setQueryData(['projects'], [{ slug: 'demo', name: 'Demo' }]);
    writer.setQueryData(['meUsage'], { tokens: 42 });

    await persistQueryClientSave({
      queryClient: writer,
      persister,
      buster,
      dehydrateOptions: { shouldDehydrateQuery },
    });

    const reader = new QueryClient();
    await persistQueryClientRestore({
      queryClient: reader,
      persister,
      buster,
      maxAge,
    });

    expect(reader.getQueryData(['projects'])).toEqual([{ slug: 'demo', name: 'Demo' }]);
    // meUsage was filtered out by shouldDehydrateQuery, so it must
    // not appear in the restored cache.
    expect(reader.getQueryData(['meUsage'])).toBeUndefined();
  });

  it('drops the persisted blob when buster changes', async () => {
    const { persister, maxAge } = createQueryPersister('usr_alice');

    const writer = new QueryClient();
    writer.setQueryData(['projects'], [{ slug: 'x' }]);
    await persistQueryClientSave({
      queryClient: writer,
      persister,
      buster: 'v1',
      dehydrateOptions: { shouldDehydrateQuery },
    });

    const reader = new QueryClient();
    await persistQueryClientRestore({
      queryClient: reader,
      persister,
      buster: 'v2',
      maxAge,
    });
    expect(reader.getQueryData(['projects'])).toBeUndefined();
  });

  it('persister.removeClient wipes the persisted blob (logout path)', async () => {
    const { persister, buster, maxAge } = createQueryPersister('usr_alice');

    const writer = new QueryClient();
    writer.setQueryData(['projects'], [{ slug: 'x' }]);
    await persistQueryClientSave({
      queryClient: writer,
      persister,
      buster,
      dehydrateOptions: { shouldDehydrateQuery },
    });

    await persister.removeClient();

    const reader = new QueryClient();
    await persistQueryClientRestore({
      queryClient: reader,
      persister,
      buster,
      maxAge,
    });
    expect(reader.getQueryData(['projects'])).toBeUndefined();
  });

  it('does not cold-restore another user’s persisted data', async () => {
    const alice = createQueryPersister('usr_alice');
    const aliceClient = new QueryClient();
    aliceClient.setQueryData(['projects'], [{ slug: 'alice-private', name: 'Alice Private' }]);
    await persistQueryClientSave({
      queryClient: aliceClient,
      persister: alice.persister,
      buster: alice.buster,
      dehydrateOptions: { shouldDehydrateQuery },
    });

    const bob = createQueryPersister('usr_bob');
    const bobClient = new QueryClient();
    await persistQueryClientRestore({
      queryClient: bobClient,
      persister: bob.persister,
      buster: bob.buster,
      maxAge: bob.maxAge,
    });

    expect(bobClient.getQueryData(['projects'])).toBeUndefined();
  });

  it('keeps each account snapshot isolated across account switches', async () => {
    const alice = createQueryPersister('usr_alice');
    const aliceClient = new QueryClient();
    aliceClient.setQueryData(['projects'], [{ slug: 'alice-private' }]);
    await persistQueryClientSave({
      queryClient: aliceClient,
      persister: alice.persister,
      buster: alice.buster,
      dehydrateOptions: { shouldDehydrateQuery },
    });

    const bob = createQueryPersister('usr_bob');
    const bobClient = new QueryClient();
    bobClient.setQueryData(['projects'], [{ slug: 'bob-private' }]);
    await persistQueryClientSave({
      queryClient: bobClient,
      persister: bob.persister,
      buster: bob.buster,
      dehydrateOptions: { shouldDehydrateQuery },
    });

    const restoredAlice = new QueryClient();
    await persistQueryClientRestore({
      queryClient: restoredAlice,
      persister: alice.persister,
      buster: alice.buster,
      maxAge: alice.maxAge,
    });
    const restoredBob = new QueryClient();
    await persistQueryClientRestore({
      queryClient: restoredBob,
      persister: bob.persister,
      buster: bob.buster,
      maxAge: bob.maxAge,
    });

    expect(restoredAlice.getQueryData(['projects'])).toEqual([{ slug: 'alice-private' }]);
    expect(restoredBob.getQueryData(['projects'])).toEqual([{ slug: 'bob-private' }]);
  });
});
