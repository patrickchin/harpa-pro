import { describe, expect, it, vi } from 'vitest';

import type { DashboardApiClient } from '@/lib/api';
import { createDashboardDataApi } from './data-api';

describe('createDashboardDataApi', () => {
  it('uses the contract paths for projects and profile', async () => {
    const request = vi.fn().mockResolvedValue({ items: [], nextCursor: null });
    const data = createDashboardDataApi({
      request,
    } as unknown as DashboardApiClient);

    await data.listProjects({ cursor: 'next', limit: 25 });
    await data.getProject('harbor house');
    await data.createProject({ name: 'Harbor House' });
    await data.updateProject('harbor-house', { address: '18 Pier Road' });
    await data.deleteProject('harbor-house');
    await data.getMe();
    await data.updateMe({ displayName: 'Morgan Lee' });

    expect(request.mock.calls).toEqual([
      ['/projects', 'get', { query: { cursor: 'next', limit: 25 } }],
      ['/projects/{project}', 'get', { params: { project: 'harbor house' } }],
      ['/projects', 'post', { body: { name: 'Harbor House' } }],
      [
        '/projects/{project}',
        'patch',
        {
          params: { project: 'harbor-house' },
          body: { address: '18 Pier Road' },
        },
      ],
      ['/projects/{project}', 'delete', { params: { project: 'harbor-house' } }],
      ['/me', 'get'],
      ['/me', 'patch', { body: { displayName: 'Morgan Lee' } }],
    ]);
  });

  it('uses nested membership paths for every management action', async () => {
    const request = vi.fn().mockResolvedValue({ items: [] });
    const data = createDashboardDataApi({
      request,
    } as unknown as DashboardApiClient);

    await data.listMembers('harbor-house');
    await data.addMember('harbor-house', {
      email: 'riley@example.com',
      role: 'editor',
    });
    await data.changeMemberRole('harbor-house', 'usr_2', 'viewer');
    await data.removeMember('harbor-house', 'usr_2');

    expect(request.mock.calls).toEqual([
      ['/projects/{project}/members', 'get', { params: { project: 'harbor-house' } }],
      [
        '/projects/{project}/members',
        'post',
        {
          params: { project: 'harbor-house' },
          body: { email: 'riley@example.com', role: 'editor' },
        },
      ],
      [
        '/projects/{project}/members/{user}',
        'patch',
        {
          params: { project: 'harbor-house', user: 'usr_2' },
          body: { role: 'viewer' },
        },
      ],
      [
        '/projects/{project}/members/{user}',
        'delete',
        { params: { project: 'harbor-house', user: 'usr_2' } },
      ],
    ]);
  });
});
