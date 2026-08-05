import type { RouteObject } from 'react-router';
import { Navigate } from 'react-router';

import { AuthBoundary } from './auth-boundary';
import {
  NotFoundRoute,
  OnboardingRoute,
  ProjectMembersRoute,
  ProjectOverviewRoute,
  ProjectReportsRoute,
  ProjectReportWorkspaceRoute,
  ProjectSettingsRoute,
  ProjectShellRoute,
  ProjectsRoute,
  SignInRoute,
} from './route-pages';

export const dashboardRoutes: RouteObject[] = [
  {
    id: 'root',
    path: '/',
    element: <AuthBoundary />,
    children: [
      {
        index: true,
        element: <Navigate replace to="/projects" />,
      },
      {
        id: 'sign-in',
        path: 'sign-in',
        element: <SignInRoute />,
      },
      {
        id: 'onboarding',
        path: 'onboarding',
        element: <OnboardingRoute />,
      },
      {
        id: 'projects',
        path: 'projects',
        element: <ProjectsRoute />,
      },
      {
        id: 'project-shell',
        path: 'projects/:project',
        element: <ProjectShellRoute />,
        children: [
          {
            id: 'project-overview',
            index: true,
            element: <ProjectOverviewRoute />,
          },
          {
            id: 'project-reports',
            path: 'reports',
            element: <ProjectReportsRoute />,
          },
          {
            id: 'report-workspace',
            path: 'reports/:number',
            element: <ProjectReportWorkspaceRoute />,
          },
          {
            id: 'project-members',
            path: 'members',
            element: <ProjectMembersRoute />,
          },
          {
            id: 'project-settings',
            path: 'settings',
            element: <ProjectSettingsRoute />,
          },
        ],
      },
      {
        path: '*',
        element: <NotFoundRoute />,
      },
    ],
  },
];
