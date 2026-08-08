import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../env.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../env.js')>();
  return {
    ...actual,
    env: {
      ...actual.env,
      ADMIN_SENTRY_ORG_SLUG: 'harpa-pro',
      ADMIN_SENTRY_READ_TOKEN: 'default-sentry-read-token',
      ADMIN_SENTRY_PROJECT_SLUGS: 'harpa-pro-api,harpa-pro-mobile',
      ADMIN_SENTRY_MOBILE_PROJECT_SLUG: 'harpa-pro-mobile',
      ADMIN_SENTRY_ENVIRONMENT: 'production',
      ADMIN_SENTRY_REGION: 'global',
    },
  };
});

import { observeAdminSentry } from './sentry-operations.js';

const NOW = new Date('2026-08-08T08:00:00.000Z');
const WINDOW_START = '2026-08-07T08:00:00.000Z';
const WINDOW_END = NOW.toISOString();
const ORG_SLUG = 'harpa-pro';
const READ_TOKEN = 'explicit-sentry-read-token';
const PROJECT_SLUGS = ['harpa-pro-api', 'harpa-pro-mobile'];
const MOBILE_PROJECT_SLUG = 'harpa-pro-mobile';
const ISSUE_BODY_LIMIT = 1_048_576;
const SESSION_BODY_LIMIT = 262_144;
const PROVIDER_BODY_SENTINEL = 'provider-secret-error-body';
const PROVIDER_HEADER_SENTINEL = 'provider-secret-response-header';

const HTTP_FAILURE_CASES = [
  [401, 'forbidden'],
  [403, 'forbidden'],
  [404, 'not_found'],
  [429, 'rate_limited'],
  [408, 'timeout'],
  [504, 'timeout'],
  [400, 'invalid_response'],
  [500, 'provider_unavailable'],
] as const;

const FAILURE_PRIORITY_ORDER = [
  [504, 'timeout'],
  [429, 'rate_limited'],
  [403, 'forbidden'],
  [404, 'not_found'],
  [400, 'invalid_response'],
  [500, 'provider_unavailable'],
] as const;

const FAILURE_PRIORITY_CASES = [
  ...FAILURE_PRIORITY_ORDER.flatMap(([higherStatus, higherReason], higherIndex) =>
    FAILURE_PRIORITY_ORDER.slice(higherIndex + 1).flatMap(([lowerStatus]) => [
      [higherStatus, lowerStatus, higherReason] as const,
      [lowerStatus, higherStatus, higherReason] as const,
    ]),
  ),
  [500, 500, 'provider_unavailable'] as const,
];

type SessionStatus = 'healthy' | 'errored' | 'abnormal' | 'crashed';
type SessionGroup = {
  by: { 'session.status': string };
  totals: { 'sum(session)': number };
};

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function exactJsonBytes(
  bodyWithPadding: (padding: string) => unknown,
  targetBytes: number,
  headers: Record<string, string> = {},
): Response {
  const emptyBody = JSON.stringify(bodyWithPadding(''));
  const emptyBytes = new TextEncoder().encode(emptyBody).byteLength;
  if (emptyBytes > targetBytes) throw new Error('target body is smaller than the JSON envelope');

  const body = JSON.stringify(bodyWithPadding('x'.repeat(targetBytes - emptyBytes)));
  if (new TextEncoder().encode(body).byteLength !== targetBytes) {
    throw new Error('test body did not reach the exact byte boundary');
  }

  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function multibyteOverflowJson(
  bodyWithPadding: (padding: string) => unknown,
  limitBytes: number,
  headers: Record<string, string> = {},
): Response {
  let characters = Math.ceil(limitBytes / 3);
  let body = JSON.stringify(bodyWithPadding('界'.repeat(characters)));
  while (new TextEncoder().encode(body).byteLength <= limitBytes) {
    characters += 1;
    body = JSON.stringify(bodyWithPadding('界'.repeat(characters)));
  }
  if (body.length >= limitBytes) {
    throw new Error('multibyte body must overflow bytes before JavaScript string length');
  }

  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function malformedJson(headers: Record<string, string> = {}): Response {
  return new Response('{not-json', {
    status: 200,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function urlOf(input: string | URL | Request): URL {
  return new URL(input instanceof Request ? input.url : input.toString());
}

function paginationLink(nextResults: boolean): string {
  const root = `https://sentry.io/api/0/organizations/${ORG_SLUG}/issues/`;
  return [
    `<${root}?cursor=previous>; rel="previous"; results="false"; cursor="previous"`,
    `<${root}?cursor=next>; rel="next"; results="${String(nextResults)}"; cursor="next"`,
  ].join(', ');
}

function issues(
  rows: unknown[] = [
    { issueCategory: 'error' },
    { issueCategory: 'performance' },
    { issueCategory: 'error' },
  ],
  nextResults = false,
): Response {
  return json(rows, 200, { link: paginationLink(nextResults) });
}

function hourlyIntervals(count = 24): string[] {
  return Array.from({ length: count }, (_, index) =>
    new Date(Date.parse(WINDOW_START) + index * 60 * 60 * 1_000).toISOString(),
  );
}

function sessionGroup(status: SessionStatus | string, count: number): SessionGroup {
  return {
    by: { 'session.status': status },
    totals: { 'sum(session)': count },
  };
}

function sessions(
  groups: unknown[] = [
    sessionGroup('healthy', 7),
    sessionGroup('errored', 1),
    sessionGroup('abnormal', 1),
    sessionGroup('crashed', 1),
  ],
  overrides: Record<string, unknown> = {},
): Response {
  return json({
    start: WINDOW_START,
    end: WINDOW_END,
    intervals: hourlyIntervals(),
    groups,
    ...overrides,
  });
}

function fetchMock(handler: (url: URL, init?: RequestInit) => Response | Promise<Response>) {
  return vi.fn<typeof fetch>((input, init) => Promise.resolve(handler(urlOf(input), init)));
}

function successfulFetch() {
  return fetchMock((url) => {
    if (url.pathname.endsWith('/issues/')) return issues();
    if (url.pathname.endsWith('/sessions/')) return sessions();
    return json({ unexpected: url.toString() }, 500);
  });
}

function options(fetchImpl: typeof fetch, overrides: Record<string, unknown> = {}) {
  return {
    orgSlug: ORG_SLUG,
    readToken: READ_TOKEN,
    projectSlugs: PROJECT_SLUGS,
    mobileProjectSlug: MOBILE_PROJECT_SLUG,
    environment: 'production',
    region: 'global',
    fetchImpl,
    now: () => NOW,
    ...overrides,
  };
}

function availableObservation() {
  return {
    observedAt: NOW.toISOString(),
    status: 'available',
    unresolvedErrors: {
      status: 'available',
      count: 2,
      countKind: 'exact',
      cap: 100,
    },
    mobileSessions: {
      status: 'available',
      window: 'last_24_hours',
      windowStart: WINDOW_START,
      windowEnd: WINDOW_END,
      totalSessions: 10,
      healthySessions: 7,
      erroredSessions: 1,
      abnormalSessions: 1,
      crashedSessions: 1,
    },
    caveats: ['issue_groups_not_events', 'mobile_sessions_only', 'telemetry_coverage_applies'],
  } as const;
}

function issueCall(fetchImpl: ReturnType<typeof fetchMock>) {
  return fetchImpl.mock.calls.find(([input]) => urlOf(input).pathname.endsWith('/issues/'))!;
}

function sessionCall(fetchImpl: ReturnType<typeof fetchMock>) {
  return fetchImpl.mock.calls.find(([input]) => urlOf(input).pathname.endsWith('/sessions/'))!;
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('observeAdminSentry', () => {
  it('returns not_configured without a Sentry request when the observer is absent', async () => {
    const fetchImpl = vi.fn<typeof fetch>();

    await expect(
      observeAdminSentry({
        orgSlug: '',
        readToken: '',
        projectSlugs: [],
        mobileProjectSlug: '',
        environment: '',
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

  it.each([
    ['orgSlug', ''],
    ['readToken', ''],
    ['projectSlugs', []],
    ['mobileProjectSlug', ''],
    ['environment', ''],
    ['region', ''],
  ] as const)(
    'fails closed before fetch when configured options contain a blank %s',
    async (field, value) => {
      const fetchImpl = vi.fn<typeof fetch>();

      await expect(observeAdminSentry(options(fetchImpl, { [field]: value }))).resolves.toEqual({
        observedAt: NOW.toISOString(),
        status: 'unknown',
        reason: 'not_configured',
      });
      expect(fetchImpl).not.toHaveBeenCalled();
    },
  );

  it('uses the global region when a complete configured observation omits it', async () => {
    const fetchImpl = successfulFetch();

    await observeAdminSentry(options(fetchImpl, { region: undefined }));

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    for (const [input] of fetchImpl.mock.calls) {
      expect(urlOf(input).origin).toBe('https://sentry.io');
    }
  });

  it('uses env and global-fetch defaults for two parallel fixed GETs', async () => {
    const pending: Array<{
      url: URL;
      resolve: (response: Response) => void;
    }> = [];
    const fetchImpl = vi.fn<typeof fetch>((input) => {
      const url = urlOf(input);
      return new Promise<Response>((resolve) => pending.push({ url, resolve }));
    });
    vi.stubGlobal('fetch', fetchImpl);

    const observation = observeAdminSentry({ now: () => NOW });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(pending).toHaveLength(2);
    for (const request of pending) {
      request.resolve(request.url.pathname.endsWith('/issues/') ? issues() : sessions());
    }
    await expect(observation).resolves.toEqual(availableObservation());

    const [issueInput, issueInit] = issueCall(fetchImpl);
    const issueUrl = urlOf(issueInput);
    expect(issueUrl.origin).toBe('https://sentry.io');
    expect(issueUrl.pathname).toBe(`/api/0/organizations/${ORG_SLUG}/issues/`);
    expect(issueUrl.searchParams.getAll('project')).toEqual(PROJECT_SLUGS);
    expect(issueUrl.searchParams.getAll('collapse')).toEqual([
      'filtered',
      'lifetime',
      'stats',
      'unhandled',
    ]);
    expect(Object.fromEntries(issueUrl.searchParams)).toMatchObject({
      environment: 'production',
      query: 'is:unresolved',
      sort: 'date',
      limit: '100',
      shortIdLookup: '0',
    });
    expect([...new Set(issueUrl.searchParams.keys())].sort()).toEqual(
      ['collapse', 'environment', 'limit', 'project', 'query', 'shortIdLookup', 'sort'].sort(),
    );

    const [sessionInput, sessionInit] = sessionCall(fetchImpl);
    const sessionUrl = urlOf(sessionInput);
    expect(sessionUrl.origin).toBe('https://sentry.io');
    expect(sessionUrl.pathname).toBe(`/api/0/organizations/${ORG_SLUG}/sessions/`);
    expect(Object.fromEntries(sessionUrl.searchParams)).toEqual({
      project: MOBILE_PROJECT_SLUG,
      environment: 'production',
      statsPeriod: '24h',
      interval: '1h',
      field: 'sum(session)',
      groupBy: 'session.status',
      includeTotals: '1',
      includeSeries: '0',
    });
    expect(sessionUrl.searchParams.has('start')).toBe(false);
    expect(sessionUrl.searchParams.has('end')).toBe(false);
    expect(sessionUrl.searchParams.has('cursor')).toBe(false);
    expect(sessionUrl.searchParams.has('query')).toBe(false);

    expect(issueInit?.signal).toBe(sessionInit?.signal);
    expect(issueInit?.signal).toBeInstanceOf(AbortSignal);
    for (const init of [issueInit, sessionInit]) {
      expect(init?.method).toBe('GET');
      expect(init?.body).toBeUndefined();
      expect(init?.redirect).toBe('error');
      expect(new Headers(init?.headers).get('accept')).toBe('application/json');
      expect(new Headers(init?.headers).get('authorization')).toBe(
        'Bearer default-sentry-read-token',
      );
    }
  });

  it.each([
    ['global', 'https://sentry.io'],
    ['us', 'https://us.sentry.io'],
    ['de', 'https://de.sentry.io'],
  ] as const)('maps %s to the fixed %s origin', async (region, origin) => {
    const fetchImpl = successfulFetch();

    await observeAdminSentry(options(fetchImpl, { region }));

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    for (const [input] of fetchImpl.mock.calls) expect(urlOf(input).origin).toBe(origin);
  });

  it('shares one exact 10-second abort budget across both requests', async () => {
    vi.useFakeTimers();
    const signals: AbortSignal[] = [];
    const fetchImpl = vi.fn<typeof fetch>((_input, init) => {
      const signal = init?.signal;
      if (!(signal instanceof AbortSignal)) throw new Error('missing abort signal');
      signals.push(signal);
      return new Promise<Response>((_resolve, reject) => {
        signal.addEventListener(
          'abort',
          () => reject(new DOMException('provider secret abort', 'AbortError')),
          { once: true },
        );
      });
    });

    const observation = observeAdminSentry(options(fetchImpl));

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(signals[0]).toBe(signals[1]);
    await vi.advanceTimersByTimeAsync(9_999);
    expect(signals[0]?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(signals[0]?.aborted).toBe(true);
    await expect(observation).resolves.toEqual({
      observedAt: NOW.toISOString(),
      status: 'unknown',
      reason: 'timeout',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('counts only exact error issue categories and makes missing known session groups zero', async () => {
    const fetchImpl = fetchMock((url) => {
      if (url.pathname.endsWith('/issues/')) {
        return issues([
          { issueCategory: 'error' },
          { issueCategory: 'performance' },
          { issueCategory: 'error ' },
          { issueCategory: 'ERROR' },
        ]);
      }
      return sessions([sessionGroup('healthy', 8), sessionGroup('crashed', 2)]);
    });

    await expect(observeAdminSentry(options(fetchImpl))).resolves.toMatchObject({
      status: 'available',
      unresolvedErrors: { status: 'available', count: 1, countKind: 'exact', cap: 100 },
      mobileSessions: {
        status: 'available',
        totalSessions: 10,
        healthySessions: 8,
        erroredSessions: 0,
        abnormalSessions: 0,
        crashedSessions: 2,
      },
    });
  });

  it.each([
    ['an empty page', []],
    ['an all-non-error page', [{ issueCategory: 'performance' }, { issueCategory: 'profile' }]],
  ])('returns an available exact zero for %s', async (_description, issueRows) => {
    const fetchImpl = fetchMock((url) =>
      url.pathname.endsWith('/issues/') ? issues(issueRows) : sessions(),
    );

    await expect(observeAdminSentry(options(fetchImpl))).resolves.toMatchObject({
      status: 'available',
      unresolvedErrors: { status: 'available', count: 0, countKind: 'exact', cap: 100 },
    });
  });

  it('marks a next issue page as a lower bound without following it', async () => {
    const fetchImpl = fetchMock((url) =>
      url.pathname.endsWith('/issues/')
        ? issues([{ issueCategory: 'error' }, { issueCategory: 'error' }], true)
        : sessions(),
    );

    await expect(observeAdminSentry(options(fetchImpl))).resolves.toEqual({
      ...availableObservation(),
      status: 'partial',
      unresolvedErrors: {
        status: 'available',
        count: 2,
        countKind: 'lower_bound',
        cap: 100,
      },
      caveats: [...availableObservation().caveats, 'issue_count_truncated'],
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls.some(([input]) => urlOf(input).searchParams.has('cursor'))).toBe(
      false,
    );
  });

  it.each([
    ['absent Link header', null],
    ['nonempty garbage Link header', 'not-a-link'],
    [
      'previous-only Link header',
      '<https://sentry.io/previous>; rel="previous"; results="false"; cursor="previous"',
    ],
    ['missing results on next relation', '<https://sentry.io/next>; rel="next"'],
    ['invalid results value', '<https://sentry.io/next>; rel="next"; results="yes"'],
  ] as const)('fails closed for an %s', async (_description, link) => {
    const fetchImpl = fetchMock((url) => {
      if (url.pathname.endsWith('/sessions/')) return sessions();
      return json([{ issueCategory: 'error' }], 200, link === null ? {} : { link });
    });

    await expect(observeAdminSentry(options(fetchImpl))).resolves.toMatchObject({
      status: 'partial',
      unresolvedErrors: { status: 'unknown', reason: 'invalid_response' },
      mobileSessions: { status: 'available' },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['more than 100 issue rows', Array.from({ length: 101 }, () => ({ issueCategory: 'error' }))],
    ['missing issue category', [{}]],
    ['blank issue category', [{ issueCategory: '   ' }]],
    ['unbounded issue category', [{ issueCategory: 'x'.repeat(1_025) }]],
  ])('rejects %s', async (_description, rows) => {
    const fetchImpl = fetchMock((url) =>
      url.pathname.endsWith('/issues/') ? issues(rows) : sessions(),
    );

    await expect(observeAdminSentry(options(fetchImpl))).resolves.toMatchObject({
      status: 'partial',
      unresolvedErrors: { status: 'unknown', reason: 'invalid_response' },
    });
  });

  it.each([
    ['duplicate status', [sessionGroup('healthy', 1), sessionGroup('healthy', 2)]],
    ['unknown status', [sessionGroup('healthy', 1), sessionGroup('muted', 2)]],
    ['negative count', [sessionGroup('crashed', -1)]],
    ['fractional count', [sessionGroup('crashed', 0.5)]],
    ['unsafe count', [sessionGroup('crashed', Number.MAX_SAFE_INTEGER + 1)]],
    [
      'unsafe total',
      [sessionGroup('healthy', Number.MAX_SAFE_INTEGER), sessionGroup('crashed', 1)],
    ],
  ])('rejects a session response with %s', async (_description, groups) => {
    const fetchImpl = fetchMock((url) =>
      url.pathname.endsWith('/issues/') ? issues() : sessions(groups),
    );

    await expect(observeAdminSentry(options(fetchImpl))).resolves.toMatchObject({
      status: 'partial',
      unresolvedErrors: { status: 'available' },
      mobileSessions: { status: 'unknown', reason: 'invalid_response' },
    });
  });

  it.each([
    ['missing intervals', { intervals: undefined }],
    ['an empty interval list', { intervals: [] }],
    [
      'more than 25 hourly intervals',
      {
        intervals: hourlyIntervals(26),
      },
    ],
    ['a malformed interval item', { intervals: [...hourlyIntervals(23), 'not-a-date'] }],
    ['a malformed start timestamp', { start: 'not-a-date' }],
    ['a malformed end timestamp', { end: 'not-a-date' }],
    ['a 22-hour provider window', { end: '2026-08-08T06:00:00.000Z' }],
    ['a 26-hour provider window', { end: '2026-08-08T10:00:00.000Z' }],
    ['a reversed provider window', { end: '2026-08-07T07:00:00.000Z' }],
  ])('rejects sessions with %s', async (_description, responseOverrides) => {
    const fetchImpl = fetchMock((url) =>
      url.pathname.endsWith('/issues/') ? issues() : sessions(undefined, responseOverrides),
    );

    await expect(observeAdminSentry(options(fetchImpl))).resolves.toMatchObject({
      status: 'partial',
      mobileSessions: { status: 'unknown', reason: 'invalid_response' },
    });
  });

  it('accepts at most 25 hourly interval markers for Sentry rounding', async () => {
    const fetchImpl = fetchMock((url) =>
      url.pathname.endsWith('/issues/')
        ? issues()
        : sessions(undefined, { intervals: hourlyIntervals(25) }),
    );

    await expect(observeAdminSentry(options(fetchImpl))).resolves.toMatchObject({
      status: 'available',
      mobileSessions: { status: 'available', totalSessions: 10 },
    });
  });

  it('treats a zero-session provider window as unknown instead of zero crashes', async () => {
    const fetchImpl = fetchMock((url) =>
      url.pathname.endsWith('/issues/') ? issues() : sessions([sessionGroup('healthy', 0)]),
    );

    await expect(observeAdminSentry(options(fetchImpl))).resolves.toEqual({
      observedAt: NOW.toISOString(),
      status: 'partial',
      unresolvedErrors: availableObservation().unresolvedErrors,
      mobileSessions: { status: 'unknown', reason: 'no_session_data' },
      caveats: availableObservation().caveats,
    });
  });

  it.each([
    ['issues', ISSUE_BODY_LIMIT, 'unresolvedErrors'],
    ['sessions', SESSION_BODY_LIMIT, 'mobileSessions'],
  ] as const)('accepts an exact-limit %s response body', async (target, limit, slice) => {
    const fetchImpl = fetchMock((url) => {
      if (url.pathname.endsWith(`/${target}/`)) {
        return target === 'issues'
          ? exactJsonBytes(
              (padding) => [{ issueCategory: 'error', providerPadding: padding }],
              limit,
              { link: paginationLink(false) },
            )
          : exactJsonBytes(
              (padding) => ({ ...sessionsPayload(), providerPadding: padding }),
              limit,
            );
      }
      return url.pathname.endsWith('/issues/') ? issues() : sessions();
    });

    const result = await observeAdminSentry(options(fetchImpl));

    expect(result).toMatchObject({
      status: 'available',
      [slice]: { status: 'available' },
    });
  });

  it.each([
    ['issues', ISSUE_BODY_LIMIT, 'unresolvedErrors'],
    ['sessions', SESSION_BODY_LIMIT, 'mobileSessions'],
  ] as const)('accepts an exact declared Content-Length for %s', async (target, limit, slice) => {
    const fetchImpl = fetchMock((url) => {
      if (url.pathname.endsWith(`/${target}/`)) {
        return target === 'issues'
          ? exactJsonBytes(
              (padding) => [{ issueCategory: 'error', providerPadding: padding }],
              limit,
              { link: paginationLink(false), 'content-length': String(limit) },
            )
          : exactJsonBytes(
              (padding) => ({ ...sessionsPayload(), providerPadding: padding }),
              limit,
              { 'content-length': String(limit) },
            );
      }
      return url.pathname.endsWith('/issues/') ? issues() : sessions();
    });

    const result = await observeAdminSentry(options(fetchImpl));

    expect(result).toMatchObject({
      status: 'available',
      [slice]: { status: 'available' },
    });
  });

  it.each([
    ['issues', ISSUE_BODY_LIMIT, 'unresolvedErrors'],
    ['sessions', SESSION_BODY_LIMIT, 'mobileSessions'],
  ] as const)(
    'rejects a declared oversized %s body before parsing it',
    async (target, limit, slice) => {
      const fetchImpl = fetchMock((url) => {
        const isTarget = url.pathname.endsWith(`/${target}/`);
        if (isTarget) {
          return json(target === 'issues' ? [{ issueCategory: 'error' }] : sessionsPayload(), 200, {
            ...(target === 'issues' ? { link: paginationLink(false) } : {}),
            'content-length': String(limit + 1),
          });
        }
        return url.pathname.endsWith('/issues/') ? issues() : sessions();
      });

      const result = await observeAdminSentry(options(fetchImpl));

      expect(result).toMatchObject({
        status: 'partial',
        [slice]: { status: 'unknown', reason: 'invalid_response' },
      });
    },
  );

  it.each([
    ['issues', ISSUE_BODY_LIMIT, 'unresolvedErrors'],
    ['sessions', SESSION_BODY_LIMIT, 'mobileSessions'],
  ] as const)(
    'rejects an observed oversized %s body without a declared length',
    async (target, limit, slice) => {
      const fetchImpl = fetchMock((url) => {
        if (url.pathname.endsWith(`/${target}/`)) {
          return target === 'issues'
            ? exactJsonBytes(
                (padding) => [{ issueCategory: 'error', providerSecret: padding }],
                limit + 1,
                { link: paginationLink(false) },
              )
            : exactJsonBytes(
                (padding) => ({ ...sessionsPayload(), providerSecret: padding }),
                limit + 1,
              );
        }
        return url.pathname.endsWith('/issues/') ? issues() : sessions();
      });

      const result = await observeAdminSentry(options(fetchImpl));

      expect(result).toMatchObject({
        status: 'partial',
        [slice]: { status: 'unknown', reason: 'invalid_response' },
      });
    },
  );

  it.each([
    ['issues', ISSUE_BODY_LIMIT, 'unresolvedErrors'],
    ['sessions', SESSION_BODY_LIMIT, 'mobileSessions'],
  ] as const)('counts multibyte UTF-8 bytes when bounding %s', async (target, limit, slice) => {
    const fetchImpl = fetchMock((url) => {
      if (url.pathname.endsWith(`/${target}/`)) {
        return target === 'issues'
          ? multibyteOverflowJson(
              (padding) => [{ issueCategory: 'error', providerSecret: padding }],
              limit,
              { link: paginationLink(false) },
            )
          : multibyteOverflowJson(
              (padding) => ({ ...sessionsPayload(), providerSecret: padding }),
              limit,
            );
      }
      return url.pathname.endsWith('/issues/') ? issues() : sessions();
    });

    const result = await observeAdminSentry(options(fetchImpl));

    expect(result).toMatchObject({
      status: 'partial',
      [slice]: { status: 'unknown', reason: 'invalid_response' },
    });
  });

  it.each(HTTP_FAILURE_CASES)(
    'maps issue HTTP %s to %s without retrying',
    async (status, reason) => {
      const consoleSpies = ['error', 'warn', 'info', 'log'].map((method) =>
        vi.spyOn(console, method as 'error').mockImplementation(() => undefined),
      );
      const fetchImpl = fetchMock((url) =>
        url.pathname.endsWith('/issues/')
          ? json({ detail: PROVIDER_BODY_SENTINEL }, status, {
              'x-provider-diagnostic': PROVIDER_HEADER_SENTINEL,
            })
          : sessions(),
      );

      const result = await observeAdminSentry(options(fetchImpl));

      expect(result).toMatchObject({
        status: 'partial',
        unresolvedErrors: { status: 'unknown', reason },
        mobileSessions: { status: 'available' },
      });
      const logged = consoleSpies
        .flatMap((spy) => spy.mock.calls.flat())
        .map(String)
        .join(' ');
      expect(JSON.stringify(result)).not.toMatch(/provider-secret-(error-body|response-header)/);
      expect(logged).not.toContain(PROVIDER_BODY_SENTINEL);
      expect(logged).not.toContain(PROVIDER_HEADER_SENTINEL);
      for (const spy of consoleSpies) expect(spy).not.toHaveBeenCalled();
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    },
  );

  it.each(HTTP_FAILURE_CASES)(
    'maps session HTTP %s to %s without retrying',
    async (status, reason) => {
      const consoleSpies = ['error', 'warn', 'info', 'log'].map((method) =>
        vi.spyOn(console, method as 'error').mockImplementation(() => undefined),
      );
      const fetchImpl = fetchMock((url) =>
        url.pathname.endsWith('/sessions/')
          ? json({ detail: PROVIDER_BODY_SENTINEL }, status, {
              'x-provider-diagnostic': PROVIDER_HEADER_SENTINEL,
            })
          : issues(),
      );

      const result = await observeAdminSentry(options(fetchImpl));

      expect(result).toMatchObject({
        status: 'partial',
        unresolvedErrors: { status: 'available' },
        mobileSessions: { status: 'unknown', reason },
      });
      const logged = consoleSpies
        .flatMap((spy) => spy.mock.calls.flat())
        .map(String)
        .join(' ');
      expect(JSON.stringify(result)).not.toMatch(/provider-secret-(error-body|response-header)/);
      expect(logged).not.toContain(PROVIDER_BODY_SENTINEL);
      expect(logged).not.toContain(PROVIDER_HEADER_SENTINEL);
      for (const spy of consoleSpies) expect(spy).not.toHaveBeenCalled();
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    },
  );

  it('maps malformed JSON to invalid_response', async () => {
    const fetchImpl = fetchMock((url) =>
      url.pathname.endsWith('/issues/')
        ? malformedJson({ link: paginationLink(false) })
        : sessions(),
    );

    await expect(observeAdminSentry(options(fetchImpl))).resolves.toMatchObject({
      status: 'partial',
      unresolvedErrors: { status: 'unknown', reason: 'invalid_response' },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it.each([
    [new DOMException('provider-secret-abort', 'AbortError'), 'timeout'],
    [new Error('provider-secret-network-message'), 'provider_unavailable'],
  ] as const)('redacts a thrown provider failure as %s', async (error, reason) => {
    const consoleSpies = ['error', 'warn', 'info', 'log'].map((method) =>
      vi.spyOn(console, method as 'error').mockImplementation(() => undefined),
    );
    const fetchImpl = fetchMock((url) => {
      if (url.pathname.endsWith('/issues/')) throw error;
      return sessions();
    });

    const result = await observeAdminSentry(options(fetchImpl));

    expect(result).toMatchObject({
      status: 'partial',
      unresolvedErrors: { status: 'unknown', reason },
    });
    expect(JSON.stringify(result)).not.toMatch(/provider-secret|network-message/);
    for (const spy of consoleSpies) expect(spy).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it.each(FAILURE_PRIORITY_CASES)(
    'uses the finite failure priority for issue %s and session %s',
    async (issueStatus, sessionStatus, reason) => {
      const fetchImpl = fetchMock((url) =>
        json(
          { detail: 'sensitive provider failure' },
          url.pathname.endsWith('/issues/') ? issueStatus : sessionStatus,
        ),
      );

      await expect(observeAdminSentry(options(fetchImpl))).resolves.toEqual({
        observedAt: NOW.toISOString(),
        status: 'unknown',
        reason,
      });
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    },
  );

  it('prioritizes provider_unavailable above zero-session no_session_data', async () => {
    const fetchImpl = fetchMock((url) =>
      url.pathname.endsWith('/issues/')
        ? json({ detail: 'sensitive provider failure' }, 500)
        : sessions([sessionGroup('healthy', 0)]),
    );

    await expect(observeAdminSentry(options(fetchImpl))).resolves.toEqual({
      observedAt: NOW.toISOString(),
      status: 'unknown',
      reason: 'provider_unavailable',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('returns only aggregate allowlisted fields from sensitive provider payloads', async () => {
    const providerSecrets = [
      'issue-identifier-123',
      'HARPA-PRO-9',
      'Database credentials leaked',
      'src/private/database.ts',
      'person@example.com',
      'https://private.example/path',
      ORG_SLUG,
      MOBILE_PROJECT_SLUG,
      READ_TOKEN,
    ];
    const consoleSpies = ['error', 'warn', 'info', 'log'].map((method) =>
      vi.spyOn(console, method as 'error').mockImplementation(() => undefined),
    );
    const fetchImpl = fetchMock((url) => {
      if (url.pathname.endsWith('/issues/')) {
        return issues([
          {
            issueCategory: 'error',
            id: providerSecrets[0],
            shortId: providerSecrets[1],
            title: providerSecrets[2],
            culprit: providerSecrets[3],
            user: { email: providerSecrets[4] },
            permalink: providerSecrets[5],
            organization: providerSecrets[6],
            project: MOBILE_PROJECT_SLUG,
            token: READ_TOKEN,
            metadata: { stacktrace: providerSecrets },
          },
        ]);
      }
      return sessions(
        [
          {
            ...sessionGroup('healthy', 10),
            users: [{ email: providerSecrets[4] }],
            project: MOBILE_PROJECT_SLUG,
          },
        ],
        { rawGroups: providerSecrets, organization: ORG_SLUG },
      );
    });

    const result = await observeAdminSentry(options(fetchImpl));

    expect(result).toEqual({
      ...availableObservation(),
      unresolvedErrors: { status: 'available', count: 1, countKind: 'exact', cap: 100 },
      mobileSessions: {
        ...availableObservation().mobileSessions,
        totalSessions: 10,
        healthySessions: 10,
        erroredSessions: 0,
        abnormalSessions: 0,
        crashedSessions: 0,
      },
    });
    const serialized = JSON.stringify(result);
    for (const secret of providerSecrets) expect(serialized).not.toContain(secret);
    for (const spy of consoleSpies) expect(spy).not.toHaveBeenCalled();
  });
});

function sessionsPayload(): Record<string, unknown> {
  return {
    start: WINDOW_START,
    end: WINDOW_END,
    intervals: hourlyIntervals(),
    groups: [sessionGroup('healthy', 10)],
  };
}
