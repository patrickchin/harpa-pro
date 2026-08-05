import { isValidElement } from 'react';
import { matchRoutes } from 'react-router';
import { describe, expect, it } from 'vitest';

import { dashboardRoutes } from './routes';
import { ProjectReportWorkspaceRoute, ProjectReportsRoute } from './route-pages';

describe('dashboardRoutes', () => {
  it.each([
    ['/sign-in', 'sign-in'],
    ['/onboarding', 'onboarding'],
    ['/projects', 'projects'],
    ['/projects/harbor-house', 'project-overview'],
    ['/projects/harbor-house/reports', 'project-reports'],
    ['/projects/harbor-house/reports/7', 'report-workspace'],
    ['/projects/harbor-house/members', 'project-members'],
    ['/projects/harbor-house/settings', 'project-settings'],
  ])('matches %s to the canonical %s route', (pathname, routeId) => {
    const matches = matchRoutes(dashboardRoutes, pathname);
    expect(matches?.at(-1)?.route.id).toBe(routeId);
  });

  it('does not add a second resource identifier to report URLs', () => {
    const matches = matchRoutes(dashboardRoutes, '/reports/rep_123/projects/harbor-house');
    expect(matches?.at(-1)?.route.path).toBe('*');
    expect(matches?.some((match) => match.route.id === 'report-workspace')).toBe(false);
  });

  it('mounts the report feature pages rather than duplicating report internals', () => {
    const listMatch = matchRoutes(dashboardRoutes, '/projects/harbor-house/reports')?.at(-1);
    const workspaceMatch = matchRoutes(dashboardRoutes, '/projects/harbor-house/reports/7')?.at(-1);

    expect(isValidElement(listMatch?.route.element)).toBe(true);
    expect(isValidElement(workspaceMatch?.route.element)).toBe(true);
    if (
      !isValidElement(listMatch?.route.element) ||
      !isValidElement(workspaceMatch?.route.element)
    ) {
      throw new Error('Report routes must render React elements.');
    }
    expect(listMatch.route.element.type).toBe(ProjectReportsRoute);
    expect(workspaceMatch.route.element.type).toBe(ProjectReportWorkspaceRoute);
  });
});
