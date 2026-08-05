import { api as dashboardApiClient } from '@/lib/api';

import { createReportsApi } from './api';

export const reportsApi = createReportsApi(dashboardApiClient);
