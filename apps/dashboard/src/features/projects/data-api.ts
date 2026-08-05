import type { auth, projects } from '@harpa/api-contract';
import type { z } from 'zod';

import { api, type DashboardApiClient } from '@/lib/api';

type CreateProjectInput = z.input<typeof projects.createProjectRequest>;
type UpdateProjectInput = z.input<typeof projects.updateProjectRequest>;
type AddMemberInput = z.input<typeof projects.inviteMemberRequest>;
type UpdateMeInput = z.input<typeof auth.updateMeRequest>;

export function createDashboardDataApi(client: DashboardApiClient) {
  return {
    listProjects(query: { cursor?: string; limit?: number } = {}) {
      return client.request('/projects', 'get', { query });
    },
    getProject(project: string) {
      return client.request('/projects/{project}', 'get', {
        params: { project },
      });
    },
    createProject(body: CreateProjectInput) {
      return client.request('/projects', 'post', { body });
    },
    updateProject(project: string, body: UpdateProjectInput) {
      return client.request('/projects/{project}', 'patch', {
        params: { project },
        body,
      });
    },
    deleteProject(project: string) {
      return client.request('/projects/{project}', 'delete', {
        params: { project },
      });
    },
    listMembers(project: string) {
      return client.request('/projects/{project}/members', 'get', {
        params: { project },
      });
    },
    addMember(project: string, body: AddMemberInput) {
      return client.request('/projects/{project}/members', 'post', {
        params: { project },
        body,
      });
    },
    changeMemberRole(project: string, user: string, role: projects.ProjectRole) {
      return client.request('/projects/{project}/members/{user}', 'patch', {
        params: { project, user },
        body: { role },
      });
    },
    removeMember(project: string, user: string) {
      return client.request('/projects/{project}/members/{user}', 'delete', {
        params: { project, user },
      });
    },
    getMe() {
      return client.request('/me', 'get');
    },
    updateMe(body: UpdateMeInput) {
      return client.request('/me', 'patch', { body });
    },
  };
}

export const dashboardDataApi = createDashboardDataApi(api);
export type DashboardDataApi = ReturnType<typeof createDashboardDataApi>;
