import { operations, type R2CapacityObservation } from '@harpa/api-contract';
import { z } from 'zod';
import { env } from '../env.js';

const CLOUDFLARE_API_ORIGIN = 'https://api.cloudflare.com';
const BUCKET_LIMIT = 100;
const GRAPHQL_GROUP_LIMIT = 10_000;
const OBSERVATION_TIMEOUT_MS = 10_000;

const CLASS_A_OPERATIONS = new Set([
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
]);

const CLASS_B_OPERATIONS = new Set([
  'HeadBucket',
  'HeadObject',
  'GetObject',
  'UsageSummary',
  'GetBucketEncryption',
  'GetBucketLocation',
  'GetBucketCors',
  'GetBucketLifecycleConfiguration',
]);

const FREE_OPERATIONS = new Set(['DeleteObject', 'DeleteBucket', 'AbortMultipartUpload']);

const providerBucket = z
  .object({
    name: z.string().trim().min(1),
    jurisdiction: z.enum(['default', 'eu', 'fedramp']).optional(),
    location: z.enum(['apac', 'eeur', 'enam', 'weur', 'wnam', 'oc']).optional(),
    storage_class: z.enum(['Standard', 'InfrequentAccess']).optional(),
    creation_date: z.string().datetime({ offset: true }).optional(),
  })
  .passthrough();

const bucketResponse = z
  .object({
    success: z.literal(true),
    result: z.object({ buckets: z.array(providerBucket).max(BUCKET_LIMIT) }),
    result_info: z
      .object({
        cursor: z.string().optional(),
        per_page: z.number().optional(),
      })
      .optional()
      .default({}),
  })
  .passthrough();

const providerMetricState = z
  .object({
    payloadSize: z.number().int().nonnegative().safe().optional(),
    metadataSize: z.number().int().nonnegative().safe().optional(),
    objects: z.number().int().nonnegative().safe().optional(),
  })
  .partial()
  .optional();

const metricsResponse = z
  .object({
    success: z.literal(true),
    result: z
      .object({
        standard: z
          .object({
            published: providerMetricState,
            uploaded: providerMetricState,
          })
          .partial()
          .optional(),
        infrequentAccess: z
          .object({
            published: providerMetricState,
            uploaded: providerMetricState,
          })
          .partial()
          .optional(),
      })
      .partial(),
  })
  .passthrough();

const operationGroup = z
  .object({
    dimensions: z.object({
      actionType: z.string().min(1),
      actionStatus: z.enum(['success', 'userError', 'internalError']),
    }),
    sum: z.object({
      requests: z.number().int().nonnegative().safe(),
    }),
  })
  .passthrough();

const graphqlResponse = z
  .object({
    data: z.object({
      viewer: z.object({
        accounts: z.array(
          z.object({
            r2OperationsAdaptiveGroups: z.array(operationGroup).max(GRAPHQL_GROUP_LIMIT),
          }),
        ),
      }),
    }),
    errors: z.unknown().optional(),
  })
  .passthrough();

type R2Reason = Extract<R2CapacityObservation, { status: 'unknown' }>['reason'];
type R2Observed = Exclude<R2CapacityObservation, { status: 'unknown' }>;
type R2Buckets = Extract<R2Observed['buckets'], { status: 'available' }>;
type R2Storage = Extract<R2Observed['storage'], { status: 'available' }>;
type R2Ops = Extract<R2Observed['operations'], { status: 'available' }>;
type R2Caveat = R2Observed['caveats'][number];

type ProviderResult<T> = { ok: true; value: T } | { ok: false; reason: R2Reason };

export interface ObserveAdminR2CapacityOptions {
  accountId?: string;
  apiToken?: string;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

export async function observeAdminR2Capacity(
  options: ObserveAdminR2CapacityOptions = {},
): Promise<R2CapacityObservation> {
  const observedAt = (options.now ?? (() => new Date()))().toISOString();
  const accountId = options.accountId ?? env.ADMIN_CLOUDFLARE_ACCOUNT_ID;
  const apiToken = options.apiToken ?? env.ADMIN_CLOUDFLARE_R2_OBSERVER_API_TOKEN;

  if (!accountId?.trim() || !apiToken?.trim()) {
    return validateObservation({ observedAt, status: 'unknown', reason: 'not_configured' });
  }

  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), OBSERVATION_TIMEOUT_MS);
  deadline.unref?.();

  try {
    const windowStart = new Date(
      Date.UTC(
        new Date(observedAt).getUTCFullYear(),
        new Date(observedAt).getUTCMonth(),
        1,
        0,
        0,
        0,
        0,
      ),
    ).toISOString();

    const [bucketsResult, storageResult, operationsResult] = await Promise.all([
      observeBuckets(accountId, apiToken, controller.signal, fetchImpl),
      observeStorage(accountId, apiToken, controller.signal, fetchImpl),
      observeOperations(accountId, apiToken, windowStart, observedAt, controller.signal, fetchImpl),
    ]);

    const failures = [bucketsResult, storageResult, operationsResult]
      .filter((result): result is { ok: false; reason: R2Reason } => !result.ok)
      .map((result) => result.reason);
    if (failures.length === 3) {
      return validateObservation({
        observedAt,
        status: 'unknown',
        reason: highestPriorityReason(failures),
      });
    }

    const buckets = bucketsResult.ok
      ? bucketsResult.value
      : ({ status: 'unknown', reason: bucketsResult.reason } as const);
    const storage = storageResult.ok
      ? storageResult.value
      : ({ status: 'unknown', reason: storageResult.reason } as const);
    const operations = operationsResult.ok
      ? operationsResult.value
      : ({ status: 'unknown', reason: operationsResult.reason } as const);

    const caveats: R2Caveat[] = [
      'storage_snapshot_not_gb_month',
      'storage_metrics_may_lag',
      'operations_estimated_from_analytics',
    ];
    if (
      storage.status === 'available' &&
      Object.values(storage.infrequentAccess).some((value) => value > 0)
    ) {
      caveats.push('infrequent_access_not_covered_by_free_tier');
    }
    if (operations.status === 'available' && operations.unclassifiedRequests > 0) {
      caveats.push('unclassified_operations_excluded');
    }
    if (buckets.status === 'available' && buckets.truncated) {
      caveats.push('bucket_inventory_truncated');
    }

    const isAvailable =
      buckets.status === 'available' &&
      storage.status === 'available' &&
      operations.status === 'available' &&
      !buckets.truncated &&
      operations.unclassifiedRequests === 0;

    return validateObservation({
      observedAt,
      status: isAvailable ? 'available' : 'partial',
      freeTierReference: {
        storageGbMonth: 10,
        classAOperations: 1_000_000,
        classBOperations: 10_000_000,
        appliesTo: 'standard_only',
      },
      buckets,
      storage,
      operations,
      caveats,
    });
  } finally {
    clearTimeout(deadline);
  }
}

async function observeBuckets(
  accountId: string,
  apiToken: string,
  signal: AbortSignal,
  fetchImpl: typeof fetch,
): Promise<ProviderResult<R2Buckets>> {
  const url = new URL(`${CLOUDFLARE_API_ORIGIN}/client/v4/accounts/${accountId}/r2/buckets`);
  url.searchParams.set('per_page', String(BUCKET_LIMIT));
  url.searchParams.set('direction', 'asc');
  url.searchParams.set('order', 'name');

  const response = await getJson(url, {
    method: 'GET',
    apiToken,
    signal,
    fetchImpl,
  });
  if (!response.ok) return response;

  const parsed = bucketResponse.safeParse(response.value);
  if (!parsed.success) return { ok: false, reason: 'invalid_response' };

  return {
    ok: true,
    value: {
      status: 'available',
      truncated: Boolean(parsed.data.result_info.cursor?.trim()),
      items: parsed.data.result.buckets.map((bucket) => ({
        name: bucket.name,
        jurisdiction: bucket.jurisdiction ?? 'unknown',
        location: bucket.location ?? null,
        defaultStorageClass:
          bucket.storage_class === 'Standard'
            ? 'standard'
            : bucket.storage_class === 'InfrequentAccess'
              ? 'infrequent_access'
              : 'unknown',
        createdAt: bucket.creation_date ?? null,
      })),
    },
  };
}

async function observeStorage(
  accountId: string,
  apiToken: string,
  signal: AbortSignal,
  fetchImpl: typeof fetch,
): Promise<ProviderResult<R2Storage>> {
  const url = new URL(`${CLOUDFLARE_API_ORIGIN}/client/v4/accounts/${accountId}/r2/metrics`);
  const response = await getJson(url, {
    method: 'GET',
    apiToken,
    signal,
    fetchImpl,
  });
  if (!response.ok) return response;

  const parsed = metricsResponse.safeParse(response.value);
  if (!parsed.success) return { ok: false, reason: 'invalid_response' };

  return {
    ok: true,
    value: {
      status: 'available',
      standard: normalizeMetricSnapshot(parsed.data.result.standard),
      infrequentAccess: normalizeMetricSnapshot(parsed.data.result.infrequentAccess),
    },
  };
}

async function observeOperations(
  accountId: string,
  apiToken: string,
  windowStart: string,
  windowEnd: string,
  signal: AbortSignal,
  fetchImpl: typeof fetch,
): Promise<ProviderResult<R2Ops>> {
  const response = await getJson(new URL(`${CLOUDFLARE_API_ORIGIN}/client/v4/graphql`), {
    method: 'POST',
    apiToken,
    signal,
    fetchImpl,
    body: JSON.stringify({
      query: `
        query HarpaR2Operations($accountTag: string!, $startDate: Time, $endDate: Time) {
          viewer {
            accounts(filter: { accountTag: $accountTag }) {
              r2OperationsAdaptiveGroups(
                limit: ${GRAPHQL_GROUP_LIMIT}
                filter: { datetime_geq: $startDate, datetime_leq: $endDate }
              ) {
                sum {
                  requests
                }
                dimensions {
                  actionType
                  actionStatus
                }
              }
            }
          }
        }
      `,
      variables: {
        accountTag: accountId,
        startDate: windowStart,
        endDate: windowEnd,
      },
    }),
  });
  if (!response.ok) return response;

  const parsed = graphqlResponse.safeParse(response.value);
  if (!parsed.success) return { ok: false, reason: 'invalid_response' };

  const account = parsed.data.data.viewer.accounts[0];
  if (!account || parsed.data.errors) return { ok: false, reason: 'invalid_response' };

  let classA = 0;
  let classB = 0;
  let freeRequests = 0;
  let unclassifiedRequests = 0;

  for (const group of account.r2OperationsAdaptiveGroups) {
    const { actionStatus, actionType } = group.dimensions;
    if (actionStatus !== 'success') continue;

    if (CLASS_A_OPERATIONS.has(actionType)) {
      const next = addSafeCount(classA, group.sum.requests);
      if (next === null) return { ok: false, reason: 'invalid_response' };
      classA = next;
    } else if (CLASS_B_OPERATIONS.has(actionType)) {
      const next = addSafeCount(classB, group.sum.requests);
      if (next === null) return { ok: false, reason: 'invalid_response' };
      classB = next;
    } else if (FREE_OPERATIONS.has(actionType)) {
      const next = addSafeCount(freeRequests, group.sum.requests);
      if (next === null) return { ok: false, reason: 'invalid_response' };
      freeRequests = next;
    } else {
      const next = addSafeCount(unclassifiedRequests, group.sum.requests);
      if (next === null) return { ok: false, reason: 'invalid_response' };
      unclassifiedRequests = next;
    }
  }

  return {
    ok: true,
    value: {
      status: 'available',
      windowStart,
      windowEnd,
      classA: {
        estimatedUsed: classA,
        publishedAllowance: 1_000_000,
        estimatedRemaining: Math.max(0, 1_000_000 - classA),
      },
      classB: {
        estimatedUsed: classB,
        publishedAllowance: 10_000_000,
        estimatedRemaining: Math.max(0, 10_000_000 - classB),
      },
      freeRequests,
      unclassifiedRequests,
    },
  };
}

function normalizeMetricSnapshot(
  value?: {
    published?: { payloadSize?: number; metadataSize?: number; objects?: number } | null;
    uploaded?: { payloadSize?: number; metadataSize?: number; objects?: number } | null;
  } | null,
) {
  return {
    publishedPayloadBytes: value?.published?.payloadSize ?? 0,
    publishedMetadataBytes: value?.published?.metadataSize ?? 0,
    publishedObjects: value?.published?.objects ?? 0,
    uploadingPayloadBytes: value?.uploaded?.payloadSize ?? 0,
    uploadingMetadataBytes: value?.uploaded?.metadataSize ?? 0,
    uploadingObjects: value?.uploaded?.objects ?? 0,
  };
}

function addSafeCount(current: number, increment: number): number | null {
  if (current > Number.MAX_SAFE_INTEGER - increment) return null;
  return current + increment;
}

async function getJson(
  url: URL,
  options: {
    method: 'GET' | 'POST';
    apiToken: string;
    signal: AbortSignal;
    fetchImpl: typeof fetch;
    body?: string;
  },
): Promise<ProviderResult<unknown>> {
  let response: Response;
  try {
    response = await options.fetchImpl(url, {
      method: options.method,
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${options.apiToken}`,
        ...(options.method === 'POST' ? { 'content-type': 'application/json' } : {}),
      },
      body: options.body,
      redirect: 'error',
      signal: options.signal,
    });
  } catch (error) {
    return {
      ok: false,
      reason: isAbort(error, options.signal) ? 'timeout' : 'provider_unavailable',
    };
  }

  if (!response.ok) return { ok: false, reason: reasonForStatus(response.status) };

  try {
    return { ok: true, value: await response.json() };
  } catch (error) {
    if (isAbort(error, options.signal)) return { ok: false, reason: 'timeout' };
    return {
      ok: false,
      reason: error instanceof SyntaxError ? 'invalid_response' : 'provider_unavailable',
    };
  }
}

function reasonForStatus(status: number): R2Reason {
  if (status === 401 || status === 403) return 'forbidden';
  if (status === 408 || status === 504) return 'timeout';
  if (status === 429) return 'rate_limited';
  return 'provider_unavailable';
}

function highestPriorityReason(reasons: R2Reason[]): R2Reason {
  if (reasons.includes('timeout')) return 'timeout';
  if (reasons.includes('rate_limited')) return 'rate_limited';
  if (reasons.includes('forbidden')) return 'forbidden';
  if (reasons.includes('invalid_response')) return 'invalid_response';
  return 'provider_unavailable';
}

function isAbort(error: unknown, signal: AbortSignal): boolean {
  return signal.aborted || (error instanceof Error && error.name === 'AbortError');
}

function validateObservation(observation: unknown): R2CapacityObservation {
  operations.r2CapacityObservation.parse(observation);
  // Validation is an assertion here. Keep valid provider ISO-8601 lexemes
  // intact instead of applying the shared contract parser's date transform.
  return observation as R2CapacityObservation;
}
