import { operations, type FlyInventoryObservation } from '@harpa/api-contract';
import { z } from 'zod';
import { env } from '../env.js';
import {
  createProviderObservationDeadline,
  requestProviderJson,
} from './provider-observer-http.js';

const FLY_API_ORIGIN = 'https://api.machines.dev';
const ORGANIZATION_APP_LIMIT = 1_000;
const PROVIDER_DETAIL_LIMIT = 1_000;
const RETURNED_DETAIL_LIMIT = 50;
const CONFIGURED_APP_LIMIT = 10;

const providerText = z.string().min(1).max(512);
const providerTimestamp = z.string().datetime({ offset: true });
const safeCount = z.number().int().nonnegative().safe();
const providerProcessGroup = z.string().regex(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/);

const providerOrganization = z
  .object({
    slug: providerText,
  })
  .passthrough();

const providerAppDetail = z
  .object({
    id: providerText,
    name: providerText,
    status: providerText,
    organization: providerOrganization,
  })
  .passthrough();

const providerAppSummary = z
  .object({
    id: providerText,
    name: providerText,
    network: providerText.nullable().optional(),
    machine_count: safeCount,
    volume_count: safeCount,
  })
  .passthrough();

const organizationAppsResponse = z
  .object({
    total_apps: safeCount,
    apps: z.array(providerAppSummary).max(ORGANIZATION_APP_LIMIT),
  })
  .passthrough();

const providerMachine = z
  .object({
    id: providerText,
    name: providerText,
    state: providerText,
    region: providerText,
    config: z
      .object({
        guest: z
          .object({
            cpu_kind: providerText,
            cpus: safeCount,
            memory_mb: safeCount,
          })
          .passthrough(),
        metadata: z
          .object({
            fly_process_group: providerProcessGroup.optional(),
          })
          .passthrough()
          .optional(),
      })
      .passthrough(),
    created_at: providerTimestamp,
    updated_at: providerTimestamp,
  })
  .passthrough();

const providerMachinesResponse = z.array(providerMachine).max(PROVIDER_DETAIL_LIMIT);

const providerVolume = z
  .object({
    id: providerText,
    name: providerText,
    state: providerText,
    size_gb: safeCount,
    region: providerText,
    encrypted: z.boolean(),
    attached_machine_id: providerText.nullable().optional(),
    created_at: providerTimestamp,
    snapshot_retention: safeCount.nullable().optional(),
    auto_backup_enabled: z.boolean().nullable().optional(),
  })
  .passthrough();

const providerVolumesResponse = z.array(providerVolume).max(PROVIDER_DETAIL_LIMIT);

const configuredOrganization = z.string().regex(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/);
const configuredAppName = z.string().regex(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/);
const observerConfiguration = z
  .object({
    organizationSlug: configuredOrganization,
    apiToken: z.string().trim().min(1),
    appNames: z
      .array(configuredAppName)
      .min(1)
      .max(CONFIGURED_APP_LIMIT)
      .refine((names) => new Set(names).size === names.length),
  })
  .strict();

type FlyReason = Extract<FlyInventoryObservation, { status: 'unknown' }>['reason'];
type FlyObserved = Exclude<FlyInventoryObservation, { status: 'unknown' }>;
type FlyApp = FlyObserved['apps'][number];
type FlyMachines = FlyApp['machines'];
type FlyVolumes = FlyApp['volumes'];
type ProviderResult<T> = { ok: true; value: T } | { ok: false; reason: FlyReason };
type ObservedAppResult = { ok: true; value: FlyApp } | { ok: false; reason: FlyReason };

export interface AdminFlyInventoryConfiguration {
  organizationSlug: string;
  apiToken: string;
  appNames: string[];
}

export interface ObserveAdminFlyInventoryOptions {
  /** `undefined` selects parsed env; `null` explicitly disables the observer. */
  configuration?: AdminFlyInventoryConfiguration | null;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

/**
 * Read a bounded, redacted Fly inventory for the dedicated browser-admin
 * surface. The observer has no write, retry, cache, pagination, or arbitrary
 * provider-proxy path.
 */
export async function observeAdminFlyInventory(
  options: ObserveAdminFlyInventoryOptions = {},
): Promise<FlyInventoryObservation> {
  const observedAt = (options.now ?? (() => new Date()))().toISOString();
  const rawConfiguration =
    options.configuration === undefined ? configurationFromEnv() : options.configuration;
  if (rawConfiguration === null) {
    return validateObservation({ observedAt, status: 'unknown', reason: 'not_configured' });
  }

  const parsedConfiguration = observerConfiguration.safeParse(rawConfiguration);
  if (!parsedConfiguration.success) {
    return validateObservation({ observedAt, status: 'unknown', reason: 'invalid_response' });
  }
  const configuration = parsedConfiguration.data;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  return createProviderObservationDeadline().run(async (signal) => {
    const discoveryUrl = new URL('/v1/apps', FLY_API_ORIGIN);
    discoveryUrl.searchParams.set('org_slug', configuration.organizationSlug);
    const discoveryResponse = await getJson(
      discoveryUrl,
      configuration.apiToken,
      signal,
      fetchImpl,
    );
    if (!discoveryResponse.ok) {
      return validateObservation({
        observedAt,
        status: 'unknown',
        reason: discoveryResponse.reason,
      });
    }

    const parsedDiscovery = organizationAppsResponse.safeParse(discoveryResponse.value);
    if (!parsedDiscovery.success) {
      return validateObservation({ observedAt, status: 'unknown', reason: 'invalid_response' });
    }

    const apps: FlyApp[] = [];
    const unavailableReasons: FlyReason[] = [];
    for (const appName of configuration.appNames) {
      const summaries = parsedDiscovery.data.apps.filter((candidate) => candidate.name === appName);
      if (summaries.length === 0) {
        unavailableReasons.push('not_found');
        continue;
      }
      const summary = summaries[0]!;
      if (summaries.length !== 1) {
        unavailableReasons.push('invalid_response');
        continue;
      }

      if (signal.aborted) {
        unavailableReasons.push('timeout');
        continue;
      }

      const observedApp = await observeApp(
        summary,
        configuration.organizationSlug,
        configuration.apiToken,
        signal,
        fetchImpl,
      );
      if (observedApp.ok) apps.push(observedApp.value);
      else unavailableReasons.push(observedApp.reason);
    }

    if (apps.length === 0) {
      return validateObservation({
        observedAt,
        status: 'unknown',
        reason: highestPriorityReason(unavailableReasons),
      });
    }

    const unavailableConfiguredAppCount = configuration.appNames.length - apps.length;
    const partial =
      unavailableConfiguredAppCount > 0 ||
      apps.some(
        (app) =>
          app.machines.status === 'unknown' ||
          app.volumes.status === 'unknown' ||
          (app.machines.status === 'available' && app.machines.truncated) ||
          (app.volumes.status === 'available' && app.volumes.truncated),
      );

    return validateObservation({
      observedAt,
      status: partial ? 'partial' : 'available',
      organizationSlug: configuration.organizationSlug,
      configuredAppCount: configuration.appNames.length,
      unavailableConfiguredAppCount,
      apps,
    });
  });
}

function configurationFromEnv(): AdminFlyInventoryConfiguration | null {
  const organizationSlug = env.ADMIN_FLY_ORG_SLUG;
  const apiToken = env.ADMIN_FLY_READ_ONLY_API_TOKEN;
  const configuredNames = env.ADMIN_FLY_APP_NAMES;
  if (!organizationSlug || !apiToken || !configuredNames) return null;

  return {
    organizationSlug,
    apiToken,
    appNames: configuredNames.split(',').map((name) => name.trim()),
  };
}

async function observeApp(
  summary: z.infer<typeof providerAppSummary>,
  organizationSlug: string,
  apiToken: string,
  signal: AbortSignal,
  fetchImpl: typeof fetch,
): Promise<ObservedAppResult> {
  const root = `${FLY_API_ORIGIN}/v1/apps/${encodeURIComponent(summary.name)}`;
  const machineUrl = new URL(`${root}/machines`);
  machineUrl.searchParams.set('include_deleted', 'false');

  const [detailResponse, machineResponse, volumeResponse] = await Promise.all([
    getJson(new URL(root), apiToken, signal, fetchImpl),
    getJson(machineUrl, apiToken, signal, fetchImpl),
    getJson(new URL(`${root}/volumes`), apiToken, signal, fetchImpl),
  ]);

  const detail = parseAppDetail(detailResponse, summary.id, summary.name, organizationSlug);
  if (!detail.ok) {
    const failures = [detail, machineResponse, volumeResponse]
      .filter((result): result is { ok: false; reason: FlyReason } => !result.ok)
      .map((result) => result.reason);
    return { ok: false, reason: highestPriorityReason(failures) };
  }

  const machines = observeMachines(machineResponse);
  const volumes = observeVolumes(volumeResponse);
  return {
    ok: true,
    value: {
      id: detail.value.id,
      name: detail.value.name,
      status: detail.value.status,
      network: summary.network ?? null,
      reportedMachineCount: summary.machine_count,
      reportedVolumeCount: summary.volume_count,
      machines,
      volumes,
    },
  };
}

function parseAppDetail(
  result: ProviderResult<unknown>,
  appId: string,
  appName: string,
  organizationSlug: string,
): ProviderResult<z.infer<typeof providerAppDetail>> {
  if (!result.ok) return result;
  const parsed = providerAppDetail.safeParse(result.value);
  if (
    !parsed.success ||
    parsed.data.id !== appId ||
    parsed.data.name !== appName ||
    parsed.data.organization.slug !== organizationSlug
  ) {
    return { ok: false, reason: 'invalid_response' };
  }
  return { ok: true, value: parsed.data };
}

function observeMachines(result: ProviderResult<unknown>): FlyMachines {
  if (!result.ok) return { status: 'unknown', reason: result.reason };
  const parsed = providerMachinesResponse.safeParse(result.value);
  if (!parsed.success) return { status: 'unknown', reason: 'invalid_response' };

  return {
    status: 'available',
    truncated: parsed.data.length > RETURNED_DETAIL_LIMIT,
    items: parsed.data.slice(0, RETURNED_DETAIL_LIMIT).map((machine) => ({
      id: machine.id,
      name: machine.name,
      state: machine.state,
      processGroup: machine.config.metadata?.fly_process_group ?? null,
      region: machine.region,
      cpuKind: machine.config.guest.cpu_kind,
      cpus: machine.config.guest.cpus,
      memoryMb: machine.config.guest.memory_mb,
      createdAt: machine.created_at,
      updatedAt: machine.updated_at,
    })),
  };
}

function observeVolumes(result: ProviderResult<unknown>): FlyVolumes {
  if (!result.ok) return { status: 'unknown', reason: result.reason };
  const parsed = providerVolumesResponse.safeParse(result.value);
  if (!parsed.success) return { status: 'unknown', reason: 'invalid_response' };

  const returned = parsed.data.slice(0, RETURNED_DETAIL_LIMIT);
  let returnedAllocatedGb = 0;
  for (const volume of returned) {
    const next = addSafeCount(returnedAllocatedGb, volume.size_gb);
    if (next === null) return { status: 'unknown', reason: 'invalid_response' };
    returnedAllocatedGb = next;
  }

  return {
    status: 'available',
    truncated: parsed.data.length > RETURNED_DETAIL_LIMIT,
    returnedAllocatedGb,
    items: returned.map((volume) => ({
      id: volume.id,
      name: volume.name,
      state: volume.state,
      sizeGb: volume.size_gb,
      region: volume.region,
      encrypted: volume.encrypted,
      attachedMachineId: volume.attached_machine_id ?? null,
      createdAt: volume.created_at,
      snapshotRetentionDays: volume.snapshot_retention ?? null,
      autoBackupEnabled: volume.auto_backup_enabled ?? null,
    })),
  };
}

async function getJson(
  url: URL,
  apiToken: string,
  signal: AbortSignal,
  fetchImpl: typeof fetch,
): Promise<ProviderResult<unknown>> {
  const response = await requestProviderJson(url, {
    method: 'GET',
    apiToken,
    signal,
    fetchImpl,
    reasonForStatus,
  });
  return response.ok ? { ok: true, value: response.body } : response;
}

function reasonForStatus(status: number): FlyReason {
  if (status === 401 || status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 408 || status === 504) return 'timeout';
  if (status === 429) return 'rate_limited';
  return 'provider_unavailable';
}

function highestPriorityReason(reasons: FlyReason[]): FlyReason {
  if (reasons.includes('timeout')) return 'timeout';
  if (reasons.includes('rate_limited')) return 'rate_limited';
  if (reasons.includes('forbidden')) return 'forbidden';
  if (reasons.includes('not_found')) return 'not_found';
  if (reasons.includes('invalid_response')) return 'invalid_response';
  return 'provider_unavailable';
}

function addSafeCount(current: number, increment: number): number | null {
  if (current > Number.MAX_SAFE_INTEGER - increment) return null;
  return current + increment;
}

function validateObservation(observation: unknown): FlyInventoryObservation {
  return operations.flyInventoryObservation.parse(observation);
}
