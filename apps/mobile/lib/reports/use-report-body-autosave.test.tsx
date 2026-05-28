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

import type { GeneratedSiteReport } from '@harpa/report-core';

const mutateSpy = vi.hoisted(() => vi.fn());
const mutationState = vi.hoisted(() => ({ isPending: false }));

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

function makeReport(siteTitle: string): GeneratedSiteReport {
  return {
    report: {
      meta: {
        title: siteTitle,
        summary: 'A summary.',
        visitDate: '2025-01-01',
        tags: [],
      },
      weather: null,
      workers: null,
      materials: [],
      issues: [],
      nextSteps: [],
      sections: [],
    },
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
    expect(call.body.body.meta.visitDate).toBe('2025-01-01');
  });

  it('skips PATCH while paused, even when dirty', () => {
    mount({
      slug: 'proj',
      number: 1,
      report: makeReport('A'),
      dirty: true,
      paused: true,
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
      dirty: true,
      onSaved,
    });

    act(() => {
      vi.advanceTimersByTime(800);
    });
    expect(mutateSpy).toHaveBeenCalledTimes(1);

    const onSuccess = mutateSpy.mock.calls[0]![1]!.onSuccess as () => void;
    act(() => {
      onSuccess();
    });

    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('does not re-PATCH after caller clears dirty (no edit in the interim)', () => {
    const harness = mount({
      slug: 'proj',
      number: 1,
      report: makeReport('A'),
      dirty: true,
    });

    act(() => {
      vi.advanceTimersByTime(800);
    });
    expect(mutateSpy).toHaveBeenCalledTimes(1);

    // Simulate success → caller clears dirty.
    const onSuccess = mutateSpy.mock.calls[0]![1]!.onSuccess as () => void;
    act(() => {
      onSuccess();
    });
    harness.setProps({
      slug: 'proj',
      number: 1,
      report: makeReport('A'),
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
