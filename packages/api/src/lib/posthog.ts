/**
 * PostHog server client factory.
 *
 * Two modes:
 *  - Real `posthog-node` client when POSTHOG_API_KEY is set and we're
 *    not running tests.
 *  - No-op stub otherwise (tests, local dev without a key configured).
 *
 * The factory is called once at boot from server.ts. Routes receive
 * the client via the analytics middleware on `c.var.posthog`.
 *
 * Per Pitfall 13 — every collaborator factory needs at least one
 * integration test that exercises the route without stubbing it,
 * asserting the real side-effect. See posthog.integration.test.ts
 * which boots the route with the real factory pointed at a stand-in
 * PostHog endpoint and asserts the HTTP request was made.
 */
import { PostHog } from 'posthog-node';
import { env } from '../env.js';
import type { EventName, EventMap } from '@harpa/analytics-events';

export interface AnalyticsClient {
  capture<K extends EventName>(args: {
    distinctId: string;
    event: K;
    properties?: EventMap[K] & Record<string, unknown>;
  }): void;
  identify(args: {
    distinctId: string;
    properties?: Record<string, unknown>;
  }): void;
  shutdown(): Promise<void>;
  /** Returns true when this is the no-op stub (useful for assertions in tests). */
  isStub(): boolean;
}

let singleton: AnalyticsClient | null = null;

export function createAnalyticsClient(opts?: {
  apiKey?: string;
  host?: string;
  forceStub?: boolean;
}): AnalyticsClient {
  const apiKey = opts?.apiKey ?? env.POSTHOG_API_KEY;
  const host = opts?.host ?? env.POSTHOG_HOST;
  const isTest = env.NODE_ENV === 'test';

  if (opts?.forceStub || isTest || !apiKey) {
    return noopAnalyticsClient();
  }

  const client = new PostHog(apiKey, {
    host,
    flushAt: 20,
    flushInterval: 10_000,
  });

  return {
    capture({ distinctId, event, properties }) {
      client.capture({
        distinctId,
        event,
        properties: {
          ...properties,
          env: env.NODE_ENV,
          surface: 'api',
        },
      });
    },
    identify({ distinctId, properties }) {
      client.identify({ distinctId, properties });
    },
    async shutdown() {
      await client.shutdown();
    },
    isStub() {
      return false;
    },
  };
}

export function noopAnalyticsClient(): AnalyticsClient {
  return {
    capture() {},
    identify() {},
    async shutdown() {},
    isStub() {
      return true;
    },
  };
}

/** Module-level singleton accessor. */
export function getAnalyticsClient(): AnalyticsClient {
  if (!singleton) singleton = createAnalyticsClient();
  return singleton;
}

/** Test helper — reset the module singleton between tests. */
export function __resetAnalyticsClientForTests(): void {
  singleton = null;
}

/** Test helper — inject a specific client (useful for capture assertions). */
export function __setAnalyticsClientForTests(client: AnalyticsClient): void {
  singleton = client;
}
