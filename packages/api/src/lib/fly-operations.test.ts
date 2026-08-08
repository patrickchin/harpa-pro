import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../env.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../env.js')>();
  return {
    ...actual,
    env: {
      ...actual.env,
      ADMIN_FLY_APP_NAMES: 'harpa-pro-api',
      ADMIN_FLY_ORG_SLUG: 'harpa-pro',
      ADMIN_FLY_READ_ONLY_API_TOKEN: 'default-read-only-token',
    },
  };
});

import { observeAdminFlyInventory } from './fly-operations.js';

const NOW = new Date('2026-08-08T08:00:00Z');
const ORGANIZATION = 'harpa-pro';
const API_TOKEN = 'explicit-read-only-token';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
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

function configuration(appNames = ['harpa-pro-api']) {
  return { organizationSlug: ORGANIZATION, apiToken: API_TOKEN, appNames };
}

function options(fetchImpl: typeof fetch, appNames = ['harpa-pro-api']) {
  return { configuration: configuration(appNames), fetchImpl, now: () => NOW };
}

function deferredResponse() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function app(name = 'harpa-pro-api', index = 0) {
  return {
    id: name,
    name,
    status: 'deployed',
    network: index === 0 ? 'default' : null,
    organization: { slug: ORGANIZATION, name: 'Provider display name' },
    machine_count: index + 1,
    volume_count: index + 2,
    secrets: ['must-not-leak'],
  };
}

function machine(index = 0, processGroup: unknown = 'app') {
  return {
    id: `machine-${index}`,
    name: `api-${index}`,
    state: 'started',
    region: 'sin',
    instance_id: `secret-instance-${index}`,
    private_ip: `fdaa:0:secret::${index}`,
    image_ref: { repository: `secret-image-${index}`, digest: `sha256:secret-${index}` },
    config: {
      guest: { cpu_kind: 'shared', cpus: 1, memory_mb: 512 },
      env: { SECRET: `secret-env-${index}` },
      services: [{ internal_port: 8080 }],
      checks: { ready: { path: '/secret' } },
      metadata: {
        fly_process_group: processGroup,
        secret: `secret-metadata-${index}`,
      },
    },
    events: [{ type: 'start', secret: true }],
    created_at: '2026-08-01T01:02:03Z',
    updated_at: '2026-08-08T04:05:06Z',
  };
}

function volume(index = 0, sizeGb = 3) {
  return {
    id: `volume-${index}`,
    name: `data-${index}`,
    state: 'created',
    size_gb: sizeGb,
    region: 'sin',
    encrypted: true,
    attached_machine_id: index === 0 ? 'machine-0' : null,
    created_at: '2026-08-02T02:03:04Z',
    snapshot_retention: 5,
    auto_backup_enabled: true,
    zone: 'secret-zone',
    allocation_id: 'secret-allocation',
    host_dedication_key: 'secret-host',
    attached_alloc_id: 'secret-attached-allocation',
    fstype: 'secret-fs',
    blocks: 1_000,
    block_size: 4096,
    blocks_free: 500,
    blocks_avail: 400,
  };
}

function providerFetch(appNames = ['harpa-pro-api']) {
  return fetchMock((url) => {
    if (url.pathname === '/v1/apps') {
      return json({
        total_apps: appNames.length + 1,
        apps: [...appNames.map((name, index) => app(name, index)), app('shadow-secret-app', 99)],
      });
    }
    const name = decodeURIComponent(url.pathname.split('/')[3] ?? '');
    if (url.pathname.endsWith('/machines')) return json([machine()]);
    if (url.pathname.endsWith('/volumes')) return json([volume()]);
    return json(app(name, appNames.indexOf(name)));
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('observeAdminFlyInventory', () => {
  it('returns not_configured and makes no provider request when configuration is explicitly absent', async () => {
    const fetchImpl = vi.fn<typeof fetch>();

    await expect(
      observeAdminFlyInventory({ configuration: null, fetchImpl, now: () => NOW }),
    ).resolves.toEqual({
      observedAt: NOW.toISOString(),
      status: 'unknown',
      reason: 'not_configured',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('uses env and global-fetch defaults for the fixed REST plan and returns only allowlisted fields', async () => {
    const fetchImpl = providerFetch();
    vi.stubGlobal('fetch', fetchImpl);

    const result = await observeAdminFlyInventory({ now: () => NOW });

    expect(result).toEqual({
      observedAt: NOW.toISOString(),
      status: 'available',
      organizationSlug: ORGANIZATION,
      configuredAppCount: 1,
      unavailableConfiguredAppCount: 0,
      apps: [
        {
          id: 'harpa-pro-api',
          name: 'harpa-pro-api',
          status: 'deployed',
          network: 'default',
          reportedMachineCount: 1,
          reportedVolumeCount: 2,
          machines: {
            status: 'available',
            truncated: false,
            items: [
              {
                id: 'machine-0',
                name: 'api-0',
                state: 'started',
                processGroup: 'app',
                region: 'sin',
                cpuKind: 'shared',
                cpus: 1,
                memoryMb: 512,
                createdAt: '2026-08-01T01:02:03.000Z',
                updatedAt: '2026-08-08T04:05:06.000Z',
              },
            ],
          },
          volumes: {
            status: 'available',
            truncated: false,
            returnedAllocatedGb: 3,
            items: [
              {
                id: 'volume-0',
                name: 'data-0',
                state: 'created',
                sizeGb: 3,
                region: 'sin',
                encrypted: true,
                attachedMachineId: 'machine-0',
                createdAt: '2026-08-02T02:03:04.000Z',
                snapshotRetentionDays: 5,
                autoBackupEnabled: true,
              },
            ],
          },
        },
      ],
    });
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    const calls = fetchImpl.mock.calls.map(([input, init]) => ({ url: urlOf(input), init }));
    expect(calls.map(({ url }) => url.toString()).sort()).toEqual(
      [
        'https://api.machines.dev/v1/apps?org_slug=harpa-pro',
        'https://api.machines.dev/v1/apps/harpa-pro-api',
        'https://api.machines.dev/v1/apps/harpa-pro-api/machines?include_deleted=false',
        'https://api.machines.dev/v1/apps/harpa-pro-api/volumes',
      ].sort(),
    );
    const sharedSignal = calls[0]?.init?.signal;
    expect(sharedSignal).toBeInstanceOf(AbortSignal);
    for (const { url, init } of calls) {
      expect(url.origin).toBe('https://api.machines.dev');
      expect(init?.method).toBe('GET');
      expect(init?.redirect).toBe('error');
      expect(init?.body).toBeUndefined();
      expect(init?.signal).toBe(sharedSignal);
      expect(new Headers(init?.headers).get('accept')).toBe('application/json');
      expect(new Headers(init?.headers).get('authorization')).toBe(
        'Bearer default-read-only-token',
      );
    }
    expect(JSON.stringify(result)).not.toMatch(
      /default-read-only-token|shadow-secret-app|must-not-leak|secret-instance|fdaa:|secret-image|secret-env|secret-metadata|internal_port|secret-zone|secret-allocation|secret-host|secret-fs|blocks_free/,
    );
  });

  it('extracts only the bounded Fly process-group metadata field without another provider call', async () => {
    const fetchImpl = providerFetch();

    const result = await observeAdminFlyInventory(options(fetchImpl));

    expect(result).toMatchObject({
      status: 'available',
      apps: [
        {
          machines: {
            status: 'available',
            items: [{ processGroup: 'app' }],
          },
        },
      ],
    });
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(JSON.stringify(result)).not.toMatch(/fly_process_group|secret-metadata|metadata/);
  });

  it("processes configured apps serially while starting one app's three detail reads together", async () => {
    const appNames = ['harpa-pro-api', 'harpa-pro-worker'];
    const firstDetail = deferredResponse();
    const firstMachines = deferredResponse();
    const firstVolumes = deferredResponse();
    const paths: string[] = [];
    const fetchImpl = fetchMock((url) => {
      paths.push(`${url.pathname}${url.search}`);
      if (url.pathname === '/v1/apps') {
        return json({ total_apps: 2, apps: appNames.map((name, index) => app(name, index)) });
      }
      if (url.pathname === '/v1/apps/harpa-pro-api') return firstDetail.promise;
      if (url.pathname === '/v1/apps/harpa-pro-api/machines') return firstMachines.promise;
      if (url.pathname === '/v1/apps/harpa-pro-api/volumes') return firstVolumes.promise;
      if (url.pathname.endsWith('/machines')) return json([machine(1)]);
      if (url.pathname.endsWith('/volumes')) return json([volume(1)]);
      return json(app('harpa-pro-worker', 1));
    });

    const observation = observeAdminFlyInventory(options(fetchImpl, appNames));

    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(4));
    expect(paths).toEqual([
      '/v1/apps?org_slug=harpa-pro',
      '/v1/apps/harpa-pro-api',
      '/v1/apps/harpa-pro-api/machines?include_deleted=false',
      '/v1/apps/harpa-pro-api/volumes',
    ]);

    firstDetail.resolve(json(app('harpa-pro-api', 0)));
    firstMachines.resolve(json([machine()]));
    firstVolumes.resolve(json([volume()]));

    await expect(observation).resolves.toMatchObject({
      status: 'available',
      apps: [{ name: 'harpa-pro-api' }, { name: 'harpa-pro-worker' }],
    });
    expect(paths.slice(4)).toEqual([
      '/v1/apps/harpa-pro-worker',
      '/v1/apps/harpa-pro-worker/machines?include_deleted=false',
      '/v1/apps/harpa-pro-worker/volumes',
    ]);
  });

  it('caps ten configured apps at the documented 31 fixed REST calls', async () => {
    const appNames = Array.from({ length: 10 }, (_, index) => `harpa-pro-api-${index}`);
    const fetchImpl = providerFetch(appNames);

    const result = await observeAdminFlyInventory(options(fetchImpl, appNames));

    expect(result).toMatchObject({
      status: 'available',
      configuredAppCount: 10,
      unavailableConfiguredAppCount: 0,
    });
    if (result.status === 'unknown') throw new Error('expected bounded Fly inventory');
    expect(result.apps.map(({ name }) => name)).toEqual(appNames);
    expect(fetchImpl).toHaveBeenCalledTimes(31);
    expect(
      fetchImpl.mock.calls.filter(([input]) => urlOf(input).pathname === '/v1/apps'),
    ).toHaveLength(1);
    for (const [input, init] of fetchImpl.mock.calls) {
      expect(urlOf(input).origin).toBe('https://api.machines.dev');
      expect(urlOf(input).pathname).not.toMatch(/graphql/i);
      expect(init?.method).toBe('GET');
      expect(init?.body).toBeUndefined();
    }
  });

  it.each([
    [401, 'forbidden'],
    [403, 'forbidden'],
    [404, 'not_found'],
    [408, 'timeout'],
    [504, 'timeout'],
    [429, 'rate_limited'],
    [500, 'provider_unavailable'],
  ] as const)(
    'maps organization discovery HTTP %i to %s, redacts the body, and does not retry',
    async (status, reason) => {
      const providerSecret = `provider-body-${status}-${API_TOKEN}`;
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockResolvedValue(json({ message: providerSecret }, status));

      const result = await observeAdminFlyInventory(options(fetchImpl));

      expect(result).toEqual({ observedAt: NOW.toISOString(), status: 'unknown', reason });
      expect(fetchImpl).toHaveBeenCalledOnce();
      expect(JSON.stringify(result)).not.toContain(providerSecret);
      expect(JSON.stringify(result)).not.toContain(API_TOKEN);
    },
  );

  it('maps malformed JSON and network failures without exposing errors or retrying', async () => {
    const malformedFetch = vi.fn<typeof fetch>().mockResolvedValue(malformedJson());
    await expect(observeAdminFlyInventory(options(malformedFetch))).resolves.toEqual({
      observedAt: NOW.toISOString(),
      status: 'unknown',
      reason: 'invalid_response',
    });
    expect(malformedFetch).toHaveBeenCalledOnce();

    const networkFetch = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error(`private provider error ${API_TOKEN}`));
    const networkResult = await observeAdminFlyInventory(options(networkFetch));
    expect(networkResult).toEqual({
      observedAt: NOW.toISOString(),
      status: 'unknown',
      reason: 'provider_unavailable',
    });
    expect(networkFetch).toHaveBeenCalledOnce();
    expect(JSON.stringify(networkResult)).not.toContain(API_TOKEN);
  });

  it('fails closed on malformed organization and app-detail REST shapes', async () => {
    const malformedOrganization = vi
      .fn<typeof fetch>()
      .mockResolvedValue(json({ total_apps: 1, apps: 'not-an-array' }));
    await expect(observeAdminFlyInventory(options(malformedOrganization))).resolves.toEqual({
      observedAt: NOW.toISOString(),
      status: 'unknown',
      reason: 'invalid_response',
    });
    expect(malformedOrganization).toHaveBeenCalledOnce();

    const malformedDetail = fetchMock((url) => {
      if (url.pathname === '/v1/apps') return json({ total_apps: 1, apps: [app()] });
      if (url.pathname.endsWith('/machines')) return json([machine()]);
      if (url.pathname.endsWith('/volumes')) return json([volume()]);
      return json({ ...app(), status: 7, provider_secret: API_TOKEN });
    });
    const detailResult = await observeAdminFlyInventory(options(malformedDetail));
    expect(detailResult).toEqual({
      observedAt: NOW.toISOString(),
      status: 'unknown',
      reason: 'invalid_response',
    });
    expect(malformedDetail).toHaveBeenCalledTimes(4);
    expect(JSON.stringify(detailResult)).not.toContain(API_TOKEN);
  });

  it.each(['machines', 'volumes'] as const)(
    'marks malformed %s invalid while preserving the safe sibling detail',
    async (malformedField) => {
      const fetchImpl = fetchMock((url) => {
        if (url.pathname === '/v1/apps') return json({ total_apps: 1, apps: [app()] });
        if (url.pathname.endsWith('/machines')) {
          const invalidMachine = machine();
          invalidMachine.config.guest.memory_mb = 1.5;
          return json([malformedField === 'machines' ? invalidMachine : machine()]);
        }
        if (url.pathname.endsWith('/volumes')) {
          return json([malformedField === 'volumes' ? volume(0, -1) : volume()]);
        }
        return json(app());
      });

      const result = await observeAdminFlyInventory(options(fetchImpl));

      expect(result).toMatchObject({
        status: 'partial',
        apps: [
          malformedField === 'machines'
            ? {
                machines: { status: 'unknown', reason: 'invalid_response' },
                volumes: { status: 'available', returnedAllocatedGb: 3 },
              }
            : {
                machines: { status: 'available' },
                volumes: { status: 'unknown', reason: 'invalid_response' },
              },
        ],
      });
      expect(fetchImpl).toHaveBeenCalledTimes(4);
    },
  );

  it('normalizes omitted nullable REST fields to explicit nulls', async () => {
    const appWithoutNetwork = { ...app(), network: undefined };
    const machineWithMetadata = machine();
    const machineWithoutProcessGroup = {
      ...machineWithMetadata,
      config: {
        ...machineWithMetadata.config,
        metadata: { secret: 'secret-metadata-without-process-group' },
      },
    };
    const volumeWithoutOptionalFields = {
      ...volume(),
      attached_machine_id: undefined,
      snapshot_retention: undefined,
      auto_backup_enabled: undefined,
    };
    const fetchImpl = fetchMock((url) => {
      if (url.pathname === '/v1/apps') {
        return json({ total_apps: 1, apps: [appWithoutNetwork] });
      }
      if (url.pathname.endsWith('/machines')) return json([machineWithoutProcessGroup]);
      if (url.pathname.endsWith('/volumes')) return json([volumeWithoutOptionalFields]);
      return json(appWithoutNetwork);
    });

    const result = await observeAdminFlyInventory(options(fetchImpl));

    expect(result).toMatchObject({
      status: 'available',
      apps: [
        {
          network: null,
          machines: {
            status: 'available',
            items: [{ processGroup: null }],
          },
          volumes: {
            status: 'available',
            items: [
              {
                attachedMachineId: null,
                snapshotRetentionDays: null,
                autoBackupEnabled: null,
              },
            ],
          },
        },
      ],
    });
  });

  it.each([
    ['empty', ''],
    ['uppercase', 'API'],
    ['leading hyphen', '-api'],
    ['more than 63 characters', `a${'-a'.repeat(32)}`],
    ['null', null],
    ['non-string', 7],
  ] as const)(
    'fails Machine inventory closed for a %s process-group value',
    async (_description, processGroup) => {
      const fetchImpl = fetchMock((url) => {
        if (url.pathname === '/v1/apps') return json({ total_apps: 1, apps: [app()] });
        if (url.pathname.endsWith('/machines')) return json([machine(0, processGroup)]);
        if (url.pathname.endsWith('/volumes')) return json([volume()]);
        return json(app());
      });

      const result = await observeAdminFlyInventory(options(fetchImpl));

      expect(result).toMatchObject({
        status: 'partial',
        apps: [
          {
            machines: { status: 'unknown', reason: 'invalid_response' },
            volumes: { status: 'available', returnedAllocatedGb: 3 },
          },
        ],
      });
      expect(fetchImpl).toHaveBeenCalledTimes(4);
      expect(JSON.stringify(result)).not.toContain('processGroup');
    },
  );

  it('accepts 1,000 organization rows but rejects 1,001 before app detail calls', async () => {
    function organizationRows(count: number) {
      return [
        app(),
        ...Array.from({ length: count - 1 }, (_, index) =>
          app(`provider-shadow-${index}`, index + 1),
        ),
      ];
    }

    const atLimit = fetchMock((url) => {
      if (url.pathname === '/v1/apps') {
        return json({ total_apps: 1_000, apps: organizationRows(1_000) });
      }
      if (url.pathname.endsWith('/machines')) return json([machine()]);
      if (url.pathname.endsWith('/volumes')) return json([volume()]);
      return json(app());
    });
    const atLimitResult = await observeAdminFlyInventory(options(atLimit));
    expect(atLimitResult).toMatchObject({
      status: 'available',
      configuredAppCount: 1,
      apps: [{ name: 'harpa-pro-api' }],
    });
    expect(atLimit).toHaveBeenCalledTimes(4);
    expect(JSON.stringify(atLimitResult)).not.toContain('provider-shadow-');

    const overLimit = vi
      .fn<typeof fetch>()
      .mockResolvedValue(json({ total_apps: 1_001, apps: organizationRows(1_001) }));
    await expect(observeAdminFlyInventory(options(overLimit))).resolves.toEqual({
      observedAt: NOW.toISOString(),
      status: 'unknown',
      reason: 'invalid_response',
    });
    expect(overLimit).toHaveBeenCalledOnce();
  });

  it('uses one ten-second abort deadline and does not retry the timed-out request', async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn<typeof fetch>((_input, init) => {
      return new Promise((_resolve, reject) => {
        const rejectAbort = () =>
          reject(Object.assign(new Error(`aborted ${API_TOKEN}`), { name: 'AbortError' }));
        if (init?.signal?.aborted) rejectAbort();
        else init?.signal?.addEventListener('abort', rejectAbort, { once: true });
      });
    });
    const settled = vi.fn();
    const observation = observeAdminFlyInventory(options(fetchImpl));
    void observation.then(settled);
    await Promise.resolve();

    expect(fetchImpl).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(9_999);
    expect(settled).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    await expect(observation).resolves.toEqual({
      observedAt: NOW.toISOString(),
      status: 'unknown',
      reason: 'timeout',
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('preserves safe app and Volume facts when Machine inventory fails', async () => {
    const providerSecret = `raw-machine-error-${API_TOKEN}`;
    const fetchImpl = fetchMock((url) => {
      if (url.pathname === '/v1/apps') return json({ total_apps: 1, apps: [app()] });
      if (url.pathname.endsWith('/machines')) {
        return json({ message: providerSecret }, 503);
      }
      if (url.pathname.endsWith('/volumes')) return json([volume()]);
      return json(app());
    });

    const result = await observeAdminFlyInventory(options(fetchImpl));

    expect(result).toMatchObject({
      status: 'partial',
      configuredAppCount: 1,
      unavailableConfiguredAppCount: 0,
      apps: [
        {
          name: 'harpa-pro-api',
          reportedMachineCount: 1,
          reportedVolumeCount: 2,
          machines: { status: 'unknown', reason: 'provider_unavailable' },
          volumes: {
            status: 'available',
            truncated: false,
            returnedAllocatedGb: 3,
            items: [{ id: 'volume-0', sizeGb: 3 }],
          },
        },
      ],
    });
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(
      fetchImpl.mock.calls.filter(([input]) => urlOf(input).pathname.endsWith('/machines')),
    ).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain(providerSecret);
    expect(JSON.stringify(result)).not.toContain(API_TOKEN);
  });

  it.each([
    ['ID', { id: 'different-provider-id' }],
    ['name', { name: 'different-provider-name' }],
    ['organization', { organization: { slug: 'different-organization' } }],
  ] as const)(
    'omits an app whose detail response repeats a different %s while preserving verified apps',
    async (_field, mismatch) => {
      const appNames = ['harpa-pro-api', 'harpa-pro-worker'];
      const fetchImpl = fetchMock((url) => {
        if (url.pathname === '/v1/apps') {
          return json({ total_apps: 2, apps: appNames.map((name, index) => app(name, index)) });
        }
        const appName = decodeURIComponent(url.pathname.split('/')[3] ?? '');
        if (url.pathname.endsWith('/machines')) return json([machine()]);
        if (url.pathname.endsWith('/volumes')) return json([volume()]);
        const detail = app(appName, appNames.indexOf(appName));
        return json(appName === 'harpa-pro-worker' ? { ...detail, ...mismatch } : detail);
      });

      const result = await observeAdminFlyInventory(options(fetchImpl, appNames));

      expect(result).toMatchObject({
        status: 'partial',
        configuredAppCount: 2,
        unavailableConfiguredAppCount: 1,
        apps: [{ name: 'harpa-pro-api' }],
      });
      expect(fetchImpl).toHaveBeenCalledTimes(7);
      expect(JSON.stringify(result)).not.toMatch(/different-provider/);
    },
  );

  it('does not probe a configured app absent from organization discovery', async () => {
    const fetchImpl = fetchMock((url) => {
      if (url.pathname === '/v1/apps') {
        return json({ total_apps: 2, apps: [app('harpa-pro-api')] });
      }
      if (url.pathname.endsWith('/machines')) return json([machine()]);
      if (url.pathname.endsWith('/volumes')) return json([volume()]);
      return json(app('harpa-pro-api'));
    });

    const result = await observeAdminFlyInventory(
      options(fetchImpl, ['harpa-pro-api', 'harpa-pro-missing']),
    );

    expect(result).toMatchObject({
      status: 'partial',
      configuredAppCount: 2,
      unavailableConfiguredAppCount: 1,
      apps: [{ name: 'harpa-pro-api' }],
    });
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(fetchImpl.mock.calls.map(([input]) => urlOf(input).pathname)).not.toContain(
      '/v1/apps/harpa-pro-missing',
    );
  });

  it('locally truncates Machine and Volume arrays at 50 and sums only returned Volumes', async () => {
    const reportedApp = { ...app(), machine_count: 137, volume_count: 149 };
    const fetchImpl = fetchMock((url) => {
      if (url.pathname === '/v1/apps') return json({ total_apps: 1, apps: [reportedApp] });
      if (url.pathname.endsWith('/machines')) {
        return json(Array.from({ length: 51 }, (_, index) => machine(index)));
      }
      if (url.pathname.endsWith('/volumes')) {
        return json(Array.from({ length: 51 }, (_, index) => volume(index, 1)));
      }
      return json(reportedApp);
    });

    const result = await observeAdminFlyInventory(options(fetchImpl));

    expect(result).toMatchObject({
      status: 'partial',
      apps: [
        {
          reportedMachineCount: 137,
          reportedVolumeCount: 149,
          machines: { status: 'available', truncated: true },
          volumes: {
            status: 'available',
            truncated: true,
            returnedAllocatedGb: 50,
          },
        },
      ],
    });
    if (result.status === 'unknown') throw new Error('expected truncated Fly inventory');
    const [observedApp] = result.apps;
    if (!observedApp || observedApp.machines.status === 'unknown') {
      throw new Error('expected bounded Machine rows');
    }
    if (observedApp.volumes.status === 'unknown') throw new Error('expected bounded Volume rows');
    expect(observedApp.machines.items).toHaveLength(50);
    expect(observedApp.volumes.items).toHaveLength(50);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it('accepts an exact safe allocated-size sum and rejects an overflowing sum as partial', async () => {
    function sizeFetch(volumes: unknown[]) {
      return fetchMock((url) => {
        if (url.pathname === '/v1/apps') return json({ total_apps: 1, apps: [app()] });
        if (url.pathname.endsWith('/machines')) return json([machine()]);
        if (url.pathname.endsWith('/volumes')) return json(volumes);
        return json(app());
      });
    }

    const safeFetch = sizeFetch([volume(0, Number.MAX_SAFE_INTEGER - 1), volume(1, 1)]);
    const safeResult = await observeAdminFlyInventory(options(safeFetch));
    expect(safeResult).toMatchObject({
      status: 'available',
      apps: [
        {
          volumes: {
            status: 'available',
            returnedAllocatedGb: Number.MAX_SAFE_INTEGER,
          },
        },
      ],
    });

    const overflowFetch = sizeFetch([volume(0, Number.MAX_SAFE_INTEGER), volume(1, 1)]);
    const overflowResult = await observeAdminFlyInventory(options(overflowFetch));
    expect(overflowResult).toMatchObject({
      status: 'partial',
      apps: [
        {
          machines: { status: 'available' },
          volumes: { status: 'unknown', reason: 'invalid_response' },
        },
      ],
    });
    expect(safeFetch).toHaveBeenCalledTimes(4);
    expect(overflowFetch).toHaveBeenCalledTimes(4);
  });

  it.each([
    [503, 'malformed', 'invalid_response'],
    ['malformed', 404, 'not_found'],
    [404, 403, 'forbidden'],
    [403, 429, 'rate_limited'],
    [429, 504, 'timeout'],
  ] as const)(
    'uses the documented failure priority for %s and %s',
    async (firstFailure, secondFailure, reason) => {
      type Failure = number | 'malformed';
      const appNames = ['harpa-pro-api', 'harpa-pro-worker'];
      const fetchImpl = fetchMock((url) => {
        if (url.pathname === '/v1/apps') {
          return json({ total_apps: 2, apps: appNames.map((name, index) => app(name, index)) });
        }
        if (url.pathname.endsWith('/machines')) return json([machine()]);
        if (url.pathname.endsWith('/volumes')) return json([volume()]);
        const failure: Failure = url.pathname.endsWith('/harpa-pro-api')
          ? firstFailure
          : secondFailure;
        return failure === 'malformed'
          ? json({ ...app(), status: 7, provider_secret: API_TOKEN })
          : json({ message: `private detail ${API_TOKEN}` }, failure);
      });

      const result = await observeAdminFlyInventory(options(fetchImpl, appNames));

      expect(result).toEqual({
        observedAt: NOW.toISOString(),
        status: 'unknown',
        reason,
      });
      expect(fetchImpl).toHaveBeenCalledTimes(7);
      expect(JSON.stringify(result)).not.toContain(API_TOKEN);
    },
  );
});
