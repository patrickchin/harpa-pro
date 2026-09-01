import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import * as Sentry from '@sentry/react';

import { App } from '@/app/app';
import { AppProviders } from '@/app/providers';
import { BrandMark, Button } from '@/components/ui';
import { env } from '@/lib/env';
import { initializeDashboardTelemetry } from '@/lib/telemetry/sentry';
import '@/globals.css';

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
        <main
          className="grid min-h-screen place-content-center place-items-center px-5 py-10 text-center"
          role="alert"
        >
          <BrandMark className="mb-5 size-12" />
          <p className="mb-2 text-label text-danger-text uppercase">
            Dashboard error
          </p>
          <h1 className="text-title text-foreground">
            Harpa Pro couldn&apos;t open this page
          </h1>
          <p className="mt-2 max-w-reading text-body text-muted-foreground">
            Your saved server data is unchanged. Reload to try again.
          </p>
          <Button className="mt-5" type="button" onClick={() => window.location.reload()}>
            Reload dashboard
          </Button>
        </main>
      }
    >
      <AppProviders>
        <App />
      </AppProviders>
    </Sentry.ErrorBoundary>
  </StrictMode>,
);
