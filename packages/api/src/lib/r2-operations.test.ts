import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../env.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../env.js')>();
  return {
    ...actual,
    env: {
      ...actual.env,
      ADMIN_CLOUDFLARE_ACCOUNT_ID: '0123456789abcdef0123456789abcdef',
      ADMIN_CLOUDFLARE_R2_OBSERVER_API_TOKEN: 'default-r2-observer-token',
    },
  };
});

import { observeAdminR2Capacity } from './r2-operations.js';

const NOW = new Date('2026-08-08T08:00:00Z');
const WINDOW_START = '2026-08-01T00:00:00.000Z';
const ACCOUNT_ID = 'fedcba9876543210fedcba9876543210';
const API_TOKEN = 'explicit-r2-observer-token';
const API_ROOT = `/client/v4/accounts/${ACCOUNT_ID}/r2`;

type OperationGroup = {
  dimensions: {
    actionType: string;
    actionStatus: 'success' | 'userError' | 'internalError';
  };
  sum: { requests: number };
};

function json(body: unknown, status = 200, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function malformedJson(status = 200): Response {
  return new Response('{not-json', {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function urlOf(input: string | URL | Request): URL {
  return new URL(input instanceof Request ? input.url : input.toString());
}

function fetchMock(handler: (url: URL, init?: RequestInit) => Response | Promise<Response>) {
  return vi.fn<typeof fetch>((input, init) => Promise.resolve(handler(urlOf(input), init)));
}

function options(fetchImpl: typeof fetch) {
  return {
    accountId: ACCOUNT_ID,
    apiToken: API_TOKEN,
    fetchImpl,
    now: () => NOW,
  };
}

function bucketsResponse({
  buckets = [
    {
      name: 'harpa-pro',
      jurisdiction: 'default',
      location: 'apac',
      storage_class: 'Standard',
      creation_date: '2026-07-01T09:00:00Z',
    },
    { name: 'legacy-archive' },
  ],
  cursor = '',
}: {
  buckets?: unknown[];
  cursor?: string;
} = {}) {
  return {
    success: true,
    errors: [],
    messages: [],
    result: { buckets },
    result_info: { cursor, per_page: 100 },
  };
}

type MetricState = { payloadSize?: number; metadataSize?: number; objects?: number };
type MetricsResult = {
  standard?: { published?: MetricState; uploaded?: MetricState };
  infrequentAccess?: { published?: MetricState; uploaded?: MetricState };
};

function metricsResponse(
  result: MetricsResult = {
    standard: {
      published: { payloadSize: 1_024, metadataSize: 64, objects: 8 },
      uploaded: { payloadSize: 256, metadataSize: 16, objects: 2 },
    },
    infrequentAccess: {
      published: { payloadSize: 4_096, metadataSize: 128, objects: 3 },
      uploaded: { payloadSize: 512, metadataSize: 32, objects: 1 },
    },
  },
) {
  return {
    success: true,
    errors: [],
    messages: [],
    result,
  };
}

function operationsResponse(
  groups: OperationGroup[] = [
    operation('PutObject', 'success', 123),
    operation('GetObject', 'success', 456),
    operation('DeleteObject', 'success', 7),
  ],
) {
  return {
    data: {
      viewer: {
        accounts: [{ r2OperationsAdaptiveGroups: groups }],
      },
    },
    errors: null,
  };
}

function operation(
  actionType: string,
  actionStatus: OperationGroup['dimensions']['actionStatus'],
  requests: number,
): OperationGroup {
  return { dimensions: { actionType, actionStatus }, sum: { requests } };
}

function successfulFetch(groups?: OperationGroup[]) {
  return fetchMock((url) => {
    if (url.pathname === `${API_ROOT}/buckets`) return json(bucketsResponse());
    if (url.pathname === `${API_ROOT}/metrics`) return json(metricsResponse());
    if (url.pathname === '/client/v4/graphql') return json(operationsResponse(groups));
    return json({ unexpected: url.toString() }, 500);
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('observeAdminR2Capacity', () => {
  it('returns not_configured without calling Cloudflare when the observer is absent', async () => {
    const fetchImpl = vi.fn<typeof fetch>();

    await expect(
      observeAdminR2Capacity({
        accountId: '',
        apiToken: '',
        fetchImpl,
        now: () => NOW,
      }),
    ).resolves.toEqual({
      observedAt: NOW.toISOString(),
      status: 'unknown',
      reason: 'not_configured',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('uses env/global-fetch defaults for exactly two REST reads and one read-only GraphQL query', async () => {
    const defaultAccountId = '0123456789abcdef0123456789abcdef';
    const defaultRoot = `/client/v4/accounts/${defaultAccountId}/r2`;
    const fetchImpl = fetchMock((url) => {
      if (url.pathname === `${defaultRoot}/buckets`) return json(bucketsResponse());
      if (url.pathname === `${defaultRoot}/metrics`) return json(metricsResponse());
      if (url.pathname === '/client/v4/graphql') return json(operationsResponse());
      return json({ unexpected: url.toString() }, 500);
    });
    vi.stubGlobal('fetch', fetchImpl);

    const result = await observeAdminR2Capacity({ now: () => NOW });

    expect(result).toMatchObject({
      observedAt: NOW.toISOString(),
      status: 'available',
      freeTierReference: {
        storageGbMonth: 10,
        classAOperations: 1_000_000,
        classBOperations: 10_000_000,
        appliesTo: 'standard_only',
      },
      buckets: {
        status: 'available',
        truncated: false,
        items: [
          {
            name: 'harpa-pro',
            jurisdiction: 'default',
            location: 'apac',
            defaultStorageClass: 'standard',
            createdAt: '2026-07-01T09:00:00Z',
          },
          {
            name: 'legacy-archive',
            jurisdiction: 'unknown',
            location: null,
            defaultStorageClass: 'unknown',
            createdAt: null,
          },
        ],
      },
      storage: {
        status: 'available',
        standard: {
          publishedPayloadBytes: 1_024,
          publishedMetadataBytes: 64,
          publishedObjects: 8,
          uploadingPayloadBytes: 256,
          uploadingMetadataBytes: 16,
          uploadingObjects: 2,
        },
        infrequentAccess: {
          publishedPayloadBytes: 4_096,
          publishedMetadataBytes: 128,
          publishedObjects: 3,
          uploadingPayloadBytes: 512,
          uploadingMetadataBytes: 32,
          uploadingObjects: 1,
        },
      },
      operations: {
        status: 'available',
        windowStart: WINDOW_START,
        windowEnd: NOW.toISOString(),
        classA: {
          estimatedUsed: 123,
          publishedAllowance: 1_000_000,
          estimatedRemaining: 999_877,
        },
        classB: {
          estimatedUsed: 456,
          publishedAllowance: 10_000_000,
          estimatedRemaining: 9_999_544,
        },
        freeRequests: 7,
        unclassifiedRequests: 0,
      },
    });
    if (result.status === 'unknown') throw new Error('expected R2 capacity observation');
    expect(result.caveats).toEqual(
      expect.arrayContaining([
        'storage_snapshot_not_gb_month',
        'storage_metrics_may_lag',
        'infrequent_access_not_covered_by_free_tier',
        'operations_estimated_from_analytics',
      ]),
    );
    expect(new Set(result.caveats).size).toBe(result.caveats.length);

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    const calls = fetchImpl.mock.calls.map(([input, init]) => ({ url: urlOf(input), init }));
    const buckets = calls.find(({ url }) => url.pathname === `${defaultRoot}/buckets`)!;
    const metrics = calls.find(({ url }) => url.pathname === `${defaultRoot}/metrics`)!;
    const analytics = calls.find(({ url }) => url.pathname === '/client/v4/graphql')!;

    expect(buckets.url.origin).toBe('https://api.cloudflare.com');
    expect(Object.fromEntries(buckets.url.searchParams)).toEqual({
      per_page: '100',
      direction: 'asc',
      order: 'name',
    });
    expect(metrics.url.origin).toBe('https://api.cloudflare.com');
    expect(Object.fromEntries(metrics.url.searchParams)).toEqual({});
    expect(analytics.url.origin).toBe('https://api.cloudflare.com');

    for (const call of [buckets, metrics]) {
      expect(call.init?.method).toBe('GET');
      expect(call.init?.redirect).toBe('error');
      expect(call.init?.body).toBeUndefined();
      expect(new Headers(call.init?.headers).get('accept')).toBe('application/json');
      expect(new Headers(call.init?.headers).get('authorization')).toBe(
        'Bearer default-r2-observer-token',
      );
      expect(call.init?.signal).toBeInstanceOf(AbortSignal);
    }

    expect(analytics.init?.method).toBe('POST');
    expect(analytics.init?.redirect).toBe('error');
    expect(new Headers(analytics.init?.headers).get('accept')).toBe('application/json');
    expect(new Headers(analytics.init?.headers).get('content-type')).toBe('application/json');
    expect(new Headers(analytics.init?.headers).get('authorization')).toBe(
      'Bearer default-r2-observer-token',
    );
    expect(analytics.init?.signal).toBeInstanceOf(AbortSignal);
    expect(new Set(calls.map(({ init }) => init?.signal)).size).toBe(1);

    const graphBody = JSON.parse(String(analytics.init?.body)) as {
      query: string;
      variables: Record<string, unknown>;
    };
    expect(graphBody.variables).toEqual({
      accountTag: defaultAccountId,
      startDate: WINDOW_START,
      endDate: NOW.toISOString(),
    });
    expect(graphBody.query).toMatch(/^\s*query\b/);
    expect(graphBody.query).not.toMatch(/\bmutation\b/i);
    expect(graphBody.query).toMatch(/accounts\s*\(\s*filter:\s*\{\s*accountTag:\s*\$accountTag/);
    expect(graphBody.query).toMatch(/r2OperationsAdaptiveGroups\s*\(/);
    expect(graphBody.query).toMatch(/limit:\s*10000/);
    expect(graphBody.query).toMatch(/datetime_geq:\s*\$startDate/);
    expect(graphBody.query).toMatch(/datetime_leq:\s*\$endDate/);
    expect(graphBody.query).toMatch(/actionType/);
    expect(graphBody.query).toMatch(/actionStatus/);
    expect(graphBody.query).toMatch(/requests/);
    expect(graphBody.query).not.toMatch(/bucketName|objectName/);
    expect(JSON.stringify(result)).not.toMatch(
      /default-r2-observer-token|0123456789abcdef0123456789abcdef|errors|messages/,
    );
  });

  it.each([
    [401, 'forbidden'],
    [403, 'forbidden'],
    [408, 'timeout'],
    [504, 'timeout'],
    [429, 'rate_limited'],
    [500, 'provider_unavailable'],
  ] as const)(
    'maps HTTP %i to %s, discards the provider body, and never retries',
    async (status, reason) => {
      const providerSecret = `raw-provider-${status}-${API_TOKEN}`;
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          json({ success: false, errors: [{ code: status, message: providerSecret }] }, status),
        );

      const result = await observeAdminR2Capacity(options(fetchImpl));

      expect(result).toEqual({
        observedAt: NOW.toISOString(),
        status: 'unknown',
        reason,
      });
      expect(fetchImpl).toHaveBeenCalledTimes(3);
      expect(JSON.stringify(result)).not.toContain(providerSecret);
      expect(JSON.stringify(result)).not.toContain(API_TOKEN);
    },
  );

  it('maps network failure and explicit request abort without retrying', async () => {
    const networkFetch = vi.fn<typeof fetch>().mockRejectedValue(new Error(`network ${API_TOKEN}`));
    await expect(observeAdminR2Capacity(options(networkFetch))).resolves.toEqual({
      observedAt: NOW.toISOString(),
      status: 'unknown',
      reason: 'provider_unavailable',
    });
    expect(networkFetch).toHaveBeenCalledTimes(3);

    const abortFetch = vi
      .fn<typeof fetch>()
      .mockRejectedValue(Object.assign(new Error(`aborted ${API_TOKEN}`), { name: 'AbortError' }));
    await expect(observeAdminR2Capacity(options(abortFetch))).resolves.toEqual({
      observedAt: NOW.toISOString(),
      status: 'unknown',
      reason: 'timeout',
    });
    expect(abortFetch).toHaveBeenCalledTimes(3);
  });

  it('uses one ten-second deadline and one abort signal for the complete observation', async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn<typeof fetch>((_input, init) => {
      return new Promise((_resolve, reject) => {
        const rejectAbort = () =>
          reject(Object.assign(new Error('provider request aborted'), { name: 'AbortError' }));
        if (init?.signal?.aborted) rejectAbort();
        else init?.signal?.addEventListener('abort', rejectAbort, { once: true });
      });
    });
    const settled = vi.fn();
    const observation = observeAdminR2Capacity(options(fetchImpl));
    void observation.then(settled);
    await Promise.resolve();

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(new Set(fetchImpl.mock.calls.map(([, init]) => init?.signal)).size).toBe(1);
    await vi.advanceTimersByTimeAsync(9_999);
    expect(settled).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    await expect(observation).resolves.toEqual({
      observedAt: NOW.toISOString(),
      status: 'unknown',
      reason: 'timeout',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('preserves successful storage when bucket and analytics reads fail', async () => {
    const providerSecret = `s3://${API_TOKEN}@private-bucket/private-object`;
    const fetchImpl = fetchMock((url) => {
      if (url.pathname === `${API_ROOT}/buckets`) {
        return json({ success: false, errors: [{ message: providerSecret }] }, 503);
      }
      if (url.pathname === `${API_ROOT}/metrics`) return json(metricsResponse());
      return json({ data: null, errors: [{ message: providerSecret }] });
    });

    const result = await observeAdminR2Capacity(options(fetchImpl));

    expect(result).toMatchObject({
      status: 'partial',
      buckets: { status: 'unknown', reason: 'provider_unavailable' },
      storage: {
        status: 'available',
        standard: { publishedPayloadBytes: 1_024, publishedObjects: 8 },
        infrequentAccess: { publishedPayloadBytes: 4_096, publishedObjects: 3 },
      },
      operations: { status: 'unknown', reason: 'invalid_response' },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(JSON.stringify(result)).not.toContain(providerSecret);
    expect(JSON.stringify(result)).not.toContain(API_TOKEN);
  });

  it('normalizes omitted optional Cloudflare metrics fields to zero instead of treating the snapshot as invalid', async () => {
    const fetchImpl = fetchMock((url) => {
      if (url.pathname === `${API_ROOT}/buckets`) return json(bucketsResponse());
      if (url.pathname === `${API_ROOT}/metrics`) {
        return json(
          metricsResponse({
            standard: {
              published: { payloadSize: 1_024 },
            },
          }),
        );
      }
      return json(operationsResponse());
    });

    const result = await observeAdminR2Capacity(options(fetchImpl));

    expect(result).toMatchObject({
      status: 'available',
      storage: {
        status: 'available',
        standard: {
          publishedPayloadBytes: 1_024,
          publishedMetadataBytes: 0,
          publishedObjects: 0,
          uploadingPayloadBytes: 0,
          uploadingMetadataBytes: 0,
          uploadingObjects: 0,
        },
        infrequentAccess: {
          publishedPayloadBytes: 0,
          publishedMetadataBytes: 0,
          publishedObjects: 0,
          uploadingPayloadBytes: 0,
          uploadingMetadataBytes: 0,
          uploadingObjects: 0,
        },
      },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('uses the documented safe-reason priority when every read fails differently', async () => {
    const fetchImpl = fetchMock((url) => {
      if (url.pathname === `${API_ROOT}/buckets`) return json({}, 503);
      if (url.pathname === `${API_ROOT}/metrics`) return json({}, 403);
      return json({}, 429);
    });

    await expect(observeAdminR2Capacity(options(fetchImpl))).resolves.toEqual({
      observedAt: NOW.toISOString(),
      status: 'unknown',
      reason: 'rate_limited',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(3);

    const timeoutFetch = fetchMock((url) => {
      if (url.pathname === `${API_ROOT}/buckets`) return json({}, 504);
      if (url.pathname === `${API_ROOT}/metrics`) return json({}, 429);
      return json({}, 403);
    });
    await expect(observeAdminR2Capacity(options(timeoutFetch))).resolves.toEqual({
      observedAt: NOW.toISOString(),
      status: 'unknown',
      reason: 'timeout',
    });
    expect(timeoutFetch).toHaveBeenCalledTimes(3);
  });

  it('does not follow a bucket cursor and reports the bounded inventory as truncated', async () => {
    const hundredBuckets = Array.from({ length: 100 }, (_, index) => ({
      name: `bucket-${String(index).padStart(3, '0')}`,
      jurisdiction: index % 2 === 0 ? 'default' : 'eu',
      location: 'weur',
      storage_class: 'Standard',
      creation_date: '2026-07-01T09:00:00Z',
    }));
    const fetchImpl = fetchMock((url) => {
      if (url.pathname === `${API_ROOT}/buckets`) {
        return json(bucketsResponse({ buckets: hundredBuckets, cursor: 'secret-next-page' }));
      }
      if (url.pathname === `${API_ROOT}/metrics`) return json(metricsResponse());
      return json(operationsResponse());
    });

    const result = await observeAdminR2Capacity(options(fetchImpl));

    expect(result).toMatchObject({
      status: 'partial',
      buckets: { status: 'available', truncated: true },
    });
    if (result.status === 'unknown' || result.buckets.status === 'unknown') {
      throw new Error('expected bucket inventory');
    }
    expect(result.buckets.items).toHaveLength(100);
    expect(result.caveats).toContain('bucket_inventory_truncated');
    expect(new Set(result.caveats).size).toBe(result.caveats.length);
    expect(
      fetchImpl.mock.calls.filter(([input]) => urlOf(input).pathname === `${API_ROOT}/buckets`),
    ).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('maps every documented successful operation and excludes unsuccessful operations', async () => {
    const classA = [
      'ListBuckets',
      'PutBucket',
      'ListObjects',
      'PutObject',
      'CopyObject',
      'CompleteMultipartUpload',
      'CreateMultipartUpload',
      'LifecycleStorageTierTransition',
      'ListMultipartUploads',
      'UploadPart',
      'UploadPartCopy',
      'ListParts',
      'PutBucketEncryption',
      'PutBucketCors',
      'PutBucketLifecycleConfiguration',
    ];
    const classB = [
      'HeadBucket',
      'HeadObject',
      'GetObject',
      'UsageSummary',
      'GetBucketEncryption',
      'GetBucketLocation',
      'GetBucketCors',
      'GetBucketLifecycleConfiguration',
    ];
    const free = ['DeleteObject', 'DeleteBucket', 'AbortMultipartUpload'];
    const groups = [
      ...classA.map((name) => operation(name, 'success', 2)),
      ...classB.map((name) => operation(name, 'success', 3)),
      ...free.map((name) => operation(name, 'success', 5)),
      operation('FutureCloudflareOperation', 'success', 7),
      operation('PutObject', 'userError', 10_000),
      operation('GetObject', 'internalError', 20_000),
      operation('UnknownFailure', 'userError', 30_000),
    ];

    const result = await observeAdminR2Capacity(options(successfulFetch(groups)));

    expect(result).toMatchObject({
      status: 'partial',
      operations: {
        status: 'available',
        classA: {
          estimatedUsed: classA.length * 2,
          publishedAllowance: 1_000_000,
          estimatedRemaining: 1_000_000 - classA.length * 2,
        },
        classB: {
          estimatedUsed: classB.length * 3,
          publishedAllowance: 10_000_000,
          estimatedRemaining: 10_000_000 - classB.length * 3,
        },
        freeRequests: free.length * 5,
        unclassifiedRequests: 7,
      },
    });
    if (result.status === 'unknown') throw new Error('expected R2 capacity observation');
    expect(result.caveats).toContain('unclassified_operations_excluded');
    expect(new Set(result.caveats).size).toBe(result.caveats.length);
  });

  it('floors estimated operation headroom at zero', async () => {
    const groups = [
      operation('PutObject', 'success', 1_000_001),
      operation('GetObject', 'success', 10_000_001),
    ];

    const result = await observeAdminR2Capacity(options(successfulFetch(groups)));

    expect(result).toMatchObject({
      status: 'available',
      operations: {
        status: 'available',
        classA: { estimatedUsed: 1_000_001, estimatedRemaining: 0 },
        classB: { estimatedUsed: 10_000_001, estimatedRemaining: 0 },
      },
    });
  });

  it('accepts a safe-integer sum at the limit and rejects an overflowing sum', async () => {
    const safeResult = await observeAdminR2Capacity(
      options(
        successfulFetch([
          operation('PutObject', 'success', Number.MAX_SAFE_INTEGER - 1),
          operation('CopyObject', 'success', 1),
        ]),
      ),
    );
    expect(safeResult).toMatchObject({
      operations: {
        status: 'available',
        classA: { estimatedUsed: Number.MAX_SAFE_INTEGER, estimatedRemaining: 0 },
      },
    });

    const overflowingGroups = [
      [
        operation('PutObject', 'success', Number.MAX_SAFE_INTEGER),
        operation('CopyObject', 'success', 1),
      ],
      [
        operation('HeadObject', 'success', Number.MAX_SAFE_INTEGER),
        operation('GetObject', 'success', 1),
      ],
      [
        operation('DeleteObject', 'success', Number.MAX_SAFE_INTEGER),
        operation('DeleteBucket', 'success', 1),
      ],
      [
        operation('FutureOperationOne', 'success', Number.MAX_SAFE_INTEGER),
        operation('FutureOperationTwo', 'success', 1),
      ],
    ];
    for (const groups of overflowingGroups) {
      const overflowResult = await observeAdminR2Capacity(options(successfulFetch(groups)));
      expect(overflowResult).toMatchObject({
        status: 'partial',
        buckets: { status: 'available' },
        storage: { status: 'available' },
        operations: { status: 'unknown', reason: 'invalid_response' },
      });
    }
  });

  it('treats malformed REST and GraphQL payloads as invalid without losing other reads', async () => {
    const malformedBuckets = fetchMock((url) => {
      if (url.pathname === `${API_ROOT}/buckets`) {
        return json({ success: true, result: { buckets: 'not-an-array' } });
      }
      if (url.pathname === `${API_ROOT}/metrics`) return json(metricsResponse());
      return json(operationsResponse());
    });
    await expect(observeAdminR2Capacity(options(malformedBuckets))).resolves.toMatchObject({
      status: 'partial',
      buckets: { status: 'unknown', reason: 'invalid_response' },
      storage: { status: 'available' },
      operations: { status: 'available' },
    });

    const malformedMetrics = fetchMock((url) => {
      if (url.pathname === `${API_ROOT}/buckets`) return json(bucketsResponse());
      if (url.pathname === `${API_ROOT}/metrics`) {
        const invalid = metricsResponse();
        invalid.result.standard!.published!.objects = -1;
        return json(invalid);
      }
      return json(operationsResponse());
    });
    await expect(observeAdminR2Capacity(options(malformedMetrics))).resolves.toMatchObject({
      status: 'partial',
      buckets: { status: 'available' },
      storage: { status: 'unknown', reason: 'invalid_response' },
      operations: { status: 'available' },
    });

    const malformedGraphql = fetchMock((url) => {
      if (url.pathname === `${API_ROOT}/buckets`) return json(bucketsResponse());
      if (url.pathname === `${API_ROOT}/metrics`) return json(metricsResponse());
      return json({ data: { viewer: { accounts: [] } } });
    });
    await expect(observeAdminR2Capacity(options(malformedGraphql))).resolves.toMatchObject({
      status: 'partial',
      buckets: { status: 'available' },
      storage: { status: 'available' },
      operations: { status: 'unknown', reason: 'invalid_response' },
    });

    expect(malformedBuckets).toHaveBeenCalledTimes(3);
    expect(malformedMetrics).toHaveBeenCalledTimes(3);
    expect(malformedGraphql).toHaveBeenCalledTimes(3);
  });

  it('maps malformed JSON from every provider read to a redacted top-level invalid response', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockImplementation(() => Promise.resolve(malformedJson()));

    const result = await observeAdminR2Capacity(options(fetchImpl));

    expect(result).toEqual({
      observedAt: NOW.toISOString(),
      status: 'unknown',
      reason: 'invalid_response',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(JSON.stringify(result)).not.toContain(API_TOKEN);
  });

  it.each([1.5, Number.MAX_SAFE_INTEGER + 1])(
    'rejects unsafe metric value %s while preserving the other reads',
    async (invalidValue) => {
      const fetchImpl = fetchMock((url) => {
        if (url.pathname === `${API_ROOT}/buckets`) return json(bucketsResponse());
        if (url.pathname === `${API_ROOT}/metrics`) {
          const invalid = metricsResponse();
          invalid.result.infrequentAccess!.uploaded!.payloadSize = invalidValue;
          return json(invalid);
        }
        return json(operationsResponse());
      });

      const result = await observeAdminR2Capacity(options(fetchImpl));

      expect(result).toMatchObject({
        status: 'partial',
        buckets: { status: 'available' },
        storage: { status: 'unknown', reason: 'invalid_response' },
        operations: { status: 'available' },
      });
      expect(fetchImpl).toHaveBeenCalledTimes(3);
    },
  );

  it.each([1.5, Number.MAX_SAFE_INTEGER + 1])(
    'rejects unsafe analytics request count %s while preserving the other reads',
    async (invalidValue) => {
      const fetchImpl = fetchMock((url) => {
        if (url.pathname === `${API_ROOT}/buckets`) return json(bucketsResponse());
        if (url.pathname === `${API_ROOT}/metrics`) return json(metricsResponse());
        return json(operationsResponse([operation('PutObject', 'success', invalidValue)]));
      });

      const result = await observeAdminR2Capacity(options(fetchImpl));

      expect(result).toMatchObject({
        status: 'partial',
        buckets: { status: 'available' },
        storage: { status: 'available' },
        operations: { status: 'unknown', reason: 'invalid_response' },
      });
      expect(fetchImpl).toHaveBeenCalledTimes(3);
    },
  );
});
