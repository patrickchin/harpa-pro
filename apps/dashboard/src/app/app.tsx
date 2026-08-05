import { createBrowserRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';

import { dashboardRoutes } from './routes';

export const dashboardRouter = createBrowserRouter(dashboardRoutes);

export function App(): React.JSX.Element {
  return <RouterProvider router={dashboardRouter} />;
}
