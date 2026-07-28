import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import * as Sentry from '@sentry/react';

import { App } from '@/app/app';
import { AppProviders } from '@/app/providers';
import { env } from '@/lib/env';
import { initializeDashboardTelemetry } from '@/lib/telemetry/sentry';
import '@/styles.css';

initializeDashboardTelemetry({
  apiBaseUrl: env.VITE_API_BASE_URL,
  dsn: env.VITE_SENTRY_DSN,
  environment: env.VITE_SENTRY_ENVIRONMENT ?? import.meta.env.MODE,
  release: env.VITE_SENTRY_RELEASE,
});

const root = document.getElementById('root');
if (!root) {
  throw new Error('Dashboard root element was not found.');
}

createRoot(root).render(
  <StrictMode>
    <Sentry.ErrorBoundary
      fallback={
        <main className="not-found-page" role="alert">
          <p className="eyebrow">Dashboard error</p>
          <h1>Harpa Pro couldn&apos;t open this page</h1>
          <p>Your saved server data is unchanged. Reload to try again.</p>
          <button
            className="button button-primary"
            type="button"
            onClick={() => window.location.reload()}
          >
            Reload dashboard
          </button>
        </main>
      }
    >
      <AppProviders>
        <App />
      </AppProviders>
    </Sentry.ErrorBoundary>
  </StrictMode>,
);
