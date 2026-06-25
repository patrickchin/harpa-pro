import { describe, expect, it, vi } from 'vitest';
import { getAccountDeletionPreview } from './account-deletion.js';

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

    const preview = await getAccountDeletionPreview(
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
