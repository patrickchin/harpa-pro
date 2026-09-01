import * as Sentry from '@sentry/react';

interface DashboardTelemetryConfig {
  apiBaseUrl: string;
  dsn: string | undefined;
  environment: string;
  release: string | undefined;
}

type SentryInit = (options: Parameters<typeof Sentry.init>[0]) => unknown;

function removeSensitiveHeaders(
  headers: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!headers) return headers;
  return Object.fromEntries(
    Object.entries(headers).filter(
      ([name]) => !['authorization', 'cookie'].includes(name.toLowerCase()),
    ),
  );
}

export function initializeDashboardTelemetry(
  config: DashboardTelemetryConfig,
  init: SentryInit = Sentry.init,
): boolean {
  if (!config.dsn) return false;

  init({
    dsn: config.dsn,
    environment: config.environment,
    release: config.release,
    sendDefaultPii: false,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: 0.1,
    tracePropagationTargets: [new URL(config.apiBaseUrl).origin],
    beforeSend(event) {
      if (event.user) {
        event.user = event.user.id ? { id: event.user.id } : undefined;
      }
      if (event.request) {
        event.request.headers = removeSensitiveHeaders(event.request.headers);
        delete event.request.cookies;
        delete event.request.data;
      }
      return event;
    },
  });
  return true;
}
