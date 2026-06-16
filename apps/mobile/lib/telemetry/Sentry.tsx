import { type ErrorInfo, type ReactNode } from 'react';
import * as NativeSentry from '@sentry/react-native';
import { env } from '@/lib/config/env';
import { buildInfo } from '@/lib/config/build-info';
import { ApiError } from '@/lib/api/errors';

type NativeInit = typeof NativeSentry.init;
type AddBreadcrumb = typeof NativeSentry.addBreadcrumb;
type CaptureException = typeof NativeSentry.captureException;

interface RecorderStartFailureContext {
  permission: string;
  recorderFactory: string;
}

interface InitSentryOptions {
  dsn?: string;
  appVariant: typeof env.EXPO_PUBLIC_APP_VARIANT;
  displayVersion: string;
  gitCommit: string;
  nativeInit?: NativeInit;
}

let didInit = false;

export function initSentry(
  options: InitSentryOptions = {
    dsn: env.EXPO_PUBLIC_SENTRY_DSN,
    appVariant: env.EXPO_PUBLIC_APP_VARIANT,
    displayVersion: buildInfo.displayVersion,
    gitCommit: buildInfo.gitCommit,
  },
): boolean {
  if (didInit) return true;
  if (!options.dsn) return false;

  const nativeInit = options.nativeInit ?? NativeSentry.init;
  nativeInit({
    dsn: options.dsn,
    environment: options.appVariant,
    release: `harpa-pro@${options.displayVersion}`,
    dist: options.gitCommit,
    sendDefaultPii: false,
    enableNativeCrashHandling: true,
    enableAutoSessionTracking: true,
    tracesSampleRate: options.appVariant === 'production' ? 0.1 : 1.0,
    beforeSend: scrubSentryEvent,
  });

  didInit = true;
  return true;
}

export function SentryProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function captureApiErrorBreadcrumb(
  err: ApiError,
  addBreadcrumb: AddBreadcrumb = NativeSentry.addBreadcrumb,
) {
  if (!err.requestId) return;

  addBreadcrumb({
    category: 'api',
    level: 'error',
    message: String(err.code),
    data: {
      requestId: err.requestId,
      status: err.status,
    },
  });
}

export function captureReactError(
  error: Error,
  info: ErrorInfo,
  captureException: CaptureException = NativeSentry.captureException,
) {
  if (!didInit) return;

  captureException(error, {
    contexts: {
      react: {
        componentStack: info.componentStack,
      },
    },
  });
}

export function captureRecorderStartFailure(
  error: unknown,
  context: RecorderStartFailureContext,
  captureException: CaptureException = NativeSentry.captureException,
) {
  if (!didInit) return;

  const captured = error instanceof Error ? error : new Error(String(error));
  captureException(captured, {
    tags: {
      feature: 'voice-recorder',
      operation: 'start',
    },
    contexts: {
      recorder: {
        permission: context.permission,
        recorderFactory: context.recorderFactory,
        diagnosticMessage: captured.message,
      },
    },
  });
}

export function resetSentryForTests() {
  didInit = false;
}

function scrubSentryEvent(event: NativeSentry.ErrorEvent): NativeSentry.ErrorEvent {
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
