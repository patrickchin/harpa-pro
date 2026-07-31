import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

const { requestSpy } = vi.hoisted(() => ({
  requestSpy: vi.fn(async () => ({ report: {} })),
}));

vi.mock('./client', () => ({
  request: requestSpy,
}));

import {
  useGenerateReportMutation,
  useRegenerateReportMutation,
  type GenerateReportMutationVars,
  type RegenerateReportMutationVars,
} from './hooks';

function renderHook<T>(useHook: () => T): { current: T } {
  const ref: { current: T } = { current: undefined as T };
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  function Probe() {
    ref.current = useHook();
    return null;
  }

  act(() => {
    TestRenderer.create(
      <QueryClientProvider client={client}>
        <Probe />
      </QueryClientProvider>,
    );
  });
  return ref;
}

describe('report generation hooks', () => {
  it.each([
    {
      path: '/projects/{project}/reports/{number}/generate',
      useHook: useGenerateReportMutation,
    },
    {
      path: '/projects/{project}/reports/{number}/regenerate',
      useHook: useRegenerateReportMutation,
    },
  ] as const)('forwards a per-attempt Idempotency-Key for $path', async ({ path, useHook }) => {
    requestSpy.mockClear();
    const hook = renderHook(useHook);
    const vars = {
      params: { project: 'prj_example123', number: 7 },
      body: {},
      headers: { 'Idempotency-Key': 'report-generation:attempt-1' },
    } as (GenerateReportMutationVars | RegenerateReportMutationVars) & {
      headers: Record<string, string>;
    };

    await act(async () => {
      await hook.current.mutateAsync(vars as never);
    });

    expect(requestSpy).toHaveBeenCalledWith(path, 'post', {
      params: vars.params,
      body: vars.body,
      headers: vars.headers,
    });
  });
});
