import { describe, expect, it, vi } from 'vitest';
import * as accountDeletion from './account-deletion.js';
import type { Storage } from './storage.js';

describe('getAccountDeletionPreview', () => {
  it('sorts transfer candidates when joined_at is returned as a string', async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [{ email: 'alice@example.com' }],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'prj_transfer',
            name: 'Transfer shared',
            owner_id: 'usr_alice',
            role: 'owner',
            member_count: '3',
            created_at: '2026-06-01T10:00:00.000Z',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            user_id: 'usr_alice',
            display_name: 'Alice',
            email: 'alice@example.com',
            role: 'owner',
            joined_at: '2026-06-01T10:00:00.000Z',
          },
          {
            user_id: 'usr_carol',
            display_name: 'Carol',
            email: 'carol@example.com',
            role: 'editor',
            joined_at: '2026-06-01T10:10:00.000Z',
          },
          {
            user_id: 'usr_bob',
            display_name: 'Bob',
            email: 'bob@example.com',
            role: 'editor',
            joined_at: '2026-06-01T10:05:00.000Z',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ count: '0' }],
      });

    const preview = await accountDeletion.getAccountDeletionPreview(
      { execute } as never,
      'usr_alice',
    );

    expect(preview?.sharedProjectsTransferred).toEqual([
      {
        id: 'prj_transfer',
        name: 'Transfer shared',
        newOwnerId: 'usr_bob',
        newOwnerEmail: 'bob@example.com',
      },
    ]);
  });
});

describe('account deletion storage lifecycle', () => {
  it('bounds each prefix sweep to four 500-key pages and reports truncation', async () => {
    let scratchPage = 0;
    const deleteObjects = vi.fn().mockResolvedValue(undefined);
    const listPrefix = vi.fn(
      async (prefix: string, _cursor?: string, limit?: number) => {
        expect(limit).toBe(500);
        if (prefix.endsWith('/avatar/')) {
          return { keys: [`${prefix}orphan.jpg`], nextCursor: null };
        }
        scratchPage += 1;
        return {
          keys: [`${prefix}orphan-${scratchPage}.m4a`],
          nextCursor: `page-${scratchPage + 1}`,
        };
      },
    );
    const storage = {
      deleteObjects,
      listPrefix,
    } as unknown as Storage;

    const result = await accountDeletion.executeStorageCleanupPlan(storage, {
      userId: 'usr_alice',
      exactKeys: ['users/usr_alice/avatar/fil_exact.jpg'],
      sweepPrefixes: [
        'users/usr_alice/avatar/',
        'users/usr_alice/scratch/',
      ],
    });

    expect(listPrefix).toHaveBeenCalledTimes(5);
    expect(deleteObjects).toHaveBeenCalledTimes(6);
    expect(result.deletedKeyCount).toBe(6);
    expect(result.truncatedPrefixes).toEqual(['users/usr_alice/scratch/']);
    expect(result.failures).toEqual([]);
  });

  it('keeps cleanup rerunnable by reporting failures without throwing or skipping later prefixes', async () => {
    const deleteObjects = vi
      .fn()
      .mockRejectedValueOnce(new Error('transient delete failure'))
      .mockResolvedValue(undefined);
    const listPrefix = vi
      .fn()
      .mockResolvedValueOnce({
        keys: ['users/usr_alice/avatar/orphan.jpg'],
        nextCursor: null,
      })
      .mockResolvedValueOnce({ keys: [], nextCursor: null });
    const storage = {
      deleteObjects,
      listPrefix,
    } as unknown as Storage;

    const result = await accountDeletion.executeStorageCleanupPlan(storage, {
      userId: 'usr_alice',
      exactKeys: ['projects/prj_shared/reports/rpt/fil_exact.jpg'],
      sweepPrefixes: [
        'users/usr_alice/avatar/',
        'users/usr_alice/scratch/',
      ],
    });

    expect(listPrefix).toHaveBeenCalledTimes(2);
    expect(deleteObjects).toHaveBeenCalledTimes(2);
    expect(result.deletedKeyCount).toBe(1);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toMatchObject({ operation: 'delete_exact' });
  });
});
