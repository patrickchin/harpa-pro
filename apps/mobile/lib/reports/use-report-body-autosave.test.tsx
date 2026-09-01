/**
 * Unit tests for useReportBodyAutosave.
 *
 * The hook is driven by a caller-owned `dirty` flag (no JSON
 * diffing) — see the file header for the rationale. These tests
 * cover the contract: PATCH only when dirty, debounce, paused gate,
 * onSaved callback after success, error propagation.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import TestRenderer, { act } from 'react-test-renderer';
import React from 'react';
import { reports } from '@harpa/api-contract';

const mutateSpy = vi.hoisted(() => vi.fn());
const mutationState = vi.hoisted(() => ({ isPending: false }));
const EXPECTED_UPDATED_AT = '2026-07-29T00:00:00.000Z';

vi.mock('@/lib/api/hooks', () => ({
  useUpdateReportMutation: () => ({
    mutate: mutateSpy,
    get isPending() {
      return mutationState.isPending;
    },
  }),
}));

import {
  useReportBodyAutosave,
  type UseReportBodyAutosaveInput,
  type UseReportBodyAutosaveResult,
} from './use-report-body-autosave';

function makeReport(siteTitle: string): reports.ReportBody {
  return {
    meta: {
      title: siteTitle,
      summary: 'A summary.',
      visitDate: '2025-01-01T00:00:00.000Z',
    },
    weather: null,
    workers: [],
    materials: [],
    issues: [],
    nextSteps: [],
    summarySections: [],
  };
}

interface Harness {
  tree: TestRenderer.ReactTestRenderer;
  setProps: (next: UseReportBodyAutosaveInput) => void;
  get result(): UseReportBodyAutosaveResult;
}

function mount(initial: UseReportBodyAutosaveInput): Harness {
  let captured!: UseReportBodyAutosaveResult;
  function Probe(props: UseReportBodyAutosaveInput) {
    captured = useReportBodyAutosave(props);
    return null;
  }
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(<Probe {...initial} />);
  });
  return {
    tree,
    setProps: (next) => {
      act(() => {
        tree.update(<Probe {...next} />);
      });
    },
    get result() {
      return captured;
    },
  };
}

describe('useReportBodyAutosave', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mutateSpy.mockReset();
    mutationState.isPending = false;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not PATCH when dirty is false (user has not edited)', () => {
    mount({
      slug: 'proj',
      number: 1,
      report: makeReport('Site A'),
      expectedUpdatedAt: EXPECTED_UPDATED_AT,
      dirty: false,
    });

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(mutateSpy).not.toHaveBeenCalled();
  });

  it('debounces and PATCHes the latest payload once dirty is true', () => {
    const harness = mount({
      slug: 'proj',
      number: 1,
      report: makeReport('A'),
      expectedUpdatedAt: EXPECTED_UPDATED_AT,
      dirty: true,
    });

    act(() => {
      vi.advanceTimersByTime(400);
    });
    // User keeps typing — timer should reset.
    harness.setProps({
      slug: 'proj',
      number: 1,
      report: makeReport('B'),
      expectedUpdatedAt: EXPECTED_UPDATED_AT,
      dirty: true,
    });
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(mutateSpy).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(mutateSpy).toHaveBeenCalledTimes(1);
    const call = mutateSpy.mock.calls[0]![0]!;
    expect(call.params).toEqual({ project: 'proj', number: 1 });
    expect(call.body.body.meta.visitDate).toBe('2025-01-01T00:00:00.000Z');
    expect(call.body.expectedUpdatedAt).toBe(EXPECTED_UPDATED_AT);
  });

  it('skips PATCH while paused, even when dirty', () => {
    mount({
      slug: 'proj',
      number: 1,
      report: makeReport('A'),
      expectedUpdatedAt: EXPECTED_UPDATED_AT,
      dirty: true,
      paused: true,
    });

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(mutateSpy).not.toHaveBeenCalled();
  });

  it('does not PATCH before the report version is available', () => {
    mount({
      slug: 'proj',
      number: 1,
      report: makeReport('A'),
      expectedUpdatedAt: null,
      dirty: true,
    });

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(mutateSpy).not.toHaveBeenCalled();
  });

  it('invokes onSaved exactly once after a successful PATCH', () => {
    const onSaved = vi.fn();
    mount({
      slug: 'proj',
      number: 1,
      report: makeReport('A'),
      expectedUpdatedAt: EXPECTED_UPDATED_AT,
      dirty: true,
      onSaved,
    });

    act(() => {
      vi.advanceTimersByTime(800);
    });
    expect(mutateSpy).toHaveBeenCalledTimes(1);

    const onSuccess = mutateSpy.mock.calls[0]![1]!.onSuccess as (
      saved: { updatedAt: string },
    ) => void;
    act(() => {
      onSuccess({ updatedAt: '2026-07-29T00:00:01.000Z' });
    });

    expect(onSaved).toHaveBeenCalledWith('2026-07-29T00:00:01.000Z');
  });

  it('does not re-PATCH after caller clears dirty (no edit in the interim)', () => {
    const harness = mount({
      slug: 'proj',
      number: 1,
      report: makeReport('A'),
      expectedUpdatedAt: EXPECTED_UPDATED_AT,
      dirty: true,
    });

    act(() => {
      vi.advanceTimersByTime(800);
    });
    expect(mutateSpy).toHaveBeenCalledTimes(1);

    // Simulate success → caller clears dirty.
    const onSuccess = mutateSpy.mock.calls[0]![1]!.onSuccess as (
      saved: { updatedAt: string },
    ) => void;
    act(() => {
      onSuccess({ updatedAt: '2026-07-29T00:00:01.000Z' });
    });
    harness.setProps({
      slug: 'proj',
      number: 1,
      report: makeReport('A'),
      expectedUpdatedAt: EXPECTED_UPDATED_AT,
      dirty: false,
    });

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(mutateSpy).toHaveBeenCalledTimes(1);
  });

  it('surfaces error from onError', () => {
    const harness = mount({
      slug: 'proj',
      number: 1,
      report: makeReport('A'),
      expectedUpdatedAt: EXPECTED_UPDATED_AT,
      dirty: true,
    });

    act(() => {
      vi.advanceTimersByTime(800);
    });
    const onError = mutateSpy.mock.calls[0]![1]!.onError as (e: Error) => void;
    act(() => {
      onError(new Error('boom'));
    });

    expect(harness.result.error).toBe('boom');
  });
});
