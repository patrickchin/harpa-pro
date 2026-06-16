import React from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';
import {
  SentryProvider,
  captureApiErrorBreadcrumb,
  captureRecorderStartFailure,
  captureReactError,
  initSentry,
  resetSentryForTests,
} from './Sentry';

let tree: ReactTestRenderer | null = null;

describe('lib/telemetry/Sentry', () => {
  afterEach(() => {
    resetSentryForTests();
    if (tree) {
      act(() => {
        tree!.unmount();
      });
      tree = null;
    }
  });

  it('renders children without requiring a configured DSN', () => {
    act(() => {
      tree = create(
        <SentryProvider>
          <Text>Child</Text>
        </SentryProvider>,
      );
    });

    expect(tree!.toJSON()).toMatchSnapshot();
  });

  it('does not initialize the native SDK when the DSN is absent', () => {
    const nativeInit = vi.fn();

    initSentry({
      dsn: undefined,
      appVariant: 'development',
      displayVersion: '0.0.0+local',
      gitCommit: 'local',
      nativeInit,
    });

    expect(nativeInit).not.toHaveBeenCalled();
  });

  it('initializes the native SDK with release, environment, and privacy defaults', () => {
    const nativeInit = vi.fn();

    initSentry({
      dsn: 'https://public@example.ingest.sentry.io/1',
      appVariant: 'preview',
      displayVersion: '0.0.0+abc123',
      gitCommit: 'abc123',
      nativeInit,
    });

    expect(nativeInit).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: 'https://public@example.ingest.sentry.io/1',
        environment: 'preview',
        release: 'harpa-pro@0.0.0+abc123',
        dist: 'abc123',
        sendDefaultPii: false,
      }),
    );
  });

  it('captures React error-boundary failures after native init', () => {
    const nativeInit = vi.fn();
    const captureException = vi.fn();
    const error = new Error('render failed');

    initSentry({
      dsn: 'https://public@example.ingest.sentry.io/1',
      appVariant: 'production',
      displayVersion: '0.0.0+abc123',
      gitCommit: 'abc123',
      nativeInit,
    });
    captureReactError(error, { componentStack: '\n    in ReportScreen' }, captureException);

    expect(captureException).toHaveBeenCalledWith(error, {
      contexts: {
        react: {
          componentStack: '\n    in ReportScreen',
        },
      },
    });
  });

  it('captures recorder start failures after native init with diagnostic context', () => {
    const nativeInit = vi.fn();
    const captureException = vi.fn();
    const error = new Error(
      "Calling the 'prepareToRecordAsync' function has failed -> Caused by: Audio recording error: Failed to prepare recorder",
    );

    initSentry({
      dsn: 'https://public@example.ingest.sentry.io/1',
      appVariant: 'production',
      displayVersion: '0.0.0+abc123',
      gitCommit: 'abc123',
      nativeInit,
    });
    captureRecorderStartFailure(
      error,
      { permission: 'granted', recorderFactory: 'expo-audio' },
      captureException,
    );

    expect(captureException).toHaveBeenCalledWith(error, {
      tags: {
        feature: 'voice-recorder',
        operation: 'start',
      },
      contexts: {
        recorder: {
          permission: 'granted',
          recorderFactory: 'expo-audio',
          diagnosticMessage: error.message,
        },
      },
    });
  });

  it('adds a breadcrumb for API errors carrying a request id', () => {
    const addBreadcrumb = vi.fn();
    const err = new ApiError({
      code: 'server_error',
      message: 'HTTP 500',
      status: 500,
      requestId: 'rid-mobile-123',
    });

    captureApiErrorBreadcrumb(err, addBreadcrumb);

    expect(addBreadcrumb).toHaveBeenCalledWith({
      category: 'api',
      level: 'error',
      message: 'server_error',
      data: { requestId: 'rid-mobile-123', status: 500 },
    });
  });
});
