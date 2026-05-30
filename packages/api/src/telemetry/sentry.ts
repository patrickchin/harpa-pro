import * as Sentry from '@sentry/hono/node';
import type { ErrorEvent } from '@sentry/hono/node';
import type { Env, Hono, MiddlewareHandler } from 'hono';
import { buildInfo } from '../lib/build-info.js';
import { env } from '../env.js';

export interface ApiExceptionContext {
  requestId: string;
  method: string;
  route: string;
  status: number;
}

let didInit = false;

export function initSentry(): boolean {
  if (didInit) return true;
  if (!env.SENTRY_DSN) return false;

  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.SENTRY_ENVIRONMENT ?? env.NODE_ENV,
    release: `harpa-pro-api@${buildInfo.version}+${buildInfo.gitCommit}`,
    dist: buildInfo.gitCommit,
    sendDefaultPii: false,
    tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE,
    beforeSend: scrubSentryEvent,
  });

  didInit = true;
  return true;
}

export function createSentryMiddleware<E extends Env>(
  app: Hono<E>,
): MiddlewareHandler<E> | null {
  if (!initSentry()) return null;

  // errorMapper captures handled API exceptions with request-id tags.
  // Keep the Hono middleware for request context and tracing, but avoid
  // duplicate exception events from the automatic response hook.
  return Sentry.sentry(app, { shouldHandleError: () => false });
}

export function captureApiException(
  err: unknown,
  context: ApiExceptionContext,
): void {
  if (!initSentry()) return;

  try {
    Sentry.withScope((scope) => {
      scope.setTag('request_id', context.requestId);
      scope.setTag('http.method', context.method);
      scope.setTag('http.status_code', String(context.status));
      scope.setTag('route', context.route);
      scope.setContext('api', {
        requestId: context.requestId,
        method: context.method,
        route: context.route,
        status: context.status,
      });
      Sentry.captureException(err);
    });
  } catch (captureErr) {
    // Telemetry must never change API behavior.
    console.error('[api] sentry capture failed', captureErr);
  }
}

function scrubSentryEvent(event: ErrorEvent): ErrorEvent {
  if (event.user) {
    delete event.user.email;
    delete event.user.ip_address;
  }

  if (event.request) {
    delete event.request.cookies;
    delete event.request.query_string;

    const headers = event.request.headers as
      | Record<string, string | undefined>
      | undefined;
    if (headers) {
      delete headers.authorization;
      delete headers.Authorization;
      delete headers.cookie;
      delete headers.Cookie;
    }
  }

  return event;
}
